# 01 — Technology Stack

Revision 3 (2026-11-23). Product-owner decisions: **Next.js** as the framework and **KLineChart** as the chart library (free, Apache-2.0). Earlier candidates are recorded in §5.

## 1. Framework: Next.js (App Router)

FinAInce is a client-heavy app. Charts, parsing and statistics run in the browser. Next.js provides:

- **The app shell:** routing, layouts, fonts (`next/font`), metadata, error and loading boundaries.
- **A home for thin server pieces later:** route handlers that proxy the separate data program (no CORS problems, API keys stay server-side), shareable report pages (stage 4), and accounts or cloud workspaces if they ever come. Not needed in stage 1, but nothing to migrate later.

### Rules that keep Next.js out of the chart's way

| Rule | Why |
|---|---|
| Server Components only for the static shell (`layout.tsx`, `page.tsx`, the credits page) | KLineChart needs `window` and a canvas |
| The interactive workspace is one client island: `app/page.tsx` renders `<WorkspaceLoader/>`, a `'use client'` component calling `dynamic(() => import('@/features/workspace/Workspace'), { ssr: false })` | Chart and worker code never runs during SSR. Since Next 15, `ssr: false` is only allowed inside client components |
| Domain logic lives in framework-free `src/core` | Testable in Node, runnable in a worker, independent of Next.js |
| Stage 1 uses no server-only features, so `output: 'export'` (static hosting) keeps working | Hosting stays open: static CDN, Node server, or a desktop wrapper later |
| Workers are created with `new Worker(new URL('../workers/data.worker.ts', import.meta.url), { type: 'module' })` | The pattern both Turbopack and webpack bundle. **Verified in spike S1** |

### Chosen stack

| Layer | Choice | Version at design time |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.x |
| UI | React | 19.x |
| Language | TypeScript strict | 5.x |
| Charts | **KLineChart** (`klinecharts`), Apache-2.0, zero dependencies | 10.1.x |
| State | Zustand (+ immer) | 5.x |
| Styling | Tailwind CSS v4 + CSS-variable design tokens | 4.x |
| Accessible primitives | Radix UI (shadcn/ui-style local components) | — |
| CSV parsing | Papa Parse, in a worker | 5.x |
| Worker RPC | Comlink | 4.x |
| Persistence | IndexedDB (`idb-keyval` or Dexie) | — |
| PDF | jsPDF + the chart's picture export | 4.x |
| Tests | Vitest (unit), Playwright (E2E and visual) | — |
| Lint/format | ESLint (`eslint-config-next`, typescript-eslint) + Prettier | — |

## 2. Charting: KLineChart

KLineChart is a canvas-based financial chart library: candles, panes, indicators and drawing overlays, framework-agnostic (`init(dom)` / `dispose(dom)`), with a small imperative API. It has no React wrapper, and we don't need one. Our `ChartEngine` adapter (05) wraps it.

### 2.1 Feature mapping (v10 API)

| FinAInce need | KLineChart feature |
|---|---|
| Candles, hollow candles, OHLC bars | `styles.candle.type`: `candle_solid`, `candle_stroke`, `candle_up_stroke`, `candle_down_stroke`, `ohlc` |
| Line / area chart | `candle.type: 'area'` with `candle.area.value` set to the field to plot (we plot a precomputed `line` field, see 05 §5) |
| Smoothed line + raw "ghost" line | A custom indicator (`registerIndicator`) drawn on the candle pane (`series: 'price'`) that plots precomputed fields |
| Arbitrary candle intervals | `setPeriod({ type: 'week' \| 'month' \| …, span: N })` + our `DataLoader` serving resampled bars from the worker |
| **Slide left to older data** | Built in: drag to pan, inertia, wheel and trackpad scroll/zoom; `DataLoader.getBars` is called with `type: 'forward'` (KLineChart v10 calls older data "forward") when the user reaches the oldest loaded bar (lazy paging) |
| Jump to a range | `scrollToTimestamp`, `setBarSpace`, `zoomAtTimestamp`, `getVisibleRange`, `onVisibleRangeChange` action |
| Zoom behaviour | `setZoomAnchor('cursor' \| 'last_bar')`, `setZoomEnabled`, `setScrollEnabled`, `setOffsetRightDistance`, `setLeftMinVisibleBarCount` / `setRightMinVisibleBarCount`, `layout.barSpaceLimit` |
| Price scales | Built-in y-axis types `normal`, `percentage`, `logarithm`. Indexed-to-100 via `registerYAxis` |
| Volume | Built-in `VOL` indicator in its own pane. Log volume via that pane's y-axis |
| Separate panes (stage 2 indicators) | Every non-price indicator gets its own pane; `setPaneOptions` for height, order, drag-resize |
| Crosshair → our legend/headline | `subscribeAction('onCrosshairChange', cb)` gives `kLineData` and `dataIndex`. The built-in candle tooltip is hidden |
| Per-bar styling (incomplete bar) | `styles.candle.bar` accepts a **callback** returning `color`/`borderColor`/`wickColor` per bar |
| Time zone | Built in: `setTimezone('America/New_York')`. Plus `setFormatter` for trading-date labels |
| Price/volume precision | `setSymbol({ ticker, pricePrecision, volumePrecision })` |
| Drawing tools (stage 3) | Built-in overlays: `segment`, `straightLine`, `rayLine`, `horizontalStraightLine`, `verticalStraightLine`, `priceLine`, `parallelStraightLine`, `priceChannelLine`, `fibonacciLine`, `simpleAnnotation`, `simpleTag`, `text`, `rect`, `circle`, `polygon`, `brush`, … Custom ones via `registerOverlay`. Snapping via overlay `mode: 'weak_magnet' \| 'strong_magnet'` |
| Measure tool, gap markers | Custom overlays (`registerOverlay`) |
| Keyboard shortcuts | `registerHotkey`, `setHotkey` |
| Themes | `setStyles` / `registerStyles(name, styles)` from our design tokens |
| Localisation | `setLocale`, `registerLocale`, `setThousandsSeparator`, `setDecimalFold` |
| Image export | `getConvertPictureUrl(includeOverlay, 'png', backgroundColor)` |

