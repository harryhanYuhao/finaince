'use client';

// Import and dataset lifecycle actions (design/06 §5).

import type { ColumnMapping, ColumnRole } from '@/core/ingest/columns';
import type { DatasetMeta } from '@/core/model/types';
import type { DataRef } from '@/core/model/spec';
import { refFromOrigin, sameData } from '@/core/model/workspace';
import { intervalLongLabel } from '@/core/time/interval';
import { useDatasets } from '@/state/datasets';
import { useUi } from '@/state/ui';
import { notify, useMessages } from '@/state/messages';
import { useWorkspace } from '@/state/workspace';
import { dataWorker } from '@/workers/client';
import type { IngestRequest } from '@/workers/api';

import { SAMPLE_NAME, SAMPLE_URL } from '@/sources/sample';

export { SAMPLE_NAME, SAMPLE_URL };
export const MAX_FILE_BYTES = 512 * 1024 * 1024;

/** Import notes of the open dataset, as a tray message (shown when something needs attention). */
function raiseNotes(meta: DatasetMeta) {
  const msgs = useMessages.getState();
  const id = `notes:${meta.id}`;
  msgs.removeWhere('notes:', id);
  const notes = meta.report.notes.filter((n) => n.severity !== 'info' || n.code === 'gaps' || n.code === 'incomplete-last');
  if (!notes.length) return msgs.remove(id);
  const serious = notes.some((n) => n.severity !== 'info');
  msgs.raise({
    id,
    kind: serious ? 'warn' : 'info',
    text: `${notes.length} data note${notes.length > 1 ? 's' : ''} for ${meta.symbol}`,
    detail: notes[0].message,
    action: { label: 'View data notes', run: () => useUi.getState().set({ dataNotesOpen: true }) },
    hidden: !serious,
  });
}

/** Default name for a workspace whose first data was just loaded. */
const UNTITLED = 'Untitled workspace';

/**
 * Show a dataset in the open chart.
 * - `replace`: the user chose new data. The chart's data reference changes (an undo step) and the
 *   interval goes back to the data's own.
 * - `bind`: a workspace is opening its saved data. Settings are kept and there is no undo step.
 */
export function showDataset(meta: DatasetMeta, mode: 'replace' | 'bind'): void {
  useDatasets.getState().setMeta(meta);
  raiseNotes(meta);
  useUi.getState().set({ dataProblem: null });
  const ws = useWorkspace.getState();
  if (mode === 'bind') {
    ws.bind(meta.id);
  } else {
    const ref = refFromOrigin(meta.origin, meta.id);
    ws.update((s) => {
      // New data starts at its own interval; the same data again (a re-loaded file) keeps settings.
      if (!sameData(s.data, ref)) {
        s.candle.interval = 'base';
        if (s.line.step !== 'auto') s.line.step = 'base';
      }
      s.datasetId = meta.id;
      s.data = ref;
    });
    if (ws.current && ws.current.name === UNTITLED && !ws.current.saved) {
      ws.setCurrent({ name: `${meta.symbol} ${intervalLongLabel(meta.baseInterval).toLowerCase()}` });
    }
  }
  useDatasets.getState().setStatus('ready');
}

function summarise(meta: DatasetMeta): string {
  const notes = meta.report.notes.length;
  return `Loaded ${meta.symbol} · ${meta.barCount.toLocaleString()} ${intervalLongLabel(meta.baseInterval).toLowerCase()} bars${notes ? ` · ${notes} note${notes > 1 ? 's' : ''}` : ''}`;
}

export interface LoadOptions {
  quiet?: boolean;
  mode?: 'replace' | 'bind';
}

/** Returns the error message, or null on success (a mapping dialog also counts as handled). */
async function runIngest(req: IngestRequest, { quiet = false, mode = 'replace' }: LoadOptions = {}): Promise<string | null> {
  const ui = useUi.getState();
  useDatasets.getState().setStatus('loading');
  try {
    const res = await dataWorker().ingest(req);
    if (res.ok) {
      ui.set({ pendingMapping: null });
      showDataset(res.meta, mode);
      if (!quiet) notify('success', summarise(res.meta));
      return null;
    }
    if (res.kind === 'mapping') {
      useDatasets.getState().setStatus(useWorkspace.getState().spec.datasetId ? 'ready' : 'idle');
      ui.set({ pendingMapping: { bytes: req.bytes, fileName: req.fileName, preview: res.preview } });
      return null;
    }
    useDatasets.getState().setStatus(useWorkspace.getState().spec.datasetId ? 'ready' : 'error', res.message);
    notify('error', `Couldn't load ${req.fileName}: ${res.message}`);
    return res.message;
  } catch (e) {
    useDatasets.getState().setStatus('error', (e as Error).message);
    notify('error', `Import failed: ${(e as Error).message}`);
    return (e as Error).message;
  }
}

