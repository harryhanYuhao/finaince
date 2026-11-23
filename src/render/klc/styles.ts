// Design tokens → KLineChart Styles (design/05 §5.1 "Theme").

import { BarFlag } from '@/core/model/types';
import type { ChartSpec } from '@/core/model/spec';
import { withAlpha, type ChartTheme } from '../theme';
import type { DeepPartial, KLineData, Styles } from 'klinecharts';

function flagsOf(d: KLineData | null): number {
  return (d?.flags as number | undefined) ?? BarFlag.Complete;
}

export function buildStyles(theme: ChartTheme, spec: ChartSpec): DeepPartial<Styles> {
  const isLine = spec.chartType === 'line';
  const { up, down, neutral } = theme;
  const smoothing = spec.line.smoothing.method !== 'none';
  const drawRawOurselves = spec.line.style === 'step' || spec.line.style === 'baseline' || (smoothing && !spec.line.showRawGhost);
  const rawIsGhost = smoothing;
  const rawColor = rawIsGhost ? theme.ghost : theme.accent;
  const showIncomplete = spec.candle.showIncomplete;
  // Chart text follows the interface size (design/06 §6); KLineChart sizes are in CSS px.
  const px = (n: number) => Math.round(n * theme.scale);

  const axisText = { color: theme.textMuted, size: px(11), family: theme.font, weight: 'normal' };
  const crossText = {
    show: true,
    color: theme.bg,
    size: px(11),
    family: theme.font,
    weight: 'normal',
    borderRadius: px(4),
    borderSize: 0,
    paddingLeft: px(6),
    paddingRight: px(6),
    paddingTop: px(3),
    paddingBottom: px(3),
    backgroundColor: theme.textMuted,
  };
  const crossLine = { show: true, style: 'dashed' as const, dashedValue: [4, 3], size: 1, color: theme.textMuted };

  return {
    grid: {
      show: spec.grid,
      horizontal: { show: true, size: 1, color: theme.grid, style: 'solid' },
      vertical: { show: false },
    },
    candle: {
      type: isLine ? 'area' : spec.candle.style,
      bar: (data) => {
        const cur = data.current;
        const dir = !cur ? 0 : cur.close > cur.open ? 1 : cur.close < cur.open ? -1 : 0;
        const base = dir > 0 ? up : dir < 0 ? down : neutral;
        const f = flagsOf(cur);
        const faded = !(f & BarFlag.Complete) || (f & BarFlag.PartialStart) !== 0;
        if (faded) {
          const a = showIncomplete ? 0.28 : 0;
          return { color: withAlpha(base, a), borderColor: withAlpha(base, showIncomplete ? 0.9 : 0), wickColor: withAlpha(base, showIncomplete ? 0.6 : 0) };
        }
        return { color: base, borderColor: base, wickColor: base };
      },
      area: {
        value: 'line',
        lineSize: drawRawOurselves ? 0 : spec.line.width,
        lineColor: drawRawOurselves ? 'rgba(0,0,0,0)' : rawColor,
        smooth: false,
        backgroundColor:
          spec.line.style === 'area' && !rawIsGhost
            ? [
                { offset: 0, color: withAlpha(theme.accent, 0.02) },
                { offset: 1, color: withAlpha(theme.accent, 0.22) },
              ]
            : 'rgba(0,0,0,0)',
        point: { show: false },
      },
      priceMark: {
        show: true,
        high: { show: !isLine, color: theme.textMuted, textSize: px(10), textFamily: theme.font },
        low: { show: !isLine, color: theme.textMuted, textSize: px(10), textFamily: theme.font },
        last: {
          show: true,
          upColor: isLine ? theme.accent : up,
          downColor: isLine ? theme.accent : down,
          noChangeColor: isLine ? theme.accent : neutral,
          line: { show: true, style: 'dashed', dashedValue: [2, 3], size: 1 },
          text: { show: true, size: px(11), family: theme.font, borderRadius: px(4), paddingLeft: px(5), paddingRight: px(5), paddingTop: px(3), paddingBottom: px(3), color: '#FFFFFF' },
        },
      },
      tooltip: { showRule: 'none' },
    },
    indicator: {
      bars: [{ upColor: withAlpha(up, 0.55), downColor: withAlpha(down, 0.55), noChangeColor: withAlpha(neutral, 0.55) }],
      lastValueMark: { show: false },
      tooltip: { showRule: 'none' },
    },
    xAxis: {
      axisLine: { show: true, color: theme.border, size: 1 },
      tickLine: { show: false },
      tickText: axisText,
    },
    yAxis: {
      axisLine: { show: false },
      tickLine: { show: false },
      tickText: axisText,
    },
    separator: { size: 1, color: theme.border, fill: true, activeBackgroundColor: theme.accentSoft },
    crosshair: {
      show: true,
      horizontal: { show: true, line: crossLine, text: crossText },
      vertical: { show: true, line: crossLine, text: crossText },
    },
    overlay: {
      point: {
        color: theme.accent,
        borderColor: withAlpha(theme.accent, 0.35),
        borderSize: 1,
        radius: 4,
        activeColor: theme.accent,
        activeBorderColor: withAlpha(theme.accent, 0.35),
        activeBorderSize: 3,
        activeRadius: 4,
      },
      line: { color: theme.accent, size: 1 },
      text: { color: theme.text, family: theme.font, size: px(12) },
    },
  };
}
