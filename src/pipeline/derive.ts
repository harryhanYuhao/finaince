// Derivation pipeline (design/02 §3): resample → price source → smoothing → page slice.
// Runs inside the data worker; pure and synchronous so it is also testable in Node.

import { BarFlag, type BarSeries, type Dataset, type Interval } from '@/core/model/types';
import { derivationKey, type DerivationSpec } from '@/core/model/spec';
import { resample } from '@/core/transforms/resample';
import { meanCloses, priceSource } from '@/core/transforms/priceSource';
import { smooth } from '@/core/transforms/smoothing';
import { rangeStats, type RangeStats } from '@/core/stats/rangeStats';

export interface Derived {
  key: string;
  interval: Interval;
  bars: BarSeries;
  line: Float64Array | null;
  smooth: Float64Array | null;
  approx: boolean;
}

export interface RenderPage {
  key: string;
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array | null;
  line: Float64Array | null;
  smooth: Float64Array | null;
  flags: Uint8Array;
  hasOlder: boolean;
  approx: boolean;
  total: number;
}

const MEMO_LIMIT = 16;
const memo = new Map<string, Derived>();

export function clearMemo(datasetId?: string): void {
  if (!datasetId) return memo.clear();
  for (const k of memo.keys()) if (k.includes(`"${datasetId}"`)) memo.delete(k);
}

export function derive(ds: Dataset, spec: DerivationSpec): Derived {
  const key = derivationKey(spec);
  const hit = memo.get(key);
  if (hit) {
    memo.delete(key);
    memo.set(key, hit); // LRU touch
    return hit;
  }
  const { bars, approx } = resample(ds.bars, spec.interval, {
    base: ds.meta.baseInterval,
    alignment: spec.alignment,
    session: ds.meta.session,
  });
  let line: Float64Array | null = null;
  let smoothed: Float64Array | null = null;
  if (spec.kind === 'line') {
    line = spec.priceSource === 'meanClose' ? meanCloses(ds.bars, bars.time) : priceSource(bars, spec.priceSource);
    if (spec.smoothing.method !== 'none') {
      // Smooth complete points only; the incomplete last point would move the smoothed line around.
      const n = line.length;
      const lastIncomplete = n > 0 && !(bars.flags[n - 1] & BarFlag.Complete);
      const input = lastIncomplete ? line.subarray(0, n - 1) : line;
      const s = smooth(input, spec.smoothing, spec.smoothInLogSpace);
      smoothed = new Float64Array(n).fill(NaN);
      smoothed.set(s);
    }
  }
  const result: Derived = { key, interval: spec.interval, bars, line, smooth: smoothed, approx };
  memo.set(key, result);
  if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value!);
  return result;
}

/** Index of the first bar with time ≥ t (binary search). */
export function lowerBound(time: Float64Array, t: number): number {
  let lo = 0;
  let hi = time.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Newest-first paging (design/02 §6): bars strictly before `endBefore`, at most `maxBars`. */
export function page(d: Derived, endBefore: number | null, maxBars: number): RenderPage {
  const end = endBefore === null ? d.bars.length : lowerBound(d.bars.time, endBefore);
  const start = Math.max(0, end - maxBars);
  const b = d.bars;
  return {
    key: d.key,
    time: b.time.slice(start, end),
    open: b.open.slice(start, end),
    high: b.high.slice(start, end),
    low: b.low.slice(start, end),
    close: b.close.slice(start, end),
    volume: b.volume ? b.volume.slice(start, end) : null,
    line: d.line ? d.line.slice(start, end) : null,
    smooth: d.smooth ? d.smooth.slice(start, end) : null,
    flags: b.flags.slice(start, end),
    hasOlder: start > 0,
    approx: d.approx,
    total: b.length,
  };
}

export interface RangeInfo {
  count: number;
  firstTime: number | null;
  lastTime: number | null;
}

export function rangeInfo(d: Derived, from: number, to: number): RangeInfo {
  const a = lowerBound(d.bars.time, from);
  const b = lowerBound(d.bars.time, to + 1);
  return {
    count: Math.max(0, b - a),
    firstTime: b > a ? d.bars.time[a] : null,
    lastTime: b > a ? d.bars.time[b - 1] : null,
  };
}

export function statsFor(d: Derived, from: number, to: number): RangeStats | null {
  return rangeStats(d.bars, d.interval, from, to);
}

/** CSV of the derived series, for "Export data". */
export function toCsv(d: Derived, precision: number): string {
  const b = d.bars;
  const head = ['time', 'open', 'high', 'low', 'close'];
  if (b.volume) head.push('volume');
  if (d.line) head.push('line');
  if (d.smooth) head.push('smoothed');
  head.push('complete');
  const rows = [head.join(',')];
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(precision) : '');
  for (let i = 0; i < b.length; i++) {
    const r = [new Date(b.time[i]).toISOString(), fmt(b.open[i]), fmt(b.high[i]), fmt(b.low[i]), fmt(b.close[i])];
    if (b.volume) r.push(Number.isFinite(b.volume[i]) ? String(b.volume[i]) : '');
    if (d.line) r.push(fmt(d.line[i]));
    if (d.smooth) r.push(fmt(d.smooth[i]));
    r.push(b.flags[i] & BarFlag.Complete ? 'true' : 'false');
    rows.push(r.join(','));
  }
  return rows.join('\n');
}

export interface Overview {
  time: Float64Array;
  lo: Float64Array;
  hi: Float64Array;
}

/** Min/max envelope of the derived series in `n` equal-count buckets (overview strip only). */
export function overview(d: Derived, n: number): Overview {
  const len = d.bars.length;
  const m = Math.max(1, Math.min(n, len));
  const time = new Float64Array(m);
  const lo = new Float64Array(m);
  const hi = new Float64Array(m);
  const src = d.line ?? d.bars.close;
  for (let b = 0; b < m; b++) {
    const a = Math.floor((b * len) / m);
    const e = Math.max(a + 1, Math.floor(((b + 1) * len) / m));
    let l = Infinity;
    let h = -Infinity;
    for (let i = a; i < e; i++) {
      const v = src[i];
      if (v < l) l = v; // NaN never compares, so missing values are skipped
      if (v > h) h = v;
    }
    time[b] = d.bars.time[a];
    lo[b] = l === Infinity ? NaN : l;
    hi[b] = h === -Infinity ? NaN : h;
  }
  return { time, lo, hi };
}
