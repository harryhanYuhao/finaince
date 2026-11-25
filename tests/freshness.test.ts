import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkFreshness, latestSessionDay, periodIndex } from '@/core/time/freshness';
import { ingestText } from '@/core/ingest/ingest';
import { civilToDays, daysToCivil } from '@/core/time/tz';
import type { SessionSpec } from '@/core/model/types';

const NY_EVENING: SessionSpec = { timeZone: 'America/New_York', sessionOpenMinutes: 17 * 60 };
const NY_MORNING: SessionSpec = { timeZone: 'America/New_York', sessionOpenMinutes: 9 * 60 + 30 };
const UTC0: SessionSpec = { timeZone: 'UTC', sessionOpenMinutes: 0 };
const day = { unit: 'day' as const, count: 1 };
const week = { unit: 'week' as const, count: 1 };
const civil = (d: number) => {
  const c = daysToCivil(d);
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
};

describe('latest session', () => {
  it('skips weekends and respects the session open', () => {
    // Saturday 2026-11-21 noon New York → Friday's session (it opened Thursday evening).
    expect(civil(latestSessionDay(Date.UTC(2026, 10, 21, 17), NY_EVENING))).toBe('2026-11-20');
    // Sunday 18:00 New York (23:00 UTC): Monday's evening session has opened.
    expect(civil(latestSessionDay(Date.UTC(2026, 10, 22, 23), NY_EVENING))).toBe('2026-11-23');
    // Monday 08:00 New York, before a 09:30 open → still Friday.
    expect(civil(latestSessionDay(Date.UTC(2026, 10, 23, 13), NY_MORNING))).toBe('2026-11-20');
    expect(civil(latestSessionDay(Date.UTC(2026, 10, 23, 15), NY_MORNING))).toBe('2026-11-23');
  });

  it('counts business days so Friday → Monday is one step', () => {
    expect(periodIndex(civilToDays(2026, 11, 23), day) - periodIndex(civilToDays(2026, 11, 20), day)).toBe(1);
    expect(periodIndex(civilToDays(2026, 11, 23), week) - periodIndex(civilToDays(2026, 11, 20), week)).toBe(1);
  });
});

describe('freshness of daily data', () => {
  const friday = Date.UTC(2026, 10, 20); // a complete daily bar for Friday (UTC midnight dates)
  it('is fresh over the weekend and while Monday has just begun', () => {
    expect(checkFreshness(friday, true, day, UTC0, Date.UTC(2026, 10, 22, 12)).stale).toBe(false);
    expect(checkFreshness(friday, true, day, UTC0, Date.UTC(2026, 10, 23, 12)).stale).toBe(false);
  });
  it('is stale once a finished trading day is missing', () => {
    const f = checkFreshness(friday, true, day, UTC0, Date.UTC(2026, 10, 24, 12));
    expect(f).toMatchObject({ stale: true, behind: 2 });
  });
  it('is stale when the last bar was still forming and its day has ended', () => {
    expect(checkFreshness(friday, false, day, UTC0, Date.UTC(2026, 10, 23, 12)).stale).toBe(true);
    expect(checkFreshness(friday, false, day, UTC0, Date.UTC(2026, 10, 20, 18)).stale).toBe(false);
  });
});

describe('freshness of the weekly sample', () => {
  const { meta } = ingestText(readFileSync('data/US500_SB_1w_1998-01-04_2026-11-15.csv', 'utf8'), {
    fileName: 'US500_SB_1w_1998-01-04_2026-11-15.csv',
  });
  const complete = !meta.report.notes.some((n) => n.code === 'incomplete-last');

  it('was fresh during the week it was saved', () => {
    expect(complete).toBe(false);
    expect(checkFreshness(meta.range.to, complete, week, meta.session, Date.UTC(2026, 10, 19, 15)).stale).toBe(false);
  });

  it('is out of date once the next week has started', () => {
    const f = checkFreshness(meta.range.to, complete, week, meta.session, Date.UTC(2026, 10, 23, 15));
    expect(f).toMatchObject({ stale: true, behind: 1 });
    expect(civil(f.lastDay)).toBe('2026-11-16');
    expect(civil(f.currentDay)).toBe('2026-11-23');
  });
});
