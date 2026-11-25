'use client';

// Workspace lifecycle (design/08 §1): open, create, duplicate, delete, export/import, autosave.

import { create } from 'zustand';
import { DEFAULT_SPEC, type ChartSpec } from '@/core/model/spec';
import {
  HANDOFF_KEY,
  decodeHandoff,
  newId,
  newWorkspace,
  parseWorkspace,
  refFromOrigin,
  sameData,
  type Handoff,
  type WorkspaceDoc,
} from '@/core/model/workspace';
import { deleteWorkspace as dbDelete, getWorkspace, listWorkspaces, putWorkspace } from '@/platform/workspaceStore';
import { downloadText } from '@/platform/export';
import { useWorkspace, LEGACY_WORKSPACE_KEY, type OpenWorkspace } from '@/state/workspace';
import { useDatasets } from '@/state/datasets';
import { useUi } from '@/state/ui';
import { notify } from '@/state/messages';
import { loadDatasetList, loadFromMassive, loadSample, resolveData } from '../data-import/actions';

const LAST_KEY = 'finaince.lastWorkspace';
const AUTOSAVE_MS = 800;

/** Saved workspaces, newest first (for the menu and the start screen). */
export const useWorkspaceList = create<{ items: WorkspaceDoc[]; loaded: boolean }>()(() => ({ items: [], loaded: false }));

export async function refreshList(): Promise<void> {
  try {
    useWorkspaceList.setState({ items: await listWorkspaces(), loaded: true });
  } catch {
    useWorkspaceList.setState({ loaded: true });
  }
}

/** The open workspace as a document. */
export function currentDoc(now = Date.now()): WorkspaceDoc | null {
  const { current, spec } = useWorkspace.getState();
  if (!current) return null;
  return {
    format: 'finaince.workspace',
    version: 1,
    id: current.id,
    name: current.name,
    createdAt: current.createdAt,
    updatedAt: now,
    layout: { kind: 'single' },
    charts: [{ id: current.chartId, spec }],
    activeChartId: current.chartId,
  };
}

// ---------------------------------------------------------------------------------- autosave

let timer: ReturnType<typeof setTimeout> | null = null;
let autosaveStarted = false;

async function saveNow(): Promise<void> {
  timer = null;
  const doc = currentDoc();
  const ws = useWorkspace.getState();
  // Empty new workspaces are not saved, so "New" doesn't litter the list.
  if (!doc || (!ws.current?.saved && !ws.spec.data)) return;
  try {
    await putWorkspace(doc);
    if (!ws.current?.saved) useWorkspace.getState().setCurrent({ saved: true });
    localStorage.setItem(LAST_KEY, doc.id);
    void refreshList();
  } catch (e) {
    notify('error', `The workspace could not be saved: ${(e as Error).message}`);
  }
}

function startAutosave(): void {
  if (autosaveStarted) return;
  autosaveStarted = true;
  useWorkspace.subscribe((s, prev) => {
    if (s.spec === prev.spec && s.current?.name === prev.current?.name && s.current?.id === prev.current?.id) return;
    if (!s.current) return;
    // Rebinding a dataset is not a change worth saving on its own, but saving is harmless.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), AUTOSAVE_MS);
  });
  window.addEventListener('pagehide', () => {
    if (timer) {
      clearTimeout(timer);
      void saveNow();
    }
  });
}

/** Save pending changes before switching workspaces. */
async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    await saveNow();
  }
}

// ------------------------------------------------------------------------------- open/create

function identity(doc: WorkspaceDoc, saved: boolean): OpenWorkspace {
  return { id: doc.id, name: doc.name, createdAt: doc.createdAt, chartId: doc.activeChartId, saved };
}

export async function openDoc(doc: WorkspaceDoc, saved = true): Promise<void> {
  await flush();
  const chart = doc.charts.find((c) => c.id === doc.activeChartId) ?? doc.charts[0];
  useUi.getState().set({ dataProblem: null, settingsOpen: false, visibleRange: null, stats: null, overflow: null, lastBar: null });
  useWorkspace.getState().open(identity(doc, saved), chart.spec);
  if (saved) localStorage.setItem(LAST_KEY, doc.id);
  await resolveData(chart.spec.data);
}

export async function openWorkspace(id: string): Promise<void> {
  const doc = await getWorkspace(id);
  if (!doc) {
    notify('error', 'That workspace could not be found.');
    void refreshList();
    return;
  }
  await openDoc(doc);
}

/** A new, empty workspace (saved once it has data). */
export async function createWorkspace(spec: ChartSpec = DEFAULT_SPEC, name?: string): Promise<void> {
  await openDoc(newWorkspace(name, { ...spec, datasetId: null }), false);
}

