import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addSpan, checkStartDate, customRange, startDays } from '@/core/time/customRange';
import { civilToDays } from '@/core/time/tz';
import { tradingDay } from '@/core/time/tradingDate';
import { ingestText } from '@/core/ingest/ingest';
import { resolveTimeFrame } from '@/pipeline/resolve';

describe('start date entry', () => {
  it('fills a missing month and day with the first', () => {
    const y = checkStartDate('2020', '', '');
    expect(y).toEqual({ ok: true, date: { year: 2020 } });
    expect(startDays({ year: 2020 })).toBe(civilToDays(2020, 1, 1));
    expect(startDays({ year: 2020, month: 3 })).toBe(civilToDays(2020, 3, 1));
    expect(checkStartDate('2020', '3', '15')).toEqual({ ok: true, date: { year: 2020, month: 3, day: 15 } });
  });

  it('reports unknown dates with what to enter', () => {
    const noMonth = checkStartDate('2020', '', '15');
    expect(noMonth.ok).toBe(false);
    if (!noMonth.ok) expect(noMonth.reason).toMatch(/day needs a month.*Enter a year/);
    const noYear = checkStartDate('', '3', '');
    if (!noYear.ok) expect(noYear.reason).toMatch(/month needs a year/);
    expect(checkStartDate('', '', '4').ok).toBe(false);
    expect(checkStartDate('', '', '').ok).toBe(false);
    expect(checkStartDate('20', '', '').ok).toBe(false);
    const feb = checkStartDate('2021', '2', '29');
    if (!feb.ok) expect(feb.reason).toMatch(/February 2021 has days 1–28/);
    expect(checkStartDate('2020', '2', '29').ok).toBe(true);
  });
});

describe('span arithmetic', () => {
  const d = (y: number, m: number, day: number) => civilToDays(y, m, day);
  it('adds calendar spans and clamps month ends', () => {
    expect(addSpan(d(2020, 1, 1), { count: 10, unit: 'day' })).toBe(d(2020, 1, 11));
    expect(addSpan(d(2020, 1, 1), { count: 2, unit: 'week' })).toBe(d(2020, 1, 15));
    expect(addSpan(d(2020, 1, 31), { count: 1, unit: 'month' })).toBe(d(2020, 2, 29));
    expect(addSpan(d(2020, 11, 15), { count: 3, unit: 'month' })).toBe(d(2021, 2, 15));
    expect(addSpan(d(2020, 2, 29), { count: 1, unit: 'year' })).toBe(d(2021, 2, 28));
  });
});

describe('custom time frame on the sample', () => {
  const { meta } = ingestText(readFileSync('data/US500_SB_1w_1998-01-04_2026-11-15.csv', 'utf8'), {
    fileName: 'US500_SB_1w_1998-01-04_2026-11-15.csv',
  });

  it('covers trading dates [start, start + span)', () => {
    const r = resolveTimeFrame({ start: { year: 2020 }, span: { count: 1, unit: 'year' } }, meta);
    expect(customRange({ year: 2020 }, { count: 1, unit: 'year' }, meta.session)).toEqual(r);
    // Sessions open at 17:00 New York (22:00 UTC in winter) and trade for the next day.
    const open = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 22);
    expect(tradingDay(open(2019, 12, 31), meta.session)).toBe(civilToDays(2020, 1, 1));
    expect(open(2019, 12, 31)).toBeGreaterThanOrEqual(r.from);
    expect(open(2019, 12, 30)).toBeLessThan(r.from);
    expect(open(2020, 12, 30)).toBeLessThanOrEqual(r.to); // trading date 31 Dec 2020
    expect(open(2020, 12, 31)).toBeGreaterThan(r.to); // trading date 1 Jan 2021
  });

  it('clamps to the data', () => {
    const early = resolveTimeFrame({ start: { year: 1990 }, span: { count: 10, unit: 'year' } }, meta);
    expect(early.from).toBe(meta.range.from);
    const late = resolveTimeFrame({ start: { year: 2026, month: 6 }, span: { count: 5, unit: 'year' } }, meta);
    expect(late.to).toBe(meta.range.to);
  });
});
