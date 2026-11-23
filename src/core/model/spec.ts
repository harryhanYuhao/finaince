// Serialisable chart specification (design/05 §2). Stage 1 has one main series per chart; the
// pane/series list of the design is introduced with indicators in stage 2 (via a v2 migration).

import type { Interval } from './types';
import type { Alignment } from '../transforms/resample';
import type { PriceSource } from '../transforms/priceSource';
import type { SmoothingSpec } from '../transforms/smoothing';

export type ChartType = 'candle' | 'line';
export type CandleStyle = 'candle_solid' | 'candle_stroke' | 'ohlc';
export type LineStyle = 'line' | 'area' | 'baseline' | 'step';
export type ScaleMode = 'linear' | 'log' | 'percent' | 'indexed100';
export type VolumeMode = 'off' | 'linear' | 'log';
export type DisplayZone = 'exchange' | 'local' | 'utc';
export type RangePreset = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | '10Y' | 'MAX';

export type TimeFrame = { preset: RangePreset } | { from: number; to: number };

export interface CandleSettings {
  interval: Interval | 'base';
  alignment: Alignment;
  style: CandleStyle;
  showIncomplete: boolean;
}

export interface LineSettings {
  step: Interval | 'base' | 'auto';
  priceSource: PriceSource;
  smoothing: SmoothingSpec;
  smoothInLogSpace: boolean;
  showRawGhost: boolean;
  style: LineStyle;
  width: 1 | 2 | 3 | 4;
}

export interface ChartSpec {
  version: 1;
  datasetId: string | null;
  chartType: ChartType;
  timeFrame: TimeFrame;
  candle: CandleSettings;
  line: LineSettings;
  volume: VolumeMode;
  scale: ScaleMode;
  showGaps: boolean;
  displayZone: DisplayZone;
  grid: boolean;
}

export const DEFAULT_SPEC: ChartSpec = {
  version: 1,
  datasetId: null,
  chartType: 'candle',
  timeFrame: { preset: '1Y' },
  candle: { interval: 'base', alignment: 'calendar', style: 'candle_solid', showIncomplete: true },
  line: {
    step: 'auto',
    priceSource: 'close',
    smoothing: { method: 'none' },
    smoothInLogSpace: false,
    showRawGhost: true,
    style: 'area',
    width: 2,
  },
  volume: 'linear',
  scale: 'linear',
  showGaps: false,
  displayZone: 'exchange',
  grid: true,
};

/** Only the fields that change the data (design/05 §3). */
export interface DerivationSpec {
  datasetId: string;
  kind: ChartType;
  interval: Interval;
  alignment: Alignment;
  priceSource: PriceSource;
  smoothing: SmoothingSpec;
  smoothInLogSpace: boolean;
}

export function derivationKey(d: DerivationSpec): string {
  return JSON.stringify([
    d.datasetId,
    d.kind,
    d.interval.unit,
    d.interval.count,
    d.alignment,
    d.kind === 'line' ? d.priceSource : '',
    d.kind === 'line' ? d.smoothing : '',
    d.kind === 'line' ? d.smoothInLogSpace : '',
  ]);
}
