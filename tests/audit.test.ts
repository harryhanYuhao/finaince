// Regression tests for defects found in the 2026-11-23 code audit, plus coverage of modules that
// had none (time zones, column sniffing, gaps, paging edges, formatting, spec resolution).

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ingestText, NeedsMappingError } from '@/core/ingest/ingest';
import { classifyTime, parseNumber, parseTimeCell } from '@/core/ingest/parseTime';
import { sniffColumns, mappingFromRoles } from '@/core/ingest/columns';
import { detectGaps } from '@/core/ingest/gaps';
import { parseFileNameHint } from '@/core/ingest/infer';
import { BarFlag, emptySeries, type BarSeries, type SessionSpec } from '@/core/model/types';
import { DEFAULT_SPEC, type DerivationSpec } from '@/core/model/spec';
import { resample } from '@/core/transforms/resample';
import { ema, sma, wma, smooth } from '@/core/transforms/smoothing';
import { rangeStats } from '@/core/stats/rangeStats';
import { checkTarget, detectInterval, intervalMs, presetTargets } from '@/core/time/interval';
import { DAY, HOUR, civilToDays, daysToCivil, fromWallClock, toWallClock, tzOffsetMs } from '@/core/time/tz';
import { isoWeek, tradingDay } from '@/core/time/tradingDate';
import { derive, overview, page, rangeInfo, toCsv } from '@/pipeline/derive';
import { presetEnabled, resolveDerivation, resolveTimeFrame } from '@/pipeline/resolve';
import { formatBarTime, formatPct, formatPrice, formatSigned } from '@/render/format';

const UTC0: SessionSpec = { timeZone: 'UTC', sessionOpenMinutes: 0 };

/** Weekday-only daily CSV between two dates (UTC dates, like most daily downloads). */
function dailyCsv(from: string, to: string, price = (i: number) => 100 + i): string {
  const rows = ['Date,Open,High,Low,Close,Volume'];
  let i = 0;
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const p = price(i++);
    rows.push(`${new Date(t).toISOString().slice(0, 10)},${p},${p + 1},${p - 1},${p + 0.5},1000`);
  }
  return rows.join('\n');
}

function series(times: number[], closes?: number[]): BarSeries {
  const s = emptySeries(times.length, false);
  times.forEach((t, i) => {
    const c = closes?.[i] ?? 100 + i;
    s.time[i] = t;
    s.open[i] = s.high[i] = s.low[i] = s.close[i] = c;
    s.flags[i] = BarFlag.Complete | BarFlag.TradingDay | BarFlag.MarketOpen;
  });
  return s;
}

// ------------------------------------------------------------------------------------------ time

describe('time zones', () => {
  it('round-trips wall clock times across DST in New York', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(1990, 0, 1), max: Date.UTC(2040, 0, 1) }), (t0) => {
        const t = Math.floor(t0 / 60_000) * 60_000;
        const wall = toWallClock('America/New_York', t);
        const back = fromWallClock('America/New_York', wall);
        // Only the repeated hour at the end of DST is ambiguous.
        return back === t || Math.abs(back - t) === HOUR;
      }),
    );
  });

  it('knows the New York offset in winter and summer', () => {
    expect(tzOffsetMs('America/New_York', Date.UTC(2024, 0, 15))).toBe(-5 * HOUR);
    expect(tzOffsetMs('America/New_York', Date.UTC(2024, 6, 15))).toBe(-4 * HOUR);
    expect(tzOffsetMs('UTC', 123)).toBe(0);
  });

  it('converts civil dates and ISO weeks', () => {
    fc.assert(fc.property(fc.integer({ min: -20000, max: 60000 }), (d) => {
      const c = daysToCivil(d);
      return civilToDays(c.year, c.month, c.day) === d;
    }));
    expect(isoWeek(civilToDays(2021, 1, 3))).toEqual({ isoYear: 2020, week: 53 });
    expect(isoWeek(civilToDays(2024, 12, 30))).toEqual({ isoYear: 2025, week: 1 });
  });

  it('assigns morning sessions to the same day', () => {
    const s: SessionSpec = { timeZone: 'America/New_York', sessionOpenMinutes: 9 * 60 + 30 };
    expect(daysToCivil(tradingDay(Date.UTC(2024, 0, 15, 14, 30), s))).toMatchObject({ month: 1, day: 15 });
  });
});

