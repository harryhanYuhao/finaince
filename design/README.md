# FinAInce — Stage 1 Design: Financial Chart Visualisation

Status: **Draft for review**, revision 3 (2026-11-23): Next.js + KLineChart. Nothing is implemented yet.

## Scope

An interactive, good-looking stock chart for user-supplied data (first format: `data/US500_SB_1w_*.csv`):

- **Candle chart**, with candle interval (any valid multiple of the data's interval), bucket alignment, style, colours, volume and scale settings.
- **Line chart**, with time frame, accuracy (sampling step + price source) and smoothing (SMA/EMA/WMA/Gaussian/Savitzky–Golay), all user-set.
- A clean extension path to the README's later goals: annotations, compositions, statistics and PDF export.

## Key decisions

| Question | Decision | Detail |
|---|---|---|
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript.** Server Components for the shell only; the chart workspace is a single client island loaded with `ssr: false`. Stage 1 stays static-export compatible; route handlers later proxy the data program | [01 §1](01-tech-stack.md) |
| Chart library | **KLineChart 10** (Apache-2.0, free, zero dependencies): candles/OHLC/area, panes, drag-to-pan with lazy loading of older data, log/percent axes, time zones, drawing overlays. Wrapped by our own `ChartEngine` adapter; our transforms and indicators are computed in `core`, and KLineChart only renders them | [01 §2](01-tech-stack.md), [05 §5](05-chart-spec-and-rendering.md) |
| State | Zustand stores; a serialisable, versioned `ChartSpec` is the single source of truth for the chart (undo, save, export, compositions) | [02](02-architecture.md), [05](05-chart-spec-and-rendering.md) |
| Performance | Columnar typed arrays, parsing/resampling/smoothing in a Web Worker (Comlink), memoised derivations, paged loading through KLineChart's `DataLoader`, `Auto` sampling step instead of visual decimation | [02 §6](02-architecture.md), [04](04-transforms-candle-and-line.md) |
| Rigour | Raw data never silently changed; ingest report; approximate/derived/non-causal transforms visibly labelled; incomplete bars and gaps shown, never filled | [03](03-data-model-and-ingestion.md), [04](04-transforms-candle-and-line.md) |
| Time | Bars anchored to an inferred exchange session (sample: New York 17:00, shifting 21:00/22:00 UTC with DST); calendar bucketing by trading date | [03 §5](03-data-model-and-ingestion.md) |
| Look and feel | Original "calm editorial" identity: warm paper/ink themes, jade/vermilion up/down, Google-Finance-style headline with TradingView-depth settings in one drawer | [06](06-ui-ux.md) |

## Documents

1. [01-tech-stack.md](01-tech-stack.md): framework and chart-library evaluation, chosen stack
2. [02-architecture.md](02-architecture.md): layers, data flow, source tree, stores, worker API, extension seams
3. [03-data-model-and-ingestion.md](03-data-model-and-ingestion.md): sample-data analysis, canonical model, adapters, validation, time zones/sessions
4. [04-transforms-candle-and-line.md](04-transforms-candle-and-line.md): exact definitions of interval resampling, accuracy, smoothing, stats
5. [05-chart-spec-and-rendering.md](05-chart-spec-and-rendering.md): ChartSpec schema, RenderPage, ChartEngine and KLineChart adapter, DataLoader paging, interactions
6. [06-ui-ux.md](06-ui-ux.md): layout, settings drawer, visual identity, import flow, accessibility
7. [07-roadmap-and-quality.md](07-roadmap-and-quality.md): milestones (incl. KLineChart spike), tests, performance budgets, licensing, open questions
8. [08-workspaces-and-symbol-pages.md](08-workspaces-and-symbol-pages.md): saved chart-tool workspaces (format, data references, autosave, export/import, hand-off) and the planned symbol pages
