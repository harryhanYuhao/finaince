import type { SessionSpec } from '../model/types';
import { DAY, MINUTE, civilToDays, daysToCivil, toWallClock } from './tz';

/**
 * Trading date of a bar (design/03 §5), as days since 1970-01-01.
 *
 * A session that opens in the evening (e.g. 17:00 New York, the FX/CFD convention) belongs to the
 * NEXT calendar day; a session that opens in the morning belongs to the same day.
 */
export function tradingDay(epochMs: number, session: SessionSpec): number {
  const wall = toWallClock(session.timeZone, epochMs);
  const open = session.sessionOpenMinutes * MINUTE;
  const shift = session.sessionOpenMinutes >= 12 * 60 ? DAY - open : -open;
  return Math.floor((wall + shift) / DAY);
}

/** Minutes since the session opened (0 … 1439), in the session's zone. */
export function minutesIntoSession(epochMs: number, session: SessionSpec): number {
  const wall = toWallClock(session.timeZone, epochMs);
  const minuteOfDay = Math.floor((((wall % DAY) + DAY) % DAY) / MINUTE);
  return (minuteOfDay - session.sessionOpenMinutes + 1440) % 1440;
}

/** ISO-8601 week-numbering year and week of a day number. */
export function isoWeek(days: number): { isoYear: number; week: number } {
  const { weekday } = daysToCivil(days);
  const isoWeekday = weekday === 0 ? 7 : weekday; // Monday = 1
  const thursday = days + (4 - isoWeekday);
  const { year } = daysToCivil(thursday);
  const jan1 = civilToDays(year, 1, 1);
  return { isoYear: year, week: Math.floor((thursday - jan1) / 7) + 1 };
}

/** Monday-based week index since the epoch (1970-01-01 was a Thursday). */
export function weekIndex(days: number): number {
  return Math.floor((days + 3) / 7);
}

export function monthIndex(days: number): number {
  const { year, month } = daysToCivil(days);
  return year * 12 + (month - 1);
}
