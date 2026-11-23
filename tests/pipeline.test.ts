import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestText } from '@/core/ingest/ingest';
import { DEFAULT_SPEC, type DerivationSpec } from '@/core/model/spec';
import { derive, overview, page, rangeInfo, toCsv } from '@/pipeline/derive';
import { resolveDerivation, resolveTimeFrame, presetEnabled } from '@/pipeline/resolve';

const ds = ingestText(readFileSync('data/US500_SB_1w_1998-01-04_2026-11-15.csv', 'utf8'), {
  fileName: 'US500_SB_1w_1998-01-04_2026-11-15.csv',
});
const { meta } = ds;
const weekly: DerivationSpec = {
  datasetId: meta.id,
  kind: 'candle',
  interval: meta.baseInterval,
  alignment: 'calendar',
  priceSource: 'close',
  smoothing: { method: 'none' },
  smoothInLogSpace: false,
};

describe('paging (newest first)', () => {
  it('returns the newest page and pages backwards without overlap', () => {
    const d = derive(ds, weekly);
    const p1 = page(d, null, 1000);
    expect(p1.time.length).toBe(1000);
    expect(p1.hasOlder).toBe(true);
    expect(p1.time[999]).toBe(meta.range.to);
    const p2 = page(d, p1.time[0], 1000);
    expect(p2.time.length).toBe(506);
    expect(p2.hasOlder).toBe(false);
    expect(p2.time[p2.time.length - 1]).toBeLessThan(p1.time[0]);
  });

  it('memoises derivations', () => {
    expect(derive(ds, weekly)).toBe(derive(ds, { ...weekly }));
  });
});

describe('line derivation', () => {
  it('keeps the incomplete last point out of smoothing', () => {
    const d = derive(ds, { ...weekly, kind: 'line', smoothing: { method: 'sma', window: 4 } });
    const n = d.line!.length;
    expect(d.smooth![n - 1]).toBeNaN();
    expect(d.smooth![n - 2]).toBeCloseTo((d.line![n - 2] + d.line![n - 3] + d.line![n - 4] + d.line![n - 5]) / 4);
    expect(d.smooth![2]).toBeNaN();
  });
});

describe('time frames', () => {
  it('resolves presets against the last bar', () => {
    const r = resolveTimeFrame({ preset: '1Y' }, meta);
    expect(r.to).toBe(meta.range.to);
    expect(rangeInfo(derive(ds, weekly), r.from, r.to).count).toBe(53);
    expect(resolveTimeFrame({ preset: 'MAX' }, meta)).toEqual(meta.range);
  });

  it('disables presets with too few bars', () => {
    expect(presetEnabled('1M', meta, meta.baseInterval)).toBe(false);
    expect(presetEnabled('3M', meta, meta.baseInterval)).toBe(true);
    expect(presetEnabled('6M', meta, { unit: 'month', count: 1 })).toBe(true);
    expect(presetEnabled('3M', meta, { unit: 'month', count: 1 })).toBe(false);
  });

  it('auto step depends on width and time frame', () => {
    const line = { ...DEFAULT_SPEC, chartType: 'line' as const, timeFrame: { preset: 'MAX' as const } };
    expect(resolveDerivation(line, meta, 1200).interval).toEqual({ unit: 'week', count: 1 });
    expect(resolveDerivation(line, meta, 300).interval).toEqual({ unit: 'week', count: 4 });
  });
});

describe('exports', () => {
  it('writes the derived series as CSV', () => {
    const csv = toCsv(derive(ds, weekly), meta.precision).split('\n');
    expect(csv[0]).toBe('time,open,high,low,close,volume,complete');
    expect(csv[1]).toBe('1998-01-04T22:00:00.000Z,975.0,982.6,921.7,927.7,1492,true');
    expect(csv[csv.length - 1].endsWith(',false')).toBe(true);
  });

  it('builds an overview envelope', () => {
    const o = overview(derive(ds, weekly), 100);
    expect(o.time.length).toBe(100);
    for (let i = 0; i < 100; i++) expect(o.hi[i]).toBeGreaterThanOrEqual(o.lo[i]);
  });
});
