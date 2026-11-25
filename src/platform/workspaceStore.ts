// IndexedDB store of chart-tool workspaces (design/08 §1.2). A separate database from the
// datasets, so either can change its layout independently.

import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import { parseWorkspace, type WorkspaceDoc } from '@/core/model/workspace';

let store: UseStore | null = null;
function db(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  store ??= createStore('finaince-workspaces', 'workspaces');
  return store;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  updatedAt: number;
  dataLabels: string[];
}

export async function putWorkspace(doc: WorkspaceDoc): Promise<void> {
  const s = db();
  if (s) await set(doc.id, doc, s);
}

export async function getWorkspace(id: string): Promise<WorkspaceDoc | null> {
  const s = db();
  if (!s) return null;
  const raw = await get(id, s);
  if (!raw) return null;
  const r = parseWorkspace(raw);
  return r.ok ? r.doc : null;
}

export async function listWorkspaces(): Promise<WorkspaceDoc[]> {
  const s = db();
  if (!s) return [];
  const docs: WorkspaceDoc[] = [];
  for (const [, raw] of await entries(s)) {
    const r = parseWorkspace(raw);
    if (r.ok) docs.push(r.doc);
  }
  return docs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const s = db();
  if (s) await del(id, s);
}
