// Ingestion pipeline: bytes → validated, normalised Dataset (design/03 §3).

import Papa from 'papaparse';
import { BarFlag, emptySeries, type Dataset, type DatasetMeta, type IngestNote } from '../model/types';
import { intervalLongLabel, parseInterval, sameInterval } from '../time/interval';
import { fromWallClock } from '../time/tz';
import { mappingFromRoles, sniffColumns, type ColumnMapping, type ColumnRole } from './columns';
import { detectGaps } from './gaps';
import { inferBaseInterval, inferPrecision, inferSession, parseFileNameHint, roundTo } from './infer';
import { classifyTime, parseBool, parseNumber, parseTimeCell } from './parseTime';

export interface IngestOptions {
  fileName: string;
  size?: number;
  /** User-confirmed mapping from the column-mapping dialog. */
  roles?: ColumnRole[];
  volumeKind?: ColumnMapping['volumeKind'];
  origin?: DatasetMeta['origin'];
  /** Stable identity for data that is re-fetched (e.g. "massive:SPY:1day"); replaces the content hash. */
  idKey?: string;
}

export interface MappingPreview {
  header: string[];
  rows: string[][];
  roles: ColumnRole[];
  reason: string;
}

export class NeedsMappingError extends Error {
  constructor(public preview: MappingPreview) {
    super(preview.reason);
    this.name = 'NeedsMappingError';
  }
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

/** 53-bit string hash (cyrb53), used as content-addressed dataset id. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function hashSeed(s: string): number {
  return parseInt(hashString(s).slice(0, 6), 36);
}

function toTable(text: string): { rows: string[][]; delimiter: string } {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return { rows: jsonToTable(trimmed), delimiter: ',' };
  const res = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  if (res.data.length === 0) throw new IngestError('The file is empty.');
  return { rows: res.data, delimiter: res.meta.delimiter };
}

/** Semicolon files whose prices look like "975,25" use a decimal comma. */
function usesDecimalComma(delimiter: string, body: string[][], col: number): boolean {
  if (delimiter !== ';') return false;
  const sample = body.slice(0, 50).map((r) => r[col]?.trim() ?? '').filter(Boolean);
  return sample.some((v) => /^-?[\d.]*\d,\d+$/.test(v)) && !sample.some((v) => /^-?\d+\.\d+$/.test(v) && !v.includes(','));
}

/** JSON adapter: array of bar objects, or columnar `{ t:[], o:[], h:[], l:[], c:[], v:[] }`. */
function jsonToTable(text: string): string[][] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new IngestError(`Invalid JSON: ${(e as Error).message}`);
  }
  if (data && !Array.isArray(data) && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const inner = Object.values(obj).find((v) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object');
    if (inner) {
      data = inner;
    } else {
      const keys = Object.keys(obj).filter((k) => Array.isArray(obj[k]));
      if (keys.length === 0) throw new IngestError('JSON has no bar arrays.');
      const len = (obj[keys[0]] as unknown[]).length;
      const rows: string[][] = [keys];
      for (let i = 0; i < len; i++) rows.push(keys.map((k) => String((obj[k] as unknown[])[i] ?? '')));
      return rows;
    }
  }
  if (!Array.isArray(data) || data.length === 0) throw new IngestError('JSON contains no bars.');
  const keys = Object.keys(data[0] as object);
  const rows: string[][] = [keys];
  for (const item of data as Record<string, unknown>[]) rows.push(keys.map((k) => String(item[k] ?? '')));
  return rows;
}

