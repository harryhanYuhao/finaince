'use client';

import { useEffect, useState } from 'react';
import { FileUp, Info, AlertTriangle, XCircle } from 'lucide-react';
import { Button, Dialog, Select, cx } from '@/components/ui';
import { useUi } from '@/state/ui';
import { useDatasets } from '@/state/datasets';
import type { ColumnMapping, ColumnRole } from '@/core/ingest/columns';
import { intervalLongLabel } from '@/core/time/interval';
import { formatDateShort } from '@/render/format';
import { confirmMapping, importFile, loadSample } from './actions';
import { useActiveMeta } from '../workspace/hooks';
import { Logo } from '../toolbar/AppBar';

/** Full-window drop target (design/06 §5 step 1). */
export function DropOverlay() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void importFile(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  if (!over) return null;
  return (
    <div className="animate-fade pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
      <div className="rounded-2xl border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-pop">
        <FileUp className="size-[1.75rem] mx-auto text-accent" />
        <div className="mt-2 font-semibold">Drop to load the file</div>
        <div className="text-sm text-muted">CSV or JSON with time and price columns</div>
      </div>
    </div>
  );
}

export function EmptyState() {
  const status = useDatasets((s) => s.status);
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border-2 border-dashed border-line p-8 text-center">
        <div className="flex justify-center text-lg">
          <Logo />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Drop a price file to start charting</h2>
        <p className="mt-2 text-sm text-muted">
          Any CSV or JSON with a time column and price columns (Open, High, Low, Close; Volume optional). Your data stays in this browser.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
            <FileUp className="size-[0.9375rem]" /> Choose a file
            <input
              type="file"
              accept=".csv,.txt,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
              }}
            />
          </label>
          <Button variant="outline" className="h-9" onClick={() => void loadSample()} disabled={status === 'loading'}>
            Try the US 500 weekly sample
          </Button>
        </div>
        <ul className="mx-auto mt-6 max-w-sm space-y-1 text-left text-xs text-muted">
          <li>• Time: ISO dates (2024-03-01, 2024-03-01T22:00:00Z) or epoch seconds/milliseconds</li>
          <li>• Optional flags: IsCompleteBar, IsTradingDay, MarketOpen</li>
          <li>• File names like SYMBOL_SOURCE_1w_….csv fill in the symbol</li>
        </ul>
      </div>
    </div>
  );
}

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'time', label: 'Time' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'close', label: 'Close / Value' },
  { value: 'volume', label: 'Volume' },
  { value: 'complete', label: 'Is complete' },
  { value: 'tradingDay', label: 'Is trading day' },
  { value: 'marketOpen', label: 'Market open' },
];

