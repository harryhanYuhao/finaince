// IndexedDB cache of normalised datasets (design/03 §4). Works in the worker and main thread.

import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import type { Dataset, DatasetMeta } from '@/core/model/types';

let store: UseStore | null = null;
function db(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  store ??= createStore('finaince', 'datasets');
  return store;
}

export async function putDataset(ds: Dataset): Promise<void> {
  const s = db();
  if (s) await set(ds.meta.id, ds, s);
}

export async function getDataset(id: string): Promise<Dataset | null> {
  const s = db();
  if (!s) return null;
  return ((await get(id, s)) as Dataset | undefined) ?? null;
}

export async function listDatasets(): Promise<DatasetMeta[]> {
  const s = db();
  if (!s) return [];
  const ids = (await keys(s)) as string[];
  const metas: DatasetMeta[] = [];
  for (const id of ids) {
    const ds = (await get(id, s)) as Dataset | undefined;
    if (ds) metas.push(ds.meta);
  }
  return metas.sort((a, b) => b.importedAt - a.importedAt);
}

export async function deleteDataset(id: string): Promise<void> {
  const s = db();
  if (s) await del(id, s);
}
