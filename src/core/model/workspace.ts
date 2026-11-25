// Saved chart-tool workspaces (design/08 §1): format, validation, upgrades and data references.

import type { DataOrigin } from './types';
import { DEFAULT_SPEC, type ChartSpec, type DataRef, type RangePreset } from './spec';

export const WORKSPACE_FORMAT = 'finaince.workspace';
export const WORKSPACE_VERSION = 1;

export interface ChartDoc {
  id: string;
  spec: ChartSpec;
}

export interface WorkspaceDoc {
  format: typeof WORKSPACE_FORMAT;
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  layout: { kind: 'single' };
  charts: ChartDoc[];
  activeChartId: string;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newWorkspace(name = 'Untitled workspace', spec: ChartSpec = DEFAULT_SPEC, now = Date.now()): WorkspaceDoc {
  const chartId = newId('c');
  return {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    id: newId('w'),
    name,
    createdAt: now,
    updatedAt: now,
    layout: { kind: 'single' },
    charts: [{ id: chartId, spec }],
    activeChartId: chartId,
  };
}

// ------------------------------------------------------------------------------ validation

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const PRESETS: RangePreset[] = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', '10Y', 'MAX'];
const SPAN_UNITS = ['day', 'week', 'month', 'year'];
const TIMESPANS = ['minute', 'hour', 'day', 'week'];

export function parseDataRef(v: unknown): DataRef | null {
  if (!isObj(v)) return null;
  switch (v.kind) {
    case 'local':
      return str(v.datasetId, 100) && str(v.label) ? { kind: 'local', datasetId: v.datasetId, label: v.label } : null;
    case 'sample':
      return v.sample === 'us500' ? { kind: 'sample', sample: 'us500' } : null;
    case 'massive':
      return str(v.ticker, 30) && num(v.multiplier) && TIMESPANS.includes(v.timespan as string) && num(v.years)
        ? { kind: 'massive', ticker: v.ticker, multiplier: v.multiplier, timespan: v.timespan as 'day', years: v.years }
        : null;
    case 'custom':
      return str(v.endpoint) && str(v.symbol, 50) ? { kind: 'custom', endpoint: v.endpoint, symbol: v.symbol } : null;
    default:
      return null;
  }
}

function parseTimeFrame(v: unknown): ChartSpec['timeFrame'] {
  if (isObj(v) && PRESETS.includes(v.preset as RangePreset)) return { preset: v.preset as RangePreset };
  if (isObj(v) && isObj(v.start) && isObj(v.span) && num(v.start.year) && num(v.span.count) && SPAN_UNITS.includes(v.span.unit as string)) {
    const start: { year: number; month?: number; day?: number } = { year: v.start.year };
    if (num(v.start.month)) start.month = v.start.month;
    if (num(v.start.day) && start.month) start.day = v.start.day;
    return { start, span: { count: v.span.count, unit: v.span.unit as 'day' } };
  }
  return DEFAULT_SPEC.timeFrame;
}

/** Defaults for anything missing; nested groups are merged so new fields get defaults. */
export function normaliseSpec(raw: unknown): ChartSpec {
  const p = isObj(raw) ? raw : {};
  const pick = <K extends keyof ChartSpec>(k: K, ok: (v: unknown) => boolean): ChartSpec[K] => (ok(p[k]) ? (p[k] as ChartSpec[K]) : DEFAULT_SPEC[k]);
  const oneOf = (...vals: string[]) => (v: unknown) => vals.includes(v as string);
  return {
    version: 1,
    datasetId: str(p.datasetId, 100) ? p.datasetId : null,
    data: parseDataRef(p.data),
    chartType: pick('chartType', oneOf('candle', 'line')),
    timeFrame: parseTimeFrame(p.timeFrame),
    candle: { ...DEFAULT_SPEC.candle, ...(isObj(p.candle) ? p.candle : {}) },
    line: { ...DEFAULT_SPEC.line, ...(isObj(p.line) ? p.line : {}) },
    volume: pick('volume', oneOf('off', 'linear', 'log')),
    scale: pick('scale', oneOf('linear', 'log', 'percent', 'indexed100')),
    showGaps: pick('showGaps', (v) => typeof v === 'boolean'),
    displayZone: pick('displayZone', oneOf('exchange', 'local', 'utc')),
    grid: pick('grid', (v) => typeof v === 'boolean'),
  };
}

export type ParseResult = { ok: true; doc: WorkspaceDoc; upgraded: boolean } | { ok: false; reason: string };

/**
 * Validate a stored or imported workspace and upgrade older shapes (design/08 §1.3). Accepts a
 * workspace document, or the pre-workspace `{ state: { spec } }` / bare ChartSpec.
 */
export function parseWorkspace(input: unknown, now = Date.now()): ParseResult {
  if (!isObj(input)) return { ok: false, reason: 'This is not a FinAInce workspace file.' };
  if (input.format !== WORKSPACE_FORMAT) {
    // Pre-workspace localStorage value, or a bare chart spec.
    const legacy = isObj(input.state) && isObj(input.state.spec) ? input.state.spec : input.version === 1 && 'chartType' in input ? input : null;
    if (!legacy) return { ok: false, reason: 'This is not a FinAInce workspace file.' };
    return { ok: true, doc: newWorkspace('Untitled workspace', normaliseSpec(legacy), now), upgraded: true };
  }
  if (!num(input.version) || input.version > WORKSPACE_VERSION) {
    return { ok: false, reason: `This workspace was saved by a newer version of FinAInce (format ${String(input.version)}). Update the app to open it.` };
  }
  const charts = Array.isArray(input.charts)
    ? input.charts.filter(isObj).map((c) => ({ id: str(c.id, 100) ? c.id : newId('c'), spec: normaliseSpec(c.spec) }))
    : [];
  if (charts.length === 0) charts.push({ id: newId('c'), spec: DEFAULT_SPEC });
  const name = str(input.name, 200) && input.name.trim() ? input.name.trim() : 'Untitled workspace';
  const doc: WorkspaceDoc = {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    id: str(input.id, 100) ? input.id : newId('w'),
    name,
    createdAt: num(input.createdAt) ? input.createdAt : now,
    updatedAt: num(input.updatedAt) ? input.updatedAt : now,
    layout: { kind: 'single' },
    charts,
    activeChartId: charts.some((c) => c.id === input.activeChartId) ? (input.activeChartId as string) : charts[0].id,
  };
  return { ok: true, doc, upgraded: false };
}

// --------------------------------------------------------------------------- data references

/** The reference to save for a dataset that was just loaded. */
export function refFromOrigin(origin: DataOrigin, datasetId: string): DataRef | null {
  switch (origin.kind) {
    case 'file':
      return { kind: 'local', datasetId, label: origin.name };
    case 'url':
    case 'sample':
      return { kind: 'sample', sample: 'us500' };
    case 'massive':
      return {
        kind: 'massive',
        ticker: origin.ticker,
        multiplier: origin.multiplier,
        timespan: origin.timespan as 'day',
        years: origin.years ?? 5,
      };
    case 'custom':
      return null;
  }
}

/** Same data, ignoring how much history was requested. */
export function sameData(a: DataRef | null, b: DataRef | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'local':
      return a.datasetId === (b as typeof a).datasetId;
    case 'sample':
      return true;
    case 'massive': {
      const m = b as typeof a;
      return a.ticker === m.ticker && a.multiplier === m.multiplier && a.timespan === m.timespan;
    }
    case 'custom': {
      const c = b as typeof a;
      return a.endpoint === c.endpoint && a.symbol === c.symbol;
    }
  }
}

