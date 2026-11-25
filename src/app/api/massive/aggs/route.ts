import { NextResponse, type NextRequest } from 'next/server';
import { MassiveError, fetchAggs, massiveConfig, parseAggsQuery } from '@/server/massive';

// Proxy for Massive aggregate bars: the browser never sees the API key.
// GET /api/massive/aggs?ticker=SPY&multiplier=1&timespan=day&from=2020-01-01&to=2026-11-23
export async function GET(req: NextRequest) {
  const cfg = massiveConfig();
  if (!cfg) {
    return NextResponse.json({ error: 'Massive is not configured on this server (MASSIVE_API_KEY is not set).' }, { status: 501 });
  }
  const q = parseAggsQuery(req.nextUrl.searchParams);
  if (typeof q === 'string') return NextResponse.json({ error: q }, { status: 400 });
  try {
    const results = await fetchAggs(q, cfg);
    return NextResponse.json({ ticker: q.ticker, multiplier: q.multiplier, timespan: q.timespan, resultsCount: results.length, results });
  } catch (e) {
    const status = e instanceof MassiveError ? (e.status === 401 || e.status === 403 ? 502 : e.status) : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
