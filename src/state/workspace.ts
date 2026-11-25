// Workspace store: the open workspace and its chart spec with undo/redo (design/02 §5, 08 §1).

import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { DEFAULT_SPEC, type ChartSpec } from '@/core/model/spec';
import { sameData } from '@/core/model/workspace';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;

/** Identity of the open workspace (design/08 §1). `null` until one is opened or created. */
export interface OpenWorkspace {
  id: string;
  name: string;
  createdAt: number;
  chartId: string;
  /** False until it has been saved once; empty new workspaces are not saved. */
  saved: boolean;
}

interface WorkspaceState {
  spec: ChartSpec;
  past: ChartSpec[];
  future: ChartSpec[];
  lastGroup: { key: string; at: number } | null;
  current: OpenWorkspace | null;
  /** Apply a change. Changes with the same `group` within 700 ms form one undo step (slider drags). */
  update: (recipe: (draft: Draft<ChartSpec>) => void, group?: string) => void;
  replace: (spec: ChartSpec) => void;
  /** Open a workspace: its chart spec, a fresh undo history. */
  open: (current: OpenWorkspace, spec: ChartSpec) => void;
  /** Bind the loaded dataset without an undo step (the data reference is unchanged). */
  bind: (datasetId: string | null) => void;
  setCurrent: (patch: Partial<OpenWorkspace>) => void;
  undo: () => void;
  redo: () => void;
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  spec: DEFAULT_SPEC,
  past: [],
  future: [],
  lastGroup: null,
  current: null,
  update: (recipe, group) => {
    const { spec, past, lastGroup } = get();
    const next = produce(spec, recipe);
    if (next === spec) return;
    const now = Date.now();
    const coalesce = group && lastGroup && lastGroup.key === group && now - lastGroup.at < COALESCE_MS;
    set({
      spec: next,
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), spec],
      future: [],
      lastGroup: group ? { key: group, at: now } : null,
    });
  },
  replace: (spec) => set({ spec, past: [...get().past, get().spec], future: [], lastGroup: null }),
  open: (current, spec) => set({ current, spec, past: [], future: [], lastGroup: null }),
  bind: (datasetId) => {
    const { spec, past, future } = get();
    // History entries with the same data reference share the binding; others keep their own.
    const rebind = (x: ChartSpec) => (x.datasetId === datasetId || (x !== spec && !sameData(x.data, spec.data)) ? x : { ...x, datasetId });
    set({ spec: rebind(spec), past: past.map(rebind), future: future.map(rebind) });
  },
  setCurrent: (patch) => {
    const cur = get().current;
    if (cur) set({ current: { ...cur, ...patch } });
  },
  undo: () => {
    const { past, spec, future } = get();
    if (!past.length) return;
    set({ spec: past[past.length - 1], past: past.slice(0, -1), future: [spec, ...future], lastGroup: null });
  },
  redo: () => {
    const { future, spec, past } = get();
    if (!future.length) return;
    set({ spec: future[0], past: [...past, spec], future: future.slice(1), lastGroup: null });
  },
}));

/** The pre-workspace localStorage key; read once and upgraded (design/08 §1.3). */
export const LEGACY_WORKSPACE_KEY = 'finaince.workspace';
