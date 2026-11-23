'use client';

import { useRef, useState } from 'react';
import { CalendarDays, CalendarRange, CandlestickChart, ChevronDown, LineChart } from 'lucide-react';
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger, Segmented, Select, cx } from '@/components/ui';
import { useWorkspace } from '@/state/workspace';
import { useUi } from '@/state/ui';
import { RANGE_PRESETS, presetEnabled, baseOr, resolveTimeFrame } from '@/pipeline/resolve';
import { checkTarget, intervalLongLabel, intervalMs, intervalShortLabel, parseInterval, presetTargets, sameInterval } from '@/core/time/interval';
import { MONTH_NAMES, addSpan, checkStartDate, spanLabel, startDateLabel, startDays, type Span, type SpanUnit } from '@/core/time/customRange';
import { tradingDay } from '@/core/time/tradingDate';
import { DAY, daysToCivil } from '@/core/time/tz';
import type { Interval } from '@/core/model/types';
import type { RangePreset } from '@/core/model/spec';
import { useActiveMeta } from '../workspace/hooks';
import { useDerivation } from '../workspace/useDerivation';

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

const SPAN_UNITS: { value: SpanUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
];

const PRESET_SPAN: Partial<Record<RangePreset, Span>> = {
  '1M': { count: 1, unit: 'month' },
  '3M': { count: 3, unit: 'month' },
  '6M': { count: 6, unit: 'month' },
  '1Y': { count: 1, unit: 'year' },
  '5Y': { count: 5, unit: 'year' },
  '10Y': { count: 10, unit: 'year' },
};

function civilIso(days: number): string {
  return new Date(days * DAY).toISOString().slice(0, 10);
}

const inputCls = 'mt-1 h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink';

function civilLabel(days: number): string {
  const { year, month, day } = daysToCivil(days);
  return startDateLabel({ year, month, day });
}