### 2.2 Q: Can the user slide the chart left for older data?

Yes, natively, with no paid tier. Dragging the plot pans; the wheel or trackpad zooms (anchored at the cursor) and horizontal trackpad gestures scroll. The chart opens with the most recent bar at the right edge and older bars off-screen to the left. When the user reaches the oldest loaded bar, KLineChart calls our `DataLoader.getBars({ type: 'forward', timestamp })` (v10 naming: `forward` = older, `backward` = newer), and the worker returns the next older page. Small files like the sample (1.5k bars) are loaded in one page. Large files (100k+ bars) are paged, which keeps memory and first render light.

### 2.3 Things KLineChart does differently, and our decisions

| Difference | Consequence | Decision |
|---|---|---|
| The x-axis is **index-based**: every bar takes one equal slot, and there is no "true time" axis | Missing bars don't show as empty space, though nights and weekends are compressed the way traders expect | Mark data gaps with a dotted `gapMarker` overlay (when "Show gaps" is on) and list them in the data notes |
| Display decimation (LTTB) would put unevenly spaced points into even slots and distort time | LTTB is not used for display | "Accuracy" acts only through the **sampling step**. `Auto` chooses the finest step that keeps the selected time frame above the minimum bar spacing (04 §3.2) |
| No built-in navigator/overview strip | — | Stage 1.8: our own `OverviewStrip`, a second small KLineChart instance (area type, interaction off) with a draggable window synced through `scrollToTimestamp` / `setBarSpace` |
| Built-in indicators follow some Chinese-market conventions (for example `SMA` is the weighted SMA(N, M) variant, and `MA` is the simple moving average) | Same names can mean different formulas | FinAInce computes its own smoothing and indicators in `core` (tested, with causal flags). KLineChart indicators are used only as **renderers** of our precomputed fields. Built-ins are exposed to users only after their formulas are checked and documented |
| Per-bar style callback sets colours only (no pattern fill) | No diagonal hatching for incomplete bars | The incomplete bar uses translucent fill + a dashed outline drawn by a tiny custom overlay, plus an "incomplete" tag |
| Documentation is good in both Chinese and English, but the community is mostly Chinese-speaking | Answers to edge cases may need source reading | The library is small and readable; pin minor versions and keep adapter-level tests |

### 2.4 Spike items (milestone 1.0b, 07 §1)

| ID | Question | Fallback |
|---|---|---|
| S1 | Worker bundling with Turbopack | `next dev --webpack`, or a prebuilt worker in `public/` |
| S2 | DataLoader + `setPeriod` flow with worker-derived data, including paging of older data | Use `resetData` and push all data at once for small files |
| S3 | Line mode via `candle.type: 'area'` + custom field + overlay indicator for the smoothed and raw lines (draw order, crosshair values) | Draw both lines with a custom indicator and hide the candle series |
| S4 | Trading-date labels for weekly bars (Sunday 17:00 NY open → shown as Mon date) via `setFormatter` | Shift timestamps to the trading date before handing them over and format as UTC |
| S5 | Performance at 100k bars (pan, zoom, crosshair) and memory of `KLineData[]` objects | Smaller pages; coarser auto step |
| S6 | Picture export resolution for PDF | Temporarily resize the container at 2× before export |

## 3. Statistics charts (stage 2)

KLineChart only does time-series charts. Statistics views (return histograms, drawdown curves, box plots, correlation heatmaps) need a general chart library. Decision deferred to stage 2. The default candidate is **Apache ECharts** (Apache-2.0, tree-shakable, lazily loaded only on statistics panels).

## 4. Licence

KLineChart is **Apache-2.0**: free for commercial use. Obligations: keep its `LICENSE` and `NOTICE` texts in the distributed app (credits page + bundled third-party licence file). No logo, watermark or key needed.

## 5. Alternatives considered

| Option | Why not chosen |
|---|---|
| Vite SPA instead of Next.js | Simpler for a pure client app, but the product owner prefers Next.js for future server features. The `src/core` separation keeps the choice low-risk |
| TradingView Lightweight Charts | Free and excellent, but no drawing tools, indicators or lazy loading built in. KLineChart ships these |
| AG Charts | Candles, zoom/pan, navigator and annotations are Enterprise-only (paid, ~$499 per developer) |
| react-financial-charts | MIT, but last released May 2023 and declares React ≤ 18 only |
| ECharts, uPlot, Highcharts Stock, SciChart | Discussed on 2026-11-22. The `ChartEngine` adapter (05 §5) keeps a switch possible |
