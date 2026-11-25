// Inference helpers used during normalisation (design/03 §3.4, §5).

import type { Interval, SessionSpec } from '../model/types';
import { detectInterval, intervalMs } from '../time/interval';
import { DAY, MINUTE, toWallClock } from '../time/tz';

/**
 * Smallest number of decimals that represents the share `coverage` of the values exactly
 * (default: almost all of them).
 */
export function inferPrecision(values: ArrayLike<number>, maxSample = 2000, coverage = 0.99): number {
  const n = values.length;
  if (n === 0) return 2;
  const step = Math.max(1, Math.floor(n / maxSample));
  const decimals: number[] = [];
  for (let i = 0; i < n; i += step) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    let d = 0;
    for (; d <= 8; d++) {
      const scaled = v * 10 ** d;
      if (Math.abs(scaled - Math.round(scaled)) < Math.max(1e-6, Math.abs(scaled) * 1e-12)) break;
    }
    decimals.push(Math.min(d, 8));
  }
  if (decimals.length === 0) return 2;
  decimals.sort((a, b) => a - b);
  return decimals[Math.min(decimals.length - 1, Math.floor(decimals.length * coverage))];
}

export function roundTo(v: number, decimals: number): number {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function medianDelta(time: Float64Array): number {
  const n = time.length;
  if (n < 2) return DAY;
  const deltas: number[] = [];
  const step = Math.max(1, Math.floor(n / 5000));
  for (let i = 1; i < n; i += step) deltas.push(time[i] - time[i - 1]);
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

export function inferBaseInterval(time: Float64Array): Interval {
  return detectInterval(medianDelta(time));
}

const CANDIDATE_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Australia/Sydney',
];

/**
 * Find the exchange time zone in which session opens happen at a constant local time.
 * Returns `confident: false` when no zone fits (falls back to UTC midnight).
 */
export function inferSession(time: Float64Array, base: Interval): { session: SessionSpec; confident: boolean } {
  const n = time.length;
  const intraday = intervalMs(base) < DAY;
  const opens: number[] = [];
  if (intraday) {
    // Session starts are bars that follow a long pause (> 3 bars).
    const pause = intervalMs(base) * 3;
    for (let i = 1; i < n && opens.length < 400; i++) {
      if (time[i] - time[i - 1] > pause) opens.push(time[i]);
    }
  } else {
    const step = Math.max(1, Math.floor(n / 600));
    for (let i = 0; i < n; i += step) opens.push(time[i]);
  }
  if (opens.length === 0) return { session: { timeZone: 'UTC', sessionOpenMinutes: 0 }, confident: false };

  for (const zone of CANDIDATE_ZONES) {
    const counts = new Map<number, number>();
    for (const t of opens) {
      const wall = toWallClock(zone, t);
      const minuteOfDay = Math.floor((((wall % DAY) + DAY) % DAY) / MINUTE);
      counts.set(minuteOfDay, (counts.get(minuteOfDay) ?? 0) + 1);
    }
    let bestMinute = 0;
    let bestCount = 0;
    for (const [m, c] of counts) {
      if (c > bestCount) {
        bestCount = c;
        bestMinute = m;
      }
    }
    if (bestCount / opens.length >= 0.98) {
      return { session: { timeZone: zone, sessionOpenMinutes: bestMinute }, confident: true };
    }
  }
  return { session: { timeZone: 'UTC', sessionOpenMinutes: 0 }, confident: false };
}

/** Parse "{symbol}_{source}_{interval}_{from}_{to}.csv" style names (a hint only). */
export function parseFileNameHint(name: string): { symbol?: string; source?: string; interval?: string } {
  const base = name.replace(/\.[^.]+$/, '');
  const parts = base.split(/[_\s]+/).filter(Boolean);
  if (parts.length === 0) return {};
  const out: { symbol?: string; source?: string; interval?: string } = { symbol: parts[0] };
  const intervalIdx = parts.findIndex((p, i) => i > 0 && /^\d+(m|h|d|w|M|mo|mn|y)$/i.test(p));
  if (intervalIdx > 0) {
    out.interval = parts[intervalIdx];
    if (intervalIdx > 1) out.source = parts.slice(1, intervalIdx).join(' ');
  } else if (parts.length > 1 && !/^\d/.test(parts[1])) {
    out.source = parts[1];
  }
  return out;
}
