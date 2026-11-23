// Resolve user settings against a dataset: time-frame presets and the effective interval/step.

import type { DatasetMeta, Interval, TimeRange } from '@/core/model/types';
import type { ChartSpec, DerivationSpec, RangePreset, TimeFrame } from '@/core/model/spec';
import { checkTarget, intervalMs } from '@/core/time/interval';
import { autoStep } from '@/core/transforms/autoStep';
import { tradingDay } from '@/core/time/tradingDate';
import { DAY, civilToDays, daysToCivil } from '@/core/time/tz';

export const RANGE_PRESETS: RangePreset[] = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', '10Y', 'MAX'];

function minusMonths(t: number, months: number): number {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

/** Presets are resolved against the dataset's last bar, not "today" (design/04 §1.1). */
export function resolveTimeFrame(tf: TimeFrame, meta: DatasetMeta): TimeRange {
  const { from: first, to: last } = meta.range;
  if ('from' in tf) return { from: Math.max(first, tf.from), to: Math.min(last, tf.to) };
  let from: number;
  switch (tf.preset) {
    case '1M':
      from = minusMonths(last, 1);
      break;
    case '3M':
      from = minusMonths(last, 3);
      break;
    case '6M':
      from = minusMonths(last, 6);
      break;
    case 'YTD': {
      const { year } = daysToCivil(tradingDay(last, meta.session));
      from = civilToDays(year, 1, 1) * DAY - DAY; // include a bar opening the evening before 1 Jan
      break;
    }
    case '1Y':
      from = minusMonths(last, 12);
      break;
    case '5Y':
      from = minusMonths(last, 60);
      break;
    case '10Y':
      from = minusMonths(last, 120);
      break;
    case 'MAX':
      from = first;
      break;
  }
  return { from: Math.max(first, from), to: last };
}

/** Presets with fewer than ~5 bars of the target interval are disabled. */
export function presetEnabled(preset: RangePreset, meta: DatasetMeta, interval: Interval): boolean {
  const r = resolveTimeFrame({ preset }, meta);
  if (preset === 'MAX') return true;
  if (r.from <= meta.range.from && preset !== 'YTD') {
    // Range longer than the data: still allowed but identical to MAX for long presets.
    return true;
  }
  return (r.to - r.from) / intervalMs(interval) >= 4.5;
}

export function baseOr(i: Interval | 'base', meta: DatasetMeta): Interval {
  return i === 'base' ? meta.baseInterval : i;
}

/** Effective data interval for the chart, plus the derivation spec for the worker. */
export function resolveDerivation(spec: ChartSpec, meta: DatasetMeta, plotWidthPx: number): DerivationSpec {
  let interval: Interval;
  if (spec.chartType === 'candle') {
    interval = baseOr(spec.candle.interval, meta);
  } else if (spec.line.step === 'auto') {
    const tf = resolveTimeFrame(spec.timeFrame, meta);
    const bars = Math.max(1, Math.round((tf.to - tf.from) / intervalMs(meta.baseInterval)) + 1);
    interval = autoStep(meta.baseInterval, bars, plotWidthPx, LINE_MIN_SLOT_PX);
  } else {
    interval = baseOr(spec.line.step, meta);
  }
  if (!checkTarget(meta.baseInterval, interval).ok) interval = meta.baseInterval;
  return {
    datasetId: meta.id,
    kind: spec.chartType,
    interval,
    alignment: spec.candle.alignment,
    priceSource: spec.line.priceSource,
    smoothing: spec.line.smoothing,
    smoothInLogSpace: spec.line.smoothInLogSpace,
  };
}

/** Minimum slot widths (design/04 §1.1, §3.2). */
export const LINE_MIN_SLOT_PX = 0.5;
export const CANDLE_MIN_READABLE_PX = 3;
export const MAX_BAR_SPACE_PX = 160;
