'use client';

import { BarFlag } from '@/core/model/types';
import { useWorkspace } from '@/state/workspace';
import { useUi } from '@/state/ui';
import { formatBarTime, formatPct, formatPrice, formatSigned } from '@/render/format';
import { useActiveMeta, useHover } from '../workspace/hooks';
import { useDerivation } from '../workspace/useDerivation';
import { cx } from '@/components/ui';

const PRESET_LABEL: Record<string, string> = {
  '1M': 'past month',
  '3M': 'past 3 months',
  '6M': 'past 6 months',
  YTD: 'year to date',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  '10Y': 'past 10 years',
  MAX: 'all time',
};

/** Google-Finance-style headline; follows the cursor while hovering (design/06 §2). */
export function Headline() {
  const meta = useActiveMeta();
  const spec = useWorkspace((s) => s.spec);
  const stats = useUi((s) => s.stats);
  const hover = useHover();
  const dspec = useDerivation();
  const lastBar = useUi((s) => s.lastBar);
  if (!meta) return null;

  const isLine = spec.chartType === 'line';
  const hoverValue = hover ? (isLine ? (hover.smooth ?? hover.line ?? hover.close) : hover.close) : null;
  const lastValue = lastBar ? (isLine ? (lastBar.line ?? lastBar.close) : lastBar.close) : null;
  const value = hoverValue ?? lastValue ?? stats?.lastClose ?? null;
  const base = stats?.firstClose ?? null;
  const change = value !== null && base !== null ? value - base : null;
  const pct = change !== null && base ? change / base : null;
  const dir = change === null ? 0 : Math.sign(change);
  const shown = hover ?? lastBar;
  const incomplete = shown && !(shown.flags & BarFlag.Complete);

  const caption = hover
    ? `${formatBarTime(hover.time, meta, dspec?.interval ?? null, spec.displayZone)}${incomplete ? ' · incomplete bar' : ''} · vs. start of view`
    : ('preset' in spec.timeFrame && stats ? PRESET_LABEL[spec.timeFrame.preset] + ' (in view)' : 'in view') +
      (incomplete ? ' · latest bar still forming' : '');

  return (
    <div className="min-w-0">
      <h1 className="truncate text-sm font-medium text-muted">{meta.displayName}</h1>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="tabular text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">{formatPrice(value, meta.precision)}</span>
        {change !== null && (
          <span className={cx('tabular text-base font-medium', dir > 0 ? 'text-up' : dir < 0 ? 'text-down' : 'text-muted')}>
            {dir > 0 ? '▲' : dir < 0 ? '▼' : '■'} {formatSigned(change, meta.precision)} ({formatPct(pct)})
          </span>
        )}
        <span className="text-sm text-muted">{caption}</span>
      </div>
    </div>
  );
}
