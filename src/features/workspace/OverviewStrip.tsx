'use client';

import { useEffect, useRef, useState } from 'react';
import type { Overview } from '@/pipeline/derive';
import { useUi } from '@/state/ui';
import { dataWorker } from '@/workers/client';
import { useChartTheme } from './hooks';
import { useDerivation } from './useDerivation';
import { getEngine } from './engineRef';
import { withAlpha } from '@/render/theme';

const BASE_HEIGHT = 36;

/**
 * Overview of the whole history with a draggable window for the visible range
 * (design/06 §2). A second way to slide to older data besides dragging the chart.
 */
export function OverviewStrip() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dspec = useDerivation();
  const theme = useChartTheme();
  const HEIGHT = Math.round(BASE_HEIGHT * theme.scale);
  const visible = useUi((s) => s.visibleRange);
  const [data, setData] = useState<Overview | null>(null);
  const [width, setWidth] = useState(0);
  const drag = useRef<{ startX: number; span: number; startCenter: number } | null>(null);
  const hasData = dspec !== null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  useEffect(() => {
    if (!dspec || width < 50) return;
    let cancelled = false;
    void dataWorker()
      .overview(dspec, Math.min(width, 2000))
      .then((o) => !cancelled && setData(o));
    return () => {
      cancelled = true;
    };
  }, [dspec, width]);

  const n = data?.time.length ?? 0;
  const t0 = n ? data!.time[0] : 0;
  const t1 = n ? data!.time[n - 1] : 1;
  const xOf = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * width;
  const tOf = (x: number) => t0 + (x / Math.max(1, width)) * (t1 - t0);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !data || width < 50) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = HEIGHT * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      min = Math.min(min, data.lo[i]);
      max = Math.max(max, data.hi[i]);
    }
    const y = (v: number) => HEIGHT - 4 - ((v - min) / Math.max(1e-9, max - min)) * (HEIGHT - 8);
    // Area under the high envelope + min/max band, so spikes are never hidden.
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(data.time[i]), y(data.hi[i]));
    ctx.lineTo(xOf(data.time[n - 1]), HEIGHT);
    ctx.closePath();
    ctx.fillStyle = withAlpha(theme.textMuted, 0.14);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(data.time[i]), y(data.hi[i]));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xOf(data.time[i]), y(data.lo[i]));
    ctx.closePath();
    ctx.fillStyle = withAlpha(theme.textMuted, 0.6);
    ctx.strokeStyle = withAlpha(theme.textMuted, 0.6);
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    if (visible) {
      const a = Math.max(0, xOf(visible.from));
      const b = Math.min(width, Math.max(a + 3, xOf(visible.to)));
      ctx.fillStyle = theme.accentSoft;
      ctx.fillRect(a, 0, b - a, HEIGHT);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a + 0.75, 0.75, b - a - 1.5, HEIGHT - 1.5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, visible, theme]);

  const moveTo = (center: number, span: number) => {
    const from = Math.max(t0, center - span / 2);
    const to = Math.min(t1, from + span);
    getEngine()?.showRange({ from: Math.max(t0, to - span), to });
  };

  if (!dspec) return null;
  return (
    <div ref={wrapRef} className="relative hidden shrink-0 px-3 pb-1 md:block" style={{ height: HEIGHT + 4 }}>
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT }}
        className="cursor-grab rounded-md active:cursor-grabbing"
        role="slider"
        aria-label="History overview: drag to move the visible range"
        aria-valuemin={t0}
        aria-valuemax={t1}
        aria-valuenow={visible ? (visible.from + visible.to) / 2 : t1}
        aria-valuetext={visible ? `${new Date(visible.from).toISOString().slice(0, 10)} to ${new Date(visible.to).toISOString().slice(0, 10)}` : undefined}
        tabIndex={0}
        onPointerDown={(e) => {
          if (!visible) return;
          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          const span = visible.to - visible.from;
          const inside = x >= xOf(visible.from) && x <= xOf(visible.to);
          const center = inside ? (visible.from + visible.to) / 2 : tOf(x);
          if (!inside) moveTo(center, span);
          drag.current = { startX: x, span, startCenter: center };
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          moveTo(d.startCenter + (tOf(x) - tOf(d.startX)), d.span);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (!visible) return;
          const span = visible.to - visible.from;
          const c = (visible.from + visible.to) / 2;
          if (e.key === 'ArrowLeft') moveTo(c - span / 2, span);
          if (e.key === 'ArrowRight') moveTo(c + span / 2, span);
        }}
      />
    </div>
  );
}