export function ingestText(rawText: string, opts: IngestOptions): Dataset {
  const text = rawText.replace(/^﻿/, '');
  if (!text.trim()) throw new IngestError('The file is empty.');
  const { rows: table, delimiter } = toTable(text);
  const header = table[0].map((h) => h.replace(/^﻿/, ''));
  const body = table.slice(1);
  if (body.length === 0) throw new IngestError('The file has a header but no data rows.');

  let mapping: ColumnMapping | null;
  if (opts.roles) {
    mapping = mappingFromRoles(opts.roles, opts.volumeKind ?? 'traded');
    if (!mapping) throw new IngestError('Select at least a Time and a Close/Value column.');
  } else {
    const sniff = sniffColumns(header);
    mapping = sniff.mapping;
    if (!mapping || sniff.confidence < 0.9) {
      throw new NeedsMappingError({
        header,
        rows: body.slice(0, 20),
        roles: sniff.roles,
        reason: 'The columns could not be recognised with confidence. Please confirm them.',
      });
    }
  }

  const notes: IngestNote[] = [];
  const firstTime = body.find((r) => r[mapping.time]?.trim())?.[mapping.time] ?? '';
  const timeKind = classifyTime(firstTime);
  if (timeKind === 'unknown') {
    throw new NeedsMappingError({
      header,
      rows: body.slice(0, 20),
      roles: header.map((_, i) => (i === mapping.time ? 'time' : 'ignore')),
      reason: `Unrecognised time format "${firstTime}". Use ISO-8601 (2024-03-01 or 2024-03-01T22:00:00Z) or epoch seconds/milliseconds.`,
    });
  }

  const decimalComma = usesDecimalComma(delimiter, body, mapping.close);
  const num = (raw: string | undefined) => parseNumber(raw, decimalComma);

  // Parse rows into temporary arrays.
  const n0 = body.length;
  const t = new Float64Array(n0);
  const o = new Float64Array(n0);
  const h = new Float64Array(n0);
  const l = new Float64Array(n0);
  const c = new Float64Array(n0);
  const v = new Float64Array(n0);
  const f = new Uint8Array(n0);
  const badRows: string[] = [];
  let nonTrading = 0;
  let k = 0;
  const synthetic = mapping.open === undefined;
  for (let r = 0; r < n0; r++) {
    const row = body[r];
    const time = parseTimeCell(row[mapping.time] ?? '', timeKind);
    const close = num(row[mapping.close]);
    const open = synthetic ? close : num(row[mapping.open!]);
    const high = synthetic ? close : num(row[mapping.high!]);
    const low = synthetic ? close : num(row[mapping.low!]);
    if (!Number.isFinite(time) || !Number.isFinite(close) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low)) {
      if (badRows.length < 20) badRows.push(`row ${r + 2}`);
      continue;
    }
    const tradingDayFlag = mapping.tradingDay !== undefined ? parseBool(row[mapping.tradingDay]) : null;
    const marketOpenFlag = mapping.marketOpen !== undefined ? parseBool(row[mapping.marketOpen]) : null;
    if (tradingDayFlag === false || marketOpenFlag === false) {
      nonTrading++;
      continue;
    }
    const complete = mapping.complete !== undefined ? parseBool(row[mapping.complete]) : null;
    t[k] = time;
    o[k] = open;
    h[k] = high;
    l[k] = low;
    c[k] = close;
    v[k] = mapping.volume !== undefined ? num(row[mapping.volume]) : NaN;
    f[k] =
      (complete === false ? 0 : BarFlag.Complete) |
      BarFlag.TradingDay |
      BarFlag.MarketOpen |
      (synthetic ? BarFlag.Synthetic : 0);
    k++;
  }
  if (badRows.length) {
    notes.push({
      severity: 'error',
      code: 'unparseable-rows',
      message: `${n0 - k - nonTrading} row(s) could not be read and were skipped.`,
      examples: badRows,
    });
  }
  if (nonTrading) {
    notes.push({ severity: 'info', code: 'non-trading-rows', message: `${nonTrading} non-trading row(s) were left out.` });
  }
  if (k === 0) throw new IngestError('No valid bars were found in the file.');

  // Sort by time (stable) and de-duplicate (last one wins).
  const idx = Array.from({ length: k }, (_, i) => i);
  let sorted = true;
  for (let i = 1; i < k; i++) {
    if (t[i] < t[i - 1]) {
      sorted = false;
      break;
    }
  }
  if (!sorted) {
    idx.sort((a, b) => t[a] - t[b] || a - b);
    notes.push({ severity: 'warn', code: 'unsorted', message: 'Rows were not in time order and have been sorted.' });
  }
  const keep: number[] = [];
  let dupes = 0;
  for (let j = 0; j < idx.length; j++) {
    const i = idx[j];
    if (keep.length && t[keep[keep.length - 1]] === t[i]) {
      keep[keep.length - 1] = i;
      dupes++;
    } else keep.push(i);
  }
  if (dupes) {
    notes.push({ severity: 'warn', code: 'duplicates', message: `${dupes} duplicate timestamp(s) found; the last row of each was kept.` });
  }

  const n = keep.length;
  const hasVolume = mapping.volume !== undefined;
  const bars = emptySeries(n, hasVolume);
  for (let j = 0; j < n; j++) {
    const i = keep[j];
    bars.time[j] = t[i];
    bars.open[j] = o[i];
    bars.high[j] = h[i];
    bars.low[j] = l[i];
    bars.close[j] = c[i];
    if (bars.volume) bars.volume[j] = v[i];
    bars.flags[j] = f[i];
  }

  // Interval, session and precision inference.
  const baseInterval = inferBaseInterval(bars.time);
  const { session, confident } = inferSession(bars.time, baseInterval);
  if (timeKind === 'date' || timeKind === 'compact-date' || timeKind === 'iso-local') {
    // Local times: re-anchor to the session zone (identity for UTC).
    for (let j = 0; j < n; j++) bars.time[j] = fromWallClock(session.timeZone, bars.time[j]);
  }
  if (!confident) {
    notes.push({
      severity: 'info',
      code: 'session-guess',
      message: 'The exchange time zone could not be determined; times are treated as UTC.',
    });
  }

  const hint = parseFileNameHint(opts.fileName);
  if (hint.interval) {
    const hinted = parseInterval(hint.interval.replace(/(mo|mn)$/i, 'M'));
    if (hinted && !sameInterval(hinted, baseInterval)) {
      notes.push({
        severity: 'warn',
        code: 'interval-mismatch',
        message: `The file name says "${hint.interval}" but the data is ${intervalLongLabel(baseInterval).toLowerCase()}; using the data.`,
      });
    }
  }

  // Display precision: what (almost) all closes need, raised when most opens, highs or lows need
  // more (e.g. a file whose highs are quoted to a finer tick). Occasional sub-penny highs and lows,
  // common in exchange aggregates, don't raise it. Values themselves are never rounded to it.
  const precision = synthetic
    ? inferPrecision(bars.close)
    : Math.max(inferPrecision(bars.close), ...[bars.open, bars.high, bars.low].map((col) => inferPrecision(col, 2000, 0.75)));
  const inconsistent: string[] = [];
  let nonPositive = 0;
  for (let j = 0; j < n; j++) {
    // Only float noise from upstream JSON (689.8099999) is cleaned; real decimals are kept.
    bars.open[j] = roundTo(bars.open[j], 8);
    bars.high[j] = roundTo(bars.high[j], 8);
    bars.low[j] = roundTo(bars.low[j], 8);
    bars.close[j] = roundTo(bars.close[j], 8);
    if (bars.high[j] < Math.max(bars.open[j], bars.close[j]) || bars.low[j] > Math.min(bars.open[j], bars.close[j])) {
      if (inconsistent.length < 20) inconsistent.push(new Date(bars.time[j]).toISOString().slice(0, 10));
    }
    if (bars.low[j] <= 0) nonPositive++;
  }
  if (inconsistent.length) {
    notes.push({
      severity: 'warn',
      code: 'ohlc-inconsistent',
      message: 'Some bars have a high below the open/close or a low above it. They are shown as given.',
      examples: inconsistent,
    });
  }
  if (nonPositive) {
    notes.push({ severity: 'warn', code: 'non-positive', message: `${nonPositive} bar(s) have prices ≤ 0, so the log scale is unavailable.` });
  }

  let volumePrecision = 0;
  if (bars.volume) volumePrecision = Math.min(4, inferPrecision(bars.volume));

  const gaps = detectGaps(bars, baseInterval, session);
  if (gaps.length) {
    const total = gaps.reduce((s, g) => s + g.missing, 0);
    notes.push({
      severity: 'info',
      code: 'gaps',
      message: `${total} expected bar(s) are missing in ${gaps.length} place(s). They are shown as gaps, not filled in.`,
      examples: gaps.slice(0, 20).map((g) => `after ${new Date(g.after).toISOString().slice(0, 10)} (${g.missing})`),
    });
  }
  if (!(bars.flags[n - 1] & BarFlag.Complete)) {
    notes.push({
      severity: 'info',
      code: 'incomplete-last',
      message: 'The last bar is still forming. It is drawn faded and left out of statistics.',
    });
  }

  const symbol = hint.symbol ?? opts.fileName.replace(/\.[^.]+$/, '');
  const meta: DatasetMeta = {
    // A different column choice gives different bars, so it must be a different dataset.
    id: opts.idKey ? hashString(opts.idKey) : opts.roles ? hashString(text, hashSeed(opts.roles.join(',') + (opts.volumeKind ?? ''))) : hashString(text),
    symbol,
    displayName: symbol,
    source: hint.source,
    baseInterval,
    session,
    precision,
    volumePrecision,
    volumeKind: hasVolume ? mapping.volumeKind : 'none',
    range: { from: bars.time[0], to: bars.time[n - 1] },
    barCount: n,
    importedAt: Date.now(),
    origin: opts.origin ?? { kind: 'file', name: opts.fileName, size: opts.size ?? text.length },
    report: { rowsRead: n0, rowsKept: n, notes, gaps },
    synthetic,
  };
  return { meta, bars };
}
