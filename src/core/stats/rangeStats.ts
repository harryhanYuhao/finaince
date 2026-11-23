// Light statistics over a range of complete bars (design/04 §4).

import { BarFlag, type BarSeries, type Interval } from '../model/types';
import { intervalMs } from '../time/interval';
import { DAY } from '../time/tz';

export interface RangeStats {
  bars: number;
  from: number;
  to: number;
  firstClose: number;
  lastClose: number;
  change: number;
  changePct: number;
  high: number;
  highTime: number;
  low: number;
  lowTime: number;
  /** Compound annual growth rate; null under one year. */
  cagr: number | null;
  /** Annualised volatility of log returns; null with fewer than 3 returns. */
  volatility: number | null;
  periodsPerYear: number;
  maxDrawdown: number;
  drawdownPeakTime: number;
  drawdownTroughTime: number;
  gaps: number;
}

/** Stats for bars with `from ≤ time ≤ to`. Incomplete and partial bars are excluded. */
export function rangeStats(bars: BarSeries, interval: Interval, from: number, to: number): RangeStats | null {
  const idx: number[] = [];
  let gaps = 0;
  for (let i = 0; i < bars.length; i++) {
    const t = bars.time[i];
    if (t < from || t > to) continue;
    const f = bars.flags[i];
    if (!(f & BarFlag.Complete) || f & BarFlag.PartialStart) continue;
    if (f & BarFlag.GapBefore && idx.length > 0) gaps++;
    idx.push(i);
  }
  if (idx.length === 0) return null;
  const first = idx[0];
  const last = idx[idx.length - 1];
  let high = -Infinity;
  let low = Infinity;
  let highTime = 0;
  let lowTime = 0;
  let peak = -Infinity;
  let peakTime = 0;
  let maxDd = 0;
  let ddPeak = 0;
  let ddTrough = 0;
  const rets: number[] = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (bars.high[i] > high) {
      high = bars.high[i];
      highTime = bars.time[i];
    }
    if (bars.low[i] < low) {
      low = bars.low[i];
      lowTime = bars.time[i];
    }
    const c = bars.close[i];
    if (c > peak) {
      peak = c;
      peakTime = bars.time[i];
    }
    const dd = peak > 0 ? c / peak - 1 : 0;
    if (dd < maxDd) {
      maxDd = dd;
      ddPeak = peakTime;
      ddTrough = bars.time[i];
    }
    if (k > 0) {
      const prev = bars.close[idx[k - 1]];
      if (prev > 0 && c > 0) rets.push(Math.log(c / prev));
    }
  }
  const firstClose = bars.close[first];
  const lastClose = bars.close[last];
  const years = (bars.time[last] - bars.time[first]) / (365.2425 * DAY);
  const periodsPerYear = (365.2425 * DAY) / intervalMs(interval);
  let volatility: number | null = null;
  if (rets.length >= 3) {
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
    volatility = Math.sqrt(variance) * Math.sqrt(periodsPerYear);
  }
  return {
    bars: idx.length,
    from: bars.time[first],
    to: bars.time[last],
    firstClose,
    lastClose,
    change: lastClose - firstClose,
    changePct: firstClose !== 0 ? lastClose / firstClose - 1 : NaN,
    high,
    highTime,
    low,
    lowTime,
    cagr: years >= 1 && firstClose > 0 && lastClose > 0 ? (lastClose / firstClose) ** (1 / years) - 1 : null,
    volatility,
    periodsPerYear,
    maxDrawdown: maxDd,
    drawdownPeakTime: ddPeak,
    drawdownTroughTime: ddTrough,
    gaps,
  };
}
