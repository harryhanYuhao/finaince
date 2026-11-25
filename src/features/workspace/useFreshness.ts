'use client';

import { useEffect } from 'react';
import type { DatasetMeta, Interval } from '@/core/model/types';
import { checkFreshness } from '@/core/time/freshness';
import { daysToCivil } from '@/core/time/tz';
import { useMessages } from '@/state/messages';
import { sourceOf } from '@/sources/registry';

const CHECK_EVERY_MS = 5 * 60_000;

function periodLabel(day: number, interval: Interval): string {
  const { year, month, day: d } = daysToCivil(day);
  const mon = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  switch (interval.unit) {
    case 'week':
      return `the week of ${d} ${mon} ${year}`;
    case 'month':
      return `${mon} ${year}`;
    case 'year':
      return String(year);
    default:
      return `${d} ${mon} ${year}`;
  }
}

/** Raises a persistent "not up to date" message for the open dataset (design/03 §7). */
export function useFreshness(meta: DatasetMeta | null): void {
  useEffect(() => {
    const msgs = useMessages.getState();
    if (!meta) {
      msgs.removeWhere('stale:');
      return;
    }
    const check = () => {
      const complete = !meta.report.notes.some((n) => n.code === 'incomplete-last');
      const f = checkFreshness(meta.range.to, complete, meta.baseInterval, meta.session, Date.now());
      // The id includes the current period, so a warning the user hid comes back when it gets worse.
      const id = `stale:${meta.id}:${f.currentDay}`;
      msgs.removeWhere('stale:', f.stale ? id : undefined);
      if (!f.stale) return;
      const source = sourceOf(meta.origin);
      const last = periodLabel(f.lastDay, meta.baseInterval);
      const now = periodLabel(f.currentDay, meta.baseInterval);
      const intraday = meta.baseInterval.unit === 'minute' || meta.baseInterval.unit === 'hour';
      msgs.raise({
        id,
        kind: 'warn',
        text: `${meta.symbol} data is not up to date: the latest bar is ${last}${f.lastComplete ? '' : ' (still forming when saved)'}.`,
        detail: [
          `${now.charAt(0).toUpperCase() + now.slice(1)} has ${intraday || meta.baseInterval.unit === 'day' ? 'traded' : 'started'}.`,
          source.live ? 'The source has not delivered newer bars yet.' : `This is a snapshot (${source.label.toLowerCase()}); load a newer file for current prices.`,
          meta.baseInterval.unit === 'day' || intraday ? 'A market holiday can also cause this.' : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
    };
    check();
    const t = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(t);
  }, [meta]);
}
