# Implementation notes — Stage 1 (2026-11-23)

Findings from building milestones 1.0–1.8, including the KLineChart spike items (01 §2.4), and where the code differs from the design.

## Spike items

| ID | Result |
|---|---|
| S1 Worker bundling | **Works** with Turbopack in `next dev` and `next build`. `new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' })` produces a separate worker chunk |
| S2 DataLoader + `setPeriod` | **Works.** ⚠ In KLineChart v10, `getBars({ type: 'forward' })` asks for **older** data (prepended, `timestamp` = oldest loaded bar) and `'backward'` asks for newer data. The docs were corrected. `setSymbol`, `setPeriod` and `setDataLoader` each call `resetData()`. Range requests that arrive while an `init` load is in flight must be queued (`initPending` in `KlcEngine`), or the stale range wins |
| S3 Line mode | **Works:** `candle.type: 'area'` with `area.value: 'line'` (a field on each `KLineData`) for the raw line. The `FX_LINE` custom indicator draws the smoothed line, step and baseline styles itself (`draw` returns `true`). The y-axis range of the candle pane uses the `area.value` field plus the indicator's figure values. The indicator must reset `ctx.setLineDash([])`, because the canvas inherits the dashed price-mark style |
| S4 Trading-date labels | **Works** via `setFormatter({ formatDate })`. Daily-and-longer bars format the trading date (`tradingDay()` → civil date). KLineChart's tick placement still uses its own calendar logic, so a year tick can land one bar late around New Year. This is cosmetic |
| S5 100k-bar performance | **Not measured yet.** The sample has 1.5k bars. To do: synthetic 1M-bar benchmark (07 §2) |
| S6 Export resolution | `getConvertPictureUrl` renders at the device pixel ratio. The planned 2× off-screen resize for PDF is **not implemented**. PDFs embed the on-screen resolution |

## Other library findings

- `setBarSpace` silently ignores values outside `layout.barSpaceLimit`, so the engine clamps itself. Limits used: min 0.5 px (lines), max 160 px (so short ranges like 1Y of monthly bars fit the width).
- KLineChart's built-in hotkeys are disabled (`hotkey: { enabled: false }`) so our shortcuts (05 §6) don't double-scroll.
- The built-in `VOL` indicator with `calcParams: []` gives a plain volume pane without MA lines. No custom `FX_VOL` was needed.
- `overrideYAxis({ paneId, name })` swaps the axis type (`normal` / `logarithm` / `percentage` / our `indexed100`).
- The y-axis `percentage` type uses the first visible bar's `close` as base. In line mode with a non-close price source the base is the close, not the line value. This is minor; to revisit.

## Deviations from the design

| Design | Implementation (stage 1) | Why |
|---|---|---|
| `ChartSpec.panes[].series[]` (05 §2) | Flat v1 spec: one main series + `volume` setting (`src/core/model/spec.ts`) | Enough for stage 1. The panes form arrives with indicators in stage 2 through a `v1 → v2` migration |
| Hatched or outlined incomplete bar | Translucent fill + stronger border via the per-bar colour callback | Simpler; still clearly different. An outline overlay can be added later |
| Gap marker tooltip text | Dotted vertical line only. Gap dates are listed in Data notes | KLineChart overlays have no hover tooltip API; to revisit |
| Overview strip as a second KLineChart instance | Plain `<canvas>` with a min/max envelope from the worker | Lighter, no second chart instance |
| Shift+drag measure | Toolbar button / `M` key, then click two points | KLineChart overlays are created in click-step mode |
| Playwright E2E + visual tests (07 §2) | **Not set up yet.** Unit and property tests (Vitest, 32 tests) cover core, ingest and pipeline. The UI was checked manually in a browser | To add with CI |

## Code audit (2026-11-23)

Defects found and fixed. Each has a regression test in `tests/audit.test.ts`:

| Area | Defect | Fix |
|---|---|---|
| Ingest | `YYYYMMDD` dates (e.g. `20240301`) were read as epoch seconds in 1970 | New `compact-date` time kind with calendar validation |
| Ingest | Semicolon files with decimal commas (`975,25`) lost the comma: 97525 | Decimal comma detected from the close column of `;` files |
| Ingest | Precision came from closes only, so highs/lows with more decimals were rounded | Precision is the maximum over O, H, L, C |
| Ingest | Re-importing a file with a different column mapping kept the same dataset id, so the chart didn't reload | The confirmed mapping is part of the id |
| Ingest | Gaps in multi-year data were counted in years, not bars | Divide by the interval count |
| Intervals | Bases that don't tile a day (7m, 5h) were accepted for daily and longer targets | `checkTarget` requires 1440 % m = 0 and 24 % h = 0 |
| Resample | Edge buckets were compared with calendar time, so full months of daily data (~21 bars, not 30) were flagged partial/incomplete and left out of stats | Compare with the median bars per bucket in the data |
| Smoothing | One NaN (e.g. a price ≤ 0 in log space) blanked the SMA/WMA/EMA for the rest of the series | NaN blanks only the windows that contain it; EMA re-seeds |
| Stats | Daily/intraday volatility was annualised with √365 instead of ≈√252 (+20%) | Bars per year measured from the series for day-and-finer intervals |
| Overview | All-NaN buckets produced ±Infinity and broke the drawing; width was 0 in background tabs; arrow keys also scrolled the chart | NaN buckets skipped; synchronous width; key events stop at the strip |
| Range stats | A failed stats request was an unhandled promise rejection | Caught; stats cleared |
| Export | Long notes ran off the PDF page; symbols like `EUR/USD` produced invalid file names | Notes wrapped; `safeFileName` |
| Chart | Animated range changes never finished when `requestAnimationFrame` was paused (hidden views) | Jump without animation after 400 ms if the range wasn't reached |

Known and left as is: `listDatasets` reads whole datasets from IndexedDB to list their metadata (slow with many large files). Storing the metadata separately is a stage-2 change.
