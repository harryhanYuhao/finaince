'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { KlcEngine } from '@/render/klc/KlcEngine';
import { resolveDerivation, resolveTimeFrame } from '@/pipeline/resolve';
import { useWorkspace } from '@/state/workspace';
import { useUi } from '@/state/ui';
import { dataWorker } from '@/workers/client';
import { intervalLongLabel } from '@/core/time/interval';
import { formatDateShort, formatPrice } from '@/render/format';
import { useActiveMeta, useChartTheme } from './hooks';
import { setEngine } from './engineRef';

/** Hosts the KLineChart engine; React only re-applies the spec when it changes (design/05 §5.2). */
export function ChartHost() {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setLocalEngine] = useState<KlcEngine | null>(null);
  const [width, setWidth] = useState(0);
  const spec = useWorkspace((s) => s.spec);
  const meta = useActiveMeta();
  const theme = useChartTheme();
  const rangeNonce = useUi((s) => s.rangeNonce);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ui = useUi.getState();
    const e = new KlcEngine({
      onVisibleRange: (r) => ui.set({ visibleRange: r }),
      onLoading: (busy) => ui.set({ loading: busy }),
      onOverflow: (info) =>
        ui.set({
          overflowHint: info ? `Showing the latest ${info.shown.toLocaleString()} of ${info.total.toLocaleString()} bars in this range` : null,
        }),
      onError: (message) => ui.toast({ kind: 'error', message }),
      onLastBar: (bar) => ui.set({ lastBar: bar }),
    });
    e.mount(el);
    setEngine(e);
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __fxEngine?: KlcEngine }).__fxEngine = e;
    setLocalEngine(e);
    // Measure synchronously too: ResizeObserver doesn't fire in background tabs.
    setWidth(Math.round(el.clientWidth / 40) * 40);
    const ro = new ResizeObserver(([entry]) => {
      // Quantise so the "Auto" step isn't recomputed on every pixel of a resize.
      setWidth(Math.round(entry.contentRect.width / 40) * 40);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      setEngine(null);
      e.destroy();
    };
  }, []);

  const plotWidth = Math.max(200, width - 72);
  const dspec = useMemo(() => (meta ? resolveDerivation(spec, meta, plotWidth) : null), [spec, meta, plotWidth]);
  const range = useMemo(() => (meta ? resolveTimeFrame(spec.timeFrame, meta) : null), [spec.timeFrame, meta]);

  useEffect(() => {
    useUi.getState().set({ derivation: dspec });
  }, [dspec]);

  useEffect(() => {
    if (!engine || !meta || !dspec || !range || width === 0) return;
    engine.apply({ spec, meta, theme, dspec, range, rangeNonce });
  }, [engine, spec, meta, theme, dspec, range, rangeNonce, width]);

  // Visible-range statistics from the worker (design/04 §4).
  const visible = useUi((s) => s.visibleRange);
  useEffect(() => {
    if (!dspec || !visible) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const stats = await dataWorker().stats(dspec, visible.from, visible.to);
      if (!cancelled) useUi.getState().set({ stats });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [dspec, visible]);

  const summary = meta
    ? `${meta.displayName} ${spec.chartType === 'candle' ? 'candlestick' : 'line'} chart, ${dspec ? intervalLongLabel(dspec.interval).toLowerCase() : ''}, from ${formatDateShort(meta.range.from)} to ${formatDateShort(meta.range.to)}`
    : 'Empty chart';
  const stats = useUi((s) => s.stats);
  const label = stats && meta ? `${summary}. Last ${formatPrice(stats.lastClose, meta.precision)}.` : summary;

  return <div ref={ref} role="img" aria-label={label} className="absolute inset-0" />;
}