export function dataLabel(ref: DataRef | null): string {
  if (!ref) return 'No data';
  switch (ref.kind) {
    case 'local':
      return ref.label;
    case 'sample':
      return 'US 500 sample';
    case 'massive':
      return `${ref.ticker} · Massive`;
    case 'custom':
      return `${ref.symbol} · custom API`;
  }
}

// ----------------------------------------------------------------------------------- hand-off

/** A request from another page to open data in the chart tool (design/08 §1.4). */
export interface Handoff {
  data: DataRef;
  range?: RangePreset;
  chartType?: 'candle' | 'line';
  name?: string;
}

export const HANDOFF_KEY = 'finaince.handoff';
export const HANDOFF_TTL_MS = 60_000;

export function encodeHandoff(h: Handoff, now = Date.now()): string {
  return JSON.stringify({ ...h, at: now });
}

/** Parse a stored hand-off; stale or malformed ones are ignored. */
export function decodeHandoff(raw: string | null, now = Date.now()): Handoff | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Obj;
    if (!num(v.at) || now - v.at > HANDOFF_TTL_MS || now < v.at - 5000) return null;
    const data = parseDataRef(v.data);
    if (!data) return null;
    return {
      data,
      range: PRESETS.includes(v.range as RangePreset) ? (v.range as RangePreset) : undefined,
      chartType: v.chartType === 'line' || v.chartType === 'candle' ? v.chartType : undefined,
      name: str(v.name, 200) ? v.name : undefined,
    };
  } catch {
    return null;
  }
}
