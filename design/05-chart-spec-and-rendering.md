# 05 — ChartSpec and the Rendering Engine

## 1. Why a declarative spec

The app never says "call `chart.addSeries`". It keeps a plain, serialisable **ChartSpec** describing the chart. Everything else follows from it:

- **Undo/redo** = a history of specs.
- **Save/load layout** = JSON file of the spec.
- **PDF export** = render a spec at a chosen size, off-screen.
- **Compositions and annotations** (later) = more entries in the spec.
- **Swapping the chart library** = write a new adapter (KLineChart today); the spec is untouched.

## 2. ChartSpec (stage 1, versioned)

```ts
interface ChartSpec {
  version: 1;
  id: string;
  title?: string;
  timeFrame: { preset: RangePreset } | { from: number; to: number };   // what is loaded/derived
  view?: { from: number; to: number };                                  // zoom state (optional, restored on load)
  displayTimeZone: 'exchange' | 'local' | 'utc';
  panes: PaneSpec[];               // [0] = main price pane
  annotations: AnnotationSpec[];   // stage 3; [] for now
  appearance: AppearanceSpec;      // grid, crosshair mode, watermark, theme override
}

interface PaneSpec {
  id: string;
  heightRatio: number;             // relative stretch
  priceScale: { mode: 'linear' | 'log' | 'percent' | 'indexed100'; side: 'right' | 'left'; invert?: boolean };
  series: SeriesSpec[];
}

type SeriesSpec = CandleSeriesSpec | LineSeriesSpec | VolumeSeriesSpec /* | IndicatorSeriesSpec (stage 2) */;

interface CandleSeriesSpec {
  kind: 'candle';
  id: string;
  datasetId: DatasetId;
  interval: Interval | 'base';
  alignment: 'calendar' | 'rollingFirst' | 'rollingLast';
  style: 'candle' | 'hollow' | 'ohlc' | 'heikinAshi';
  colors: { up: ColorToken; down: ColorToken; wickUp?: ColorToken; wickDown?: ColorToken };
  showIncomplete: boolean;
}

interface LineSeriesSpec {
  kind: 'line';
  id: string;
  datasetId: DatasetId;
  step: Interval | 'base' | 'auto';
  priceSource: 'close' | 'hlc3' | 'hl2' | 'ohlc4' | 'meanClose';
  smoothing: { method: 'none' } | { method: 'sma' | 'wma'; window: number }
           | { method: 'ema'; span: number } | { method: 'gaussian'; sigma: number; edge: 'trim' | 'shrink' }
           | { method: 'savgol'; window: number; order: 2 | 3 | 4; edge: 'trim' | 'shrink' };
  smoothInLogSpace: boolean;
  showRawGhost: boolean;
  style: 'line' | 'area' | 'baseline' | 'step';
  baseline?: { mode: 'firstVisible' } | { mode: 'price'; value: number };
  color: ColorToken; width: 1 | 2 | 3 | 4;
}

interface VolumeSeriesSpec { kind: 'volume'; id: string; datasetId: DatasetId; follows: string /* series id for interval */; scale: 'linear' | 'log'; colorByDirection: boolean }
```

**Mapping to KLineChart:** a KLineChart instance has one main data stream (symbol + period). So `panes[0].series[0]` is the **main series** (candle or line) and defines the dataset and interval. Volume and later indicators are native panes. Additional series on the price pane (raw ghost, smoothed line, stage-3 compare series) are drawn by our custom indicators from fields carried on the main data or from a secondary dataset aligned by timestamp in the worker.

`ColorToken` is either a theme token name (`'up'`, `'down'`, `'accent.1'`…) or a literal colour. Tokens make the theme switch, the red-up convention and print mode work everywhere without editing the spec.

**Switching chart type** (Candle ⇄ Line) swaps the main series spec, carrying over the dataset, time frame and compatible settings (`interval` maps to `step`). The last settings of the other type are kept in `uiStore`, so switching back restores them.

**Spec migrations:** `version` plus a `migrations/` folder of pure `vN → vN+1` functions. Saved layouts must keep loading forever.

## 3. The DerivationSpec

The worker gets only the parts of the spec that affect data: series kinds, datasets, intervals, step, price source, smoothing, time frame, and the display zone (for bucketing labels). `stableHash(derivationSpec)` is the memo key. Purely visual fields (colours, widths, scale mode) do **not** trigger a worker round trip.

## 4. RenderPage (worker → main)

