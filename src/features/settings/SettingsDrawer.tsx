'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Field, IconButton, NumberSlider, Segmented, Select, Toggle } from '@/components/ui';
import { useWorkspace } from '@/state/workspace';
import { autoRootPx, usePrefs } from '@/state/prefs';
import { useUi } from '@/state/ui';
import { DEFAULT_SPEC } from '@/core/model/spec';
import type { ChartSpec, LineStyle } from '@/core/model/spec';
import { SMOOTHERS, warmup, windowPoints, type SmoothingMethod, type SmoothingSpec } from '@/core/transforms/smoothing';
import { PRICE_SOURCE_LABEL, type PriceSource } from '@/core/transforms/priceSource';
import { intervalLongLabel, intervalPerLabel } from '@/core/time/interval';
import { IntervalPicker } from '../toolbar/RangeBar';
import { useActiveMeta } from '../workspace/hooks';
import { useDerivation } from '../workspace/useDerivation';
import type { Draft } from 'immer';

function Section({ title, children, onReset }: { title: string; children: ReactNode; onReset?: () => void }) {
  return (
    <section className="space-y-3 border-b border-line px-4 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onReset && (
          <button className="text-xs text-muted hover:text-accent" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function defaultSmoothing(method: SmoothingMethod): SmoothingSpec {
  switch (method) {
    case 'none':
      return { method: 'none' };
    case 'sma':
      return { method: 'sma', window: 20 };
    case 'wma':
      return { method: 'wma', window: 20 };
    case 'ema':
      return { method: 'ema', span: 20 };
    case 'gaussian':
      return { method: 'gaussian', sigma: 4, edge: 'trim' };
    case 'savgol':
      return { method: 'savgol', window: 21, order: 2, edge: 'trim' };
  }
}

function SmoothingPreview({ method }: { method: SmoothingMethod }) {
  // Tiny illustrative sparkline: noisy series (grey) + this method's response (accent).
  const xs = Array.from({ length: 40 }, (_, i) => i);
  const raw = xs.map((i) => 10 + Math.sin(i / 5) * 4 + (((i * 7919) % 13) - 6) * 0.35);
  const sm = raw.map((_, i) => {
    if (method === 'none') return raw[i];
    const causal = SMOOTHERS[method].causal;
    const w = 6;
    const lo = causal ? i - w + 1 : i - w / 2;
    const hi = causal ? i : i + w / 2;
    if (lo < 0 || hi >= raw.length) return NaN;
    let s = 0;
    let n = 0;
    for (let j = Math.ceil(lo); j <= Math.floor(hi); j++) {
      s += raw[j];
      n++;
    }
    return s / n;
  });
  const path = (arr: number[]) =>
    arr
      .map((v, i) => (Number.isFinite(v) ? `${i === 0 || !Number.isFinite(arr[i - 1]) ? 'M' : 'L'}${(i / 39) * 60},${22 - (v - 4) * 1.2}` : ''))
      .join('');
  return (
    <svg viewBox="0 0 60 24" className="h-6 w-full" aria-hidden>
      <path d={path(raw)} fill="none" stroke="var(--text-muted)" strokeOpacity="0.5" strokeWidth="1" />
      {method !== 'none' && <path d={path(sm)} fill="none" stroke="var(--accent)" strokeWidth="1.6" />}
    </svg>
  );
}

export function SettingsDrawer() {
  const spec = useWorkspace((s) => s.spec);
  const update = useWorkspace((s) => s.update);
  const meta = useActiveMeta();
  const dspec = useDerivation();
  const set = useUi((s) => s.set);
  const prefs = usePrefs();
  if (!meta) return null;

  const u = (group: string) => (recipe: (d: Draft<ChartSpec>) => void) => update(recipe, group);
  const isLine = spec.chartType === 'line';
  const sm = spec.line.smoothing;
  const per = dspec ? intervalPerLabel(dspec.interval) : 'point';
  const pointsLabel = (n: number) => `≈ ${n} ${dspec ? (dspec.interval.count * n === 1 ? dspec.interval.unit : `${dspec.interval.unit}s`) : 'points'}`;
  const logBlocked = meta.report.notes.some((n) => n.code === 'non-positive');

  return (
    <aside aria-label="Chart settings" className="animate-drawer flex h-full w-full flex-col overflow-y-auto border-l border-line bg-surface sm:w-[20rem]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <h2 className="text-sm font-semibold">{isLine ? 'Line chart settings' : 'Candle settings'}</h2>
        <IconButton label="Close settings" onClick={() => set({ settingsOpen: false })}>
          <X className="size-[1rem]" />
        </IconButton>
      </div>

      {!isLine && (
        <Section
          title="Candles"
          onReset={() =>
            update((s) => {
              s.candle = DEFAULT_SPEC.candle;
            })
          }
        >
          <Field label="Interval" hint={`Data is ${intervalLongLabel(meta.baseInterval).toLowerCase()}. Larger intervals combine whole bars.`}>
            <IntervalPicker />
          </Field>
          <Field
            label="Bucket alignment"
            info="Calendar: months start on the 1st and years on 1 January (by trading date). Rolling: every N bars counted from the first or last bar."
          >
            <Select
              label="Bucket alignment"
              value={spec.candle.alignment}
              onChange={(v) => u('candle')((s) => void (s.candle.alignment = v))}
              options={[
                { value: 'calendar', label: 'Calendar' },
                { value: 'rollingFirst', label: 'Rolling from first bar' },
                { value: 'rollingLast', label: 'Rolling from last bar (last bucket complete)' },
              ]}
            />
          </Field>
          <Field label="Style">
            <Segmented
              label="Candle style"
              value={spec.candle.style}
              onChange={(v) => u('candle')((s) => void (s.candle.style = v))}
              options={[
                { value: 'candle_solid', label: 'Candles' },
                { value: 'candle_stroke', label: 'Hollow' },
                { value: 'ohlc', label: 'OHLC bars' },
              ]}
            />
          </Field>
          <Toggle
            label="Show incomplete bars"
            hint="The forming last bar (and partial first bucket) is drawn faded"
            checked={spec.candle.showIncomplete}
            onChange={(v) => update((s) => void (s.candle.showIncomplete = v))}
          />
        </Section>
      )}

      {isLine && (
        <>
          <Section
            title="Accuracy"
            onReset={() =>
              update((s) => {
                s.line.step = 'auto';
                s.line.priceSource = 'close';
              })
            }
          >
            <Field
              label="One point per"
              hint={dspec ? `${spec.line.step === 'auto' ? 'Auto: ' : ''}1 point per ${per}. Auto picks the finest step that fits the screen.` : undefined}
              info="The line is sampled at a uniform step. No hidden thinning is applied, so every drawn point is a real aggregated value."
            >
              <IntervalPicker />
            </Field>
            <Field label="Price source" info="Value per point. For coarser steps, computed over the whole bucket.">
              <Select
                label="Price source"
                value={spec.line.priceSource}
                onChange={(v: PriceSource) => update((s) => void (s.line.priceSource = v))}
                options={(Object.keys(PRICE_SOURCE_LABEL) as PriceSource[]).map((k) => ({ value: k, label: PRICE_SOURCE_LABEL[k] }))}
              />
            </Field>
          </Section>

          <Section
            title="Smoothing"
            onReset={() =>
              update((s) => {
                s.line.smoothing = { method: 'none' };
                s.line.smoothInLogSpace = false;
                s.line.showRawGhost = true;
              })
            }
          >
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Smoothing method">
              {(Object.keys(SMOOTHERS) as SmoothingMethod[]).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={sm.method === m}
                  title={SMOOTHERS[m].description}
                  onClick={() => update((s) => void (s.line.smoothing = defaultSmoothing(m)))}
                  className={`rounded-lg border p-1.5 text-left text-xs transition-colors ${sm.method === m ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}
                >
                  <SmoothingPreview method={m} />
                  <div className="mt-0.5 font-medium">{m === 'none' ? 'None' : SMOOTHERS[m].short}</div>
                </button>
              ))}
            </div>
            {sm.method !== 'none' && (
              <>
                <p className="text-xs leading-snug text-muted">
                  <span className="font-medium text-ink">{SMOOTHERS[sm.method].label}.</span> {SMOOTHERS[sm.method].description}
                </p>
                {!SMOOTHERS[sm.method].causal ? (
                  <p className="rounded-lg border border-warn/40 bg-warn/10 p-2 text-xs leading-snug text-warn">
                    Centred method: each point uses future values. Good for seeing the shape, but not suitable for back-testing signals.
                  </p>
                ) : (
                  <p className="text-xs text-muted">Causal: uses only past values. The first {warmup(sm)} points have no value (warm-up).</p>
                )}
                {(sm.method === 'sma' || sm.method === 'wma') && (
                  <Field label="Window (points)">
                    <NumberSlider label="Window" min={2} max={200} value={sm.window} onChange={(v) => u('smooth')((s) => void ((s.line.smoothing as { window: number }).window = v))} format={pointsLabel} />
                  </Field>
                )}
                {sm.method === 'ema' && (
                  <Field label="Span (points)" hint={`α = ${(2 / (sm.span + 1)).toFixed(3)}`}>
                    <NumberSlider label="Span" min={2} max={200} value={sm.span} onChange={(v) => u('smooth')((s) => void ((s.line.smoothing as { span: number }).span = v))} format={pointsLabel} />
                  </Field>
                )}
                {sm.method === 'gaussian' && (
                  <Field label="σ (points)" hint={`Window ±3σ = ${windowPoints(sm)} points`}>
                    <NumberSlider label="Sigma" min={0.5} max={50} step={0.5} value={sm.sigma} onChange={(v) => u('smooth')((s) => void ((s.line.smoothing as { sigma: number }).sigma = v))} format={pointsLabel} />
                  </Field>
                )}
                {sm.method === 'savgol' && (
                  <>
                    <Field label="Window (points, odd)">
                      <NumberSlider
                        label="Window"
                        min={5}
                        max={201}
                        step={2}
                        value={sm.window}
                        onChange={(v) => u('smooth')((s) => void ((s.line.smoothing as { window: number }).window = v % 2 ? v : v + 1))}
                        format={pointsLabel}
                      />
                    </Field>
                    <Field label="Polynomial order">
                      <Segmented
                        label="Polynomial order"
                        size="sm"
                        value={String(sm.order) as '2' | '3' | '4'}
                        onChange={(v) => update((s) => void ((s.line.smoothing as { order: number }).order = Number(v)))}
                        options={[
                          { value: '2', label: '2' },
                          { value: '3', label: '3' },
                          { value: '4', label: '4' },
                        ]}
                      />
                    </Field>
                  </>
                )}
                {(sm.method === 'gaussian' || sm.method === 'savgol') && (
                  <Field label="Edges" info="Trim: no value where the window doesn't fit. Shrink: use a smaller window near the ends.">
                    <Segmented
                      label="Edge handling"
                      size="sm"
                      value={sm.edge}
                      onChange={(v) => update((s) => void ((s.line.smoothing as { edge: string }).edge = v))}
                      options={[
                        { value: 'trim', label: 'Trim' },
                        { value: 'shrink', label: 'Shrink' },
                      ]}
                    />
                  </Field>
                )}
                <Toggle label="Show raw line" hint="Faint line of the unsmoothed values" checked={spec.line.showRawGhost} onChange={(v) => update((s) => void (s.line.showRawGhost = v))} />
                <Toggle label="Smooth in log space" hint="Geometric smoothing for long, exponential trends" checked={spec.line.smoothInLogSpace} onChange={(v) => update((s) => void (s.line.smoothInLogSpace = v))} />
              </>
            )}
          </Section>

          <Section title="Line style">
            <Segmented
              label="Line style"
              value={spec.line.style}
              onChange={(v: LineStyle) => update((s) => void (s.line.style = v))}
              options={[
                { value: 'line', label: 'Line' },
                { value: 'area', label: 'Area' },
                { value: 'baseline', label: 'Baseline', title: 'Two colours above/below the first visible value' },
                { value: 'step', label: 'Step' },
              ]}
            />
            <Field label="Width">
              <Segmented
                label="Line width"
                size="sm"
                value={String(spec.line.width) as '1' | '2' | '3' | '4'}
                onChange={(v) => update((s) => void (s.line.width = Number(v) as 1 | 2 | 3 | 4))}
                options={['1', '2', '3', '4'].map((w) => ({ value: w as '1' | '2' | '3' | '4', label: `${w}px` }))}
              />
            </Field>
          </Section>
        </>
      )}

      <Section title="Scale & volume">
        <Field label="Price scale">
          <Select
            label="Price scale"
            value={spec.scale}
            onChange={(v) => update((s) => void (s.scale = v))}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'log', label: logBlocked ? 'Logarithmic (needs prices > 0)' : 'Logarithmic', disabled: logBlocked },
              { value: 'percent', label: 'Percent from first visible bar' },
              { value: 'indexed100', label: 'Indexed to 100 at first visible bar' },
            ]}
          />
        </Field>
        <Field label={meta.volumeKind === 'tick' ? 'Tick volume' : 'Volume'} hint={meta.volumeKind === 'tick' ? 'Tick volume counts price updates, not traded shares.' : undefined}>
          <Segmented
            label="Volume pane"
            value={meta.volumeKind === 'none' ? 'off' : spec.volume}
            onChange={(v) => update((s) => void (s.volume = v))}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'linear', label: 'Linear', disabled: meta.volumeKind === 'none' },
              { value: 'log', label: 'Log', disabled: meta.volumeKind === 'none' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Appearance">
        <Field
          label="Interface size"
          hint={prefs.uiScale === 'auto' ? `Auto: ${autoRootPx() === 16 ? 'normal' : autoRootPx() === 18 ? 'large' : 'extra large'} for this screen. Browser zoom (Ctrl +/−) also works.` : 'Browser zoom (Ctrl +/−) also works.'}
          info="Scales buttons, icons, text and chart labels together. Auto enlarges the interface on high-resolution screens running at 100% display scaling."
        >
          <Segmented
            label="Interface size"
            size="sm"
            value={prefs.uiScale}
            onChange={prefs.setUiScale}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'small', label: 'S', title: 'Small' },
              { value: 'normal', label: 'M', title: 'Normal' },
              { value: 'large', label: 'L', title: 'Large' },
              { value: 'xlarge', label: 'XL', title: 'Extra large' },
            ]}
          />
        </Field>
        <Field label="Up / down colours">
          <Segmented
            label="Colour convention"
            value={prefs.colorConvention}
            onChange={prefs.setColorConvention}
            options={[
              { value: 'greenUp', label: 'Green up' },
              { value: 'redUp', label: 'Red up' },
              { value: 'mono', label: 'Mono' },
            ]}
          />
        </Field>
        <Toggle label="Grid lines" checked={spec.grid} onChange={(v) => update((s) => void (s.grid = v))} />
        <Toggle label="Mark data gaps" hint="Dotted line where expected bars are missing" checked={spec.showGaps} onChange={(v) => update((s) => void (s.showGaps = v))} />
      </Section>

      <Section title="Data">
        <Field label="Time zone for labels" hint={`Exchange session: ${meta.session.timeZone}, opens ${String(Math.floor(meta.session.sessionOpenMinutes / 60)).padStart(2, '0')}:${String(meta.session.sessionOpenMinutes % 60).padStart(2, '0')}. Daily and longer bars show their trading date.`}>
          <Segmented
            label="Display time zone"
            value={spec.displayZone}
            onChange={(v) => update((s) => void (s.displayZone = v))}
            options={[
              { value: 'exchange', label: 'Exchange' },
              { value: 'local', label: 'Local' },
              { value: 'utc', label: 'UTC' },
            ]}
          />
        </Field>
        <button className="text-sm font-medium text-accent hover:underline" onClick={() => set({ dataNotesOpen: true })}>
          View data notes ({meta.report.notes.length})
        </button>
      </Section>
    </aside>
  );
}