describe('interval rules', () => {
  it('detects common intervals', () => {
    expect(detectInterval(DAY)).toEqual({ unit: 'day', count: 1 });
    expect(detectInterval(7 * DAY)).toEqual({ unit: 'week', count: 1 });
    expect(detectInterval(31 * DAY)).toEqual({ unit: 'month', count: 1 });
    expect(detectInterval(10 * 60_000)).toEqual({ unit: 'minute', count: 10 });
    expect(detectInterval(2 * HOUR)).toEqual({ unit: 'hour', count: 2 });
  });

  it('only allows targets whose boundaries line up with the base bars', () => {
    // Audit: 7-minute bars cannot tile an hour or a day.
    expect(checkTarget({ unit: 'minute', count: 7 }, { unit: 'hour', count: 1 }).ok).toBe(false);
    expect(checkTarget({ unit: 'minute', count: 7 }, { unit: 'day', count: 1 }).ok).toBe(false);
    expect(checkTarget({ unit: 'hour', count: 5 }, { unit: 'day', count: 1 }).ok).toBe(false);
    expect(checkTarget({ unit: 'minute', count: 15 }, { unit: 'day', count: 1 }).ok).toBe(true);
    expect(checkTarget({ unit: 'hour', count: 4 }, { unit: 'week', count: 1 }).ok).toBe(true);
    expect(checkTarget({ unit: 'month', count: 1 }, { unit: 'year', count: 1 }).ok).toBe(true);
    expect(checkTarget({ unit: 'month', count: 5 }, { unit: 'year', count: 1 }).ok).toBe(false);
  });

  it('offers the base and only valid presets, finest first', () => {
    const p = presetTargets({ unit: 'day', count: 1 });
    expect(p[0]).toEqual({ unit: 'day', count: 1 });
    for (let i = 1; i < p.length; i++) expect(intervalMs(p[i])).toBeGreaterThanOrEqual(intervalMs(p[i - 1]));
    expect(presetTargets({ unit: 'week', count: 3 })[0]).toEqual({ unit: 'week', count: 3 });
  });
});

// ---------------------------------------------------------------------------------------- ingest

describe('time and number cells', () => {
  it('reads compact YYYYMMDD dates as dates, not epoch seconds', () => {
    // Audit: "20240301" used to become 1970-08-23.
    expect(classifyTime('20240301')).toBe('compact-date');
    expect(parseTimeCell('20240301', 'compact-date')).toBe(Date.UTC(2024, 2, 1));
    expect(parseTimeCell('20241301', 'compact-date')).toBeNaN();
    expect(classifyTime('1709251200')).toBe('epoch-s');
    expect(classifyTime('1709251200000')).toBe('epoch-ms');
  });

  it('parses ISO offsets with and without a colon', () => {
    expect(parseTimeCell('2024-03-01T22:00:00+01:00', 'iso')).toBe(Date.UTC(2024, 2, 1, 21));
    expect(parseTimeCell('2024-03-01T22:00:00+0100', classifyTime('2024-03-01T22:00:00+0100'))).toBe(Date.UTC(2024, 2, 1, 21));
    expect(parseTimeCell('2024-03-01 22:00', 'iso-local')).toBe(Date.UTC(2024, 2, 1, 22));
  });

  it('handles thousands separators and decimal commas', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('"975.0"')).toBe(975);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('1.234,5', true)).toBe(1234.5);
    expect(parseNumber('975,25', true)).toBe(975.25);
  });

  it('reads semicolon files with decimal commas', () => {
    const csv = 'Date;Open;High;Low;Close\n2024-03-01;10,5;11,25;10,0;11,0\n2024-03-04;11,0;12,0;10,75;11,5\n';
    const ds = ingestText(csv, { fileName: 'x.csv' });
    expect(Array.from(ds.bars.high)).toEqual([11.25, 12]);
    // Audit: precision came from closes only, which rounded the 11.25 high to 11.3.
    expect(ds.meta.precision).toBe(2);
  });

  it('ingests compact dates end to end', () => {
    const ds = ingestText('date,close\n20240301,10\n20240304,11\n20240305,12\n20240306,13\n20240307,14\n', { fileName: 'x.csv' });
    expect(ds.meta.range.from).toBe(Date.UTC(2024, 2, 1));
    expect(ds.meta.baseInterval).toEqual({ unit: 'day', count: 1 });
  });
});

