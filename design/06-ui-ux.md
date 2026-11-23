# 06 — UI / UX Design

## 1. Design direction

The look should be **calm and editorial, not a trading terminal**. TradingView is dense and expert-oriented. Google Finance is friendly but shallow. FinAInce sits between them: Google Finance's clarity at first glance, with TradingView's depth one click away. This is how the README's "user friendly, while informative and rigorous" principle shows up visually.

Principles:

1. **Progressive disclosure.** The default screen shows the chart, a headline number, range buttons and a chart-type toggle. Everything else lives in one settings drawer, grouped and explained.
2. **Every transformation is visible.** Chips on the chart's top-left list what's applied: `1M ≈` · `EMA 20 ⟶` · `Log`. Clicking a chip opens its settings. Nothing important is hidden in a menu.
3. **Explain, don't assume.** Each setting has a one-line plain-language hint and an ⓘ with the exact definition (pulled from `04-transforms-candle-and-line.md`).
4. **Numbers are first-class.** Tabular (monospaced-digit) figures, consistent precision, signed changes, units always shown.

## 2. Layout (desktop ≥ 1024 px)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ FinAInce   [ US500 · Spread bet · Weekly ▾ ]  [+ Import]                  ☾  ⤓ Export  ⚙ │  ← App bar (48px)
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  US 500                                                                                    │
│  6,952.9   −619.5 (−8.18%)  past week · incomplete bar                                     │  ← Headline (Google-Finance-like)
│  1M  3M  6M  YTD  1Y  5Y  10Y [Max]  Custom ▾          [ ▮▯ Candle | ⟋ Line ]   [ 1W ▾ ]   │  ← Range bar + type toggle + interval
├────────────────────────────────────────────────────────────────────────────────────────┬───┤
│ ⓘ 1W · Log · Vol            O 7,572.4  H 7,594.2  L 6,880.1  C 6,952.9  −8.18%  2.05M  │   │
│                                                                                        │ 7 │
│                                         ▮                                              │ 6 │
│                                 ▮ ▮    ▮▮▮  ▮                                          │ 0 │
│                       ▮▮ ▮▮▮  ▮▮ ▮▮▮▮▮      ▮▮▮                                        │ 0 │  ← Price pane
│              ▮▮▮▮▮▮▮▮                          ▮▮▯ (hatched = incomplete)              │   │
│      ▮▮▮▮▮▮                                                                            │   │
│ ────────────────────────────────────────────────────────────────────────────────────── │───│
│ ▁▂▁▃▂▁▂▃▅▃▂▂▁▂▃▂▂▃▄▅▃▂▂▃▂▂▃▄▆█                                       Tick volume       │   │  ← Volume pane
├────────────────────────────────────────────────────────────────────────────────────────┴───┤
│ 2019        2020        2021        2022        2023        2024        2025        2026    │  ← Time axis
│ ▁▁▂▂▃▃▃▄▄▅▅▆▅▆▇▆▇██▇▆▇█[▓▓▓▓▓▓▓▓▓▓▓▓]                                                    │  ← Overview strip (drag window)
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Range stats ▾   Change +2,431.6 (+53.8%) · CAGR 9.0% · Vol 17.2% · Max DD −25.4% · 1 gap    │  ← Collapsible stats strip
└────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                     ┌────────────────────────┐
                                                     Settings drawer │ Candles                │
                                                     (slides over,   │  Interval  [1W ▾] ...  │
                                                      320 px, right) │ Scale · Appearance ... │
                                                                     └────────────────────────┘
