// Custom time frame: a start date (year, optionally month and day) plus a span to show.

import type { SessionSpec, TimeRange } from '../model/types';
import { DAY, civilToDays, daysToCivil } from './tz';

export type SpanUnit = 'day' | 'week' | 'month' | 'year';

export interface Span {
  count: number;
  unit: SpanUnit;
}

/** A start date as the user entered it: a missing month or day means "the first". */
export interface StartDate {
  year: number;
  month?: number; // 1-12
  day?: number;
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const START_DATE_HELP = 'Enter a year, optionally a month, then optionally a day (e.g. 2020, 2020 · Mar, or 2020 · Mar · 15).';

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Validate the year / month / day fields (empty string = not entered). A day needs a month and a
 * month needs a year; anything else is an unknown date.
 */
export function checkStartDate(year: string, month: string, day: string): { ok: true; date: StartDate } | { ok: false; reason: string } {
  const y = year.trim();
  const m = month.trim();
  const d = day.trim();
  if (!y && !m && !d) return { ok: false, reason: `Unknown date: no start entered. ${START_DATE_HELP}` };
  if (!y) return { ok: false, reason: `Unknown date: ${m ? 'a month' : 'a day'} needs a year. ${START_DATE_HELP}` };
  if (d && !m) return { ok: false, reason: `Unknown date: a day needs a month. ${START_DATE_HELP}` };
  if (!/^\d{4}$/.test(y) || Number(y) < 1800 || Number(y) > 2200) return { ok: false, reason: `Unknown date: "${y}" is not a year. Use four digits, e.g. 2020.` };
  const date: StartDate = { year: Number(y) };
  if (m) {
    const mn = Number(m);
    if (!Number.isInteger(mn) || mn < 1 || mn > 12) return { ok: false, reason: `Unknown date: "${m}" is not a month. Use 1–12.` };
    date.month = mn;
  }
  if (d) {
    const dn = Number(d);
    const max = daysInMonth(date.year, date.month!);
    if (!Number.isInteger(dn) || dn < 1 || dn > max) {
      return { ok: false, reason: `Unknown date: ${MONTH_NAMES[date.month! - 1]} ${date.year} has days 1–${max}.` };
    }
    date.day = dn;
  }
  return { ok: true, date };
}

/** Days since 1970-01-01 of the first day the start date covers. */
export function startDays(s: StartDate): number {
  return civilToDays(s.year, s.month ?? 1, s.day ?? 1);
}

/** Add a span to a civil day; months and years clamp to the end of a shorter month. */
export function addSpan(days: number, span: Span): number {
  if (span.unit === 'day') return days + span.count;
  if (span.unit === 'week') return days + 7 * span.count;
  const { year, month, day } = daysToCivil(days);
  const months = span.unit === 'year' ? 12 * span.count : span.count;
  const total = month - 1 + months;
  const y = year + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return civilToDays(y, m, Math.min(day, daysInMonth(y, m)));
}

/**
 * First instant of bars whose trading date is `days` or later. Evening sessions open the day
 * before their trading date (design/03 §5); midnight UTC falls between sessions for real zones.
 */
export function tradingDayStart(days: number, session: SessionSpec): number {
  return days * DAY - (session.sessionOpenMinutes >= 12 * 60 ? DAY : 0);
}

/** Trading-date window [start, start + span) as bar-open instants, unclamped. */
export function customRange(start: StartDate, span: Span, session: SessionSpec): TimeRange {
  const from = startDays(start);
  return { from: tradingDayStart(from, session), to: tradingDayStart(addSpan(from, span), session) - 1 };
}

export function startDateLabel(s: StartDate): string {
  if (s.month === undefined) return String(s.year);
  const mon = MONTH_NAMES[s.month - 1].slice(0, 3);
  return s.day === undefined ? `${mon} ${s.year}` : `${s.day} ${mon} ${s.year}`;
}

export function spanLabel(s: Span): string {
  return `${s.count} ${s.unit}${s.count === 1 ? '' : 's'}`;
}