KLineChart pulls data through a `DataLoader` in pages (newest first, older pages on demand), so the worker returns **pages** rather than one whole model.

```ts
interface RenderPage {
  specHash: string;                       // derivation identity; stale pages are dropped
  time: Float64Array;                     // bar open instants, epoch ms (KLineChart applies the display zone)
  open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array;
  volume: Float64Array | null;
  line?: Float64Array;                    // line mode: sampled value for the chosen price source
  smooth?: Float64Array;                  // line mode: smoothed value (NaN during warm-up / trimmed edges)
  flags: Uint8Array;                      // incomplete / partialStart / gapBefore / synthetic / approx
  hasOlder: boolean;                      // → DataLoader callback `more.forward` (KLineChart v10: forward = older)
  meta: { tags: Array<'approx' | 'derived' | 'nonCausal'>; precision: number; volumePrecision: number; step: Interval };
}
```

`stats` (RangeStats) are requested separately for the visible range (`statsFor`), because the visible range changes with panning while pages don't.

## 5. ChartEngine interface

```ts
interface ChartEngine {
  mount(el: HTMLElement, theme: ChartTheme): void;
  apply(spec: ChartSpec, meta: DatasetMeta): void;          // diff against the previously applied spec
  setTheme(theme: ChartTheme): void;
  showRange(r: TimeRange, opts?: { animate?: boolean }): void;
  fitContent(): void;
  on(ev: 'crosshair', cb: (p: CrosshairPayload | null) => void): Unsubscribe;
  on(ev: 'visibleRange', cb: (r: TimeRange) => void): Unsubscribe;
  on(ev: 'loading', cb: (busy: boolean) => void): Unsubscribe;
  snapshot(opts: { pixelRatio: number; includeOverlays: boolean }): Promise<string /* data URL */>;
  resize(): void;
  destroy(): void;
}
```

### 5.1 KlcEngine (KLineChart adapter)

**Lifecycle.** `register.ts` runs once per page load: it registers our custom indicators, overlays, y-axis and locale. `mount` calls `init(el, { locale, timezone, styles, zoomAnchor: 'cursor' })`. `destroy` calls `dispose(el)`. A `ResizeObserver` calls `chart.resize()`.

**Applying a spec.** `apply` compares the new spec with the last applied one and calls only what changed:

| Spec change | KLineChart call(s) |
|---|---|
| Dataset | `setSymbol({ ticker, pricePrecision, volumePrecision })` → reload |
| Candle interval / line step | `setPeriod({ type, span })` → KLineChart calls `getBars({ type: 'init' })` |
| Price source, smoothing, alignment | `resetData()` → reload via the DataLoader (the worker memo makes this fast) |
| Chart type, candle style, colours | `setStyles({ candle: { type, bar, area } })` |
| Scale mode (linear/log/percent/indexed) | `overrideYAxis({ paneId: 'candle_pane', name: 'normal' \| 'logarithm' \| 'percentage' \| 'indexed100' })` |
| Volume pane on/off, log | `createIndicator({ name: 'FX_VOL' }, false, { id: 'vol_pane', height })` / `removeIndicator`; `overrideYAxis({ paneId: 'vol_pane', name: 'logarithm' })` |
| Smoothing display / raw ghost | `overrideIndicator({ name: 'FX_LINE', extendData: { showRaw, showSmooth, style } })` |
| Display time zone | `setTimezone(zone)` |
| Time frame preset | `showRange()` (below) |

**DataLoader bridge** (`dataLoader.ts`):

```ts
const loader: DataLoader = {
  getBars: async ({ type, timestamp, callback }) => {
    const gen = ++generation;
    const page = await worker.derive(datasetId, derivationSpec,
      { endBefore: type === 'forward' ? timestamp : null, maxBars: PAGE });   // v10: 'forward' = older
    if (gen !== generation) return;                      // superseded by a newer request
    callback(toKLineData(page), { forward: page.hasOlder, backward: false });
  },
  // subscribeBar / unsubscribeBar: stage 4 live feed (updates the incomplete last bar)
};
```

`toKLineData` builds `{ timestamp, open, high, low, close, volume, line, smooth, flags }` objects in one tight loop. KLineChart allows extra fields on `KLineData`, which our indicators and style callbacks read.

