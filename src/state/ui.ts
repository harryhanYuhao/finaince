import { create } from 'zustand';
import type { RangeStats } from '@/core/stats/rangeStats';
import type { MappingPreview } from '@/core/ingest/ingest';
import type { TimeRange } from '@/core/model/types';
import type { DataRef, DerivationSpec } from '@/core/model/spec';
import type { HoverBar } from '@/render/events';

export interface PendingMapping {
  bytes: ArrayBuffer;
  fileName: string;
  preview: MappingPreview;
}

interface UiState {
  settingsOpen: boolean;
  dataNotesOpen: boolean;
  exportOpen: boolean;
  massiveOpen: boolean;
  /** The open chart's data couldn't be loaded (design/08 §1.1). */
  dataProblem: { ref: DataRef | null; message: string } | null;
  pendingMapping: PendingMapping | null;
  visibleRange: TimeRange | null;
  stats: RangeStats | null;
  /** The selected time frame has more bars than fit on screen (design/04 §1.1). */
  overflow: { shown: number; total: number } | null;
  loading: boolean;
  /** Bumped when the user re-selects the current time frame, so the chart re-fits it. */
  rangeNonce: number;
  measuring: boolean;
  /** Effective derivation of the chart (resolved interval/step), published by ChartHost. */
  derivation: DerivationSpec | null;
  lastBar: HoverBar | null;
  set: (patch: Partial<Omit<UiState, 'set'>>) => void;
}

export const useUi = create<UiState>()((set) => ({
  settingsOpen: false,
  dataNotesOpen: false,
  exportOpen: false,
  massiveOpen: false,
  dataProblem: null,
  pendingMapping: null,
  visibleRange: null,
  stats: null,
  overflow: null,
  loading: false,
  rangeNonce: 0,
  measuring: false,
  derivation: null,
  lastBar: null,
  set: (patch) => set(patch),
}));
