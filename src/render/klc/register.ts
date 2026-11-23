// One-time registration of FinAInce's custom KLineChart pieces (design/05 §5.1).

import { registerIndicator, registerOverlay, registerYAxis, type KLineData } from 'klinecharts';

export const FX_LINE = 'FX_LINE';
export const FX_GAP = 'fxGap';
export const FX_MEASURE = 'fxMeasure';
export const INDEXED_100 = 'indexed100';

export interface FxLineExtend {
  /** Draw the raw sampled line ourselves (step/baseline styles). */
  rawStyle: 'none' | 'step' | 'baseline';
  rawColor: string;
  upColor: string;
  downColor: string;
  upFill: string;
  downFill: string;
  showSmooth: boolean;
  smoothColor: string;
  width: number;
}

interface FxLineData {
  smooth: number | null;
  raw: number | null;
}

let registered = false;

export function registerKlcExtensions(): void {
  if (registered) return;
  registered = true;

  // Smoothed line + step/baseline renderer, reading values precomputed by the worker.
  registerIndicator<FxLineData, number, FxLineExtend>({
    name: FX_LINE,
    shortName: 'Line',
    series: 'price',
    precision: 2,
    figures: [{ key: 'smooth', type: 'line' }],
    calc: (dataList: KLineData[]) =>
      dataList.map((d) => ({
        smooth: typeof d.smooth === 'number' && Number.isFinite(d.smooth) ? d.smooth : null,
        raw: typeof d.line === 'number' && Number.isFinite(d.line) ? d.line : null,
      })),
    draw: ({ ctx, chart, indicator, xAxis, yAxis, bounding }) => {
      const ext = indicator.extendData;
      if (!ext) return true;
      const { realFrom, realTo } = chart.getVisibleRange();
      const from = Math.max(0, realFrom - 1);
      const to = Math.min(indicator.result.length, realTo + 1);
      const res = indicator.result;
      const half = chart.getBarSpace().halfBar;
      ctx.setLineDash([]);

      if (ext.rawStyle !== 'none') {
        // Baseline value = first visible raw value.
        let base: number | null = null;
        for (let i = Math.max(0, realFrom); i < to && base === null; i++) base = res[i]?.raw ?? null;
        const baseY = base === null ? 0 : yAxis.convertToPixel(base);
        ctx.lineWidth = ext.width;
        ctx.lineJoin = 'round';
        const pts: Array<[number, number]> = [];
        for (let i = from; i < to; i++) {
          const v = res[i]?.raw;
          if (v === null || v === undefined) continue;
          const x = xAxis.convertToPixel(i);
          const y = yAxis.convertToPixel(v);
          if (ext.rawStyle === 'step' && pts.length) pts.push([x - half, pts[pts.length - 1][1]], [x - half, y]);
          pts.push([x, y]);
        }
        if (pts.length > 1) {
          if (ext.rawStyle === 'baseline' && base !== null) {
            // Fill above (up) and below (down) the baseline with clipping.
            for (const [clipTop, fill, stroke] of [
              [true, ext.upFill, ext.upColor],
              [false, ext.downFill, ext.downColor],
            ] as const) {
              ctx.save();
              ctx.beginPath();
              if (clipTop) ctx.rect(0, 0, bounding.width, baseY);
              else ctx.rect(0, baseY, bounding.width, bounding.height - baseY);
              ctx.clip();
              ctx.beginPath();
              ctx.moveTo(pts[0][0], baseY);
              for (const [x, y] of pts) ctx.lineTo(x, y);
              ctx.lineTo(pts[pts.length - 1][0], baseY);
              ctx.closePath();
              ctx.fillStyle = fill;
              ctx.fill();
              ctx.beginPath();
              ctx.moveTo(pts[0][0], pts[0][1]);
              for (const [x, y] of pts) ctx.lineTo(x, y);
              ctx.strokeStyle = stroke;
              ctx.stroke();
              ctx.restore();
            }
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = ext.rawColor;
            ctx.beginPath();
            ctx.moveTo(0, baseY);
            ctx.lineTo(bounding.width, baseY);
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.strokeStyle = ext.rawColor;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts) ctx.lineTo(x, y);
            ctx.stroke();
          }
        }
      }

      if (ext.showSmooth) {
        ctx.lineWidth = ext.width;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = ext.smoothColor;
        ctx.beginPath();
        let started = false;
        for (let i = from; i < to; i++) {
          const v = res[i]?.smooth;
          if (v === null || v === undefined) {
            started = false;
            continue;
          }
          const x = xAxis.convertToPixel(i);
          const y = yAxis.convertToPixel(v);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      return true; // we drew everything; skip default figures
    },
  });

  // Dotted vertical marker before a bar that follows missing data.
  registerOverlay<{ color: string }>({
    name: FX_GAP,
    totalStep: 2,
    lock: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding, chart, overlay }) => {
      const x = coordinates[0].x - chart.getBarSpace().halfBar;
      return [
        {
          type: 'line',
          attrs: { coordinates: [{ x, y: 0 }, { x, y: bounding.height }] },
          styles: { style: 'dashed', dashedValue: [2, 3], color: overlay.extendData?.color ?? '#B8892B', size: 1 },
          ignoreEvent: true,
        },
      ];
    },
  });

  // Measure tool: Δprice, Δ%, Δbars between two clicks.
  registerOverlay<{ fill: string; text: string; up: string; down: string; precision: number }>({
    name: FX_MEASURE,
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const [pa, pb] = overlay.points;
      const ext = overlay.extendData;
      const dv = (pb.value ?? 0) - (pa.value ?? 0);
      const pct = pa.value ? (dv / pa.value) * 100 : 0;
      const bars = (pb.dataIndex ?? 0) - (pa.dataIndex ?? 0);
      const color = dv >= 0 ? ext.up : ext.down;
      const sign = dv >= 0 ? '+' : '−';
      const text = `${sign}${Math.abs(dv).toFixed(ext.precision)} (${sign}${Math.abs(pct).toFixed(2)}%) · ${Math.abs(bars)} bars`;
      return [
        {
          type: 'rect',
          attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
          styles: { style: 'fill', color: ext.fill },
        },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 6, text, align: 'center', baseline: 'bottom' },
          styles: { color: '#fff', backgroundColor: color, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, size: 12 },
        },
      ];
    },
  });

  // Price indexed to 100 at the first visible bar (design/04 §2.1).
  registerYAxis({
    name: INDEXED_100,
    minSpan: () => 0.01,
    displayValueToText: (value) => value.toFixed(2),
    valueToRealValue: (value, { range }) =>
      range.range === 0 ? range.realFrom : ((value - range.from) / range.range) * range.realRange + range.realFrom,
    realValueToValue: (value, { range }) =>
      range.realRange === 0 ? range.from : ((value - range.realFrom) / range.realRange) * range.range + range.from,
    createRange: ({ chart, defaultRange }) => {
      const list = chart.getDataList();
      const first = list[chart.getVisibleRange().from];
      const base = (first?.line as number | undefined) ?? first?.close;
      if (!base) return defaultRange;
      const realFrom = (defaultRange.from / base) * 100;
      const realTo = (defaultRange.to / base) * 100;
      return {
        ...defaultRange,
        realFrom,
        realTo,
        realRange: realTo - realFrom,
        displayFrom: realFrom,
        displayTo: realTo,
        displayRange: realTo - realFrom,
      };
    },
  });
}