**Range presets.** `showRange({ from, to })`: count derived bars in the range (from the worker's index), call `setBarSpace(clamp(plotWidth / count, minSpace, maxSpace))`, then `scrollToTimestamp(to)`. If `from` is older than the loaded data, the engine first requests pages back to `from`. When the range has more bars than fit (04 §1.1), the hint chip is raised.

**Line mode.** The main line uses `candle.type: 'area'` with `candle.area.value: 'line'`. Style `line` uses a transparent background; `area` a token gradient. The custom `FX_LINE` indicator (`series: 'price'`, on `candle_pane`) draws the smoothed line from the `smooth` field and, for `baseline` and `step` styles, the fill and step geometry. When smoothing is on, the area line is restyled as the faint raw ghost (or hidden), and `FX_LINE` draws the smoothed line in the accent colour. Exact draw order and crosshair values are verified in spike S3.

**Incomplete and partial bars.** `styles.candle.bar` is a callback: when `flags & INCOMPLETE`, it returns the up/down colours at 45% alpha. The `incompleteOutline` overlay draws a dashed outline and a small "incomplete" tag above the bar.

**Gap markers.** For each gap, an `gapMarker` overlay (a dotted `verticalStraightLine` variant, locked) is created at the bar after the gap. Its tooltip reads "Missing: 30 Jul 2017 (1 week)".

**Volume.** `FX_VOL` is a copy of the built-in `VOL` without the moving-average lines (built-in `calcParams: [5, 10, 20]` removed). Bars are coloured by direction, and the label reads "Tick volume" when `volumeKind === 'tick'`.

**Crosshair.** The built-in candle tooltip is hidden (`styles.candle.tooltip.showRule: 'none'`). `subscribeAction('onCrosshairChange')` forwards `{ kLineData, dataIndex }` to our Legend/Headline through an rAF-throttled emitter.

**Formatting.** `setFormatter({ formatDate })` produces trading-date labels for day-and-longer periods and `Intl` time labels for intraday. `setSymbol` precision drives price labels. `setThousandsSeparator` / `setDecimalFold` follow the locale.

**Theme.** `styles.ts` builds a complete KLineChart `Styles` object from design tokens (06 §4) for `light`, `dark` and `print`. It is registered with `registerStyles('finaince-light', …)` and switched with `setStyles(name)`.

**Export.** `snapshot` = `getConvertPictureUrl(includeOverlays, 'png', tokens.bg)`. For high-resolution PDF output, the container is temporarily resized to 2× off-screen before capture (spike S6).

### 5.2 React integration

```tsx
function ChartHost({ chartId }: { chartId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const engine = useEngine(ref);                         // mount on effect, destroy on cleanup (StrictMode-safe)
  const spec = useWorkspace(s => s.charts[chartId]);
  const meta = useDatasetMeta(mainDatasetId(spec));
  useLayoutEffect(() => { if (meta) engine.apply(spec, meta); }, [engine, spec, meta]);
  return <div ref={ref} className="chart-host" role="img" aria-label={useChartSummary(chartId)} />;
}
```

React re-renders the host only when the spec changes. Pan, zoom and crosshair happen inside KLineChart. While a reload is in flight, the previous bars stay on screen. A thin progress bar appears only if loading takes longer than 150 ms.

## 6. Interaction model

| Gesture | Action | Source |
|---|---|---|
| Drag on chart | Pan; slide left into older data, which loads lazily | Built in |
| Wheel / pinch | Zoom around the cursor (`zoomAnchor: 'cursor'`) | Built in |
| Horizontal trackpad swipe | Scroll in time | Built in |
| Drag on price axis | Scale the price axis; "A" (auto) button resets | Built in + our button |
| Double-click on chart | Fit the selected time frame | Ours |
| Hover | Crosshair; values in our legend | Built in + ours |
| `Shift` + drag | **Measure**: Δprice, Δ%, Δbars, Δtime between two points | Custom `measure` overlay |
| `←` / `→` | Scroll one bar; with `Shift` scroll a page | Hotkeys (`scrollLeft` / `scrollRight`, extended) |
| `+` / `−` | Zoom in/out | Hotkeys (`zoomIn` / `zoomOut`) |
| `End` | Jump to the latest bar (`scrollToRealTime`) | Ours |
| `Ctrl/Cmd+Z`, `Shift+Ctrl/Cmd+Z` | Undo / redo spec changes | Ours |
| `C` / `L` | Switch to the candle / line chart | Ours |
| `/` | Focus the interval quick-entry ("3w", "2M", "1y") | Ours |