export async function duplicateWorkspace(): Promise<void> {
  const doc = currentDoc();
  if (!doc) return;
  const copy: WorkspaceDoc = { ...doc, id: newId('w'), name: `${doc.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() };
  await putWorkspace(copy);
  await openDoc(copy);
  void refreshList();
  notify('success', `Opened a copy: ${copy.name}`);
}

export function renameWorkspace(name: string): void {
  const n = name.trim().slice(0, 200);
  if (n) useWorkspace.getState().setCurrent({ name: n });
}

export async function removeWorkspace(id: string): Promise<void> {
  await dbDelete(id);
  if (useWorkspace.getState().current?.id === id) {
    if (timer) clearTimeout(timer);
    timer = null;
    localStorage.removeItem(LAST_KEY);
    const next = (await listWorkspaces())[0];
    if (next) await openDoc(next);
    else await createWorkspace();
  }
  void refreshList();
}

// ----------------------------------------------------------------------------- export/import

export function exportWorkspace(): void {
  const doc = currentDoc();
  if (!doc) return;
  const local = doc.charts.some((c) => c.spec.data?.kind === 'local');
  // Bindings are device-specific; the data reference is what travels.
  const portable = { ...doc, charts: doc.charts.map((c) => ({ ...c, spec: { ...c.spec, datasetId: null } })) };
  downloadText(JSON.stringify(portable, null, 2), `${doc.name}.finaince.json`, 'application/json');
  if (local) notify('info', 'Exported the workspace. Charts from your own files will ask for those files when opened on another device.');
}

export async function importWorkspaceFile(file: File): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    notify('error', `${file.name} is not a workspace file (it isn't valid JSON).`);
    return;
  }
  const r = parseWorkspace(raw);
  if (!r.ok) {
    notify('error', r.reason);
    return;
  }
  const doc = r.doc;
  // Never overwrite: an id that already exists gets a new one.
  if (await getWorkspace(doc.id)) doc.id = newId('w');
  doc.updatedAt = Date.now();
  await putWorkspace(doc);
  await openDoc(doc);
  void refreshList();
  notify('success', `Imported workspace: ${doc.name}`);
}

// -------------------------------------------------------------------------------------- entry

/** Open data handed over by another page (design/08 §1.4). */
async function applyHandoff(h: Handoff): Promise<void> {
  const existing = (await listWorkspaces()).find((d) => d.charts.some((c) => sameData(c.spec.data, h.data)));
  if (existing) {
    await openDoc(existing);
  } else {
    await createWorkspace(DEFAULT_SPEC, h.name);
    const err =
      h.data.kind === 'sample'
        ? await loadSample({ quiet: true })
        : h.data.kind === 'massive'
          ? await loadFromMassive(h.data, { quiet: true })
          : await resolveData(h.data);
    if (err) useUi.getState().set({ dataProblem: { ref: h.data, message: err } });
  }
  useWorkspace.getState().update((s) => {
    if (h.chartType) s.chartType = h.chartType;
    if (h.range) s.timeFrame = { preset: h.range };
  });
}

let entering: Promise<void> | null = null;

/**
 * Opening the chart tool: hand-off, else the workspace already open (returning from another page),
 * else the last workspace, else an upgrade, else empty.
 */
export function enterChartTool(): Promise<void> {
  // React strict mode runs effects twice in development; share the run in progress.
  entering ??= enter().finally(() => {
    entering = null;
  });
  return entering;
}

async function enter(): Promise<void> {
  startAutosave();
  const handoff = decodeHandoff(localStorage.getItem(HANDOFF_KEY));
  localStorage.removeItem(HANDOFF_KEY);
  const alreadyOpen = useWorkspace.getState().current !== null;
  if (!alreadyOpen) useDatasets.getState().setStatus('loading');
  await Promise.all([loadDatasetList(), refreshList()]);
  if (handoff) return applyHandoff(handoff);
  if (alreadyOpen) return;

  const lastId = localStorage.getItem(LAST_KEY);
  const last = lastId ? await getWorkspace(lastId) : null;
  if (last) return openDoc(last);

  // Upgrade the pre-workspace single chart once (design/08 §1.3).
  const legacy = localStorage.getItem(LEGACY_WORKSPACE_KEY);
  if (legacy) {
    localStorage.removeItem(LEGACY_WORKSPACE_KEY);
    try {
      const r = parseWorkspace(JSON.parse(legacy));
      if (r.ok) {
        const doc = r.doc;
        // Old specs had no data reference; recover it from the dataset they showed.
        const spec = doc.charts[0].spec;
        const meta = spec.datasetId ? useDatasets.getState().metas[spec.datasetId] : undefined;
        if (meta && !spec.data) {
          doc.charts[0].spec = { ...spec, data: refFromOrigin(meta.origin, meta.id) };
          doc.name = `${meta.symbol} chart`;
        }
        if (doc.charts[0].spec.data) {
          await putWorkspace(doc);
          void refreshList();
          return openDoc(doc);
        }
      }
    } catch {
      // Unreadable old state: start fresh.
    }
  }

  const newest = useWorkspaceList.getState().items[0];
  if (newest) return openDoc(newest);
  await createWorkspace();
}
