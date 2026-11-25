'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { ingestText } from '@/core/ingest/ingest';
import { sliceSeries, type Dataset } from '@/core/model/types';
import { resolveTimeFrame } from '@/pipeline/resolve';
import { lowerBound } from '@/pipeline/derive';
import { mountMiniCandles, type MiniChart } from '@/render/klc/miniChart';
import { formatDateShort, formatPct, formatPrice } from '@/render/format';
import { cx } from '@/components/ui';
import { SAMPLE_LABEL, SAMPLE_NAME, SAMPLE_URL } from '@/sources/sample';
import { useChartTheme } from '@/features/workspace/hooks';
import { HANDOFF_KEY, encodeHandoff } from '@/core/model/workspace';

/** Hand the sample to the chart tool: six months, candles (design/08 §1.4). */
function handOff() {
  localStorage.setItem(HANDOFF_KEY, encodeHandoff({ data: { kind: 'sample', sample: 'us500' }, range: '6M', chartType: 'candle', name: 'S&P 500 sample' }));
}

/** Home page preview: the last six months of the S&P 500 sample as candles (sample data for now). */
export default function HomeChartCard() {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<MiniChart | null>(null);
  const theme = useChartTheme();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(SAMPLE_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => !cancelled && setDs(ingestText(text, { fileName: SAMPLE_NAME })))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => {
    if (!ds) return null;
    const r = resolveTimeFrame({ preset: '6M' }, ds.meta);
    const bars = sliceSeries(ds.bars, lowerBound(ds.bars.time, r.from), ds.bars.length);
    const first = bars.open[0];
    const last = bars.close[bars.length - 1];
    return { bars, last, change: last / first - 1, from: bars.time[0], to: ds.meta.range.to };
  }, [ds]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ds || !view) return;
    chart.current = mountMiniCandles(el, view.bars, ds.meta, theme);
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
    // The theme is applied by the effect below without remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, view]);

  useEffect(() => {
    chart.current?.setTheme(theme);
  }, [theme]);

  const dir = view ? Math.sign(view.change) : 0;
  return (
    <Link
      href="/chart"
      onClick={handOff}
      onAuxClick={handOff}
      aria-label={`${SAMPLE_LABEL}, last six months as weekly candles (sample data). Open in chart mode.`}
      className="group block rounded-2xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-pop focus-visible:shadow-pop"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{SAMPLE_LABEL}</h2>
            <span className="rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-warn">Sample data</span>
          </div>
          {view && ds && (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tabular text-2xl font-semibold">{formatPrice(view.last, ds.meta.precision)}</span>
              <span className={cx('tabular text-sm font-medium', dir > 0 ? 'text-up' : dir < 0 ? 'text-down' : 'text-muted')}>
                {formatPct(view.change)} <span className="font-normal text-muted">6 months</span>
              </span>
            </div>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent opacity-80 group-hover:opacity-100">
          Open chart <ArrowUpRight className="size-[0.875rem]" />
        </span>
      </div>
      {/* Clicks go to the link; the preview itself is not interactive. */}
      <div ref={ref} className="pointer-events-none mt-3 h-[16rem]" aria-hidden />
      {error && <p className="text-sm text-down">The sample could not be loaded ({error}).</p>}
      {view && (
        <p className="mt-2 text-xs text-muted">
          Weekly candles · {formatDateShort(view.from)} – {formatDateShort(view.to)} · bundled sample file, not live prices
        </p>
      )}
    </Link>
  );
}
