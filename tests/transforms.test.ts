import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ingestText } from '@/core/ingest/ingest';
import { BarFlag, emptySeries } from '@/core/model/types';
import { resample } from '@/core/transforms/resample';
import { ema, gaussian, savgol, sma, smooth, wma } from '@/core/transforms/smoothing';
import { autoStep } from '@/core/transforms/autoStep';
import { rangeStats } from '@/core/stats/rangeStats';
import { checkTarget, parseInterval } from '@/core/time/interval';
import { tradingDay } from '@/core/time/tradingDate';
import { daysToCivil } from '@/core/time/tz';

const sample = ingestText(readFileSync('data/US500_SB_1w_1998-01-04_2026-11-15.csv', 'utf8'), {
  fileName: 'US500_SB_1w_1998-01-04_2026-11-15.csv',
});
const { session, baseInterval } = sample.meta;
const opts = { base: baseInterval, session, alignment: 'calendar' as const };

describe('trading date', () => {
  it('maps a Sunday 17:00 NY open to Monday, across DST', () => {
    const winter = Date.parse('1998-01-04T22:00:00Z');
    const summer = Date.parse('2026-07-05T21:00:00Z');
    expect(daysToCivil(tradingDay(winter, session))).toMatchObject({ year: 1998, month: 1, day: 5, weekday: 1 });
    expect(daysToCivil(tradingDay(summer, session))).toMatchObject({ year: 2026, month: 7, day: 6, weekday: 1 });
  });
});

describe('interval parsing and validity', () => {
  it('parses free text', () => {
    expect(parseInterval('3w')).toEqual({ unit: 'week', count: 3 });
    expect(parseInterval('2M')).toEqual({ unit: 'month', count: 2 });
    expect(parseInterval('15m')).toEqual({ unit: 'minute', count: 15 });
    expect(parseInterval('quarter')).toEqual({ unit: 'month', count: 3 });
    expect(parseInterval('1 year')).toEqual({ unit: 'year', count: 1 });
    expect(parseInterval('abc')).toBeNull();
  });
  it('rejects finer targets and flags weeks→months as approximate', () => {
    expect(checkTarget({ unit: 'week', count: 1 }, { unit: 'day', count: 1 }).ok).toBe(false);
    expect(checkTarget({ unit: 'week', count: 1 }, { unit: 'month', count: 1 })).toEqual({ ok: true, approx: true });
    expect(checkTarget({ unit: 'day', count: 1 }, { unit: 'month', count: 1 })).toEqual({ ok: true, approx: false });
    expect(checkTarget({ unit: 'minute', count: 5 }, { unit: 'minute', count: 7 }).ok).toBe(false);
  });
});

describe('resample', () => {
  it('builds monthly candles from weekly data by trading date', () => {
    const { bars, approx } = resample(sample.bars, { unit: 'month', count: 1 }, opts);
    expect(approx).toBe(true);
    // Jan 1998 contains the weeks of 5, 12, 19, 26 Jan.
    expect(bars.open[0]).toBe(975);
    expect(bars.high[0]).toBe(Math.max(...Array.from(sample.bars.high.slice(0, 4))));
    expect(bars.close[0]).toBe(sample.bars.close[3]);
    expect(bars.flags[0] & BarFlag.Approx).toBeTruthy();
    // ~ 28.9 years of months
    expect(bars.length).toBeGreaterThan(340);
    expect(bars.length).toBeLessThan(350);
    // The current month is incomplete because the last weekly bar is.
    expect(bars.flags[bars.length - 1] & BarFlag.Complete).toBe(0);
  });

  it('builds 2-week rolling buckets', () => {
    const { bars } = resample(sample.bars, { unit: 'week', count: 2 }, { ...opts, alignment: 'rollingFirst' });
    expect(bars.length).toBe(Math.ceil(sample.bars.length / 2));
    expect(bars.open[1]).toBe(sample.bars.open[2]);
  });

  it('keeps invariants for random series', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: 1, max: 1000, noNaN: true }), fc.double({ min: 0, max: 50, noNaN: true })), {
          minLength: 2,
          maxLength: 120,
        }),
        (rows) => {
          const s = emptySeries(rows.length, true);
          const t0 = Date.parse('2020-01-06T00:00:00Z');
          rows.forEach(([p, spread], i) => {
            s.time[i] = t0 + i * 86_400_000;
            s.open[i] = p;
            s.close[i] = p + spread / 2;
            s.high[i] = p + spread;
            s.low[i] = p - spread;
            s.volume![i] = 1;
            s.flags[i] = BarFlag.Complete;
          });
          const day = { timeZone: 'UTC', sessionOpenMinutes: 0 };
          const { bars } = resample(s, { unit: 'week', count: 1 }, { base: { unit: 'day', count: 1 }, session: day, alignment: 'calendar' });
          let vol = 0;
          for (let i = 0; i < bars.length; i++) {
            expect(bars.high[i]).toBeGreaterThanOrEqual(Math.max(bars.open[i], bars.close[i]));
            expect(bars.low[i]).toBeLessThanOrEqual(Math.min(bars.open[i], bars.close[i]));
            vol += bars.volume![i];
          }
          expect(vol).toBe(rows.length);
          expect(bars.length).toBeLessThanOrEqual(rows.length);
        },
      ),
    );
  });
});

