import { create } from 'zustand';
import type { RangeStats } from '@/core/stats/rangeStats';
import type { MappingPreview } from '@/core/ingest/ingest';
import type { TimeRange } from '@/core/model/types';
import type { DerivationSpec } from '@/core/model/spec';
import type { HoverBar } from '@/render/events';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
  action?: { label: string; run: () => void };
}

export interface PendingMapping {
  bytes: ArrayBuffer;
  fileName: string;
  preview: MappingPreview;
}

interface UiState {
  settingsOpen: boolean;
  dataNotesOpen: boolean;
  exportOpen: boolean;
  pendingMapping: PendingMapping | null;
  visibleRange: TimeRange | null;
  stats: RangeStats | null;
  /** Bars in the selected time frame that don't fit on screen (design/04 §1.1). */
  overflowHint: string | null;
  loading: boolean;
  /** Bumped when the user re-selects the current time frame, so the chart re-fits it. */
  rangeNonce: number;
  measuring: boolean;
  /** Effective derivation of the chart (resolved interval/step), published by ChartHost. */
  derivation: DerivationSpec | null;
  lastBar: HoverBar | null;
  toasts: Toast[];
  set: (patch: Partial<Omit<UiState, 'set' | 'toast' | 'dismiss'>>) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  dataNotesOpen: false,
  exportOpen: false,
  pendingMapping: null,
  visibleRange: null,
  stats: null,
  overflowHint: null,
  loading: false,
  rangeNonce: 0,
  measuring: false,
  derivation: null,
  lastBar: null,
  toasts: [],
  set: (patch) => set(patch),
  toast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === 'error' ? 9000 : 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
