// Time-zone helpers built on Intl only (no external tz database needed).

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a time zone. */
export function localParts(timeZone: string, epochMs: number): LocalParts {
  if (timeZone === 'UTC') {
    const d = new Date(epochMs);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    };
  }
  const parts = formatter(timeZone).formatToParts(epochMs);
  const out: LocalParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const p of parts) {
    switch (p.type) {
      case 'year':
        out.year = Number(p.value);
        break;
      case 'month':
        out.month = Number(p.value);
        break;
      case 'day':
        out.day = Number(p.value);
        break;
      case 'hour':
        out.hour = Number(p.value);
        break;
      case 'minute':
        out.minute = Number(p.value);
        break;
      case 'second':
        out.second = Number(p.value);
        break;
    }
  }
  return out;
}

/** Offset of the zone from UTC at the instant, in ms (New York in winter → -5h). */
export function tzOffsetMs(timeZone: string, epochMs: number): number {
  if (timeZone === 'UTC') return 0;
  const p = localParts(timeZone, epochMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Wall-clock epoch: the instant shifted so that its UTC fields equal the zone's local fields. */
export function toWallClock(timeZone: string, epochMs: number): number {
  return epochMs + tzOffsetMs(timeZone, epochMs);
}

/** Instant for a local wall-clock time in a zone (resolves DST by two-pass correction). */
export function fromWallClock(timeZone: string, wallMs: number): number {
  let guess = wallMs - tzOffsetMs(timeZone, wallMs);
  guess = wallMs - tzOffsetMs(timeZone, guess);
  return guess;
}

/** Days since 1970-01-01 for a civil date. */
export function civilToDays(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY);
}

export function daysToCivil(days: number): { year: number; month: number; day: number; weekday: number } {
  const d = new Date(days * DAY);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(), // 0 = Sunday
  };
}
