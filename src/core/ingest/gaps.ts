import { BarFlag, type BarSeries, type Gap, type Interval, type SessionSpec } from '../model/types';
import { monthIndex, tradingDay, weekIndex } from '../time/tradingDate';
import { daysToCivil } from '../time/tz';

function weekdaysBetween(fromDay: number, toDay: number): number {
  // Weekdays strictly between the two day numbers.
  let n = 0;
  for (let d = fromDay + 1; d < toDay; d++) {
    const wd = daysToCivil(d).weekday;
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Detect missing bars against the session calendar and set `GapBefore` flags (design/03 §3.3).
 * Daily and intraday data only report runs of 3+ missing weekdays, so ordinary holidays are not noise.
 */
export function detectGaps(bars: BarSeries, base: Interval, session: SessionSpec): Gap[] {
  const gaps: Gap[] = [];
  const n = bars.length;
  if (n < 2) return gaps;
  let prevDay = tradingDay(bars.time[0], session);
  for (let i = 1; i < n; i++) {
    const day = tradingDay(bars.time[i], session);
    let missing = 0;
    switch (base.unit) {
      case 'week':
        missing = Math.floor((weekIndex(day) - weekIndex(prevDay)) / base.count) - 1;
        break;
      case 'month':
        missing = Math.floor((monthIndex(day) - monthIndex(prevDay)) / base.count) - 1;
        break;
      case 'year':
        missing = daysToCivil(day).year - daysToCivil(prevDay).year - base.count;
        break;
      case 'day':
      case 'hour':
      case 'minute': {
        if (day - prevDay > 1) {
          const wd = weekdaysBetween(prevDay, day);
          missing = wd >= 3 ? wd : 0;
        }
        break;
      }
    }
    if (missing > 0) {
      gaps.push({ after: bars.time[i - 1], before: bars.time[i], missing });
      bars.flags[i] |= BarFlag.GapBefore;
    }
    prevDay = day;
  }
  return gaps;
}