describe('ingest', () => {
  it('gives a re-mapped file a different id, so the chart reloads', () => {
    // Audit: same id for different column choices meant the chart kept the old data.
    const csv = 'when,a,b\n2024-03-01,1,10\n2024-03-04,2,20\n2024-03-05,3,30\n';
    expect(() => ingestText(csv, { fileName: 'x.csv' })).toThrow(NeedsMappingError);
    const a = ingestText(csv, { fileName: 'x.csv', roles: ['time', 'close', 'ignore'] });
    const b = ingestText(csv, { fileName: 'x.csv', roles: ['time', 'ignore', 'close'] });
    expect(a.meta.id).not.toBe(b.meta.id);
    expect(b.bars.close[0]).toBe(10);
  });

  it('sorts, de-duplicates (last wins) and reports it', () => {
    const csv = 'time,close\n2024-03-05,3\n2024-03-01,1\n2024-03-04,2\n2024-03-04,2.5\n';
    const ds = ingestText(csv, { fileName: 'x.csv' });
    expect(Array.from(ds.bars.close)).toEqual([1, 2.5, 3]);
    const codes = ds.meta.report.notes.map((n) => n.code);
    expect(codes).toContain('unsorted');
    expect(codes).toContain('duplicates');
  });

  it('skips bad rows and non-trading rows with notes', () => {
    const csv = 'time,close,MarketOpen\n2024-03-01,1,true\n2024-03-02,x,true\n2024-03-04,2,false\n2024-03-05,3,true\n';
    const ds = ingestText(csv, { fileName: 'x.csv' });
    expect(ds.meta.barCount).toBe(2);
    const bad = ds.meta.report.notes.find((n) => n.code === 'unparseable-rows');
    expect(bad?.message).toMatch(/^1 row/);
    expect(bad?.examples).toEqual(['row 3']);
    expect(ds.meta.report.notes.find((n) => n.code === 'non-trading-rows')).toBeDefined();
  });

  it('reads JSON arrays, wrapped arrays and columnar JSON alike', () => {
    const rows = [
      { time: '2024-03-01', open: 1, high: 2, low: 0.5, close: 1.5 },
      { time: '2024-03-04', open: 1.5, high: 2.5, low: 1, close: 2 },
    ];
    const a = ingestText(JSON.stringify(rows), { fileName: 'a.json' });
    const b = ingestText(JSON.stringify({ data: rows }), { fileName: 'b.json' });
    const c = ingestText(JSON.stringify({ t: ['2024-03-01', '2024-03-04'], o: [1, 1.5], h: [2, 2.5], l: [0.5, 1], c: [1.5, 2] }), { fileName: 'c.json' });
    for (const ds of [a, b, c]) expect(Array.from(ds.bars.close)).toEqual([1.5, 2]);
  });

  it('flags OHLC inconsistencies and non-positive prices', () => {
    const csv = 'time,open,high,low,close\n2024-03-01,1,0.5,0.4,1\n2024-03-04,0,1,0,0.5\n';
    const codes = ingestText(csv, { fileName: 'x.csv' }).meta.report.notes.map((n) => n.code);
    expect(codes).toContain('ohlc-inconsistent');
    expect(codes).toContain('non-positive');
  });
});