/** Custom time frame: how much to show (span) and where it starts (year, month, day). */
function CustomRange() {
  const meta = useActiveMeta();
  const tf = useWorkspace((s) => s.spec.timeFrame);
  const update = useWorkspace((s) => s.update);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState<SpanUnit>('year');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  if (!meta) return null;
  const custom = 'start' in tf;
  const firstDay = tradingDay(meta.range.from, meta.session);
  const lastDay = tradingDay(meta.range.to, meta.session);

  const prefill = () => {
    setError(null);
    if (custom) {
      setCount(String(tf.span.count));
      setUnit(tf.span.unit);
      setYear(String(tf.start.year));
      setMonth(tf.start.month ? String(tf.start.month) : '');
      setDay(tf.start.day ? String(tf.start.day) : '');
      return;
    }
    // Start from what the preset shows now.
    const r = resolveTimeFrame(tf, meta);
    const from = daysToCivil(tradingDay(r.from, meta.session));
    const span = PRESET_SPAN[tf.preset] ?? { count: Math.max(1, Math.ceil((r.to - r.from) / (365.25 * DAY))), unit: 'year' as const };
    setCount(String(span.count));
    setUnit(span.unit);
    setYear(String(from.year));
    setMonth(String(from.month));
    setDay(String(from.day));
  };

  const n = Number(count);
  const spanOk = Number.isInteger(n) && n >= 1 && n <= 10000;
  const date = checkStartDate(year, month, day);
  // Live preview of the trading dates the range covers, and how it meets the data.
  let preview: string | null = null;
  const notes: string[] = [];
  if (spanOk && date.ok) {
    const s = startDays(date.date);
    const e = addSpan(s, { count: n, unit }) - 1;
    preview = `${civilLabel(s)} – ${civilLabel(e)}`;
    if (s < firstDay) notes.push(`Data starts ${civilLabel(firstDay)}; the chart starts there.`);
    if (e > lastDay && s <= lastDay) notes.push(`Data ends ${civilLabel(lastDay)}; the chart ends there.`);
  }

  const submit = () => {
    if (!spanOk) return setError('Range must be a whole number from 1 to 10000.');
    if (!date.ok) return setError(date.reason);
    const span = { count: n, unit };
    const s = startDays(date.date);
    if (s > lastDay) return setError(`No data from ${startDateLabel(date.date)}: data ends ${civilLabel(lastDay)}.`);
    if (addSpan(s, span) <= firstDay) return setError(`No data in that range: data starts ${civilLabel(firstDay)}.`);
    const r = resolveTimeFrame({ start: date.date, span }, meta);
    if ((r.to - r.from) / intervalMs(meta.baseInterval) < 1) {
      return setError(`Too short: the data is ${intervalLongLabel(meta.baseInterval).toLowerCase()}, so ${spanLabel(span)} holds fewer than two points.`);
    }
    update((st) => {
      st.timeFrame = { start: date.date, span };
    });
    setOpen(false);
  };

  const edit = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setError(null);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) prefill();
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" active={custom} title={custom ? `${spanLabel(tf.span)} from ${startDateLabel(tf.start)}` : 'Custom range'}>
          <CalendarRange className="size-[0.875rem]" />
          <span className="hidden md:inline">{custom ? `${spanLabel(tf.span)} · ${startDateLabel(tf.start)}` : 'Custom'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset>
            <legend className="text-xs font-medium text-muted">Range shown on screen</legend>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <input type="number" inputMode="numeric" aria-label="Range length" min={1} value={count} onChange={edit(setCount)} className={cx(inputCls, 'tabular text-right')} />
              <Select
                label="Range unit"
                value={unit}
                onChange={(v) => {
                  setUnit(v);
                  setError(null);
                }}
                options={SPAN_UNITS}
                className="mt-1"
              />
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium text-muted">Start</legend>
            <div className="grid grid-cols-[5rem_1fr_3.5rem_auto] items-end gap-2">
              <input aria-label="Start year" placeholder="Year" inputMode="numeric" maxLength={4} value={year} onChange={edit(setYear)} className={cx(inputCls, 'tabular')} />
              <select aria-label="Start month" value={month} onChange={edit(setMonth)} className={inputCls}>
                <option value="">Month</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
              <input aria-label="Start day" placeholder="Day" inputMode="numeric" maxLength={2} value={day} onChange={edit(setDay)} className={cx(inputCls, 'tabular')} />
              <div className="relative">
                <IconButton
                  type="button"
                  label="Pick a date"
                  variant="outline"
                  onClick={() => {
                    const el = pickerRef.current;
                    if (!el) return;
                    if (date.ok) el.value = civilIso(startDays(date.date));
                    try {
                      el.showPicker();
                    } catch {
                      el.focus();
                    }
                  }}
                >
                  <CalendarDays className="size-[1rem]" />
                </IconButton>
                <input
                  ref={pickerRef}
                  type="date"
                  tabIndex={-1}
                  aria-hidden
                  min={civilIso(firstDay)}
                  max={civilIso(lastDay)}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split('-');
                    if (!d) return;
                    setYear(y);
                    setMonth(String(Number(m)));
                    setDay(String(Number(d)));
                    setError(null);
                  }}
                  className="pointer-events-none absolute inset-0 opacity-0"
                />
              </div>
            </div>
            <p className="mt-1 text-xs leading-snug text-muted">Leave the day (or month and day) empty to start on the first of the month (or year).</p>
          </fieldset>
          {error ? (
            <p role="alert" className="text-xs leading-snug text-down">
              {error}
            </p>
          ) : (
            preview && (
              <div className="text-xs leading-snug">
                <p>
                  Shows <span className="font-medium">{preview}</span>
                </p>
                {notes.map((t) => (
                  <p key={t} className="text-warn">
                    {t}
                  </p>
                ))}
              </div>
            )
          )}
          <p className="text-xs text-muted">
            Data covers {civilLabel(firstDay)} to {civilLabel(lastDay)}.
          </p>
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
