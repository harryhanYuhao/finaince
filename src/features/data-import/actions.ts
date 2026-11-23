'use client';

// Import and dataset lifecycle actions (design/06 §5).

import type { ColumnMapping, ColumnRole } from '@/core/ingest/columns';
import type { DatasetMeta } from '@/core/model/types';
import { intervalLongLabel } from '@/core/time/interval';
import { useDatasets } from '@/state/datasets';
import { useUi } from '@/state/ui';
import { useWorkspace } from '@/state/workspace';
import { dataWorker } from '@/workers/client';
import type { IngestRequest } from '@/workers/api';

export const SAMPLE_URL = '/samples/US500_SB_1w_1998-01-04_2026-11-15.csv';
export const SAMPLE_NAME = 'US500_SB_1w_1998-01-04_2026-11-15.csv';
export const MAX_FILE_BYTES = 512 * 1024 * 1024;

function activate(meta: DatasetMeta) {
  useDatasets.getState().setMeta(meta);
  useWorkspace.getState().update((s) => {
    if (s.datasetId !== meta.id) {
      s.datasetId = meta.id;
      s.candle.interval = 'base';
      if (s.line.step !== 'auto') s.line.step = 'base';
    }
  });
  useDatasets.getState().setStatus('ready');
}

function summarise(meta: DatasetMeta): string {
  const notes = meta.report.notes.length;
  return `Loaded ${meta.symbol} · ${meta.barCount.toLocaleString()} ${intervalLongLabel(meta.baseInterval).toLowerCase()} bars${notes ? ` · ${notes} note${notes > 1 ? 's' : ''}` : ''}`;
}

async function runIngest(req: IngestRequest): Promise<void> {
  const ui = useUi.getState();
  useDatasets.getState().setStatus('loading');
  try {
    const res = await dataWorker().ingest(req);
    if (res.ok) {
      ui.set({ pendingMapping: null });
      activate(res.meta);
      const hasNotes = res.meta.report.notes.length > 0;
      ui.toast({
        kind: 'success',
        message: summarise(res.meta),
        action: hasNotes ? { label: 'View', run: () => useUi.getState().set({ dataNotesOpen: true }) } : undefined,
      });
    } else if (res.kind === 'mapping') {
      useDatasets.getState().setStatus(useWorkspace.getState().spec.datasetId ? 'ready' : 'idle');
      ui.set({ pendingMapping: { bytes: req.bytes, fileName: req.fileName, preview: res.preview } });
    } else {
      useDatasets.getState().setStatus(useWorkspace.getState().spec.datasetId ? 'ready' : 'error', res.message);
      ui.toast({ kind: 'error', message: `Couldn't load ${req.fileName}: ${res.message}` });
    }
  } catch (e) {
    useDatasets.getState().setStatus('error', (e as Error).message);
    ui.toast({ kind: 'error', message: `Import failed: ${(e as Error).message}` });
  }
}

export async function importFile(file: File): Promise<void> {
  if (file.size > MAX_FILE_BYTES) {
    useUi.getState().toast({ kind: 'error', message: 'Files larger than 512 MB are not supported yet.' });
    return;
  }
  const bytes = await file.arrayBuffer();
  await runIngest({ bytes, fileName: file.name });
}

export async function loadSample(): Promise<void> {
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) {
    useUi.getState().toast({ kind: 'error', message: 'The sample file could not be downloaded.' });
    return;
  }
  await runIngest({ bytes: await res.arrayBuffer(), fileName: SAMPLE_NAME, origin: { kind: 'url', url: SAMPLE_URL } });
}

export async function confirmMapping(roles: ColumnRole[], volumeKind: ColumnMapping['volumeKind']): Promise<void> {
  const pending = useUi.getState().pendingMapping;
  if (!pending) return;
  await runIngest({ bytes: pending.bytes, fileName: pending.fileName, roles, volumeKind });
}

export async function switchDataset(id: string): Promise<void> {
  const meta = await dataWorker().restore(id);
  if (meta) activate(meta);
}

export async function removeDataset(id: string): Promise<void> {
  await dataWorker().remove(id);
  useDatasets.getState().removeMeta(id);
  const ws = useWorkspace.getState();
  if (ws.spec.datasetId === id) {
    const next = Object.values(useDatasets.getState().metas)[0];
    if (next) await switchDataset(next.id);
    else {
      ws.update((s) => {
        s.datasetId = null;
      });
      useDatasets.getState().setStatus('idle');
    }
  }
}

/** Restore cached datasets and the last workspace (design/02 §5). */
export async function bootstrap(): Promise<void> {
  const ds = useDatasets.getState();
  ds.setStatus('loading');
  try {
    const worker = dataWorker();
    const metas = await worker.listCached();
    ds.setMetas(metas);
    const wanted = useWorkspace.getState().spec.datasetId;
    const target = (wanted && metas.find((m) => m.id === wanted)) || metas[0];
    if (target) {
      const meta = await worker.restore(target.id);
      if (meta) {
        activate(meta);
        return;
      }
    }
    useWorkspace.getState().update((s) => {
      s.datasetId = null;
    });
    ds.setStatus('idle');
  } catch (e) {
    ds.setStatus('error', (e as Error).message);
  }
}
