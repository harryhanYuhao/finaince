# 02 — System Architecture

## 1. Guiding constraints

From the README:

- **Frontend only, light statistics only.** Heavy analysis and data fetching belong to a separate program. FinAInce must still stay responsive on large files, so CPU work happens in a Web Worker.
- **Friendly but rigorous.** Every transform the user applies (resampling, smoothing, rounding) must be explicit, reversible, and labelled on the chart. The raw data is never silently changed.
- **Built to grow.** Annotations, compositions (multi-series, multi-pane), custom statistics and PDF export are planned. Stage 1 must leave clean seams for them.

## 2. Layered architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NEXT.JS SHELL (Server Components)        src/app                         │
│  layout, fonts, metadata, credits page · <WorkspaceLoader/> (ssr:false)   │
├──────────────────────────────────────────────────────────────────────────┤
│  WORKSPACE UI  (Client Components, React)  src/features/*                 │
│  Workspace layout · Toolbar · Settings panels · Legend · Data dialog      │
│  reads/writes ─────────────────────────────┐                             │
├────────────────────────────────────────────┼─────────────────────────────┤
│  STATE  (Zustand stores)                    ▼            src/state         │
│  datasetsStore   workspaceStore (ChartSpec)   uiStore   prefsStore        │
├──────────────┬──────────────────────────────┬────────────────────────────┤
│  PIPELINE    │  derive: ChartSpec + Dataset  │  → RenderPage (paged)      │
│  src/pipeline│  (memoised, runs in worker)   │                            │
├──────────────┴──────────────────────────────┴────────────────────────────┤
│  CORE  (pure TypeScript, no DOM, no React)                  src/core      │
│  model/   BarSeries, Interval, Timezone, Precision                        │
│  ingest/  format adapters, schema detection, validation                   │
│  transforms/ resample, price-source, smoothing, auto sampling step        │
│  stats/   returns, change, range high/low, volatility (light)             │
│  indicators/ registry (SMA/EMA/… later)                                   │
├──────────────────────────────────────────────────────────────────────────┤
│  RENDER  (imperative)                                     src/render      │
│  ChartEngine interface ← KlcEngine adapter (KLineChart)                   │
│  DataLoader bridge (worker → getBars, older-page paging) · styles from      │
│  tokens · custom indicators (line/ghost renderers) · custom overlays      │
│  (gap marker, incomplete outline, measure) · crosshair events · picture   │
├──────────────────────────────────────────────────────────────────────────┤
│  WORKERS                                                   src/workers    │
│  data.worker.ts (Comlink): parse → normalise → resample → smooth → stats  │
├──────────────────────────────────────────────────────────────────────────┤
│  PLATFORM                                                  src/platform   │
│  IndexedDB cache · file access · export (PDF/PNG/CSV) · URL state          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows point downward only. `core` imports nothing from the other layers and has no browser globals, so it can run in a worker, in Vitest under Node, or be shared later with the data program. `render` never imports React. React components never call KLineChart directly. Only `render/klc/` imports `klinecharts`.

**Server/client boundary:** everything below the Next.js shell is client-only and is loaded through one `next/dynamic(..., { ssr: false })` boundary. Server Components never import from `features/`, `state/`, `render/` or `workers/`. An ESLint `no-restricted-imports` rule in `src/app/**` enforces this.

## 3. Data flow

```
 File drop / URL / (later) data-service feed
        │
        ▼
 [worker] ingest: sniff → pick adapter → parse → validate → normalise
        │                                   └─► IngestReport (warnings, gaps, precision)
        ▼
 Dataset { meta, base: BarSeries (columnar typed arrays) }  ──► IndexedDB cache
        │
 ChartSpec (user settings: chart type, interval, range, smoothing, style)
        │
        ▼
 [main] ChartEngine.apply(spec) ── setSymbol / setPeriod / setStyles / overrideYAxis / overrideIndicator ──► KLineChart
        │
        │  KLineChart pulls data: DataLoader.getBars({ type: 'init' | 'forward', timestamp, period })  (v10: forward = older)
        ▼
 [worker] pipeline.derive(dataset, derivationSpec, page) ───── memoised by (datasetId, specHash)
        │  1. resample to the target interval (candles) or sampling step (line)
        │  2. price source (close / HL2 / HLC3 / OHLC4) for line charts
        │  3. smoothing (computed on the full series, so page edges have no warm-up artefacts)
        │  4. slice the requested page (newest first; older pages on demand)
        ▼
 RenderPage { time, o/h/l/c, volume, line, smooth, flags, hasOlder }  (Transferable ArrayBuffers)
        │
        ▼
 [main] toKLineData(page) ──► callback(data, { forward: hasOlder }) ──► KLineChart draws
        │
        │  pan / zoom / crosshair stay inside KLineChart; visible-range changes ─► worker.statsFor(range)
        │
        ▼
 user interaction (crosshair, zoom, range buttons) ─► uiStore / workspaceStore ─► loop
```

Three update paths with different costs:

| Path | Trigger | Work |
|---|---|---|
| **Re-derive** | Interval, smoothing, price source, dataset change | Engine calls `setPeriod` (interval) or `resetData` (other derivation changes); KLineChart asks the DataLoader again; the worker serves the new derived page, keeping the anchor timestamp in view |
| **Re-style / re-view** | Colours, visible range, scale mode | Main thread only: `setStyles`, y-axis override, `setBarSpace` + `scrollToTimestamp` for range presets; no worker round trip |
| **Pan / zoom** | User drags or scrolls the chart | Entirely inside KLineChart; no React work. The worker is asked only when the user reaches the oldest loaded bar (`forward` page, KLineChart v10 naming). The engine listens to `onVisibleRangeChange` (debounced) to update `ChartSpec.view` and the range stats |

Hover moves never go through React state per frame: the engine publishes the hovered bar to a small event emitter that the Legend subscribes to and throttles with `requestAnimationFrame`.

## 4. Source tree

```
finaince/
├─ design/                        ← these documents
├─ data/                          ← sample datasets (git-ignored if large)
├─ public/
│  └─ samples/US500_SB_1w_….csv   "Try with sample data" (fetched client-side)
├─ src/
│  ├─ app/                        NEXT.JS APP ROUTER (Server Components unless noted)
│  │  ├─ layout.tsx               <html>, next/font (Inter), theme no-flash script, metadata
│  │  ├─ globals.css              Tailwind entry + tokens import
│  │  ├─ page.tsx                 Workspace route → <WorkspaceLoader/>
│  │  ├─ WorkspaceLoader.tsx      'use client'; next/dynamic(() => import(Workspace), { ssr: false }) + skeleton
│  │  ├─ credits/page.tsx         Licences and attributions (static)
│  │  ├─ error.tsx, not-found.tsx
│  │  └─ api/                     (stage 4) route handlers proxying the data program
│  ├─ features/                   CLIENT ONLY
│  │  ├─ workspace/               Workspace layout, ChartHost component
│  │  ├─ toolbar/                 Symbol chip, chart type, interval picker, range buttons
│  │  ├─ settings/                Settings drawer: candle, line, scale, appearance, data
│  │  ├─ legend/                  OHLC/value legend + headline stats
│  │  ├─ data-import/             Drop zone, import dialog, column mapping, IngestReport view
│  │  └─ export/                  Export dialog (PNG, PDF, CSV of derived series)
│  ├─ components/ui/              Our design-system primitives (Button, Segmented, Slider, Popover…)
│  ├─ state/                      Zustand stores + selectors
│  ├─ pipeline/                   derive(), memo cache, spec hashing
│  ├─ core/                       PURE TS (no DOM, no React, no Next)
│  │  ├─ model/                   types: Bar, BarSeries, Interval, Dataset, Precision, Session
│  │  ├─ time/                    tz conversion, calendar bucketing, interval arithmetic
│  │  ├─ ingest/                  adapters/{csv-ohlcv, csv-close, json}, sniff, validate, normalise
│  │  ├─ transforms/              resample, priceSource, smoothing/*, autoStep, slice
│  │  ├─ stats/                   change, returns, extremes, volatility
│  │  └─ indicators/              registry + definitions (stage 2+)
│  ├─ render/
│  │  ├─ engine.ts                ChartEngine interface
│  │  └─ klc/
│  │     ├─ register.ts           one-time registerIndicator / registerOverlay / registerYAxis / registerLocale
│  │     ├─ KlcEngine.ts          ChartEngine implementation (init / dispose / setPeriod / setStyles …)
│  │     ├─ dataLoader.ts         DataLoader bridging getBars → worker.derive (paging, generation ids)
│  │     ├─ indicators/           FX_LINE (smoothed + raw ghost renderer), FX_VOL (volume, no MA lines)
│  │     ├─ overlays/             gapMarker, incompleteOutline, measure (stage 3: drawing tools)
│  │     ├─ yAxes/                indexed100
│  │     ├─ styles.ts             design tokens → KLineChart Styles (light/dark/print), candle bar callback
│  │     └─ format.ts             trading-date & number formatters (setFormatter)
│  ├─ workers/                    data.worker.ts, worker client
│  ├─ platform/                   storage, files, export, urlState
│  └─ styles/                     tokens.css
├─ tests/
│  ├─ fixtures/                   small hand-crafted CSVs + golden outputs
│  └─ e2e/                        Playwright specs + screenshot baselines
├─ next.config.ts
├─ vitest.config.ts
├─ playwright.config.ts
└─ package.json
```

## 5. State stores

| Store | Contents | Persisted |
|---|---|---|
| `datasetsStore` | `Record<DatasetId, DatasetMeta>` plus load status. The heavy arrays live in the worker and IndexedDB, not in React state | IndexedDB |
| `workspaceStore` | The active `ChartSpec` (one per chart; one chart in stage 1), undo/redo history of spec changes | localStorage (last session), and as `.finaince.json` layout files on explicit save |
| `uiStore` | Open panels, hovered bar index, drag state, toasts | No |
| `prefsStore` | Theme, locale, number format, default timezone, up/down colour convention (green-up or red-up for East Asian markets) | localStorage |

**Undo/redo** applies to `ChartSpec` changes only (interval, smoothing, styles, and later annotations). Because the spec is a plain serialisable object, this is a bounded stack of snapshots (or immer patches).

## 6. Worker boundary

```ts
// src/workers/data.worker.ts (Comlink-exposed API)
interface DataWorkerApi {
  ingest(file: File | ArrayBuffer, hint?: IngestHint): Promise<{ meta: DatasetMeta; report: IngestReport }>;
  loadCached(id: DatasetId): Promise<DatasetMeta | null>;
  derive(id: DatasetId, spec: DerivationSpec, page: PageRequest): Promise<RenderPage>;  // transfers typed arrays
  statsFor(id: DatasetId, spec: DerivationSpec, range: TimeRange): Promise<RangeStats>;
  exportCsv(id: DatasetId, spec: DerivationSpec): Promise<Blob>;
  evict(id: DatasetId): void;
}
```

- The worker owns the canonical `BarSeries` for each loaded dataset, so they are not copied back and forth.
- `PageRequest = { endBefore: number | null; maxBars: number }`. `null` means "the newest page". KLineChart's `init` load maps to `endBefore: null`, `forward` (older data in KLineChart v10) to `endBefore: oldestLoadedTimestamp`. Default page size: everything up to 20k bars, otherwise 5k bars per page.
- `derive` results are memoised in the worker (LRU, keyed by `datasetId + stableHash(spec subset)`), which makes toggling between intervals instant.
- Requests are cancellable: each new `derive` for the same chart supersedes the previous one (generation counter), so dragging a smoothing slider never queues stale work.
- For small datasets (< ~20k bars) the round trip is a few milliseconds and not noticeable. A synchronous main-thread fallback is kept for tests.

## 7. Error handling

| Failure | Behaviour |
|---|---|
| Unparseable file | Import dialog shows the reason and the first offending line; nothing is loaded |
| Parseable but suspicious (OHLC inconsistent, duplicate timestamps, gaps) | Loaded; warnings listed in the IngestReport; affected bars marked on the chart when "Show data issues" is on |
| Transform impossible (for example candle interval finer than the source data) | The option is disabled in the UI with a tooltip explaining why; the pipeline also rejects it defensively |
| Worker crash | Error boundary toast, worker restarted, datasets reloaded from IndexedDB |

## 8. Extension seams for later stages

| Planned feature (README) | Seam provided in stage 1 |
|---|---|
| Annotations | `ChartSpec.annotations[]` (empty in stage 1). Stage 3 uses KLineChart overlays (built-in drawing tools plus our own via `registerOverlay`) with our own toolbar. Annotations are stored in **data coordinates** (timestamp, price) in our spec format and mapped to and from `createOverlay` / `getOverlays`, so saved layouts don't depend on the library's schema |
| Compositions | `ChartSpec.panes[].series[]` is already a list. Compare mode = another series bound to a different dataset on a percent scale. Extra panes (indicators) are native KLineChart panes sharing the time axis and crosshair. Multi-chart layouts (2×2) are several instances synced through `onVisibleRangeChange` / `onCrosshairChange` + `scrollToTimestamp` / `executeAction` |
| Predefined/custom statistics | `core/stats` + `core/indicators` registry with a `{ id, params schema, compute, outputs }` contract; outputs are extra fields on the RenderPage, drawn by a KLineChart indicator |
| PDF export | `ChartEngine.snapshot()` (`getConvertPictureUrl`) + `platform/export/pdf.ts`; spec + stats give the vector text parts |
| Server features (data proxy, shared reports, accounts) | `src/app/api/*` route handlers and new routes; no client code changes, because the data adapter interface already abstracts the source |
| Live data from the data program | `core/ingest` adapter interface; a `StreamSource` can append bars to a dataset and mark the last one incomplete, which the model already supports |
