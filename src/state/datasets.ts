import { create } from 'zustand';
import type { DatasetMeta } from '@/core/model/types';

interface DatasetsState {
  metas: Record<string, DatasetMeta>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  setMeta: (meta: DatasetMeta) => void;
  setMetas: (metas: DatasetMeta[]) => void;
  removeMeta: (id: string) => void;
  setStatus: (status: DatasetsState['status'], error?: string | null) => void;
}

export const useDatasets = create<DatasetsState>()((set) => ({
  metas: {},
  status: 'idle',
  error: null,
  setMeta: (meta) => set((s) => ({ metas: { ...s.metas, [meta.id]: meta } })),
  setMetas: (metas) => set({ metas: Object.fromEntries(metas.map((m) => [m.id, m])) }),
  removeMeta: (id) =>
    set((s) => {
      const metas = { ...s.metas };
      delete metas[id];
      return { metas };
    }),
  setStatus: (status, error = null) => set({ status, error }),
}));
