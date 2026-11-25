import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAggs, parseAggsQuery, MassiveError } from '@/server/massive';
import { ingestText } from '@/core/ingest/ingest';
import { sourceOf } from '@/sources/registry';
import { TRANSIENT_MS, useMessages } from '@/state/messages';

describe('Massive query validation', () => {
  const q = (o: Record<string, string>) => parseAggsQuery(new URLSearchParams({ ticker: 'SPY', multiplier: '1', timespan: 'day', from: '2024-01-01', to: '2024-12-31', ...o }));
  it('accepts stocks, indices and crypto tickers', () => {
    expect(q({})).toMatchObject({ ticker: 'SPY', multiplier: 1, timespan: 'day' });
    expect(q({ ticker: 'brk.b' })).toMatchObject({ ticker: 'BRK.B' });
    expect(q({ ticker: 'I:SPX' })).toMatchObject({ ticker: 'I:SPX' });
  });
  it('rejects anything that could change the upstream path', () => {
    expect(typeof q({ ticker: '../v1/x' })).toBe('string');
    expect(typeof q({ ticker: 'SPY/range' })).toBe('string');
    expect(typeof q({ timespan: 'second' })).toBe('string');
    expect(typeof q({ multiplier: '0' })).toBe('string');
    expect(typeof q({ from: '2025-01-01' })).toBe('string');
    expect(typeof q({ to: '2024-1-1' })).toBe('string');
  });
});

describe('Massive fetching', () => {
  const cfg = { key: 'test-key', base: 'https://api.massive.com' };
  const query = { ticker: 'SPY', multiplier: 1, timespan: 'day' as const, from: '2024-01-01', to: '2024-01-10' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('sends the key as a header and follows next_url on the same host only', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
      if (calls.length === 1) return json({ results: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10, vw: 1.2 }], next_url: 'https://api.massive.com/v2/aggs/next?cursor=abc' });
      if (calls.length === 2) return json({ results: [{ t: 2, o: 1.5, h: 2.5, l: 1, c: 2 }], next_url: 'https://evil.example.com/steal' });
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    const bars = await fetchAggs(query, cfg, fake);
    expect(bars).toEqual([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
      { t: 2, o: 1.5, h: 2.5, l: 1, c: 2 },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://api.massive.com/v2/aggs/ticker/SPY/range/1/day/2024-01-01/2024-01-10?adjusted=true&sort=asc&limit=50000');
    expect(calls[0].url).not.toContain('test-key');
    expect(calls.every((c) => c.auth === 'Bearer test-key')).toBe(true);
  });

  it('reports upstream errors', async () => {
    const fake = (async () => json({ status: 'ERROR', error: 'Unknown API Key' }, 401)) as unknown as typeof fetch;
    await expect(fetchAggs(query, cfg, fake)).rejects.toThrow(MassiveError);
    await expect(fetchAggs(query, cfg, fake)).rejects.toThrow('Unknown API Key');
  });
});

describe('Massive responses through ingest', () => {
  const body = JSON.stringify({
    ticker: 'SPY',
    multiplier: 1,
    timespan: 'day',
    resultsCount: 3,
    results: [
      { t: Date.UTC(2024, 0, 2, 5), o: 472.16, h: 473.67, l: 470.49, c: 472.65, v: 123623700 },
      { t: Date.UTC(2024, 0, 3, 5), o: 470.43, h: 471.19, l: 468.17, c: 468.79, v: 103585900 },
      { t: Date.UTC(2024, 0, 4, 5), o: 468.3, h: 470.96, l: 467.05, c: 467.28, v: 84232200 },
    ],
  });
  const origin = { kind: 'massive' as const, ticker: 'SPY', multiplier: 1, timespan: 'day', fetchedAt: 0 };

  it('reads the bars, symbol and source', () => {
    const ds = ingestText(body, { fileName: 'SPY_Massive_1d.json', origin, idKey: 'massive:SPY:1day' });
    expect(ds.meta.barCount).toBe(3);
    expect(ds.meta.symbol).toBe('SPY');
    expect(ds.meta.precision).toBe(2);
    expect(ds.meta.volumeKind).toBe('traded');
    expect(ds.bars.close[2]).toBe(467.28);
    expect(sourceOf(ds.meta.origin)).toMatchObject({ id: 'massive', live: true });
  });

  it('keeps one id per ticker and interval across re-fetches', () => {
    const a = ingestText(body, { fileName: 'SPY_Massive_1d.json', origin, idKey: 'massive:SPY:1day' });
    const b = ingestText(body.replace('467.28', '468.00'), { fileName: 'SPY_Massive_1d.json', origin, idKey: 'massive:SPY:1day' });
    const c = ingestText(body, { fileName: 'SPY_Massive_1w.json', origin, idKey: 'massive:SPY:1week' });
    expect(a.meta.id).toBe(b.meta.id);
    expect(a.meta.id).not.toBe(c.meta.id);
  });
});

describe('message system', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useMessages.setState({ messages: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('removes transient messages after 15 s, pausing while hovered', () => {
    const m = useMessages.getState();
    const id = m.notify({ kind: 'success', text: 'Loaded' });
    vi.advanceTimersByTime(TRANSIENT_MS - 1000);
    m.pause(id);
    vi.advanceTimersByTime(60_000);
    expect(useMessages.getState().messages).toHaveLength(1);
    m.resume(id);
    vi.advanceTimersByTime(1499);
    expect(useMessages.getState().messages).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(useMessages.getState().messages).toHaveLength(0);
  });

  it('keeps at most four transient messages', () => {
    const m = useMessages.getState();
    for (let i = 0; i < 6; i++) m.notify({ kind: 'info', text: `m${i}` });
    expect(useMessages.getState().messages.map((x) => x.text)).toEqual(['m2', 'm3', 'm4', 'm5']);
  });

  it('keeps persistent messages until hidden, and remembers hiding on re-raise', () => {
    const m = useMessages.getState();
    m.raise({ id: 'stale:a:1', kind: 'warn', text: 'Old data' });
    vi.advanceTimersByTime(10 * 60_000);
    expect(useMessages.getState().messages[0]).toMatchObject({ persistent: true, hidden: false });
    m.hide('stale:a:1');
    m.remove('stale:a:1');
    m.raise({ id: 'stale:a:1', kind: 'warn', text: 'Old data' });
    expect(useMessages.getState().messages[0].hidden).toBe(true);
    m.show('stale:a:1');
    expect(useMessages.getState().messages[0].hidden).toBe(false);
  });

  it('removes persistent messages by prefix, keeping the given one', () => {
    const m = useMessages.getState();
    m.raise({ id: 'stale:a:1', kind: 'warn', text: 'a' });
    m.raise({ id: 'stale:b:1', kind: 'warn', text: 'b' });
    m.raise({ id: 'notes:a', kind: 'info', text: 'n' });
    m.notify({ kind: 'info', text: 't' });
    m.removeWhere('stale:', 'stale:b:1');
    const ids = useMessages.getState().messages.map((x) => x.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(['notes:a', 'stale:b:1']));
    expect(ids.some((id) => id.startsWith('t'))).toBe(true);
  });
});
