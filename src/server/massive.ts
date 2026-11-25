// Server-only Massive (formerly Polygon.io) client. The API key never reaches the browser.
// Docs: https://massive.com/docs/rest/stocks/aggregates/custom-bars

export const TIMESPANS = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'] as const;
export type Timespan = (typeof TIMESPANS)[number];

export interface AggsQuery {
  ticker: string;
  multiplier: number;
  timespan: Timespan;
  from: string; // YYYY-MM-DD
  to: string;
}

export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export class MassiveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Stocks (AAPL, BRK.B), indices (I:SPX), crypto (X:BTCUSD), forex (C:EURUSD).
const TICKER = /^(?:[ICX]:)?[A-Za-z0-9.\-]{1,15}$/;
const MAX_PAGES = 20;

/** Validate query parameters; returns a message for the first problem. */
export function parseAggsQuery(p: URLSearchParams): AggsQuery | string {
  const ticker = (p.get('ticker') ?? '').trim();
  const multiplier = Number(p.get('multiplier') ?? '1');
  const timespan = p.get('timespan') as Timespan;
  const from = p.get('from') ?? '';
  const to = p.get('to') ?? '';
  if (!TICKER.test(ticker)) return 'Ticker should look like AAPL, BRK.B or I:SPX.';
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 1000) return 'Multiplier must be a whole number from 1 to 1000.';
  if (!TIMESPANS.includes(timespan)) return `Timespan must be one of ${TIMESPANS.join(', ')}.`;
  if (!DATE.test(from) || !DATE.test(to) || from > to) return 'Dates must be YYYY-MM-DD with from ≤ to.';
  return { ticker: ticker.toUpperCase(), multiplier, timespan, from, to };
}

export function massiveConfig(): { key: string; base: string } | null {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) return null;
  return { key, base: (process.env.MASSIVE_API_BASE ?? 'https://api.massive.com').replace(/\/$/, '') };
}

/** Fetch all aggregate bars for the query, following `next_url` pages on the same host. */
export async function fetchAggs(q: AggsQuery, cfg: { key: string; base: string }, fetchImpl: typeof fetch = fetch): Promise<Bar[]> {
  const path = `/v2/aggs/ticker/${encodeURIComponent(q.ticker)}/range/${q.multiplier}/${q.timespan}/${q.from}/${q.to}`;
  let url: string | null = `${cfg.base}${path}?adjusted=true&sort=asc&limit=50000`;
  const origin = new URL(cfg.base).origin;
  const bars: Bar[] = [];
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${cfg.key}` }, cache: 'no-store' });
    const body = (await res.json().catch(() => ({}))) as { results?: Bar[]; next_url?: string; error?: string; message?: string; status?: string };
    if (!res.ok) throw new MassiveError(body.error ?? body.message ?? `Massive returned HTTP ${res.status}`, res.status);
    for (const b of body.results ?? []) bars.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, ...(b.v !== undefined ? { v: b.v } : {}) });
    // Only follow pages on the configured host.
    url = body.next_url && new URL(body.next_url).origin === origin ? body.next_url : null;
  }
  return bars;
}
