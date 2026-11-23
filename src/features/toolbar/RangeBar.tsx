'use client';

import { useState } from 'react';
import { CalendarRange, CandlestickChart, ChevronDown, LineChart } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger, Segmented, cx } from '@/components/ui';
import { useWorkspace } from '@/state/workspace';
import { useUi } from '@/state/ui';
import { RANGE_PRESETS, presetEnabled, baseOr } from '@/pipeline/resolve';
import { checkTarget, intervalLongLabel, intervalShortLabel, parseInterval, presetTargets, sameInterval } from '@/core/time/interval';
import type { Interval } from '@/core/model/types';
import type { RangePreset } from '@/core/model/spec';
import { useActiveMeta } from '../workspace/hooks';
import { useDerivation } from '../workspace/useDerivation';

function toDateInput(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function selectPreset(preset: RangePreset) {
  const ws = useWorkspace.getState();
  const cur = ws.spec.timeFrame;
  if ('preset' in cur && cur.preset === preset) {
    useUi.setState((s) => ({ rangeNonce: s.rangeNonce + 1 }));
    return;
  }
  ws.update((s) => {
    s.timeFrame = { preset };
  });
}

function CustomRange() {
  const meta = useActiveMeta();
  const tf = useWorkspace((s) => s.spec.timeFrame);
  const update = useWorkspace((s) => s.update);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  if (!meta) return null;
  const custom = 'from' in tf;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setFrom(toDateInput(custom ? tf.from : meta.range.from));
          setTo(toDateInput(custom ? tf.to : meta.range.to));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" active={custom} title="Custom date range">
          <CalendarRange className="size-[0.875rem]" />
          <span className="hidden md:inline">Custom</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Date.parse(from + 'T00:00:00Z');
            const t = Date.parse(to + 'T23:59:59Z');
            if (!Number.isFinite(f) || !Number.isFinite(t) || f >= t) return;
            update((s) => {
              s.timeFrame = { from: f, to: t };
            });
            setOpen(false);
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              From
              <input type="date" value={from} min={toDateInput(meta.range.from)} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
            </label>
            <label className="text-xs text-muted">
              To
              <input type="date" value={to} min={from} max={toDateInput(meta.range.to)} onChange={(e) => setTo(e.target.value)} className="mt-1 h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
            </label>
          </div>
          <p className="text-xs text-muted">Data covers {toDateInput(meta.range.from)} to {toDateInput(meta.range.to)}.</p>
          <Button type="submit" variant="primary" className="w-full">
            Show range
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Interval (candles) or sampling step (line) picker with free-text entry ("3w", "2M"). */
export function IntervalPicker() {
  const meta = useActiveMeta();
  const spec = useWorkspace((s) => s.spec);
  const update = useWorkspace((s) => s.update);
  const dspec = useDerivation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!meta) return null;

  const isLine = spec.chartType === 'line';
  const effective = dspec?.interval ?? meta.baseInterval;
  const auto = isLine && spec.line.step === 'auto';
  const approx = checkTarget(meta.baseInterval, effective);
  const isApprox = approx.ok && approx.approx;

  const choose = (i: Interval | 'auto') => {
    update((s) => {
      if (s.chartType === 'line') s.line.step = i === 'auto' ? 'auto' : sameInterval(i, meta.baseInterval) ? 'base' : i;
      else if (i !== 'auto') s.candle.interval = sameInterval(i, meta.baseInterval) ? 'base' : i;
    });
    setOpen(false);
    setError(null);
    setText('');
  };

  const presets = presetTargets(meta.baseInterval);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={isLine ? 'Sampling step (accuracy)' : 'Candle interval'} className="min-w-[4rem]">
          {auto && <span className="text-muted">Auto ·</span>}
          {intervalShortLabel(effective)}
          {isApprox && (
            <span className="text-warn" title="Built from weekly data: month boundaries are approximate">
              ≈
            </span>
          )}
          <ChevronDown className="size-[0.8125rem] text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="mb-2 text-xs font-medium text-muted">{isLine ? 'One point per…' : 'Candle interval'}</div>
        <div className="grid grid-cols-4 gap-1">
          {isLine && (
            <Button size="sm" active={auto} onClick={() => choose('auto')} title="Finest step that fits the screen">
              Auto
            </Button>
          )}
          {presets.map((p) => {
            const v = checkTarget(meta.baseInterval, p);
            const active = !auto && sameInterval(p, isLine ? baseOr(spec.line.step === 'auto' ? 'base' : spec.line.step, meta) : baseOr(spec.candle.interval, meta));
            return (
              <Button key={`${p.unit}${p.count}`} size="sm" active={active} onClick={() => choose(p)} title={intervalLongLabel(p) + (v.ok && v.approx ? ' (approximate boundaries)' : '')}>
                {intervalShortLabel(p)}
                {v.ok && v.approx && <span className="text-warn">≈</span>}
              </Button>
            );
          })}
        </div>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseInterval(text);
            if (!parsed) {
              setError('Try "3w", "2M", "1y" or "quarter"');
              return;
            }
            const v = checkTarget(meta.baseInterval, parsed);
            if (!v.ok) {
              setError(v.reason);
              return;
            }
            choose(parsed);
          }}
        >
          <label className="text-xs text-muted">
            Custom
            <input
              id="interval-quick-entry"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder='e.g. "3w", "2M", "1y"'
              className="mt-1 h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
            />
          </label>
          {error && <p className="mt-1 text-xs text-down">{error}</p>}
        </form>
        <p className="mt-3 text-xs leading-snug text-muted">
          Data interval: {intervalLongLabel(meta.baseInterval).toLowerCase()}. Finer intervals can&apos;t be built from it.
          {meta.baseInterval.unit === 'week' && ' Months and years built from weeks are approximate (≈): each week goes to the month of its Monday.'}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function RangeBar() {
  const meta = useActiveMeta();
  const spec = useWorkspace((s) => s.spec);
  const update = useWorkspace((s) => s.update);
  const dspec = useDerivation();
  if (!meta) return null;
  const interval = dspec?.interval ?? meta.baseInterval;
  const activePreset = 'preset' in spec.timeFrame ? spec.timeFrame.preset : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto" role="group" aria-label="Time frame">
        {RANGE_PRESETS.map((p) => {
          const enabled = presetEnabled(p, meta, interval);
          return (
            <button
              key={p}
              disabled={!enabled}
              onClick={() => selectPreset(p)}
              aria-pressed={activePreset === p}
              aria-label={p === 'MAX' ? 'Max' : p}
              title={enabled ? undefined : 'Too few bars at this interval'}
              className={cx(
                'h-7 shrink-0 rounded-md px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                activePreset === p ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {p === 'MAX' ? 'Max' : p}
            </button>
          );
        })}
        <CustomRange />
      </div>
      <div className="flex-1" />
      <Segmented
        label="Chart type"
        value={spec.chartType}
        onChange={(v) =>
          update((s) => {
            s.chartType = v;
          })
        }
        options={[
          {
            value: 'candle',
            label: (
              <>
                <CandlestickChart className="size-[0.875rem]" /> <span className="hidden sm:inline">Candle</span>
              </>
            ),
            title: meta.synthetic ? 'Candles need open/high/low data' : 'Candlestick chart (C)',
            disabled: meta.synthetic,
          },
          {
            value: 'line',
            label: (
              <>
                <LineChart className="size-[0.875rem]" /> <span className="hidden sm:inline">Line</span>
              </>
            ),
            title: 'Line chart (L)',
          },
        ]}
      />
      <IntervalPicker />
    </div>
  );
}
