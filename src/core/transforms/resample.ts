// OHLCV resampling (design/04 §2.3). Single linear pass; empty buckets produce no bar.

import { BarFlag, emptySeries, type BarSeries, type Interval, type SessionSpec } from '../model/types';
import { checkTarget, intervalMs, sameInterval } from '../time/interval';
import { isoWeek, minutesIntoSession, monthIndex, tradingDay, weekIndex } from '../time/tradingDate';
import { daysToCivil } from '../time/tz';

export type Alignment = 'calendar' | 'rollingFirst' | 'rollingLast';

export interface ResampleOptions {
  base: Interval;
  alignment: Alignment;
  session: SessionSpec;
}

export interface ResampleResult {
  bars: BarSeries;
  approx: boolean;
}

/** Calendar bucket key of a bar for the target interval. */
function calendarKey(t: number, target: Interval, session: SessionSpec): number {
  const day = tradingDay(t, session);
  switch (target.unit) {
    case 'minute':
    case 'hour': {
      const minutes = target.unit === 'hour' ? target.count * 60 : target.count;
      return day * 2000 + Math.floor(minutesIntoSession(t, session) / minutes);
    }
    case 'day':
      return Math.floor(day / target.count);
    case 'week': {
      if (target.count === 1) return weekIndex(day);
      const { isoYear, week } = isoWeek(day);
      return isoYear * 100 + Math.floor((week - 1) / target.count);
    }
    case 'month': {
      const mi = monthIndex(day);
      if (12 % target.count === 0) {
        const year = Math.floor(mi / 12);
        return year * 12 + Math.floor((mi % 12) / target.count);
      }
      return Math.floor(mi / target.count);
    }
    case 'year':
      return Math.floor(daysToCivil(day).year / target.count);
  }
}

/** Median bars per bucket, ignoring the (possibly partial) first and last buckets. */
function typicalCount(counts: Int32Array, nominal: number): number {
  if (counts.length < 3) return nominal;
  const inner = Array.from(counts.subarray(1, counts.length - 1)).sort((a, b) => a - b);
  return inner[Math.floor(inner.length / 2)];
}

export function resample(src: BarSeries, target: Interval, opts: ResampleOptions): ResampleResult {
  const validity = checkTarget(opts.base, target);
  if (!validity.ok) throw new Error(validity.reason);
  if (sameInterval(target, opts.base)) return { bars: src, approx: false };

  const n = src.length;
  // Bucket assignment.
  const bucketOf = new Int32Array(n);
  if (opts.alignment === 'calendar') {
    let b = -1;
    let prevKey = NaN;
    for (let i = 0; i < n; i++) {
      const key = calendarKey(src.time[i], target, opts.session);
      if (key !== prevKey) {
        b++;
        prevKey = key;
      }
      bucketOf[i] = b;
    }
  } else {
    const per = Math.max(1, Math.round(intervalMs(target) / intervalMs(opts.base)));
    const offset = opts.alignment === 'rollingLast' ? (per - (n % per)) % per : 0;
    for (let i = 0; i < n; i++) bucketOf[i] = Math.floor((i + offset) / per);
  }
  const m = n === 0 ? 0 : bucketOf[n - 1] - bucketOf[0] + 1;
  const out = emptySeries(m, src.volume !== null);
  const counts = new Int32Array(m);

  let j = -1;
  for (let i = 0; i < n; i++) {
    const b = bucketOf[i] - bucketOf[0];
    if (b !== j) {
      j = b;
      out.time[j] = src.time[i];
      out.open[j] = src.open[i];
      out.high[j] = src.high[i];
      out.low[j] = src.low[i];
      out.close[j] = src.close[i];
      if (out.volume) out.volume[j] = src.volume![i];
      out.flags[j] = src.flags[i] & (BarFlag.Complete | BarFlag.TradingDay | BarFlag.MarketOpen | BarFlag.Synthetic | BarFlag.GapBefore);
    } else {
      if (src.high[i] > out.high[j]) out.high[j] = src.high[i];
      if (src.low[i] < out.low[j]) out.low[j] = src.low[i];
      out.close[j] = src.close[i];
      if (out.volume) {
        const v = src.volume![i];
        if (!Number.isNaN(v)) out.volume[j] = Number.isNaN(out.volume[j]) ? v : out.volume[j] + v;
      }
      if (!(src.flags[i] & BarFlag.Complete)) out.flags[j] &= ~BarFlag.Complete;
      if (src.flags[i] & BarFlag.GapBefore) out.flags[j] |= BarFlag.GapBefore;
    }
    counts[j]++;
  }

  // Partial first / last buckets (data starts or ends mid-bucket).
  if (m > 1) {
    const expected = intervalMs(target) / intervalMs(opts.base);
    const per = Math.max(1, Math.round(expected));
    if (opts.alignment === 'calendar') {
      // Compare edge buckets with the typical full bucket in this data, not with calendar time:
      // a month of daily bars has ~21 trading days, not 30.
      const threshold = Math.max(1, Math.ceil(typicalCount(counts, expected) * 0.75));
      if (counts[0] < threshold) out.flags[0] |= BarFlag.PartialStart;
      if (counts[m - 1] < threshold) out.flags[m - 1] &= ~BarFlag.Complete;
    } else if (opts.alignment === 'rollingFirst') {
      if (counts[m - 1] < per) out.flags[m - 1] &= ~BarFlag.Complete;
    } else if (counts[0] < per) {
      out.flags[0] |= BarFlag.PartialStart;
    }
  }
  if (validity.approx) for (let k = 0; k < m; k++) out.flags[k] |= BarFlag.Approx;
  return { bars: out, approx: validity.approx };
}
