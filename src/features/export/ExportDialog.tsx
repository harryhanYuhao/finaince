'use client';

import { useState } from 'react';
import { FileImage, FileText, Sheet } from 'lucide-react';
import { Dialog } from '@/components/ui';
import { useUi } from '@/state/ui';
import { useWorkspace } from '@/state/workspace';
import { intervalLongLabel } from '@/core/time/interval';
import { smoothingLabel, SMOOTHERS } from '@/core/transforms/smoothing';
import { PRICE_SOURCE_LABEL } from '@/core/transforms/priceSource';
import { downloadText, downloadUrl, exportPdf } from '@/platform/export';
import { dataWorker } from '@/workers/client';
import { formatDateShort } from '@/render/format';
import { useActiveMeta } from '../workspace/hooks';
import { useDerivation } from '../workspace/useDerivation';
import { getEngine } from '../workspace/engineRef';

export function ExportDialog() {
  const open = useUi((s) => s.exportOpen);
  const set = useUi((s) => s.set);
  const toast = useUi((s) => s.toast);
  const stats = useUi((s) => s.stats);
  const spec = useWorkspace((s) => s.spec);
  const meta = useActiveMeta();
  const dspec = useDerivation();
  const [busy, setBusy] = useState<string | null>(null);
  if (!meta || !dspec) return null;

  const base = `${meta.symbol}_${intervalLongLabel(dspec.interval).replace(/\s+/g, '')}_${spec.chartType}`;
  const settings = [
    spec.chartType === 'candle' ? 'Candles' : 'Line',
    intervalLongLabel(dspec.interval) + (spec.chartType === 'line' && spec.line.step === 'auto' ? ' (auto)' : ''),
    ...(spec.chartType === 'line' ? [PRICE_SOURCE_LABEL[spec.line.priceSource]] : []),
    ...(spec.chartType === 'line' && spec.line.smoothing.method !== 'none'
      ? [smoothingLabel(spec.line.smoothing) + (SMOOTHERS[spec.line.smoothing.method].causal ? '' : ' (centred, uses future values)')]
      : []),
    { linear: 'Linear scale', log: 'Log scale', percent: 'Percent scale', indexed100: 'Indexed to 100' }[spec.scale],
  ];

  const run = async (kind: string, fn: () => Promise<void> | void) => {
    setBusy(kind);
    try {
      await fn();
      set({ exportOpen: false });
    } catch (e) {
      toast({ kind: 'error', message: `Export failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const items = [
    {
      kind: 'png',
      icon: FileImage,
      title: 'Image (PNG)',
      desc: 'The chart as shown, including drawings.',
      run: () => {
        const url = getEngine()?.snapshot();
        if (!url) throw new Error('Chart not ready');
        downloadUrl(url, `${base}.png`);
      },
    },
    {
      kind: 'pdf',
      icon: FileText,
      title: 'Report (PDF)',
      desc: 'One page: chart, settings and range statistics.',
      run: async () => {
        const image = getEngine()?.snapshot();
        if (!image) throw new Error('Chart not ready');
        await exportPdf(
          {
            title: meta.displayName,
            subtitle: `${meta.source ? meta.source + ' · ' : ''}${intervalLongLabel(meta.baseInterval)} data · ${formatDateShort(meta.range.from)} – ${formatDateShort(meta.range.to)}`,
            settings,
            image,
            meta,
            stats,
            notes: meta.report.notes.map((n) => n.message),
          },
          `${base}.pdf`,
        );
      },
    },
    {
      kind: 'csv',
      icon: Sheet,
      title: 'Data (CSV)',
      desc: 'The derived series: resampled bars, line and smoothed values.',
      run: async () => downloadText(await dataWorker().exportCsv(dspec), `${base}.csv`),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => set({ exportOpen: o })} title="Export" description={settings.join(' · ')}>
      <div className="space-y-2">
        {items.map((it) => (
          <button
            key={it.kind}
            disabled={busy !== null}
            onClick={() => void run(it.kind, it.run)}
            className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-2 disabled:opacity-50"
          >
            <it.icon size={20} className="text-accent" />
            <div>
              <div className="text-sm font-medium">{busy === it.kind ? 'Preparing…' : it.title}</div>
              <div className="text-xs text-muted">{it.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
