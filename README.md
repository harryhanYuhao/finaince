# FinAInce - User Friendly Quantitative Finance

FinAInce is a user friendly quantitative finance tool. 
This is an ambitious project that made up of several components listed below. 

## Functionalities

- A comprehensive visualisation tool for finance. 
This tool can graph line charts and candle charts (among others). 
It allows annotation, compositions, and visualisation of various predefined and custom data statistics. 
It allows pdf export.
- Various financial data statistics. 
- Custom statistics, such as comparison, etc

## Designing Principle 

The designing principle of this app is 
1. It is user friendly, while at same time informative and deliver clear and rigorous data
1. The aim of this program is to make quantitative finance accessible to retail traders.

This project consist of entirely frontend visualisation and light statistics.
The job of pulling data and heavy data analysis shall be handled by another dedicated program. 

## Developer's Guide 

### Data Format 

The app accepts many different data formats. 
One of the example data-sheet is shown in `./data/` directory.

Supported inputs (see `design/03-data-model-and-ingestion.md`):

- CSV/TSV/semicolon-delimited text with a time column and OHLC columns (or a single close/value column); volume and the `IsCompleteBar` / `IsTradingDay` / `MarketOpen` flags are optional.
- JSON: an array of bar objects, or columnar `{ "t": [], "o": [], "h": [], "l": [], "c": [], "v": [] }`.
- Unrecognised headers open a column-mapping dialog.

### Running

Requires Node.js 20+ and [pnpm](https://pnpm.io) 11 (the version is pinned in `package.json` → `packageManager`).

```bash
pnpm install
pnpm dev           # http://localhost:3000
pnpm test          # unit + property tests (Vitest)
pnpm typecheck
pnpm lint
pnpm build         # production build
```

### Project layout

- `design/` — architecture and design documents (start with `design/README.md`; implementation findings in `design/spike-notes.md`)
- `src/core/` — framework-free domain logic: data model, ingestion, time/sessions, resampling, smoothing, statistics
- `src/pipeline/` — derivation (resample → price source → smoothing → paging) used by the worker
- `src/workers/` — data Web Worker (Comlink)
- `src/render/klc/` — KLineChart adapter (the only code that imports `klinecharts`)
- `src/features/` — workspace UI (toolbar, settings, legend, import, export)
- `src/app/` — Next.js App Router shell
- `tests/` — Vitest tests
