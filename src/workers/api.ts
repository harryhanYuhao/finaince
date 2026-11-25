// Data worker API (design/02 §6). Shared by the worker and its client.

import type { DatasetMeta } from '@/core/model/types';
import type { DerivationSpec } from '@/core/model/spec';
import type { ColumnMapping, ColumnRole } from '@/core/ingest/columns';
import type { MappingPreview } from '@/core/ingest/ingest';
import type { RangeStats } from '@/core/stats/rangeStats';
import type { Overview, RangeInfo, RenderPage } from '@/pipeline/derive';

export type IngestResult =
  | { ok: true; meta: DatasetMeta }
  | { ok: false; kind: 'mapping'; preview: MappingPreview }
  | { ok: false; kind: 'error'; message: string };

export interface IngestRequest {
  bytes: ArrayBuffer;
  fileName: string;
  roles?: ColumnRole[];
  volumeKind?: ColumnMapping['volumeKind'];
  origin?: DatasetMeta['origin'];
  idKey?: string;
}

export interface DataWorkerApi {
  ingest(req: IngestRequest): Promise<IngestResult>;
  /** Load a cached dataset into worker memory; null when not cached. */
  restore(id: string): Promise<DatasetMeta | null>;
  listCached(): Promise<DatasetMeta[]>;
  remove(id: string): Promise<void>;
  page(spec: DerivationSpec, endBefore: number | null, maxBars: number): Promise<RenderPage>;
  rangeInfo(spec: DerivationSpec, from: number, to: number): Promise<RangeInfo>;
  stats(spec: DerivationSpec, from: number, to: number): Promise<RangeStats | null>;
  exportCsv(spec: DerivationSpec): Promise<string>;
  overview(spec: DerivationSpec, buckets: number): Promise<Overview>;
}
