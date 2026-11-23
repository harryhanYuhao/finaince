/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import type { Dataset } from '@/core/model/types';
import { IngestError, NeedsMappingError, ingestText } from '@/core/ingest/ingest';
import { clearMemo, derive, overview, page, rangeInfo, statsFor, toCsv } from '@/pipeline/derive';
import { deleteDataset, getDataset, listDatasets, putDataset } from '@/platform/datasetCache';
import type { DataWorkerApi } from './api';

const datasets = new Map<string, Dataset>();

async function need(id: string): Promise<Dataset> {
  let ds = datasets.get(id);
  if (!ds) {
    ds = (await getDataset(id)) ?? undefined;
    if (!ds) throw new Error(`Dataset ${id} is not loaded`);
    datasets.set(id, ds);
  }
  return ds;
}

function transferablesOf(p: { [k: string]: unknown }): Transferable[] {
  return Object.values(p)
    .filter((v): v is ArrayBufferView => ArrayBuffer.isView(v))
    .map((v) => v.buffer as ArrayBuffer);
}

const api: DataWorkerApi = {
  async ingest(req) {
    try {
      const text = new TextDecoder('utf-8').decode(req.bytes);
      const ds = ingestText(text, {
        fileName: req.fileName,
        size: req.bytes.byteLength,
        roles: req.roles,
        volumeKind: req.volumeKind,
        origin: req.origin,
      });
      datasets.set(ds.meta.id, ds);
      clearMemo(ds.meta.id);
      try {
        await putDataset(ds);
      } catch {
        // Caching is best-effort (e.g. private browsing).
      }
      return { ok: true, meta: ds.meta };
    } catch (e) {
      if (e instanceof NeedsMappingError) return { ok: false, kind: 'mapping', preview: e.preview };
      if (e instanceof IngestError) return { ok: false, kind: 'error', message: e.message };
      return { ok: false, kind: 'error', message: (e as Error).message ?? String(e) };
    }
  },
  async restore(id) {
    try {
      return (await need(id)).meta;
    } catch {
      return null;
    }
  },
  listCached: () => listDatasets(),
  async remove(id) {
    datasets.delete(id);
    clearMemo(id);
    await deleteDataset(id);
  },
  async page(spec, endBefore, maxBars) {
    const d = derive(await need(spec.datasetId), spec);
    const p = page(d, endBefore, maxBars);
    return Comlink.transfer(p, transferablesOf(p as unknown as Record<string, unknown>));
  },
  async rangeInfo(spec, from, to) {
    return rangeInfo(derive(await need(spec.datasetId), spec), from, to);
  },
  async stats(spec, from, to) {
    return statsFor(derive(await need(spec.datasetId), spec), from, to);
  },
  async exportCsv(spec) {
    const ds = await need(spec.datasetId);
    return toCsv(derive(ds, spec), ds.meta.precision);
  },
  async overview(spec, buckets) {
    return overview(derive(await need(spec.datasetId), spec), buckets);
  },
};

Comlink.expose(api);
