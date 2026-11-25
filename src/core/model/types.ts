// Canonical domain model (design/03 §2). Pure types, no runtime dependencies.

export type IntervalUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface Interval {
  unit: IntervalUnit;
  count: number;
}

/** Bit flags stored per bar in `BarSeries.flags`. */
export const BarFlag = {
  Complete: 1 << 0,
  TradingDay: 1 << 1,
  MarketOpen: 1 << 2,
  Synthetic: 1 << 3, // OHLC built from a single value column
  PartialStart: 1 << 4, // first bucket of a resample that started mid-bucket
  GapBefore: 1 << 5, // one or more expected bars are missing before this bar
  Approx: 1 << 6, // bucket boundaries are approximate (e.g. weeks → months)
} as const;

export interface BarSeries {
  length: number;
  /** Bar OPEN time, epoch ms UTC. */
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  /** NaN where missing; null when the source has no volume at all. */
  volume: Float64Array | null;
  flags: Uint8Array;
}

export interface SessionSpec {
  /** IANA zone, e.g. 'America/New_York'. */
  timeZone: string;
  /** Minutes after local midnight at which the trading day starts (17:00 → 1020). */
  sessionOpenMinutes: number;
}

export type VolumeKind = 'tick' | 'traded' | 'none';

export type IngestSeverity = 'error' | 'warn' | 'info';

export interface IngestNote {
  severity: IngestSeverity;
  code:
    | 'unparseable-rows'
    | 'unsorted'
    | 'duplicates'
    | 'ohlc-inconsistent'
    | 'non-positive'
    | 'gaps'
    | 'incomplete-last'
    | 'interval-mismatch'
    | 'session-guess'
    | 'non-trading-rows';
  message: string;
  /** Optional examples (row numbers, dates). */
  examples?: string[];
}

export interface Gap {
  /** Open time of the last bar before the gap (epoch ms). */
  after: number;
  /** Open time of the first bar after the gap (epoch ms). */
  before: number;
  /** Number of expected bars that are missing. */
  missing: number;
}

export interface IngestReport {
  rowsRead: number;
  rowsKept: number;
  notes: IngestNote[];
  gaps: Gap[];
}

/** Where a dataset came from (design/03 §7). Live sources are expected to stay up to date. */
export type DataOrigin =
  | { kind: 'file'; name: string; size: number }
  | { kind: 'url'; url: string }
  | { kind: 'sample'; url: string }
  | { kind: 'massive'; ticker: string; multiplier: number; timespan: string; fetchedAt: number; years?: number }
  | { kind: 'custom'; endpoint: string; fetchedAt: number };

export interface DatasetMeta {
  id: string;
  symbol: string;
  displayName: string;
  source?: string;
  baseInterval: Interval;
  session: SessionSpec;
  precision: number;
  volumePrecision: number;
  volumeKind: VolumeKind;
  range: { from: number; to: number };
  barCount: number;
  importedAt: number;
  origin: DataOrigin;
  report: IngestReport;
  /** True when the source was close-only (candles disabled). */
  synthetic: boolean;
}

export interface Dataset {
  meta: DatasetMeta;
  bars: BarSeries;
}

export interface TimeRange {
  from: number;
  to: number;
}

export function emptySeries(n: number, withVolume: boolean): BarSeries {
  return {
    length: n,
    time: new Float64Array(n),
    open: new Float64Array(n),
    high: new Float64Array(n),
    low: new Float64Array(n),
    close: new Float64Array(n),
    volume: withVolume ? new Float64Array(n) : null,
    flags: new Uint8Array(n),
  };
}

export function sliceSeries(s: BarSeries, start: number, end: number): BarSeries {
  return {
    length: Math.max(0, end - start),
    time: s.time.slice(start, end),
    open: s.open.slice(start, end),
    high: s.high.slice(start, end),
    low: s.low.slice(start, end),
    close: s.close.slice(start, end),
    volume: s.volume ? s.volume.slice(start, end) : null,
    flags: s.flags.slice(start, end),
  };
}
