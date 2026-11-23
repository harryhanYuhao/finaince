# 04 — Transforms: Candle and Line Chart Settings

This document defines exactly what each user setting means mathematically. "Rigorous data" means a user (or a test) can reproduce every plotted number from the raw file and the settings.

## 1. Shared concepts

| Term | Definition |
|---|---|
| **Base interval** | The interval of the source data (the sample: 1 week) |
| **Target interval** | The interval the user asks for. It must be an *integer multiple* of the base interval in calendar terms (§2.2). It can never be finer than the base: a weekly file can't produce daily candles, and the UI says so |
| **Time frame** | The span of data loaded into the chart (`from`–`to`). Distinct from the *visible range*, which is what's on screen after zooming. Range buttons (1M … Max) set both |
| **Trading date** | Per `03-data-model-and-ingestion.md` §5. All calendar bucketing uses it |

### 1.1 Time frame presets (both chart types)

`1M · 3M · 6M · YTD · 1Y · 5Y · 10Y · Max · Custom…`.

**Custom** sets *how much* to show and *where it starts*, not two end dates:

- **Range:** `N` × days / weeks / months / years: the span shown on screen.
- **Start:** Year, then Month, then Day, as separate fields, plus a calendar button that fills all three. A missing day means the 1st of the month; a missing month and day means 1 January. A day without a month, or a month or day without a year, is an *unknown date*: the picker says so and explains the expected input. Impossible days (30 February) are rejected the same way.
- The window is the trading dates `[start, start + span)`. Months and years clamp to the end of a shorter month (31 Jan + 1 month → 28/29 Feb). Bar times map to trading dates by the session rule (03 §5), so an evening session's bar opening the evening before the start date is included.
- The window is clamped to the data, with a note when it starts before the first bar or ends after the last. A start after the data, a window ending before it, or a span shorter than two base bars is refused with a message. A live preview shows the dates covered.
- Stored in the spec as `{ start: { year, month?, day? }, span: { count, unit } }`, so a partial start stays partial when the popover is reopened.
Presets are resolved against the dataset's **last bar** (not "today"), so an old file still shows meaningful ranges. Presets shorter than ~5 target bars are disabled (for weekly data, `1M` would be about 4 candles).

**Ranges that don't fit.** KLineChart shows at most `plotWidth / minBarSpace` bars at once. Candles narrower than ~3 px are unreadable, so for candle charts a preset showing more bars than `plotWidth / 3` (for example "Max" on weekly data: 1,506 candles in a 1,200 px plot) shows as many as fit, ending at the range end. A hint chip then offers "Switch to monthly to see the whole range", and the rest is a pan away to the left. Nothing is silently resampled.

## 2. Candle chart

### 2.1 Settings

| Setting | Values | Default |
|---|---|---|
| Interval | Presets valid for the base interval, plus **Custom N × unit** | Base interval |
| Bucket alignment | `Calendar` (months start on the 1st, years on 1 Jan, N-week buckets anchored to the first ISO week of the year) / `Rolling from first bar` / `Rolling from last bar` (the last bucket is complete) | Calendar |
| Bar style | Candles · Hollow candles · OHLC bars · Heikin-Ashi (stage 2; labelled "derived") | Candles |
| Colour convention | Green-up/red-down · Red-up/green-down · Monochrome | From prefs |
| Show incomplete bar | On / Off | On (hatched) |
| Volume pane | Off · Linear · Log | Linear |
| Price scale | Linear · Log · Percent (from the first visible bar) · Indexed to 100 | Linear |
| Show gaps | Off · Markers | Off |

Interval presets offered for a weekly base: `1W, 2W, 4W, 1M, 3M (quarter), 6M, 1Y`, plus Custom (`N weeks`, `N months`, `N years`). For a 1-minute base the list includes `1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, 1M`, and so on.

### 2.2 Valid target intervals

A target `T` is valid for base `B` when every T-bucket boundary coincides with a B-bar boundary:

| Base | Valid targets |
|---|---|
| minute × k | minute × (n·k), hour, day*, week*, month*, … |
| hour × k | hour × (n·k), day*, week*, month* … |
| day | day × n, week, month, quarter, year |
| week | week × n, **month\*\*, quarter\*\*, year\*\*** |
| month | month × n, quarter, year |

\* Session-aligned: a "day" is a trading session.
\*\* **Weeks do not tile months.** A weekly bar spanning 29 Sep–3 Oct can't be split. Rule: a weekly bar goes to the month that contains its **trading date** (the Monday). Month candles built from weekly data are therefore *approximate* (their open and close can be off by up to 4 trading days from true calendar-month values). The UI marks this with a "≈" badge on the interval chip and a tooltip: *"Monthly candles built from weekly data. Boundaries are approximate. Load daily data for exact months."* This is the kind of honesty the README's principles call for.

### 2.3 Aggregation (OHLCV resample)

For each bucket `k` containing source bars `i ∈ [s_k, e_k]`:

```
time_k   = bucketStart_k           (trading-date-based, converted back to an instant)
open_k   = open[s_k]
high_k   = max(high[s_k..e_k])
low_k    = min(low[s_k..e_k])
close_k  = close[e_k]
volume_k = Σ volume[s_k..e_k]      (NaN-aware; NaN only if all are NaN)
complete_k = all source bars complete AND bucket end ≤ last source bar end
```

- A **single linear pass** over the sorted arrays: O(n), allocation of only the output arrays.
- **Empty buckets** (data gaps) produce *no bar*, never a zero or a forward-filled bar. They are listed as gaps.
- A **partial first bucket** (data starts mid-month) is marked `partialStart`, drawn like an incomplete bar, and excluded from stats.
- Rolling alignment counts N *existing* bars, so gaps shift buckets. The tooltip says so.

