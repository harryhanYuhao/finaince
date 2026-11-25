// Data sources (design/03 §7). Every dataset records its origin; the source decides how it is
// fetched and whether "not up to date" is expected (a file) or a problem (a live feed).

import type { DataOrigin } from '@/core/model/types';

export type SourceId = 'upload' | 'sample' | 'massive' | 'custom';

export interface SourceInfo {
  id: SourceId;
  label: string;
  /** Live sources should always have the latest bar; snapshots end when they were saved. */
  live: boolean;
}

export const SOURCES: Record<SourceId, SourceInfo> = {
  upload: { id: 'upload', label: 'File upload', live: false },
  sample: { id: 'sample', label: 'Bundled sample', live: false },
  massive: { id: 'massive', label: 'Massive (formerly Polygon.io)', live: true },
  custom: { id: 'custom', label: 'Custom API', live: true },
};

export function sourceOf(origin: DataOrigin): SourceInfo {
  switch (origin.kind) {
    case 'file':
      return SOURCES.upload;
    case 'url':
    case 'sample':
      return SOURCES.sample;
    case 'massive':
      return SOURCES.massive;
    case 'custom':
      return SOURCES.custom;
  }
}

/** One-line description of where the data came from, for data notes and exports. */
export function originLabel(origin: DataOrigin): string {
  switch (origin.kind) {
    case 'file':
      return `File: ${origin.name}`;
    case 'url':
    case 'sample':
      return `Sample: ${origin.url.split('/').pop()}`;
    case 'massive':
      return `Massive: ${origin.ticker}, ${origin.multiplier} ${origin.timespan} bars`;
    case 'custom':
      return `Custom API: ${origin.endpoint}`;
  }
}
