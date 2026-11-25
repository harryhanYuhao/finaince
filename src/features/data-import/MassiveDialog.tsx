'use client';

import { useState } from 'react';
import { Button, Dialog, Field, Segmented, Select } from '@/components/ui';
import { useUi } from '@/state/ui';
import { loadFromMassive, type MassiveRequest } from './actions';

const INTERVALS: { value: string; label: string; req: Pick<MassiveRequest, 'multiplier' | 'timespan'>; maxYears: number }[] = [
  { value: '5m', label: '5 minutes', req: { multiplier: 5, timespan: 'minute' }, maxYears: 1 },
  { value: '1h', label: '1 hour', req: { multiplier: 1, timespan: 'hour' }, maxYears: 2 },
  { value: '1d', label: '1 day', req: { multiplier: 1, timespan: 'day' }, maxYears: 20 },
  { value: '1w', label: '1 week', req: { multiplier: 1, timespan: 'week' }, maxYears: 20 },
];
const YEARS = ['1', '2', '5', '10', '20'] as const;

/** Load bars from Massive (formerly Polygon.io) through our server, which holds the API key. */
export function MassiveDialog() {
  const open = useUi((s) => s.massiveOpen);
  const set = useUi((s) => s.set);
  const [ticker, setTicker] = useState('SPY');
  const [interval, setIntervalChoice] = useState('1d');
  const [years, setYears] = useState<(typeof YEARS)[number]>('5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iv = INTERVALS.find((i) => i.value === interval)!;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => set({ massiveOpen: o })}
      title="Load from Massive"
      description="Market data from Massive (formerly Polygon.io), fetched by the FinAInce server. Prices are split-adjusted."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const err = await loadFromMassive({ ticker, ...iv.req, years: Math.min(Number(years), iv.maxYears) });
          setBusy(false);
          if (err) setError(err);
          else set({ massiveOpen: false });
        }}
      >
        <Field label="Ticker" hint="Stocks and ETFs as listed (AAPL, SPY, BRK.B). Indices use the I: prefix (I:SPX) and need an indices plan.">
          <input
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value);
              setError(null);
            }}
            aria-label="Ticker"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm uppercase text-ink"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bar interval">
            <Select label="Bar interval" value={interval} onChange={setIntervalChoice} options={INTERVALS.map((i) => ({ value: i.value, label: i.label }))} />
          </Field>
          <Field label="History" hint={Number(years) > iv.maxYears ? `Limited to ${iv.maxYears} year${iv.maxYears > 1 ? 's' : ''} for this interval.` : undefined}>
            <Segmented label="Years of history" size="sm" value={years} onChange={setYears} options={YEARS.map((y) => ({ value: y, label: `${y}y` }))} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !ticker.trim()}>
          {busy ? 'Loading…' : 'Load chart'}
        </Button>
      </form>
    </Dialog>
  );
}
