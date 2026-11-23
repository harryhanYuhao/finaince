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