export async function importFile(file: File, opts?: LoadOptions): Promise<string | null> {
  if (file.size > MAX_FILE_BYTES) {
    notify('error', 'Files larger than 512 MB are not supported yet.');
    return 'File too large';
  }
  const bytes = await file.arrayBuffer();
  return runIngest({ bytes, fileName: file.name }, opts);
}

export async function loadSample(opts?: LoadOptions): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(SAMPLE_URL);
  } catch (e) {
    return `The sample could not be downloaded (${(e as Error).message}).`;
  }
  if (!res.ok) {
    notify('error', 'The sample file could not be downloaded.');
    return `The sample could not be downloaded (HTTP ${res.status}).`;
  }
  return runIngest({ bytes: await res.arrayBuffer(), fileName: SAMPLE_NAME, origin: { kind: 'sample', url: SAMPLE_URL } }, opts);
}

export interface MassiveRequest {
  ticker: string;
  multiplier: number;
  timespan: 'minute' | 'hour' | 'day' | 'week';
  years: number;
}

/** Fetch bars from Massive through the server proxy, then ingest them like any other file. */
export async function loadFromMassive(req: MassiveRequest, opts?: LoadOptions): Promise<string | null> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - req.years);
  const q = new URLSearchParams({
    ticker: req.ticker.trim(),
    multiplier: String(req.multiplier),
    timespan: req.timespan,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
  let res: Response;
  try {
    res = await fetch(`/api/massive/aggs?${q}`);
  } catch (e) {
    return `The server could not be reached (${(e as Error).message}).`;
  }
  const text = await res.text();
  if (!res.ok) {
    try {
      return (JSON.parse(text) as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }
  const body = JSON.parse(text) as { ticker: string; resultsCount: number };
  if (!body.resultsCount) return `Massive has no ${req.timespan} bars for ${body.ticker} in that period.`;
  const unit = { minute: 'm', hour: 'h', day: 'd', week: 'w' }[req.timespan];
  return runIngest(
    {
      bytes: new TextEncoder().encode(text).buffer as ArrayBuffer,
      fileName: `${body.ticker.replace(/^[ICX]:/, '')}_Massive_${req.multiplier}${unit}.json`,
      origin: { kind: 'massive', ticker: body.ticker, multiplier: req.multiplier, timespan: req.timespan, fetchedAt: Date.now(), years: req.years },
      idKey: `massive:${body.ticker}:${req.multiplier}${req.timespan}`,
    },
    opts,
  );
}

export async function confirmMapping(roles: ColumnRole[], volumeKind: ColumnMapping['volumeKind']): Promise<void> {
  const pending = useUi.getState().pendingMapping;
  if (!pending) return;
  await runIngest({ bytes: pending.bytes, fileName: pending.fileName, roles, volumeKind });
}

export async function switchDataset(id: string): Promise<void> {
  const meta = await dataWorker().restore(id);
  if (meta) showDataset(meta, 'replace');
}

export async function removeDataset(id: string): Promise<void> {
  await dataWorker().remove(id);
  useDatasets.getState().removeMeta(id);
  const ws = useWorkspace.getState();
  if (ws.spec.datasetId === id) {
    // The open chart loses its data; it asks for the file again (design/08 §1.1).
    ws.bind(null);
    useUi.getState().set({ dataProblem: { ref: ws.spec.data, message: 'The data was removed from this device.' } });
    useDatasets.getState().setStatus('idle');
  }
}

/**
 * Load the data a chart refers to and bind it, keeping the chart's settings. Returns an error
 * message (also shown in the chart area) or null.
 */
export async function resolveData(ref: DataRef | null): Promise<string | null> {
  const ui = useUi.getState();
  if (!ref) {
    useWorkspace.getState().bind(null);
    useDatasets.getState().setStatus('idle');
    return null;
  }
  useDatasets.getState().setStatus('loading');
  let error: string | null = null;
  switch (ref.kind) {
    case 'local': {
      const meta = await dataWorker().restore(ref.datasetId);
      if (meta) showDataset(meta, 'bind');
      else error = `"${ref.label}" is no longer saved on this device. Load the file again to continue with this chart.`;
      break;
    }
    case 'sample':
      error = await loadSample({ quiet: true, mode: 'bind' });
      break;
    case 'massive':
      error = await loadFromMassive(ref, { quiet: true, mode: 'bind' });
      break;
    case 'custom':
      error = 'Custom API sources are not available yet.';
      break;
  }
  if (error) {
    useWorkspace.getState().bind(null);
    useDatasets.getState().setStatus('idle');
    ui.set({ dataProblem: { ref, message: error } });
  }
  return error;
}

/** Load the list of datasets saved on this device (for the data menu). */
export async function loadDatasetList(): Promise<void> {
  try {
    useDatasets.getState().setMetas(await dataWorker().listCached());
  } catch {
    // The list is a convenience; the chart works without it.
  }
}
