// ChartEngine implementation on KLineChart (design/05 §5.1).
// Only this folder imports 'klinecharts'. React talks to the engine through `apply` and callbacks.

import { dispose, init, type Chart, type DataLoader, type KLineData, type Period } from 'klinecharts';
import { BarFlag, type DatasetMeta, type TimeRange } from '@/core/model/types';
import { derivationKey, type ChartSpec, type DerivationSpec } from '@/core/model/spec';
import { intervalMs } from '@/core/time/interval';
import { CANDLE_MIN_READABLE_PX, LINE_MIN_SLOT_PX, MAX_BAR_SPACE_PX } from '@/pipeline/resolve';
import type { RenderPage } from '@/pipeline/derive';
import { dataWorker } from '@/workers/client';
import { hoverBus, type HoverBar } from '../events';
import { formatBarTime, zoneFor } from '../format';
import type { ChartTheme } from '../theme';
import { FX_GAP, FX_LINE, FX_MEASURE, INDEXED_100, registerKlcExtensions, type FxLineExtend } from './register';
import { buildStyles } from './styles';
import { withAlpha } from '../theme';

const CANDLE_PANE = 'candle_pane';
const VOL_PANE = 'fx_vol_pane';
const PAGE_SIZE = 20_000;
const OLDER_PAGE = 5_000;
const RIGHT_OFFSET_PX = 24;

export interface EngineInput {
  spec: ChartSpec;
  meta: DatasetMeta;
  theme: ChartTheme;
  dspec: DerivationSpec;
  /** Range to show (time-frame preset or custom range). */
  range: TimeRange;
  /** Increments when the user re-selects the same time frame, forcing a re-show. */
  rangeNonce: number;
}

export interface EngineCallbacks {
  onVisibleRange: (r: TimeRange) => void;
  onLoading: (busy: boolean) => void;
  onOverflow: (info: { shown: number; total: number } | null) => void;
  onError: (message: string) => void;
  onLastBar: (bar: HoverBar | null) => void;
}

function toKLineData(p: RenderPage): KLineData[] {
  const out: KLineData[] = new Array(p.time.length);
  for (let i = 0; i < p.time.length; i++) {
    out[i] = {
      timestamp: p.time[i],
      open: p.open[i],
      high: p.high[i],
      low: p.low[i],
      close: p.close[i],
      volume: p.volume && Number.isFinite(p.volume[i]) ? p.volume[i] : undefined,
      line: p.line ? p.line[i] : p.close[i],
      smooth: p.smooth && Number.isFinite(p.smooth[i]) ? p.smooth[i] : null,
      flags: p.flags[i],
    };
  }
  return out;
}