describe('column sniffing', () => {
  it('maps common headers and prefers close over price', () => {
    const r = sniffColumns(['Date', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']);
    expect(r.confidence).toBe(1);
    expect(r.mapping).toMatchObject({ time: 0, open: 1, high: 2, low: 3, close: 4, volume: 6, volumeKind: 'traded' });
    expect(sniffColumns(['timestamp', 'price']).mapping).toMatchObject({ time: 0, close: 1 });
    expect(sniffColumns(['TIME_UTC', 'TICK_VOLUME', 'CLOSE']).mapping?.volumeKind).toBe('tick');
    expect(sniffColumns(['foo', 'bar']).mapping).toBeNull();
  });

  it('builds a mapping from dialog roles', () => {
    expect(mappingFromRoles(['ignore', 'close'], 'none')).toBeNull();
    expect(mappingFromRoles(['time', 'close', 'volume'], 'none')).toMatchObject({ volume: 2, volumeKind: 'traded' });
  });

  it('reads file-name hints', () => {
    expect(parseFileNameHint('EURUSD_DUKA_1mo_2020.csv')).toEqual({ symbol: 'EURUSD', source: 'DUKA', interval: '1mo' });
    expect(parseFileNameHint('AAPL.csv')).toEqual({ symbol: 'AAPL' });
  });

  it('does not warn when a "1mo" file name matches monthly data', () => {
    const rows = ['time,close'];
    for (let m = 0; m < 12; m++) rows.push(`${new Date(Date.UTC(2023, m, 1)).toISOString().slice(0, 10)},${m + 1}`);
    const ds = ingestText(rows.join('\n'), { fileName: 'X_Y_1mo_a.csv' });
    expect(ds.meta.baseInterval).toEqual({ unit: 'month', count: 1 });
    expect(ds.meta.report.notes.find((n) => n.code === 'interval-mismatch')).toBeUndefined();
  });
});

describe('gap detection', () => {
  it('ignores weekends and single holidays in daily data', () => {
    const ds = ingestText(dailyCsv('2024-01-01', '2024-03-31'), { fileName: 'x.csv' });
    expect(ds.meta.report.gaps).toEqual([]);
  });

  it('reports runs of 3+ missing weekdays', () => {
    const csv = dailyCsv('2024-01-01', '2024-03-31')
      .split('\n')
      .filter((l) => !/^2024-02-0[5-9]/.test(l))
      .join('\n');
    const ds = ingestText(csv, { fileName: 'x.csv' });
    expect(ds.meta.report.gaps).toHaveLength(1);
    expect(ds.meta.report.gaps[0].missing).toBe(5);
  });

  it('counts missing multi-year bars in bars, not years', () => {
    // Audit: 2-year bars with one missing reported 2 missing.
    const s = series([Date.UTC(2000, 0, 1), Date.UTC(2002, 0, 1), Date.UTC(2006, 0, 1)]);
    const gaps = detectGaps(s, { unit: 'year', count: 2 }, UTC0);
    expect(gaps.map((g) => g.missing)).toEqual([1]);
  });
});

// ------------------------------------------------------------------------------------ transforms

describe('resampling daily data', () => {
  const ds = ingestText(dailyCsv('2023-01-02', '2024-06-28'), { fileName: 'x.csv' });
  const opts = { base: ds.meta.baseInterval, session: ds.meta.session, alignment: 'calendar' as const };

  it('treats full months of weekdays as complete', () => {
    // Audit: ~21 trading days per month were compared with 30 calendar days, so the first and last
    // full months were flagged partial/incomplete and left out of statistics.
    const { bars } = resample(ds.bars, { unit: 'month', count: 1 }, opts);
    expect(bars.length).toBe(18);
    expect(bars.flags[0] & BarFlag.PartialStart).toBe(0);
    expect(bars.flags[bars.length - 1] & BarFlag.Complete).toBeTruthy();
    expect(new Date(bars.time[0]).toISOString().slice(0, 10)).toBe('2023-01-02');
  });

  it('still flags a month that has barely started', () => {
    const cut = ingestText(dailyCsv('2023-01-02', '2024-07-02'), { fileName: 'x.csv' });
    const { bars } = resample(cut.bars, { unit: 'month', count: 1 }, { ...opts, session: cut.meta.session });
    expect(bars.flags[bars.length - 1] & BarFlag.Complete).toBe(0);
    const late = ingestText(dailyCsv('2023-01-27', '2024-06-28'), { fileName: 'x.csv' });
    const r = resample(late.bars, { unit: 'month', count: 1 }, { ...opts, session: late.meta.session });
    expect(r.bars.flags[0] & BarFlag.PartialStart).toBeTruthy();
  });

  it('keeps OHLC invariants for any interval (property)', () => {
    const targets = presetTargets(ds.meta.baseInterval);
    for (const target of targets) {
      for (const alignment of ['calendar', 'rollingFirst', 'rollingLast'] as const) {
        const { bars } = resample(ds.bars, target, { ...opts, alignment });
        let vol = 0;
        for (let i = 0; i < bars.length; i++) {
          expect(bars.high[i]).toBeGreaterThanOrEqual(Math.max(bars.open[i], bars.close[i]));
          expect(bars.low[i]).toBeLessThanOrEqual(Math.min(bars.open[i], bars.close[i]));
          if (i) expect(bars.time[i]).toBeGreaterThan(bars.time[i - 1]);
          vol += bars.volume![i];
        }
        expect(vol).toBe(1000 * ds.meta.barCount);
      }
    }
  });
});

describe('smoothing with missing values', () => {
  const x = Float64Array.from([1, 2, 3, NaN, 5, 6, 7, 8, 9]);

  it('lets a NaN blank only the windows that contain it', () => {
    // Audit: one NaN (e.g. a price ≤ 0 in log space) used to blank everything after it.
    const s = sma(x, 3);
    expect(s[2]).toBe(2);
    expect(s[3]).toBeNaN();
    expect(s[5]).toBeNaN();
    expect(s[6]).toBe(6);
    expect(s[8]).toBe(8);
    const w = wma(x, 2);
    expect(w[2]).toBeCloseTo((2 + 2 * 3) / 3);
    expect(w[4]).toBeNaN();
    expect(w[5]).toBeCloseTo((5 + 2 * 6) / 3);
    const e = ema(x, 2);
    expect(e[3]).toBeNaN();
    expect(e[5]).toBeCloseTo(5.5); // re-seeded after the gap
    expect(e[8]).toBeGreaterThan(8);
  });

  it('matches the plain running computation when nothing is missing (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 1, max: 1000, noNaN: true }), { minLength: 1, maxLength: 60 }), fc.integer({ min: 1, max: 10 }), (arr, n) => {
        const a = Float64Array.from(arr);
        const s = sma(a, n);
        for (let i = n - 1; i < a.length; i++) {
          let sum = 0;
          for (let k = i - n + 1; k <= i; k++) sum += a[k];
          if (Math.abs(s[i] - sum / n) > 1e-7 * Math.max(1, sum)) return false;
        }
        return true;
      }),
    );
  });

  it('smooths in log space around non-positive values', () => {
    const s = smooth(Float64Array.from([1, 2, 0, 4, 8, 16]), { method: 'sma', window: 2 }, true);
    expect(s[1]).toBeCloseTo(Math.SQRT2);
    expect(s[2]).toBeNaN();
    expect(s[5]).toBeCloseTo(Math.sqrt(8 * 16));
  });
});

