// Workspace store: the active ChartSpec with undo/redo (design/02 §5).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce, type Draft } from 'immer';
import { DEFAULT_SPEC, type ChartSpec } from '@/core/model/spec';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;

interface WorkspaceState {
  spec: ChartSpec;
  past: ChartSpec[];
  future: ChartSpec[];
  lastGroup: { key: string; at: number } | null;
  /** Apply a change. Changes with the same `group` within 700 ms form one undo step (slider drags). */
  update: (recipe: (draft: Draft<ChartSpec>) => void, group?: string) => void;
  replace: (spec: ChartSpec) => void;
  undo: () => void;
  redo: () => void;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      spec: DEFAULT_SPEC,
      past: [],
      future: [],
      lastGroup: null,
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
      undo: () => {
        const { past, spec, future } = get();
        if (!past.length) return;
        set({ spec: past[past.length - 1], past: past.slice(0, -1), future: [spec, ...future], lastGroup: null });
      },
      redo: () => {
        const { past, spec, future } = get();
        if (!future.length) return;
        set({ spec: future[0], past: [...past, spec], future: future.slice(1), lastGroup: null });
      },
    }),
    {
      name: 'finaince.workspace',
      version: 1,
      partialize: (s) => ({ spec: s.spec }),
      merge: (persisted, current) => {
        const p = persisted as { spec?: Partial<ChartSpec> } | undefined;
        if (!p?.spec) return current;
        // Shallow-merge onto defaults so new fields get defaults after upgrades.
        return {
          ...current,
          spec: {
            ...DEFAULT_SPEC,
            ...p.spec,
            candle: { ...DEFAULT_SPEC.candle, ...p.spec.candle },
            line: { ...DEFAULT_SPEC.line, ...p.spec.line },
          },
        };
      },
    },
  ),
);