### 2.4 Heikin-Ashi (stage 2)

Standard recursive formula on the resampled series. Shown with a "Derived: Heikin-Ashi" legend tag; the crosshair legend shows both HA and real OHLC values so the user never mistakes HA prices for traded prices.

## 3. Line chart

The user asked for three controls: **time frame**, **accuracy**, and **smoothing**. Precise definitions:

### 3.1 Time frame
As in §1.1.

### 3.2 Accuracy

"Accuracy" is how faithfully the line follows the underlying bars: the **sampling step** (one point per step) and the **price source** used to compute each point.

**Sampling step.** Options: `Auto`, `Every bar` (base interval), or any valid target interval (§2.2). Coarser steps aggregate by the selected price source over the bucket:

| Price source | Value per step |
|---|---|
| Close (default) | Close of the bucket's last bar |
| Typical (HLC3) | (H + L + C) / 3 of the aggregated bucket |
| Median (HL2) | (H + L) / 2 |
| OHLC4 | (O + H + L + C) / 4 |
| Mean close | Arithmetic mean of the closes in the bucket |

**`Auto` step.** KLineChart places one point per equal-width slot, with a minimum slot width (`layout.barSpaceLimit.min`, default 1 px; we set 0.5 px for line mode). So the number of points that fit on screen is bounded by the chart width. `Auto` picks the **finest valid step** whose point count for the selected time frame fits the plot width at the minimum slot width. Example: the sample file (1,506 weekly bars) on "Max" in a 1,200 px plot area → 1 point per week fits at 0.8 px per point, so `Auto` = every bar. On a 600 px phone plot → 2-week step. The chosen step is always displayed ("Auto: 1 point per 2 weeks · 754 points"). Zooming in doesn't change the step: the user can pin `Every bar` and pan instead.

No display decimation (LTTB or similar) is used. On KLineChart's index-based axis, unevenly spaced decimated points would be drawn evenly spaced and distort time. Accuracy is always an honest, uniform sampling step that the user can see.

UI: a slider with stops `Max (every bar) · High · Medium · Low · Custom`, mapped to step sizes valid for the dataset, with the effective step shown below it ("1 point per 2 weeks · 754 points").

### 3.3 Smoothing

| Method | Parameter (user-facing) | Causal? | Notes |
|---|---|---|---|
| None | — | — | Default |
| Simple moving average (SMA) | Window *n* points | Yes | Classic, lags n/2 |
| Exponential (EMA) | Span *n* (α = 2/(n+1)) or half-life | Yes | Less lag. Seeded with the SMA of the first n points |
| Weighted (WMA) | Window *n* | Yes | Linear weights |
| Gaussian kernel | σ in points (window = ±3σ) | **No** | Visually smooth; uses future values |
| Savitzky–Golay | Window *n* (odd), polynomial order 2–4 | **No** | Preserves peak height better than SMA |
| LOWESS (stage 2) | Span fraction | **No** | O(n·w); worker only |

Rules that keep it honest:

1. **Causal vs. centred is shown.** Non-causal methods carry a "uses future data, not suitable for signal back-testing" note in the settings panel and an icon in the legend. Retail users often draw wrong conclusions from centred smoothers that "predict" turns.
2. **Warm-up.** The first n−1 points of SMA/WMA are not drawn (no fake values). Centred methods are trimmed at both ends, or computed with shrinking windows when "Edge handling: shrink" is chosen, marked by a dashed segment.
3. **Raw line underneath.** When smoothing is on, the raw (sampled) line stays visible as a faint "ghost" (toggleable), so the user always sees what was smoothed away.
4. **Parameter units are points, with time shown.** "Window 10 points (≈ 10 weeks)", so changing the sampling step doesn't silently change the meaning.
5. **Log-space option.** Smoothing on log prices (geometric) is offered for long time frames where exponential growth dominates; off by default.

The slider gives live feedback: the worker recomputes on `input` events, debounced to one animation frame, with stale requests cancelled (`02-architecture.md` §6).

### 3.4 Line styles

Line · Area (gradient fill to baseline) · Baseline (two-colour above/below a reference: the first visible value, or a user-set price, Google-Finance style) · Step line. Width 1–4 px; colour driven by up/down state over the visible range (optional).

## 4. Light statistics (header and legend)

Computed in the worker over the **visible range**, using complete bars only:

| Stat | Definition |
|---|---|
| Change | `close_last − close_first`, plus % |
| Range high / low | Max high / min low, with dates |
| Period return, annualised (CAGR) | Shown only when range ≥ 1 year |
| Volatility (annualised) | stdev of log returns × √(periods per year), labelled with the period ("weekly returns") |
| Max drawdown | Peak-to-trough on close, with dates |
| Bars / gaps | Count, and the number of missing bars in range |

These are deliberately "light" (README). Heavier analytics come from the separate program or later stages.

## 5. Module layout and signatures

```ts
// core/transforms/resample.ts
export function resample(src: BarSeries, target: Interval, opts: { alignment: Alignment; session: SessionSpec }): ResampledSeries;

// core/transforms/priceSource.ts
export function priceSource(bars: BarSeries, src: PriceSource): Float64Array;

// core/transforms/smoothing/index.ts
export interface Smoother<P> { id: string; causal: boolean; warmup(p: P): number; apply(x: Float64Array, p: P): Float64Array }
export const smoothers: Record<SmoothingId, Smoother<any>>;

// core/transforms/autoStep.ts
export function autoStep(base: Interval, timeFrameBars: number, plotWidthPx: number, minSlotPx: number): Interval;
```

All functions are pure, allocation-conscious, and covered by golden tests (`07-roadmap-and-quality.md`).
