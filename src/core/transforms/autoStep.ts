import type { Interval } from '../model/types';
import { intervalMs, presetTargets } from '../time/interval';

/**
 * Finest valid sampling step whose point count for the time frame fits the plot at the minimum
 * slot width (design/04 §3.2). `timeFrameBars` counts base bars in the selected time frame.
 */
export function autoStep(base: Interval, timeFrameBars: number, plotWidthPx: number, minSlotPx: number): Interval {
  const capacity = Math.max(1, Math.floor(plotWidthPx / minSlotPx));
  const candidates = presetTargets(base);
  for (const step of candidates) {
    const points = Math.ceil((timeFrameBars * intervalMs(base)) / intervalMs(step));
    if (points <= capacity) return step;
  }
  return candidates[candidates.length - 1];
}