function lowerBound(list: KLineData[], t: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid].timestamp < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class KlcEngine {
  private chart: Chart | null = null;
  private el: HTMLElement | null = null;
  private input: EngineInput | null = null;
  private applied = {
    datasetId: '',
    dkey: '',
    styleKey: '',
    scale: '',
    volume: '',
    zone: '',
    formatKey: '',
    lineKey: '',
    rangeKey: '',
    gapsKey: '',
  };
  private generation = 0;
  private hasOlder = false;
  private pendingRange: TimeRange | null = null;
  /** True between a reset and its 'init' page arriving; range requests are queued meanwhile. */
  private initPending = false;
  private initMinTime: number | null = null;
  private visible: TimeRange | null = null;
  private visibleTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private cb: EngineCallbacks) {}

  mount(el: HTMLElement): void {
    registerKlcExtensions();
    this.el = el;
    const chart = init(el, {
      zoomAnchor: 'cursor',
      // Our own shortcuts handle zoom/scroll keys (design/05 §6); avoid double handling.
      hotkey: { enabled: false },
      layout: { barSpaceLimit: { min: LINE_MIN_SLOT_PX, max: MAX_BAR_SPACE_PX } },
    });
    if (!chart) throw new Error('KLineChart failed to initialise');
    this.chart = chart;
    chart.setOffsetRightDistance(RIGHT_OFFSET_PX);
    chart.setFormatter({
      formatDate: ({ timestamp, template, type }) => this.formatDate(timestamp, template, type),
      formatBigNumber: (v) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(v)),
    });
    chart.subscribeAction('onCrosshairChange', (data) => {
      const c = data as { kLineData?: KLineData; dataIndex?: number };
      const k = c.kLineData;
      if (!k) {
        hoverBus.emit(null);
        return;
      }
      hoverBus.emit(this.toHover(chart.getDataList(), c.dataIndex ?? -1, k));
    });
    chart.subscribeAction('onVisibleRangeChange', () => this.scheduleVisibleRange());
    el.addEventListener('mouseleave', this.onMouseLeave);
    this.resizeObserver = new ResizeObserver(() => chart.resize());
    this.resizeObserver.observe(el);
    chart.setDataLoader(this.loader);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.el?.removeEventListener('mouseleave', this.onMouseLeave);
    if (this.visibleTimer) clearTimeout(this.visibleTimer);
    if (this.el) dispose(this.el);
    this.chart = null;
    this.el = null;
  }

  private onMouseLeave = () => hoverBus.emit(null);

  private toHover(list: KLineData[], index: number, k: KLineData): HoverBar {
    const prev = index > 0 ? list[index - 1] : null;
    const isLine = this.input?.spec.chartType === 'line';
    return {
      time: k.timestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume ?? null,
      line: (k.line as number | undefined) ?? null,
      smooth: (k.smooth as number | null | undefined) ?? null,
      flags: (k.flags as number | undefined) ?? BarFlag.Complete,
      prevClose: prev ? ((isLine ? (prev.line as number) : prev.close) ?? null) : null,
    };
  }

  // ---------------------------------------------------------------- data loading

  private loader: DataLoader = {
    getBars: async ({ type, timestamp, callback }) => {
      const input = this.input;
      if (!input) {
        callback([], false);
        return;
      }
      if (type === 'backward') {
        // KLineChart v10: 'backward' = newer data. Our data ends at the last bar.
        callback([], { backward: false, forward: this.hasOlder });
        return;
      }
      const gen = this.generation;
      const dspec = input.dspec;
      this.cb.onLoading(true);
      try {
        const worker = dataWorker();
        let maxBars = type === 'init' ? PAGE_SIZE : OLDER_PAGE;
        if (type === 'init' && this.initMinTime !== null) {
          const info = await worker.rangeInfo(dspec, this.initMinTime, Number.MAX_SAFE_INTEGER);
          maxBars = Math.max(PAGE_SIZE, info.count + 50);
          this.initMinTime = null;
        }
        // 'forward' = older data in KLineChart v10; `timestamp` is the oldest loaded bar.
        const p = await worker.page(dspec, type === 'forward' ? timestamp : null, maxBars);
        if (gen !== this.generation) return; // superseded; the newer reset already restarted loading
        const data = toKLineData(p);
        if (type === 'init') this.hasOlder = p.hasOlder;
        else this.hasOlder = p.hasOlder;
        callback(data, type === 'init' ? { forward: p.hasOlder, backward: false } : { forward: p.hasOlder });
        setTimeout(() => this.afterLoad(type === 'init'), 0); // not rAF: it pauses in background tabs
      } catch (e) {
        if (gen === this.generation) {
          callback([], false);
          this.cb.onError((e as Error).message ?? String(e));
        }
      } finally {
        if (gen === this.generation) this.cb.onLoading(false);
      }
    },
  };

  private afterLoad(isInit: boolean): void {
    if (isInit) this.initPending = false;
    this.refreshGaps(true);
    const list = this.chart?.getDataList() ?? [];
    this.cb.onLastBar(list.length ? this.toHover(list, list.length - 1, list[list.length - 1]) : null);
    if (isInit) {
      const r = this.pendingRange ?? this.input?.range ?? null;
      this.pendingRange = null;
      if (r) this.showRange(r);
    } else if (this.pendingRange) {
      const r = this.pendingRange;
      this.pendingRange = null;
      this.showRange(r);
    }
    this.scheduleVisibleRange();
  }

  /** Restart loading (new dataset, interval or derivation), optionally keeping a range in view. */
  private reload(keep: TimeRange | null): void {
    const chart = this.chart;
    if (!chart || !this.input) return;
    this.generation++;
    this.initPending = true;
    this.pendingRange = keep;
    if (keep) this.initMinTime = keep.from;
    const { meta, dspec } = this.input;
    if (this.applied.datasetId !== meta.id) {
      this.applied.datasetId = meta.id;
      chart.setSymbol({ ticker: meta.symbol, pricePrecision: meta.precision, volumePrecision: meta.volumePrecision });
    }
    const period: Period = { type: dspec.interval.unit, span: dspec.interval.count };
    chart.setPeriod(period); // triggers resetData → getBars('init')
  }

  // ---------------------------------------------------------------- applying the spec

  apply(input: EngineInput): void {
    const chart = this.chart;
    if (!chart) return;
    const prev = this.input;
    this.input = input;
    const { spec, meta, theme, dspec } = input;

    const zone = zoneFor(spec.displayZone, meta);
    if (zone !== this.applied.zone) {
      this.applied.zone = zone;
      chart.setTimezone(zone);
    }

    const styleKey = JSON.stringify([theme, spec.chartType, spec.candle.style, spec.candle.showIncomplete, spec.line.style, spec.line.width, spec.line.smoothing.method !== 'none', spec.line.showRawGhost, spec.grid]);
    if (styleKey !== this.applied.styleKey) {
      this.applied.styleKey = styleKey;
      chart.setStyles(buildStyles(theme, spec));
    }

    const scaleName = { linear: 'normal', log: 'logarithm', percent: 'percentage', indexed100: INDEXED_100 }[spec.scale];
    const logOk = !meta.report.notes.some((n) => n.code === 'non-positive');
    const finalScale = scaleName === 'logarithm' && !logOk ? 'normal' : scaleName;
    if (finalScale !== this.applied.scale) {
      this.applied.scale = finalScale;
      chart.overrideYAxis({ paneId: CANDLE_PANE, name: finalScale });
    }

    this.applyVolume(spec, meta);
    this.applyLineIndicator(spec, theme);

    const dkey = derivationKey(dspec);
    const rangeKey = JSON.stringify([spec.timeFrame, input.rangeNonce]);
    if (dkey !== this.applied.dkey || meta.id !== this.applied.datasetId) {
      const sameDataset = prev?.meta.id === meta.id;
      const rangeChanged = rangeKey !== this.applied.rangeKey;
      this.applied.dkey = dkey;
      this.applied.rangeKey = rangeKey;
      // Keep the dates in view when only the interval/derivation changes (design/02 §3).
      this.reload(sameDataset && !rangeChanged && this.visible ? this.visible : input.range);
    } else if (rangeKey !== this.applied.rangeKey) {
      this.applied.rangeKey = rangeKey;
      this.showRange(input.range, true);
    }

    const gapsKey = JSON.stringify([spec.showGaps, theme.gap, dkey]);
    if (gapsKey !== this.applied.gapsKey) {
      this.applied.gapsKey = gapsKey;
      this.refreshGaps(false);
    }
  }

  private applyVolume(spec: ChartSpec, meta: DatasetMeta): void {
    const chart = this.chart!;
    const mode = meta.volumeKind === 'none' ? 'off' : spec.volume;
    if (mode === this.applied.volume) return;
    const had = this.applied.volume !== '' && this.applied.volume !== 'off';
    this.applied.volume = mode;
    if (mode === 'off') {
      if (had) chart.removeIndicator({ paneId: VOL_PANE });
      return;
    }
    if (!had) {
      chart.createIndicator({ name: 'VOL', calcParams: [], paneId: VOL_PANE, shortName: 'Volume' }, false);
      chart.setPaneOptions({ id: VOL_PANE, height: 90, minHeight: 40 });
    }
    chart.overrideYAxis({ paneId: VOL_PANE, name: mode === 'log' ? 'logarithm' : 'normal' });
  }

  private applyLineIndicator(spec: ChartSpec, theme: ChartTheme): void {
    const chart = this.chart!;
    const smoothing = spec.line.smoothing.method !== 'none';
    const rawStyle = spec.chartType === 'line' && (spec.line.style === 'step' || spec.line.style === 'baseline') ? spec.line.style : 'none';
    const want = spec.chartType === 'line' && (smoothing || rawStyle !== 'none');
    const ext: FxLineExtend = {
      rawStyle: rawStyle === 'none' || (smoothing && !spec.line.showRawGhost) ? 'none' : rawStyle,
      rawColor: smoothing ? theme.ghost : theme.accent,
      upColor: smoothing ? withAlpha(theme.up, 0.5) : theme.up,
      downColor: smoothing ? withAlpha(theme.down, 0.5) : theme.down,
      upFill: withAlpha(theme.up, smoothing ? 0.06 : 0.14),
      downFill: withAlpha(theme.down, smoothing ? 0.06 : 0.14),
      showSmooth: smoothing,
      smoothColor: theme.accent,
      width: spec.line.width,
    };
    const lineKey = want ? JSON.stringify(ext) : 'off';
    if (lineKey === this.applied.lineKey) return;
    const had = this.applied.lineKey !== '' && this.applied.lineKey !== 'off';
    this.applied.lineKey = lineKey;
    if (!want) {
      if (had) chart.removeIndicator({ name: FX_LINE });
      return;
    }
    if (had) chart.overrideIndicator({ name: FX_LINE, extendData: ext });
    else chart.createIndicator({ name: FX_LINE, paneId: CANDLE_PANE, extendData: ext }, true);

  }

  private refreshGaps(onlyIfShown: boolean): void {
    const chart = this.chart;
    const input = this.input;
    if (!chart || !input) return;
    if (onlyIfShown && !input.spec.showGaps) return;
    chart.removeOverlay({ groupId: 'gaps' });
    if (!input.spec.showGaps) return;
    const list = chart.getDataList();
    for (const k of list) {
      if (((k.flags as number) & BarFlag.GapBefore) === 0) continue;
      chart.createOverlay({
        name: FX_GAP,
        groupId: 'gaps',
        lock: true,
        points: [{ timestamp: k.timestamp, value: k.close }],
        extendData: { color: input.theme.gap },
      });
    }
  }

  // ---------------------------------------------------------------- view

  /** Fit a time range into the plot (design/05 §5.1 "Range presets"). */
  showRange(range: TimeRange, animate = false): void {
    const chart = this.chart;
    const input = this.input;
    if (!chart || !input) return;
    const list = chart.getDataList();
    if (!list.length || this.initPending) {
      this.pendingRange = range;
      if (this.initPending) this.initMinTime = Math.min(this.initMinTime ?? range.from, range.from);
      return;
    }
    if (range.from < list[0].timestamp && this.hasOlder) {
      // Need older bars than loaded: reload with enough history, then show.
      this.generation++;
      this.initPending = true;
      this.pendingRange = range;
      this.initMinTime = range.from;
      chart.resetData();
      return;
    }
    const a = lowerBound(list, range.from);
    const b = Math.max(a, lowerBound(list, range.to + 1) - 1);
    const count = b - a + 1;
    const size = chart.getSize(CANDLE_PANE, 'main');
    const plotWidth = Math.max(50, (size?.width ?? this.el?.clientWidth ?? 800) - RIGHT_OFFSET_PX);
    const readable = input.spec.chartType === 'candle' ? CANDLE_MIN_READABLE_PX : LINE_MIN_SLOT_PX;
    const ideal = plotWidth / count;
    const space = Math.min(MAX_BAR_SPACE_PX, Math.max(readable, ideal));
    this.cb.onOverflow(ideal < readable ? { shown: Math.floor(plotWidth / readable), total: count } : null);
    const current = chart.getBarSpace().bar;
    if (Math.abs(current - space) > 1e-6) chart.setBarSpace(space);
    const scroll = (ms?: number) => (b >= list.length - 1 ? chart.scrollToRealTime(ms) : chart.scrollToDataIndex(b, ms));
    scroll(animate ? 250 : undefined);
    // Animations run on requestAnimationFrame, which stalls in background or hidden views; land anyway.
    if (animate) {
      setTimeout(() => {
        if (this.chart !== chart || chart.getDataList() !== list) return;
        const vr = chart.getVisibleRange();
        if (b < vr.from || b >= vr.to) scroll();
      }, 400);
    }
  }

  private scheduleVisibleRange(): void {
    if (this.visibleTimer) clearTimeout(this.visibleTimer);
    this.visibleTimer = setTimeout(() => {
      const chart = this.chart;
      if (!chart) return;
      const list = chart.getDataList();
      if (!list.length) return;
      const vr = chart.getVisibleRange();
      const from = list[Math.max(0, Math.min(list.length - 1, vr.from))]?.timestamp;
      const to = list[Math.max(0, Math.min(list.length - 1, vr.to - 1))]?.timestamp;
      if (from === undefined || to === undefined) return;
      this.visible = { from, to };
      this.cb.onVisibleRange(this.visible);
    }, 120);
  }

  scrollToLatest(): void {
    this.chart?.scrollToRealTime(250);
  }

  zoom(scale: number): void {
    this.chart?.zoomAtCoordinate(scale, undefined, 150);
  }

  scrollBars(bars: number): void {
    const chart = this.chart;
    if (chart) chart.scrollByDistance(bars * chart.getBarSpace().bar, 120);
  }

  startMeasure(): void {
    const input = this.input;
    if (!this.chart || !input) return;
    this.chart.removeOverlay({ groupId: 'measure' });
    this.chart.createOverlay({
      name: FX_MEASURE,
      groupId: 'measure',
      extendData: { fill: input.theme.accentSoft, text: input.theme.text, up: input.theme.up, down: input.theme.down, precision: input.meta.precision, scale: input.theme.scale },
    });
  }

  clearMeasure(): void {
    this.chart?.removeOverlay({ groupId: 'measure' });
  }

  snapshot(): string | null {
    if (!this.chart || !this.input) return null;
    return this.chart.getConvertPictureUrl(true, 'png', this.input.theme.bg);
  }

  // ---------------------------------------------------------------- formatting

  private formatDate(timestamp: number, template: string, type: string): string {
    const input = this.input;
    if (!input) return new Date(timestamp).toISOString().slice(0, 10);
    const { meta, spec, dspec } = input;
    const daily = intervalMs(dspec.interval) >= 86_400_000 - 1;
    if (type === 'xAxis') {
      if (template === 'YYYY') return formatBarTime(timestamp, meta, dspec.interval, spec.displayZone, 'axis-year');
      if (template === 'YYYY-MM') return formatBarTime(timestamp, meta, dspec.interval, spec.displayZone, 'axis-month');
      if (template === 'MM-DD' || daily) return formatBarTime(timestamp, meta, dspec.interval, spec.displayZone, 'axis-day');
      return formatBarTime(timestamp, meta, dspec.interval, spec.displayZone, 'axis-time');
    }
    return formatBarTime(timestamp, meta, dspec.interval, spec.displayZone, 'long');
  }
}
