'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useUi } from '@/state/ui';
import { formatDateShort, formatPct, formatPrice, formatSigned } from '@/render/format';
import { cx } from '@/components/ui';
import { useActiveMeta } from '../workspace/hooks';
import { useDerivation } from '../workspace/useDerivation';
import { intervalPerLabel } from '@/core/time/interval';

function Stat({ label, value, sub, tone, title }: { label: string; value: string; sub?: string; tone?: number; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('tabular text-sm font-semibold', tone !== undefined && (tone > 0 ? 'text-up' : tone < 0 ? 'text-down' : ''))}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

/** Light statistics for the visible range, complete bars only (design/04 §4). */
export function StatsStrip() {
  const meta = useActiveMeta();
  const stats = useUi((s) => s.stats);
  const dspec = useDerivation();
  const [open, setOpen] = useState(true);
  if (!meta) return null;

  return (
    <section aria-label="Statistics for the visible range" className="shrink-0 border-t border-line">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs text-muted hover:text-ink"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        <span className="font-medium">Range stats</span>
        {stats && (
          <span className="truncate">
            {formatDateShort(stats.from)} – {formatDateShort(stats.to)} · {stats.bars.toLocaleString()} complete bars
            {dspec ? ` · ${intervalPerLabel(dspec.interval)} returns` : ''}
          </span>
        )}
      </button>
      {open && stats && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 px-4 pb-3 sm:grid-cols-6">
          <Stat label="Change" value={formatPct(stats.changePct)} sub={formatSigned(stats.change, meta.precision)} tone={Math.sign(stats.change)} />
          <Stat
            label="High / Low"
            value={`${formatPrice(stats.high, meta.precision)} / ${formatPrice(stats.low, meta.precision)}`}
            sub={`${formatDateShort(stats.highTime)} · ${formatDateShort(stats.lowTime)}`}
          />
          <Stat label="CAGR" value={stats.cagr === null ? '—' : formatPct(stats.cagr)} sub={stats.cagr === null ? 'under 1 year' : 'per year'} tone={stats.cagr === null ? undefined : Math.sign(stats.cagr)} />
          <Stat
            label="Volatility"
            value={stats.volatility === null ? '—' : formatPct(stats.volatility, 1, false)}
            sub="annualised"
            title={`Standard deviation of log returns × √${stats.periodsPerYear.toFixed(1)} periods per year`}
          />
          <Stat
            label="Max drawdown"
            value={formatPct(stats.maxDrawdown, 1)}
            sub={stats.maxDrawdown < 0 ? `${formatDateShort(stats.drawdownPeakTime)} → ${formatDateShort(stats.drawdownTroughTime)}` : 'none'}
            tone={stats.maxDrawdown < 0 ? -1 : 0}
          />
          <Stat label="Gaps" value={String(stats.gaps)} sub={stats.gaps ? 'missing data in view' : 'no missing bars'} />
        </div>
      )}
    </section>
  );
}