```

(Figures in the mock are illustrative.)

- The **headline** shows the last price and the change over the *selected range*, like Google Finance. On hover it switches to the hovered bar's value and its change from the range start, so moving the cursor tells a story.
- The **legend row** inside the chart (top-left) shows the transformation chips, then OHLC/volume of the hovered bar (the last bar when not hovering). In line mode it shows `Value`, plus `Raw` if smoothing is on.
- The **overview strip** (milestone 1.8, desktop): a 40 px mini area chart of the whole dataset under the time axis, with a draggable window showing the visible range. Dragging it slides the main chart, a second way to reach older data besides dragging the chart itself.
- The **interval control** is a combobox: a preset list plus free text ("3w", "2 months", "1y"). Invalid entries explain why ("Finer than the data's weekly interval").

### Responsive

| Width | Adaptation |
|---|---|
| 768–1023 | Settings drawer becomes a full-height sheet; range buttons scroll horizontally |
| < 768 | Single column; toolbar collapses into a bottom bar (`Range · Type · Interval · ⚙`); volume pane hidden by default; long-press = crosshair, two-finger drag = pan |

## 3. Settings drawer

One drawer with sections that change with the chart type. Every control applies live (no "Apply" button). There's a "Reset section" link per section.

**Candle mode**
1. *Candles*: Interval (+ alignment, under "Advanced"), style, colour convention, show incomplete bar.
2. *Volume*: Off / Linear / Log, colour by direction, pane vs. overlay.

**Line mode**
1. *Time frame*: mirrors the range bar, plus a Custom date-range picker.
2. *Accuracy*: slider `Auto · Every bar · 2× · 4× · …` over the valid sampling steps, with an effective step readout ("Auto: 1 point per 2 weeks · 754 points"). Advanced: price source.
3. *Smoothing*: method selector as cards with tiny sparkline previews of each method on the current data; parameter slider with time equivalent ("20 points ≈ 20 weeks"); causal/non-causal badge; "show raw line" toggle; "smooth in log space".
4. *Style*: line/area/baseline/step, width, colour.

**Both modes**
- *Scale*: linear/log/percent/indexed, left/right axis, invert.
- *Appearance*: grid, crosshair magnet, watermark (symbol + interval, very faint), theme override.
- *Data*: dataset info, IngestReport, precision override, display time zone, "Show data issues".

## 4. Visual identity (original)

| Token | Light | Dark | Notes |
|---|---|---|---|
| `bg` | `#FBFAF7` (warm paper) | `#0F1115` (ink) | Warm paper rather than pure white sets it apart from the cold white of most finance apps |
| `surface` | `#FFFFFF` | `#161A21` | Panels, drawer |
| `grid` | `#ECE9E2` | `#222833` | Very low contrast; horizontal lines only by default |
| `text` / `textMuted` | `#1B1D22` / `#6B6F78` | `#E6E8EC` / `#8B919C` | |
| `up` | `#1E9E72` (jade) | `#33C08E` | Not the stock #26A69A teal/green |
| `down` | `#D9534A` (vermilion) | `#F0665C` | |
| `accent.1` | `#3D5AFE` (indigo) | `#7C8CFF` | Line chart default, focus rings |
| `accent.2…6` | Validated categorical set for compare mode / indicators (colour-blind safe, checked in light and dark) | | |
| `incomplete` | Current up/down colour at 45% + 45° hatching | | |

- **Typography:** UI in *Inter* (or *IBM Plex Sans*); numbers use `font-variant-numeric: tabular-nums`. Headline price 32/600, change 16/500 in up/down colour with ▲/▼ glyphs (so meaning isn't conveyed by colour alone).
- **Chart chrome:** no chart border, price axis on the right with a floating last-price label in the series colour, crosshair as a 1 px dashed line in `textMuted`, and axis labels on rounded pill backgrounds.
- **Motion:** 150 ms ease-out for drawer and range transitions; the visible-range change on preset click animates (spring) so the user sees *where* the new range is. Respects `prefers-reduced-motion`.
- **Empty state:** a large dashed drop zone with a sample-data link ("Try with US 500 weekly sample") and a list of the accepted formats.

## 5. Import flow

1. Drop a file anywhere on the window (a full-window overlay appears), or use `+ Import` / paste a URL.
2. The worker parses it. If the format is recognised with high confidence, the chart appears immediately and a toast says "Loaded US500 · 1,506 weekly bars · 3 notes [View]".
3. If confidence is low, the **column-mapping dialog** opens: a preview table of the first 20 rows, a dropdown per column (Time/Open/High/Low/Close/Volume/Ignore), time-format and time-zone selectors, and a live validation summary.
4. "Notes" (the IngestReport) use plain language: *"1 week is missing (30 Jul 2017). It's shown as a gap, not filled in."*

## 6. Accessibility

- **Interface size** (Settings → Appearance): Auto / Small / Normal / Large / Extra large sets the root font size (14–20 px). All UI sizes are in `rem`, so buttons, icons and text scale together, and chart labels scale by the same factor. CSS pixels already follow OS display scaling. Auto additionally enlarges the UI when a very high-resolution screen runs at 100% scaling (device-pixel ratio 1 and ≥ 2500 CSS px wide), which is common on Linux desktops.
- All controls are keyboard-reachable (Radix primitives) with visible focus rings.
- The chart canvas has `role="img"` with a live `aria-label` summary ("US 500 weekly candles from Jan 1998 to Nov 2026, last 6,952.9, down 8.2% this week"). Arrow-key crosshair navigation announces each bar through an `aria-live="polite"` region.
- Colour contrast is AA for text. Up/down are distinguished by glyph and position as well as colour, and a monochrome candle convention (hollow up, filled down) is available.
- "Data table view" toggle (stage 2): the same derived series as an accessible, virtualised table, which can also be downloaded as CSV.

## 7. Localisation

`Intl.NumberFormat` / `DateTimeFormat` everywhere, driven by `prefsStore.locale`. Strings are kept in a message catalogue from day one (English only in stage 1). The red-up colour convention is a preference, not tied to locale (suggested by default for zh/ja/ko locales).