describe('range statistics', () => {
  it('annualises daily volatility with trading days, not calendar days', () => {
    // Audit: √365 instead of ≈√252 overstated daily volatility by ~20%.
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
    let p = 100;
    const ds = ingestText(
      dailyCsv('2015-01-01', '2024-12-31', () => (p *= Math.exp(rnd()))),
      { fileName: 'x.csv' },
    );
    const s = rangeStats(ds.bars, ds.meta.baseInterval, ds.meta.range.from, ds.meta.range.to)!;
    expect(s.periodsPerYear).toBeGreaterThan(255);
    expect(s.periodsPerYear).toBeLessThan(265);
  });

  it('keeps calendar periods for weekly and monthly data', () => {
    const times = Array.from({ length: 30 }, (_, i) => Date.UTC(2020, i, 1));
    expect(rangeStats(series(times), { unit: 'month', count: 1 }, 0, Infinity)!.periodsPerYear).toBeCloseTo(12);
  });

  it('computes change, drawdown and CAGR', () => {
    const times = [0, 1, 2, 3, 4].map((y) => Date.UTC(2000 + y, 0, 1));
    const s = rangeStats(series(times, [100, 150, 75, 120, 200]), { unit: 'year', count: 1 }, 0, Infinity)!;
    expect(s.changePct).toBeCloseTo(1);
    expect(s.maxDrawdown).toBeCloseTo(-0.5);
    expect(s.drawdownPeakTime).toBe(times[1]);
    expect(s.drawdownTroughTime).toBe(times[2]);
    expect(s.cagr).toBeCloseTo(2 ** (1 / ((times[4] - times[0]) / (365.2425 * DAY))) - 1);
    expect(rangeStats(series(times), { unit: 'year', count: 1 }, 1, 2)).toBeNull();
  });
});

// -------------------------------------------------------------------------------------- pipeline

