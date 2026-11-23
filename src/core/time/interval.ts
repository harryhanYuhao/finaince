import type { Interval, IntervalUnit } from '../model/types';
import { DAY, HOUR, MINUTE } from './tz';

const UNIT_MS: Record<IntervalUnit, number> = {
  minute: MINUTE,
  hour: HOUR,
  day: DAY,
  week: 7 * DAY,
  month: 30.436875 * DAY,
  year: 365.2425 * DAY,
};

const UNIT_ORDER: IntervalUnit[] = ['minute', 'hour', 'day', 'week', 'month', 'year'];

/** Nominal duration in ms (months and years are averages). */
export function intervalMs(i: Interval): number {
  return UNIT_MS[i.unit] * i.count;
}

export function sameInterval(a: Interval, b: Interval): boolean {
  return a.unit === b.unit && a.count === b.count;
}

export function intervalKey(i: Interval): string {
  return `${i.count}${i.unit}`;
}

const SHORT: Record<IntervalUnit, string> = { minute: 'm', hour: 'h', day: 'D', week: 'W', month: 'M', year: 'Y' };

export function intervalShortLabel(i: Interval): string {
  if (i.unit === 'month' && i.count === 3) return '1Q';
  return `${i.count}${SHORT[i.unit]}`;
}

export function intervalLongLabel(i: Interval): string {
  if (i.unit === 'month' && i.count === 3) return 'Quarterly';
  if (i.count === 1) {
    return { minute: '1 minute', hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[i.unit];
  }
  return `${i.count} ${i.unit}s`;
}

/** Point label used in the UI ("1 point per 2 weeks"). */
export function intervalPerLabel(i: Interval): string {
  return i.count === 1 ? i.unit : `${i.count} ${i.unit}s`;
}

/**
 * Parse free text such as "3w", "2M", "1y", "15m", "4h", "2 months", "quarter".
 * Case matters only for m/M (minute vs month).
 */
export function parseInterval(text: string): Interval | null {
  const t = text.trim();
  if (!t) return null;
  if (/^(q|quarter|quarterly|1q)$/i.test(t)) return { unit: 'month', count: 3 };
  const m = /^(\d+)?\s*([a-zA-Z]+)$/.exec(t);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  if (!Number.isInteger(count) || count < 1 || count > 10_000) return null;
  const u = m[2];
  let unit: IntervalUnit | null = null;
  if (u === 'm' || /^(min|mins|minute|minutes)$/i.test(u)) unit = 'minute';
  else if (u === 'M' || /^(mo|mon|month|months)$/i.test(u)) unit = 'month';
  else if (/^(h|hr|hrs|hour|hours)$/i.test(u)) unit = 'hour';
  else if (/^(d|day|days)$/i.test(u)) unit = 'day';
  else if (/^(w|wk|wks|week|weeks)$/i.test(u)) unit = 'week';
  else if (/^(y|yr|yrs|year|years)$/i.test(u)) unit = 'year';
  else if (/^(q|quarter|quarters)$/i.test(u)) return { unit: 'month', count: 3 * count };
  if (!unit) return null;
  return { unit, count };
}

export type IntervalValidity = { ok: true; approx: boolean } | { ok: false; reason: string };

/**
 * Can `target` be built from bars of `base` (design/04 §2.2)?
 * `approx` is true when target boundaries cannot coincide with base bars (weeks → months).
 */
export function checkTarget(base: Interval, target: Interval): IntervalValidity {
  const bi = UNIT_ORDER.indexOf(base.unit);
  const ti = UNIT_ORDER.indexOf(target.unit);
  if (intervalMs(target) < intervalMs(base) - 1) {
    return { ok: false, reason: `Finer than the data's ${intervalLongLabel(base).toLowerCase()} interval` };
  }
  if (ti < bi) return { ok: false, reason: `Finer than the data's ${intervalLongLabel(base).toLowerCase()} interval` };

  if (base.unit === target.unit) {
    return target.count % base.count === 0
      ? { ok: true, approx: false }
      : { ok: false, reason: `Must be a multiple of ${intervalShortLabel(base)}` };
  }
  switch (base.unit) {
    case 'minute':
      if (target.unit === 'hour') {
        return (target.count * 60) % base.count === 0
          ? { ok: true, approx: false }
          : { ok: false, reason: `Hours must divide evenly into ${base.count}-minute bars` };
      }
      return { ok: true, approx: false };
    case 'hour':
      return { ok: true, approx: false };
    case 'day':
      return { ok: true, approx: false };
    case 'week':
      if (base.count !== 1) {
        return target.unit === 'week' ? { ok: true, approx: false } : { ok: false, reason: 'Use 1-week data to build months' };
      }
      return { ok: true, approx: true }; // weeks do not tile months/years
    case 'month':
      if (target.unit === 'year') {
        return 12 % base.count === 0 ? { ok: true, approx: false } : { ok: false, reason: 'Months must divide a year' };
      }
      return { ok: false, reason: 'Invalid target' };
    case 'year':
      return { ok: false, reason: 'Invalid target' };
  }
}

/** Preset intervals offered for a base interval (only valid ones). */
export function presetTargets(base: Interval): Interval[] {
  const all: Interval[] = [
    { unit: 'minute', count: 1 },
    { unit: 'minute', count: 5 },
    { unit: 'minute', count: 15 },
    { unit: 'minute', count: 30 },
    { unit: 'hour', count: 1 },
    { unit: 'hour', count: 4 },
    { unit: 'day', count: 1 },
    { unit: 'week', count: 1 },
    { unit: 'week', count: 2 },
    { unit: 'week', count: 4 },
    { unit: 'month', count: 1 },
    { unit: 'month', count: 3 },
    { unit: 'month', count: 6 },
    { unit: 'year', count: 1 },
  ];
  const out = all.filter((t) => checkTarget(base, t).ok);
  if (!out.some((t) => sameInterval(t, base))) out.unshift(base);
  return out.sort((a, b) => intervalMs(a) - intervalMs(b));
}

/** Snap a typical spacing (ms) to the nearest calendar interval (design/03 §3.4). */
export function detectInterval(medianDeltaMs: number): Interval {
  const candidates: Interval[] = [
    { unit: 'minute', count: 1 },
    { unit: 'minute', count: 5 },
    { unit: 'minute', count: 15 },
    { unit: 'minute', count: 30 },
    { unit: 'hour', count: 1 },
    { unit: 'hour', count: 4 },
    { unit: 'day', count: 1 },
    { unit: 'week', count: 1 },
    { unit: 'month', count: 1 },
    { unit: 'month', count: 3 },
    { unit: 'year', count: 1 },
  ];
  let best = candidates[0];
  let bestErr = Infinity;
  for (const c of candidates) {
    const err = Math.abs(Math.log(medianDeltaMs / intervalMs(c)));
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  // Non-standard minute/hour multiples (e.g. 10m, 2h)
  if (best.unit === 'minute' || best.unit === 'hour') {
    const minutes = Math.round(medianDeltaMs / MINUTE);
    if (minutes > 0 && minutes < 60) return { unit: 'minute', count: minutes };
    if (minutes % 60 === 0 && minutes < 1440) return { unit: 'hour', count: minutes / 60 };
  }
  return best;
}
