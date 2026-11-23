# 03 — Data Model and Ingestion

## 1. What the sample file tells us

`data/US500_SB_1w_1998-01-04_2026-11-15.csv`, 1,506 rows:

```
TimeUtc,IsTradingDay,MarketOpen,IsCompleteBar,Open,High,Low,Close,TickVolume
1998-01-04T22:00:00Z,true,true,true,975,982.60000000000002,921.70000000000005,927.70000000000005,1492
```

| Observation | Consequence for the design |
|---|---|
| File starts with a UTF-8 BOM (`EF BB BF`) | Strip the BOM before reading the header; otherwise the first column would be named `﻿TimeUtc` |
| File name encodes metadata: `{symbol}_{source}_{interval}_{from}_{to}` (`US500`, `SB`, `1w`) | Parse it as a *hint* for symbol, source and interval; always verify the interval against the actual timestamps |
| Prices carry binary float noise (`982.60000000000002`) | Infer the instrument's **price precision** (here 1 decimal), round on ingest, and use it for axis labels and `minMove` |
| Bar open times are Sunday 21:00 **or** 22:00 UTC (946 / 560 rows) | They are 17:00 America/New_York, shifting with US daylight saving. Bars are anchored to an **exchange session time zone**, not UTC. Calendar bucketing (weeks → months) must happen in that zone |
| Bar spacing is 7 days, except 29 spacings of 6 days and 1 of 14 days | 6-day spacings are DST transitions (23/25 h); the 14-day one is a **missing week** (2017-07-30). Gaps must be detected and reported, not interpolated |
| Last bar has `IsCompleteBar=false` | A partial, still-forming bar. Shown with a distinct style, excluded from statistics by default |
| `IsTradingDay` / `MarketOpen` are always `true` here | Keep them as optional flags; other files (daily/intraday) will contain non-trading rows, which are filtered out by default |
| `TickVolume` from 264 to 2,053,891 | It is *tick* volume (number of price updates), not traded volume. Label it as such. Its range spans 4 orders of magnitude, so the volume pane needs an optional log scale |

## 2. Canonical in-memory model

The model is columnar, using typed arrays: fast to resample, cheap to transfer to and from the worker, and memory-light (1M bars ≈ 48 MB as Float64, versus several hundred MB as JS objects).

```ts
type DatasetId = string;                 // content hash (xxhash of bytes) → dedupes re-imports

interface BarSeries {
  length: number;
  time:   Float64Array;   // bar OPEN time, epoch ms UTC (true instant)
  open:   Float64Array;
  high:   Float64Array;
  low:    Float64Array;
  close:  Float64Array;
  volume: Float64Array | null;           // NaN where missing
  flags:  Uint8Array;     // bit 0 complete, bit 1 tradingDay, bit 2 marketOpen, bit 3 synthetic(OHLC from close only)
}

interface DatasetMeta {
  id: DatasetId;
  symbol: string;                        // "US500"
  displayName?: string;                  // "US 500 (spread bet)"
  source?: string;                       // "SB"
  baseInterval: Interval;                // detected, e.g. { unit: 'week', count: 1 }
  session: SessionSpec;                  // time zone + session open (see §5)
  precision: number;                     // price decimals, e.g. 1
  volumeKind: 'tick' | 'traded' | 'none';
  range: { from: number; to: number };   // epoch ms
  barCount: number;
  importedAt: number;
  origin: { kind: 'file'; name: string; size: number } | { kind: 'url'; url: string } | { kind: 'stream'; sourceId: string };
  report: IngestReport;
}

interface Interval { unit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'; count: number }
```

Only **OHLC(V) bar series** are modelled in stage 1. A close-only series (for example an index level or a fund NAV) is stored as a BarSeries with O=H=L=C and the `synthetic` flag set, which disables the candle chart type for it (candles would be misleading).

## 3. Ingestion pipeline

```
bytes ──► decode (UTF-8, strip BOM) ──► sniff ──► adapter.parse ──► validate ──► normalise ──► Dataset
                                          │                            │
                                          └── confidence < threshold ──┴──► Column-mapping dialog (user confirms)
```

### 3.1 Adapters

```ts
interface FormatAdapter {
  id: string;                                       // 'csv-ohlcv'
  label: string;                                    // 'CSV with OHLC columns'
  sniff(sample: string, fileName?: string): { confidence: number; mapping?: ColumnMapping };
  parse(input: string | ReadableStream, mapping: ColumnMapping): AsyncIterable<RawRow[]>;  // chunked
}
```

Stage-1 adapters:

