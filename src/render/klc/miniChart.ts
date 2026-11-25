// Small read-only candle chart (home page). No paging, zoom or scroll; just the given bars.

import { dispose, init, type KLineData } from 'klinecharts';
import type { BarSeries, DatasetMeta } from '@/core/model/types';
import { DEFAULT_SPEC } from '@/core/model/spec';
import { formatBarTime } from '../format';
import type { ChartTheme } from '../theme';
import { buildStyles } from './styles';

export interface MiniChart {
  setTheme(theme: ChartTheme): void;
  destroy(): void;
}

const Y_AXIS_PX = 64;

export function mountMiniCandles(el: HTMLElement, bars: BarSeries, meta: DatasetMeta, theme: ChartTheme): MiniChart {
  const chart = init(el, { hotkey: { enabled: false }, layout: { barSpaceLimit: { min: 1, max: 60 } } });
  if (!chart) throw new Error('KLineChart failed to initialise');
  const spec = { ...DEFAULT_SPEC, volume: 'off' as const };
  chart.setStyles(buildStyles(theme, spec));
  chart.setZoomEnabled(false);
  chart.setScrollEnabled(false);
  chart.setOffsetRightDistance(6);
  chart.setFormatter({
    formatDate: ({ timestamp, template }) =>
      formatBarTime(timestamp, meta, meta.baseInterval, 'exchange', template === 'YYYY' ? 'axis-year' : template === 'YYYY-MM' ? 'axis-month' : 'axis-day'),
  });
  const data: KLineData[] = Array.from({ length: bars.length }, (_, i) => ({
    timestamp: bars.time[i],
    open: bars.open[i],
    high: bars.high[i],
    low: bars.low[i],
    close: bars.close[i],
    flags: bars.flags[i],
  }));
  chart.setSymbol({ ticker: meta.symbol, pricePrecision: meta.precision, volumePrecision: 0 });
  chart.setPeriod({ type: meta.baseInterval.unit, span: meta.baseInterval.count });
  chart.setDataLoader({
    getBars: ({ type, callback }) => callback(type === 'init' ? data : [], false),
  });
  const fit = () => {
    chart.resize();
    chart.setBarSpace(Math.max(1, Math.min(60, (el.clientWidth - Y_AXIS_PX - 6) / Math.max(1, data.length))));
    chart.scrollToRealTime();
  };
  // Not rAF: it pauses in background tabs.
  const timer = setTimeout(fit, 0);
  const ro = new ResizeObserver(fit);
  ro.observe(el);
  return {
    setTheme: (t) => chart.setStyles(buildStyles(t, spec)),
    destroy: () => {
      clearTimeout(timer);
      ro.disconnect();
      dispose(el);
    },
  };
}
