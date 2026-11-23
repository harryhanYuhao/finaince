import type { BarSeries } from '../model/types';

export type PriceSource = 'close' | 'hlc3' | 'hl2' | 'ohlc4' | 'meanClose';

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  close: 'Close',
  hlc3: 'Typical (HLC/3)',
  hl2: 'Median (HL/2)',
  ohlc4: 'OHLC/4',
  meanClose: 'Mean of closes',
};

/**
 * Value per bar for a line chart (design/04 §3.2). `meanClose` needs the source bars and the
 * bucket boundaries, so it is computed by `meanCloses` instead.
 */
export function priceSource(bars: BarSeries, src: Exclude<PriceSource, 'meanClose'>): Float64Array {
  const n = bars.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    switch (src) {
      case 'close':
        out[i] = bars.close[i];
        break;
      case 'hlc3':
        out[i] = (bars.high[i] + bars.low[i] + bars.close[i]) / 3;
        break;
      case 'hl2':
        out[i] = (bars.high[i] + bars.low[i]) / 2;
        break;
      case 'ohlc4':
        out[i] = (bars.open[i] + bars.high[i] + bars.low[i] + bars.close[i]) / 4;
        break;
    }
  }
  return out;
}

/** Arithmetic mean of source closes within each resampled bucket. */
export function meanCloses(src: BarSeries, bucketStarts: Float64Array): Float64Array {
  const m = bucketStarts.length;
  const out = new Float64Array(m);
  let i = 0;
  for (let b = 0; b < m; b++) {
    const end = b + 1 < m ? bucketStarts[b + 1] : Infinity;
    let sum = 0;
    let count = 0;
    while (i < src.length && src.time[i] < end) {
      if (src.time[i] >= bucketStarts[b]) {
        sum += src.close[i];
        count++;
      }
      i++;
    }
    out[b] = count ? sum / count : NaN;
  }
  return out;
}
