// Is a dataset up to date? (design/03 §7). Calendar-aware, so weekends never raise a false alarm.
//
// Bars are grouped into periods of the dataset's interval (trading days, weeks, months…). With
// `current` the period of the latest session that has started by now, the data is up to date when
//   - it already has a bar for `current` (the bar still forming), or
//   - its last bar is the complete bar of the period just before (the new bar isn't out yet).
// Otherwise a finished period is missing, or the last bar was still forming when its period ended.
// Intraday data is judged by trading day. Exchange holidays are not known, so a holiday can look
// like a missing day; the message says so.

import type { Interval, SessionSpec } from '../model/types';
import { monthIndex, tradingDay, weekIndex } from './tradingDate';
import { daysToCivil } from './tz';

export interface Freshness {
  stale: boolean;
  /** Periods between the last bar and the current one (0 = has the current bar). */
  behind: number;
  /** Trading day (days since epoch) of the last bar and of the latest started session. */
  lastDay: number;
  currentDay: number;
  lastComplete: boolean;
}

function isWeekend(day: number): boolean {
  const wd = daysToCivil(day).weekday;
  return wd === 0 || wd === 6;
}

/** Latest weekday whose session has started by `now`. */
export function latestSessionDay(now: number, session: SessionSpec): number {
  let d = tradingDay(now, session);
  while (isWeekend(d)) d--;
  return d;
}

/** Period index of a trading day for an interval; consecutive periods differ by 1. */
export function periodIndex(day: number, interval: Interval): number {
  switch (interval.unit) {
    case 'minute':
    case 'hour':
    case 'day': {
      // Business-day index, so Friday → Monday is one step.
      const wd = (daysToCivil(day).weekday + 6) % 7; // Monday = 0
      const business = weekIndex(day) * 5 + Math.min(wd, 4);
      return interval.unit === 'day' ? Math.floor(business / interval.count) : business;
    }
    case 'week':
      return Math.floor(weekIndex(day) / interval.count);
    case 'month':
      return Math.floor(monthIndex(day) / interval.count);
    case 'year':
      return Math.floor(daysToCivil(day).year / interval.count);
  }
}

export function checkFreshness(lastBarTime: number, lastComplete: boolean, interval: Interval, session: SessionSpec, now: number): Freshness {
  const lastDay = tradingDay(lastBarTime, session);
  const currentDay = latestSessionDay(now, session);
  const behind = periodIndex(currentDay, interval) - periodIndex(lastDay, interval);
  const stale = behind > 1 || (behind === 1 && !lastComplete);
  return { stale, behind: Math.max(0, behind), lastDay, currentDay, lastComplete };
}
