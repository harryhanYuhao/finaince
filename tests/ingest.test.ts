import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestText, NeedsMappingError, IngestError } from '@/core/ingest/ingest';
import { BarFlag } from '@/core/model/types';
import { parseFileNameHint, inferPrecision } from '@/core/ingest/infer';

const SAMPLE = 'data/US500_SB_1w_1998-01-04_2026-11-15.csv';

describe('ingest sample file', () => {
  const text = readFileSync(SAMPLE, 'utf8');
  const ds = ingestText(text, { fileName: 'US500_SB_1w_1998-01-04_2026-11-15.csv' });

  it('reads all bars and strips the BOM', () => {
    expect(ds.meta.barCount).toBe(1506);
    expect(ds.meta.report.notes.find((n) => n.code === 'unparseable-rows')).toBeUndefined();
  });

  it('infers weekly interval, NY 17:00 session and precision 1', () => {
    expect(ds.meta.baseInterval).toEqual({ unit: 'week', count: 1 });
    expect(ds.meta.session).toEqual({ timeZone: 'America/New_York', sessionOpenMinutes: 17 * 60 });
    expect(ds.meta.precision).toBe(1);
    expect(ds.bars.high[0]).toBe(982.6);
  });

  it('parses file-name metadata', () => {
    expect(ds.meta.symbol).toBe('US500');
    expect(ds.meta.source).toBe('SB');
    expect(ds.meta.volumeKind).toBe('tick');
  });

  it('finds the missing week and the incomplete last bar', () => {
    expect(ds.meta.report.gaps).toHaveLength(1);
    expect(new Date(ds.meta.report.gaps[0].after).toISOString().slice(0, 10)).toBe('2017-07-23');
    expect(ds.meta.report.gaps[0].missing).toBe(1);
    expect(ds.bars.flags[ds.meta.barCount - 1] & BarFlag.Complete).toBe(0);
    expect(ds.bars.flags[0] & BarFlag.Complete).toBeTruthy();
  });
});

describe('ingest edge cases', () => {
  it('handles CRLF, semicolons, unsorted rows and duplicates', () => {
    const csv = 'Date;Open;High;Low;Close;Volume\r\n2024-01-03;2;3;1;2.5;10\r\n2024-01-02;1;2;0.5;1.5;5\r\n2024-01-03;2;3;1;2.6;11\r\n';
    const ds = ingestText(csv, { fileName: 'X.csv' });
    expect(ds.meta.barCount).toBe(2);
    expect(Array.from(ds.bars.close)).toEqual([1.5, 2.6]);
    const codes = ds.meta.report.notes.map((n) => n.code);
    expect(codes).toContain('unsorted');
    expect(codes).toContain('duplicates');
  });

  it('accepts close-only data as synthetic bars', () => {
    const ds = ingestText('date,price\n2024-01-01,10\n2024-01-02,11\n2024-01-03,12\n', { fileName: 'NAV.csv' });
    expect(ds.meta.synthetic).toBe(true);
    expect(ds.bars.flags[0] & BarFlag.Synthetic).toBeTruthy();
  });

  it('accepts epoch seconds and JSON columnar input', () => {
    const json = JSON.stringify({ t: [1704067200, 1704153600], o: [1, 2], h: [2, 3], l: [0.5, 1], c: [1.5, 2.5], v: [1, 2] });
    const ds = ingestText(json, { fileName: 'api.json' });
    expect(ds.meta.barCount).toBe(2);
    expect(ds.bars.time[0]).toBe(1704067200000);
  });

  it('asks for a mapping when columns are unknown', () => {
    expect(() => ingestText('a,b,c\n1,2,3\n', { fileName: 'x.csv' })).toThrow(NeedsMappingError);
  });

  it('rejects empty and header-only files', () => {
    expect(() => ingestText('', { fileName: 'x.csv' })).toThrow(IngestError);
    expect(() => ingestText('time,open,high,low,close\n', { fileName: 'x.csv' })).toThrow(IngestError);
  });

  it('flags inconsistent OHLC without fixing it', () => {
    const ds = ingestText('time,open,high,low,close\n2024-01-01,2,1,0.5,1.5\n2024-01-02,2,3,1,2\n', { fileName: 'x.csv' });
    expect(ds.meta.report.notes.map((n) => n.code)).toContain('ohlc-inconsistent');
    expect(ds.bars.high[0]).toBe(1);
  });
});

describe('helpers', () => {
  it('parses file-name hints', () => {
    expect(parseFileNameHint('EURUSD_IG_1d_2020.csv')).toEqual({ symbol: 'EURUSD', source: 'IG', interval: '1d' });
  });
  it('infers precision through float noise', () => {
    expect(inferPrecision([982.60000000000002, 921.70000000000005, 975])).toBe(1);
    expect(inferPrecision([1.23456, 1.2, 1.1])).toBe(5);
  });
});