describe('pipeline edges', () => {
  const ds = ingestText(dailyCsv('2023-01-02', '2024-06-28'), { fileName: 'pipe.csv' });
  const spec: DerivationSpec = {
    datasetId: ds.meta.id,
    kind: 'line',
    interval: { unit: 'week', count: 1 },
    alignment: 'calendar',
    priceSource: 'meanClose',
    smoothing: { method: 'none' },
    smoothInLogSpace: false,
  };

  it('pages to the very first bar and stops', () => {
    const d = derive(ds, spec);
    const all: number[] = [];
    let end: number | null = null;
    for (;;) {
      const p = page(d, end, 25);
      all.unshift(...p.time);
      if (!p.hasOlder) break;
      end = p.time[0];
    }
    expect(all).toEqual(Array.from(d.bars.time));
  });

  it('counts bars in a range inclusively and handles empty ranges', () => {
    const d = derive(ds, spec);
    expect(rangeInfo(d, d.bars.time[2], d.bars.time[4])).toMatchObject({ count: 3 });
    expect(rangeInfo(d, 0, 1)).toEqual({ count: 0, firstTime: null, lastTime: null });
  });

  it('averages source closes for meanClose', () => {
    const d = derive(ds, spec);
    // First week: 2–6 Jan 2023, closes 100.5…104.5.
    expect(d.line![0]).toBeCloseTo(102.5);
  });

  it('builds a finite overview envelope even with missing values', () => {
    const d = derive(ds, spec);
    const broken = { ...d, line: d.line!.map((v, i) => (i < 20 ? NaN : v)) }; // whole buckets missing
    const o = overview(broken, 10);
    expect(o.lo[0]).toBeNaN();
    for (let i = 0; i < o.time.length; i++) {
      expect(o.lo[i]).not.toBe(Infinity);
      expect(o.hi[i]).not.toBe(-Infinity);
    }
  });

  it('exports CSV with line columns', () => {
    const csv = toCsv(derive(ds, spec), 2).split('\n');
    expect(csv[0]).toBe('time,open,high,low,close,volume,line,complete');
    expect(csv).toHaveLength(derive(ds, spec).bars.length + 1);
  });

  it('resolves presets and the auto step for daily data', () => {
    expect(presetEnabled('1M', ds.meta, { unit: 'day', count: 1 })).toBe(true);
    expect(presetEnabled('1M', ds.meta, { unit: 'month', count: 1 })).toBe(false);
    const ytd = resolveTimeFrame({ preset: 'YTD' }, ds.meta);
    expect(new Date(ytd.from).toISOString().slice(0, 10) <= '2024-01-01').toBe(true);
    expect(ytd.from).toBeGreaterThanOrEqual(Date.UTC(2023, 11, 31));
    const line = { ...DEFAULT_SPEC, chartType: 'line' as const, timeFrame: { preset: 'MAX' as const } };
    expect(resolveDerivation(line, ds.meta, 2000).interval).toEqual({ unit: 'day', count: 1 });
    expect(resolveDerivation(line, ds.meta, 100).interval.unit).not.toBe('day');
  });
});

// ------------------------------------------------------------------------------------ formatting

describe('formatting', () => {
  it('formats prices, signs and percentages', () => {
    expect(formatPrice(1234.5, 2)).toBe('1,234.50');
    expect(formatPrice(NaN, 2)).toBe('—');
    expect(formatSigned(-3, 1)).toBe('−3.0');
    expect(formatPct(0.0123)).toBe('+1.23%');
    expect(formatPct(-0.5, 1, false)).toBe('−50.0%');
  });

  it('shows the trading date for daily bars of an evening session', () => {
    const ds = ingestText('time,close\n2024-03-03T22:00:00Z,1\n2024-03-10T21:00:00Z,2\n2024-03-17T21:00:00Z,3\n', { fileName: 'x.csv' });
    const label = formatBarTime(Date.UTC(2024, 2, 3, 22), ds.meta, { unit: 'week', count: 1 }, 'exchange');
    expect(label).toBe('Mon, Mar 4, 2024');
  });
});

describe('export file names', async () => {
  const { safeFileName } = await import('@/platform/export');
  it('removes characters that are invalid in file names', () => {
    expect(safeFileName('EUR/USD_Weekly_candle.png')).toBe('EUR-USD_Weekly_candle.png');
    expect(safeFileName('a:b*c?.csv')).toBe('a-b-c-.csv');
    expect(safeFileName('...')).toBe('chart');
  });
});