/** Column-mapping dialog when the format isn't recognised (design/06 §5 step 3). */
export function MappingDialog() {
  const pending = useUi((s) => s.pendingMapping);
  const set = useUi((s) => s.set);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [volumeKind, setVolumeKind] = useState<ColumnMapping['volumeKind']>('traded');
  const [key, setKey] = useState<unknown>(null);
  if (pending !== key) {
    setKey(pending);
    setRoles(pending?.preview.roles ?? []);
  }
  if (!pending) return null;
  const { header, rows, reason } = pending.preview;
  const hasTime = roles.includes('time');
  const hasClose = roles.includes('close');
  const partialOhlc = ['open', 'high', 'low'].some((r) => roles.includes(r as ColumnRole)) && !['open', 'high', 'low'].every((r) => roles.includes(r as ColumnRole));

  return (
    <Dialog open onOpenChange={(o) => !o && set({ pendingMapping: null })} title={`Confirm columns · ${pending.fileName}`} description={reason} wide>
      <div className="overflow-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="bg-surface-2">
            <tr>
              {header.map((h, i) => (
                <th key={i} className="min-w-[6.875rem] p-1.5 text-left align-top font-medium">
                  <div className="mb-1 truncate text-muted">{h || `Column ${i + 1}`}</div>
                  <Select
                    label={`Role of ${h}`}
                    value={roles[i] ?? 'ignore'}
                    onChange={(v) => setRoles((r) => r.map((x, j) => (j === i ? v : x === v && v !== 'ignore' ? 'ignore' : x)))}
                    options={ROLE_OPTIONS}
                    className={cx('h-7 text-xs', roles[i] && roles[i] !== 'ignore' && 'border-accent')}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r, i) => (
              <tr key={i} className="border-t border-line">
                {header.map((_, j) => (
                  <td key={j} className={cx('tabular truncate p-1.5', roles[j] === 'ignore' && 'text-muted')}>
                    {r[j]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        {roles.includes('volume') && (
          <label className="flex items-center gap-2">
            Volume is
            <Select
              label="Volume kind"
              className="w-40"
              value={volumeKind}
              onChange={setVolumeKind}
              options={[
                { value: 'traded', label: 'Traded volume' },
                { value: 'tick', label: 'Tick volume' },
              ]}
            />
          </label>
        )}
        <span className={cx('text-xs', hasTime && hasClose && !partialOhlc ? 'text-muted' : 'text-down')}>
          {!hasTime || !hasClose
            ? 'Choose at least a Time and a Close/Value column.'
            : partialOhlc
              ? 'Choose all of Open, High and Low, or none (line charts only).'
              : roles.includes('open')
                ? 'Ready: candles and line charts available.'
                : 'Ready: close-only data (line charts only).'}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => set({ pendingMapping: null })}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!hasTime || !hasClose || partialOhlc} onClick={() => void confirmMapping(roles, roles.includes('volume') ? volumeKind : 'none')}>
          Load data
        </Button>
      </div>
    </Dialog>
  );
}

/** Ingest report in plain language (design/03 §3.3). */
export function DataNotesDialog() {
  const open = useUi((s) => s.dataNotesOpen);
  const set = useUi((s) => s.set);
  const meta = useActiveMeta();
  if (!meta) return null;
  const r = meta.report;
  return (
    <Dialog open={open} onOpenChange={(o) => set({ dataNotesOpen: o })} title={`Data notes · ${meta.symbol}`} description="What we found when reading the file. The raw data is never changed silently.">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-surface-2 p-3 text-sm">
        <dt className="text-muted">Source</dt>
        <dd className="truncate">{meta.origin.kind === 'file' ? meta.origin.name : meta.origin.url}</dd>
        <dt className="text-muted">Bars</dt>
        <dd className="tabular">
          {r.rowsKept.toLocaleString()} of {r.rowsRead.toLocaleString()} rows
        </dd>
        <dt className="text-muted">Interval</dt>
        <dd>{intervalLongLabel(meta.baseInterval)}</dd>
        <dt className="text-muted">Range</dt>
        <dd>
          {formatDateShort(meta.range.from)} – {formatDateShort(meta.range.to)}
        </dd>
        <dt className="text-muted">Session</dt>
        <dd>
          {meta.session.timeZone}, opens {String(Math.floor(meta.session.sessionOpenMinutes / 60)).padStart(2, '0')}:
          {String(meta.session.sessionOpenMinutes % 60).padStart(2, '0')}
        </dd>
        <dt className="text-muted">Price precision</dt>
        <dd>{meta.precision} decimals</dd>
        <dt className="text-muted">Volume</dt>
        <dd>{meta.volumeKind === 'tick' ? 'Tick volume (price updates)' : meta.volumeKind === 'traded' ? 'Traded volume' : 'None'}</dd>
      </dl>
      <ul className="mt-4 space-y-2">
        {r.notes.length === 0 && <li className="text-sm text-muted">No issues found.</li>}
        {r.notes.map((n, i) => {
          const Icon = n.severity === 'error' ? XCircle : n.severity === 'warn' ? AlertTriangle : Info;
          return (
            <li key={i} className="flex gap-2 text-sm">
              <Icon className={cx('mt-0.5 size-[1rem] shrink-0', n.severity === 'error' ? 'text-down' : n.severity === 'warn' ? 'text-warn' : 'text-accent')} />
              <div>
                {n.message}
                {n.examples && n.examples.length > 0 && <div className="mt-0.5 text-xs text-muted">{n.examples.slice(0, 6).join(' · ')}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
