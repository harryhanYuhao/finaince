'use client';

import { AlertTriangle } from 'lucide-react';
import { BarFlag } from '@/core/model/types';
import { checkTarget, intervalShortLabel } from '@/core/time/interval';
import { SMOOTHERS, smoothingLabel } from '@/core/transforms/smoothing';
import { PRICE_SOURCE_LABEL } from '@/core/transforms/priceSource';
import { useWorkspace } from '@/state/workspace';
import { useUi } from '@/state/ui';
import { formatBarTime, formatPct, formatPrice, formatVolume } from '@/render/format';
import { Chip, cx } from '@/components/ui';
import { useActiveMeta, useHover } from '../workspace/hooks';
import { useDerivation } from '../workspace/useDerivation';

function V({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted">{k}</span> <span className={cx('tabular font-medium', className)}>{v}</span>
    </span>
  );
}

/**
 * Transformation chips + values of the hovered (or last) bar, top-left inside the chart
 * (design/06 §1 "Every transformation is visible").
 */
export function Legend() {
  const meta = useActiveMeta();
  const spec = useWorkspace((s) => s.spec);
  const ui = useUi();
  const hover = useHover();
  const dspec = useDerivation();
  if (!meta || !dspec) return null;

  const bar = hover ?? ui.lastBar;
  const isLine = spec.chartType === 'line';
  const validity = checkTarget(meta.baseInterval, dspec.interval);
  const approx = validity.ok && validity.approx;
  const smoothing = isLine && spec.line.smoothing.method !== 'none';
  const nonCausal = smoothing && !SMOOTHERS[spec.line.smoothing.method].causal;
  const openSettings = () => ui.set({ settingsOpen: true });

  const dir = bar ? Math.sign((isLine ? (bar.line ?? bar.close) : bar.close) - (isLine ? (bar.prevClose ?? bar.close) : bar.open)) : 0;
  const tone = dir > 0 ? 'text-up' : dir < 0 ? 'text-down' : '';
  const change = bar && bar.prevClose ? (isLine ? (bar.line ?? bar.close) : bar.close) / bar.prevClose - 1 : null;
  const incomplete = !!bar && (!(bar.flags & BarFlag.Complete) || (bar.flags & BarFlag.PartialStart) !== 0);

  return (
    <div className="pointer-events-none absolute left-2 right-28 top-2 z-10 flex flex-col gap-1.5 text-xs sm:left-3">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1">
        <Chip onClick={openSettings} title={approx ? 'Approximate: built from weekly bars by trading date' : 'Interval'} tone={approx ? 'warn' : 'default'}>
          {isLine && spec.line.step === 'auto' ? 'Auto ' : ''}
          {intervalShortLabel(dspec.interval)}
          {approx ? ' ≈' : ''}
        </Chip>
        {isLine && spec.line.priceSource !== 'close' && <Chip onClick={openSettings}>{PRICE_SOURCE_LABEL[spec.line.priceSource]}</Chip>}
        {smoothing && (
          <Chip
            onClick={openSettings}
            tone={nonCausal ? 'warn' : 'accent'}
            title={nonCausal ? 'Centred smoothing uses future values: not suitable for signal back-testing' : SMOOTHERS[spec.line.smoothing.method].description}
          >
            {smoothingLabel(spec.line.smoothing)}
            {spec.line.smoothInLogSpace ? ' · log' : ''}
            {nonCausal ? (
              <>
                {' '}
                <AlertTriangle className="size-[0.6875rem]" /> uses future
              </>
            ) : (
              ' ⟶'
            )}
          </Chip>
        )}
        {spec.scale !== 'linear' && (
          <Chip onClick={openSettings}>{{ log: 'Log', percent: '%', indexed100: 'Indexed 100', linear: '' }[spec.scale]}</Chip>
        )}
        {spec.volume !== 'off' && meta.volumeKind === 'tick' && <Chip onClick={openSettings} title="Tick volume counts price updates, not traded shares">Tick vol{spec.volume === 'log' ? ' · log' : ''}</Chip>}
      </div>
      {bar && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-bg/70 px-1 py-0.5 backdrop-blur-[2px]">
          <span className="font-medium">{formatBarTime(bar.time, meta, dspec.interval, spec.displayZone)}</span>
          {isLine ? (
            <>
              <V k={smoothing ? 'Raw' : 'Value'} v={formatPrice(bar.line ?? bar.close, meta.precision)} className={smoothing ? '' : tone} />
              {smoothing && <V k={smoothingLabel(spec.line.smoothing)} v={formatPrice(bar.smooth, meta.precision)} className="text-accent" />}
            </>
          ) : (
            <>
              <V k="O" v={formatPrice(bar.open, meta.precision)} className={tone} />
              <V k="H" v={formatPrice(bar.high, meta.precision)} className={tone} />
              <V k="L" v={formatPrice(bar.low, meta.precision)} className={tone} />
              <V k="C" v={formatPrice(bar.close, meta.precision)} className={tone} />
            </>
          )}
          {change !== null && <span className={cx('tabular font-medium', tone)}>{formatPct(change)}</span>}
          {meta.volumeKind !== 'none' && bar.volume !== null && <V k={meta.volumeKind === 'tick' ? 'Tick vol' : 'Vol'} v={formatVolume(bar.volume)} />}
          {incomplete && <span className="rounded bg-warn/15 px-1 font-medium text-warn">{bar.flags & BarFlag.PartialStart ? 'partial' : 'incomplete'}</span>}
          {(bar.flags & BarFlag.GapBefore) !== 0 && <span className="rounded bg-warn/15 px-1 font-medium text-warn">after gap</span>}
        </div>
      )}
    </div>
  );
}