describe('smoothing', () => {
  const x = new Float64Array([1, 3, 2, 5, 4, 6, 8, 7, 9, 10, 12, 11]);

  it('SMA / WMA / EMA leave warm-up as NaN', () => {
    expect(Array.from(sma(x, 3)).slice(0, 4)).toEqual([NaN, NaN, 2, 10 / 3]);
    expect(wma(x, 3)[2]).toBeCloseTo((1 * 1 + 2 * 3 + 3 * 2) / 6);
    expect(wma(x, 3)[5]).toBeCloseTo((1 * 5 + 2 * 4 + 3 * 6) / 6);
    const e = ema(x, 3);
    expect(e[1]).toBeNaN();
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(0.5 * 5 + 0.5 * 2);
  });

  it('Savitzky–Golay matches SciPy in the interior', () => {
    const ref = [3.2857142857, 3.7142857143, 4.8571428571, 6.0, 7.2285714286, 7.8571428571, 8.4857142857, 10.5142857143];
    const out = savgol(x, 5, 2, 'trim');
    ref.forEach((v, k) => expect(out[k + 2]).toBeCloseTo(v, 8));
    expect(out[0]).toBeNaN();
    expect(savgol(x, 5, 2, 'shrink')[0]).not.toBeNaN();
  });

  it('every smoother returns a constant series unchanged', () => {
    const c = new Float64Array(30).fill(7);
    for (const spec of [
      { method: 'sma', window: 5 },
      { method: 'wma', window: 5 },
      { method: 'ema', span: 5 },
      { method: 'gaussian', sigma: 2, edge: 'shrink' },
      { method: 'savgol', window: 7, order: 3, edge: 'shrink' },
    ] as const) {
      const out = smooth(c, spec);
      out.forEach((v) => Number.isNaN(v) || expect(v).toBeCloseTo(7, 9));
    }
    expect(gaussian(c, 2, 'trim')[0]).toBeNaN();
  });

  it('log-space smoothing works on positive prices', () => {
    const out = smooth(new Float64Array([1, 10, 100]), { method: 'sma', window: 3 }, true);
    expect(out[2]).toBeCloseTo(10);
  });
});

describe('auto step and stats', () => {
  it('picks every bar when the sample fits and coarser when it does not', () => {
    expect(autoStep(baseInterval, 1506, 1200, 0.5)).toEqual({ unit: 'week', count: 1 });
    expect(autoStep(baseInterval, 1506, 800, 1)).toEqual({ unit: 'week', count: 2 });
    expect(autoStep(baseInterval, 1506, 600, 1)).toEqual({ unit: 'week', count: 4 });
  });

  it('computes range stats over complete bars', () => {
    const s = rangeStats(sample.bars, baseInterval, -Infinity, Infinity)!;
    expect(s.bars).toBe(1505); // last bar incomplete
    expect(s.firstClose).toBe(927.7);
    expect(s.gaps).toBe(1);
    expect(s.maxDrawdown).toBeLessThan(-0.4); // 2008
    expect(s.cagr).toBeGreaterThan(0.04);
    expect(s.volatility).toBeGreaterThan(0.1);
  });
});