| Adapter | Recognises |
|---|---|
| `csv-ohlcv` | Any delimited text whose header matches time + OHLC aliases (case/space/underscore-insensitive): time: `time, timeutc, date, datetime, timestamp, t`; open: `open, o, opening`; … ; volume: `volume, vol, tickvolume, v`. The sample file matches with confidence 1.0 |
| `csv-close` | Time + single value column (`close, price, value, adj close`) |
| `json-bars` | Array of objects with the same aliases, or `{ t:[], o:[], h:[], l:[], c:[], v:[] }` columnar JSON (a common API shape and the likely format for the future data program) |

New formats (Parquet via a WASM reader, broker-specific exports) are added by registering another adapter. Nothing else changes.

### 3.2 Time parsing

Accepted: ISO-8601 with `Z` or an offset; ISO date only (`2024-03-01`, which means the session open on that date in the dataset's session time zone); epoch seconds or milliseconds (told apart by magnitude); common locale formats only after the user confirms them in the mapping dialog (`03/04/2024` is ambiguous and is never guessed silently).

### 3.3 Validation → `IngestReport`

| Check | Severity | Action |
|---|---|---|
| Unparseable time or price | error (row) | Row skipped; first 20 listed |
| Non-monotonic times | warn | Sorted |
| Duplicate timestamps | warn | Last one wins (configurable) |
| `high < max(open, close)` or `low > min(open, close)` | warn | Kept as is and flagged; never "fixed" silently |
| Non-positive price | warn | Kept; log scale disabled for the dataset with an explanation |
| Gaps (missing expected bars per the session calendar) | info | Listed (for example "1 missing week: 2017-07-30"); shown as optional gap markers |
| Incomplete trailing bar | info | Flagged |
| Interval mismatch with the file-name hint | warn | The detected interval wins |

The IngestReport appears in the import dialog and later from the dataset chip ("ⓘ 3 notes").

### 3.4 Normalisation

1. **Precision inference.** For a sample of values, find the smallest `d ∈ [0, 8]` such that `|v·10^d − round(v·10^d)| < 1e-6`. Take the 99th percentile across values (robust to the odd computed value). Round every price to `d` decimals. The user can override it.
2. **Base-interval detection.** Take the mode of the consecutive time deltas, snapped to the nearest calendar interval with tolerance for DST (±1 h) and month length (28–31 d).
3. **Session inference** (§5).
4. **Volume kind.** `tickvolume` maps to `'tick'`, `volume` to `'traded'`, absent to `'none'`.

## 4. Persistence

- Normalised datasets are cached in IndexedDB as raw `ArrayBuffer`s keyed by `DatasetId`, so a reload restores the workspace instantly without re-parsing.
- Workspace layouts store the `DatasetId` plus the original file name. If a dataset is missing from the cache, the user is asked to re-drop the file (the hash is checked).

## 5. Time zones and sessions

Financial bars are defined by **exchange sessions**, not UTC days. This decides whether weekly→monthly resampling is correct.

```ts
interface SessionSpec {
  timeZone: string;          // IANA, e.g. 'America/New_York'
  sessionOpen: string;       // '17:00' local; the trading day starts here (FX/CFD convention)
  weekStartsOn: 0 | 1;       // 0 = Sunday-open week (FX/CFD), 1 = Monday
}
```

**Inference:** for each bar open time, compute the local time-of-day in a list of candidate zones (`America/New_York`, `Europe/London`, `Asia/Tokyo`, `UTC`, …). Pick the zone where the open time is constant across DST changes. For the sample file, opens are exactly 17:00 in New York in every row, so the session is `America/New_York`, open 17:00. Unclear cases fall back to UTC and an info note.

**Trading date.** A bar that opens Sunday 17:00 NY belongs to the trading week of **Monday**. All calendar logic (month, quarter and year buckets; "YTD"; week labels) uses the *trading date*: the local date of `open + (24h − sessionOpen)` for session-open conventions. The rule is implemented once in `core/time/tradingDate.ts` and unit-tested around DST changes and year ends.

**Display time zone** (user preference): `Exchange` (default), `Local`, or `UTC`. KLineChart supports this directly: `setTimezone(ianaZone)` sets the zone for axis labels and the crosshair. For bars of daily or longer intervals, our own date formatter (`setFormatter`, spike item S4) makes the axis show **trading dates** (for example "Mon 3 Nov 2026"), never "Sun 22:00", which would confuse users.

## 6. Size budgets

| Bars | Example | Expected behaviour |
|---|---|---|
| 1.5k | Sample weekly file | Parse < 50 ms, every interaction instant |
| 100k | 30 years of hourly | Parse < 1 s (streamed), resample < 50 ms |
| 2M | Years of 1-minute | Parse streamed with a progress bar; loaded in pages as the user scrolls back; `Auto` interval/step picks a coarser level for long time frames with a notice |
