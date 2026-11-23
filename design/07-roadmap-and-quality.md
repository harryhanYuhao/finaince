# 07 — Roadmap, Testing and Quality

## 1. Milestones

### Stage 1 — Chart visualisation tool (this design)

| # | Milestone | Done when |
|---|---|---|
| 1.0 | Scaffold | Next.js 16 (App Router) + React 19 + TS strict, client-only workspace island (`ssr: false`), Tailwind tokens, ESLint/Prettier, Vitest, Playwright, CI (lint, typecheck, test, build) |
| 1.0b | KLineChart spike | Spike items S1–S6 (01 §2.4) answered in a throwaway branch with the sample file: worker bundling, DataLoader paging, line mode via `area` + custom indicator, trading-date labels, 100k-bar pan/zoom, export resolution. Findings recorded in `design/spike-notes.md` |
| 1.1 | Core model + ingest | `csv-ohlcv` adapter loads the sample file in a worker; IngestReport finds the BOM, precision 1, session NY 17:00, 1 gap, incomplete last bar |
| 1.2 | Engine + candle chart | `KlcEngine` renders base-interval candles + volume pane via the DataLoader; drag-left loads older pages; crosshair legend; theme light/dark |
| 1.3 | Range + interval | Range presets, Custom range, interval combobox, calendar resample incl. the "≈" path for weeks→months |
| 1.4 | Line chart | Sampling step (incl. `Auto`) and price source, all stage-1 smoothers with causal labelling and raw ghost, line/area/baseline/step styles |
| 1.5 | Headline + stats strip | Range stats computed in the worker; hover-driven headline |
| 1.6 | Persistence | IndexedDB dataset cache, last workspace restore, save/load layout JSON |
| 1.7 | Export (basic) | PNG snapshot; simple one-page PDF (title, chart image, settings chips, stats table) |
| 1.8 | Polish | Overview strip, measure overlay, gap markers, keyboard navigation, a11y labels, responsive layout, empty state, error states |

### Stage 2 — Statistics and indicators
Indicator registry (SMA/EMA/Bollinger/RSI/MACD/ATR…) computed in `core` and rendered as KLineChart indicator panes. Built-in KLineChart indicators are offered only after their formulas are checked and documented. Also: Heikin-Ashi, LOWESS, return-distribution and drawdown panels (a general chart library such as ECharts, lazy-loaded), data-table view, more adapters (JSON API, Parquet).

### Stage 3 — Annotations and compositions
Drawing tools from KLineChart overlays (segment, ray, horizontal/vertical lines, price channel, Fibonacci, text, notes) plus our own via `registerOverlay`, with our own toolbar, magnet snapping and a stored style per tool. Saved in data coordinates in `ChartSpec.annotations`. Compare mode (several datasets on a percent scale, drawn by a custom indicator). Multi-chart layouts (2×1, 2×2) with synced crosshair and time.

### Stage 4 — Reports and integration
Multi-page PDF report builder (charts + stats + notes), live feed from the data program (WebSocket adapter that appends bars), custom statistic formulas (a sandboxed expression language, not arbitrary JS).

## 2. Testing strategy

| Level | Tooling | What |
|---|---|---|
| Unit (core) | Vitest | Every transform with hand-computed **golden fixtures**: resample (calendar/rolling, gaps, DST weeks, year end, partial buckets), smoothers (against reference values from NumPy/SciPy generated once and committed), auto step selection, precision inference, session inference, trading-date mapping |
| Property-based | fast-check | Resampling invariants: `high ≥ max(open, close)`, Σ volume preserved, bucket count ≤ source count, resample(resample(x, 2w), 4w) == resample(x, 4w) under calendar alignment, smoothing a constant series returns the same constant |
| Ingest | Vitest + fixtures | BOM, CRLF, `;` delimiter, quoted numbers, epoch s/ms, unsorted, duplicates, broken OHLC, empty file, header-only |
| Engine adapter | Vitest + a mocked `klinecharts` module | Spec diffing: a colour change calls only `setStyles`; an interval change calls `setPeriod` and not `resetData`; stale DataLoader responses are dropped; backward paging passes the right `endBefore` |
| E2E | Playwright | Import sample → candles visible → drag left until 1998 is reached (older pages load) → change interval → switch to line → set EMA 20 → export PNG; keyboard-only path |
| Visual regression | Playwright screenshots | Fixed viewport, both themes, candle/line/area/baseline, incomplete bar outline, gap markers |
| Performance | Vitest bench + Playwright trace | Budgets below, run in CI against a synthetic 1M-bar file |

### Performance budgets

| Operation | Budget |
|---|---|
| Ingest sample (1.5k bars) | < 50 ms |
| Ingest 1M bars | < 3 s, with progress |
| Re-derive on interval change (100k → any) | < 50 ms worker time |
| Smoothing slider drag | ≥ 50 fps perceived (no dropped interaction frames on the main thread) |
| Pan/zoom | 60 fps with 100k loaded bars (visible bars bounded by width) |
| Backward page load (5k bars) | < 100 ms from reaching the edge to bars drawn |
| Initial JS (gz) | < 250 kB for the workspace chunk (KLineChart included; jsPDF and statistics charts lazy) |

## 3. Licence compliance

- KLineChart is Apache-2.0: free for commercial use. Ship its `LICENSE` and `NOTICE` texts (credits page `/credits` + the bundled third-party licence file). No logo or key required.
- Pin `klinecharts` to a minor version (`~10.1.0`) and upgrade deliberately. The adapter tests catch API drift.
- Keep a generated third-party licence list (`license-checker`) in the build output.

## 4. Open questions for the product owner

1. **Data source integration.** Will the data program provide files only, or an HTTP/WebSocket API? This decides whether a JSON/stream adapter moves into stage 1.
2. **Delivery target.** Browser only, or also a desktop app (Tauri) for offline use with large local files? The architecture supports both; the choice affects the export (native save dialogs) and storage limits.
3. **Typical data granularity.** If intraday (1-minute) data is common, the 2M-bar path (streamed parsing, paged loading, coarser `Auto` steps) should be hardened early.
4. **"Accuracy" semantics.** This design reads it as *sampling step + price source* (04 §3.2). If you meant something else (for example number of decimals shown), it's a small change to the settings panel.
5. **Colour convention default.** Green-up (Western) or red-up (East Asian)?
6. **Statistics chart library (stage 2).** KLineChart covers time-series charts only. Is ECharts (Apache-2.0) acceptable for histograms and heatmaps, or should it be another library?
