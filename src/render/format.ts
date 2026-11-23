// Date and number formatting shared by the chart and the UI (design/03 §5, design/06 §1).

import type { DatasetMeta, Interval } from '@/core/model/types';
import type { DisplayZone } from '@/core/model/spec';
import { intervalMs } from '@/core/time/interval';
import { tradingDay } from '@/core/time/tradingDate';
import { DAY } from '@/core/time/tz';

export function zoneFor(display: DisplayZone, meta: DatasetMeta | null): string {
  if (display === 'utc') return 'UTC';
  if (display === 'local') return Intl.DateTimeFormat().resolvedOptions().timeZone;
  return meta?.session.timeZone ?? 'UTC';
}

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

export type DateStyle = 'long' | 'axis-year' | 'axis-month' | 'axis-day' | 'axis-time';

/**
 * Format a bar time. For day-and-longer intervals the bar's TRADING date is shown (a Sunday 17:00
 * New York open shows as Monday), never the raw open instant.
 */
export function formatBarTime(
  t: number,
  meta: DatasetMeta | null,
  interval: Interval | null,
  displayZone: DisplayZone,
  style: DateStyle = 'long',
  locale = 'en-US',
): string {
  const daily = interval ? intervalMs(interval) >= DAY - 1 : false;
  let instant = t;
  let timeZone = zoneFor(displayZone, meta);
  if (daily && meta) {
    instant = tradingDay(t, meta.session) * DAY + 12 * 3_600_000; // noon UTC on the trading date
    timeZone = 'UTC';
  }
  switch (style) {
    case 'axis-year':
      return fmt(locale, { timeZone, year: 'numeric' }).format(instant);
    case 'axis-month':
      return fmt(locale, { timeZone, month: 'short', year: daily && interval?.unit !== 'day' ? 'numeric' : undefined }).format(instant);
    case 'axis-day':
      return fmt(locale, { timeZone, day: 'numeric', month: 'short' }).format(instant);
    case 'axis-time':
      return fmt(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
    case 'long': {
      if (!daily) {
        return fmt(locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
      }
      if (interval && (interval.unit === 'month' || interval.unit === 'year')) {
        return fmt(locale, { timeZone, month: interval.unit === 'month' ? 'short' : undefined, year: 'numeric' }).format(instant);
      }
      return fmt(locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(instant);
    }
  }
}

export function formatDateShort(t: number, locale = 'en-US'): string {
  return fmt(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(t);
}

export function formatPrice(v: number | null | undefined, precision: number, locale = 'en-US'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString(locale, { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

export function formatSigned(v: number, precision: number, locale = 'en-US'): string {
  const s = formatPrice(Math.abs(v), precision, locale);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export function formatPct(v: number | null | undefined, digits = 2, signed = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = Math.abs(v * 100).toFixed(digits) + '%';
  if (!signed) return (v < 0 ? '−' : '') + s;
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export function formatVolume(v: number | null | undefined, locale = 'en-US'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(v);
}
