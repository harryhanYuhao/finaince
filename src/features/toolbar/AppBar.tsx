'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, Download, FileUp, Moon, Redo2, Ruler, Settings2, Sun, Trash2, Undo2, Monitor } from 'lucide-react';
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger, cx } from '@/components/ui';
import { useDatasets } from '@/state/datasets';
import { useUi } from '@/state/ui';
import { useWorkspace } from '@/state/workspace';
import { usePrefs } from '@/state/prefs';
import { intervalLongLabel } from '@/core/time/interval';
import { formatDateShort } from '@/render/format';
import { importFile, loadSample, removeDataset, switchDataset } from '../data-import/actions';
import { useActiveMeta } from '../workspace/hooks';
import { getEngine } from '../workspace/engineRef';

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg width="1.125rem" height="1.125rem" viewBox="0 0 18 18" aria-hidden>
        <path d="M9 1 17 9 9 17 1 9Z" fill="var(--accent)" />
        <path d="M5 10.5 8 7.5l2 2 3-3" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      FinAInce
    </span>
  );
}

export function AppBar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = useActiveMeta();
  const metas = useDatasets((s) => s.metas);
  const { undo, redo, past, future } = useWorkspace();
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const ui = useUi();

  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      <Logo />
      <div className="mx-1 h-5 w-px bg-line" />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="subtle" className="max-w-[46vw]">
            <span className="truncate">
              {meta ? (
                <>
                  {meta.symbol}
                  <span className="text-muted">
                    {meta.source ? ` · ${meta.source}` : ''} · {intervalLongLabel(meta.baseInterval)}
                  </span>
                </>
              ) : (
                'No data'
              )}
            </span>
            <ChevronDown className="size-[0.875rem] text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-1.5">
          <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted">Datasets on this device</div>
          {Object.values(metas).length === 0 && <div className="px-2 py-2 text-sm text-muted">Nothing imported yet.</div>}
          {Object.values(metas).map((m) => (
            <div
              key={m.id}
              className={cx('group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2', m.id === meta?.id && 'bg-accent-soft')}
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => void switchDataset(m.id)}>
                <div className="truncate text-sm font-medium">{m.symbol}</div>
                <div className="truncate text-xs text-muted">
                  {intervalLongLabel(m.baseInterval)} · {m.barCount.toLocaleString()} bars · {formatDateShort(m.range.from)} – {formatDateShort(m.range.to)}
                </div>
              </button>
              <IconButton
                label={`Remove ${m.symbol} from this device`}
                className="opacity-0 group-hover:opacity-100"
                onClick={() => void removeDataset(m.id)}
              >
                <Trash2 className="size-[0.875rem]" />
              </IconButton>
            </div>
          ))}
          <div className="my-1 h-px bg-line" />
          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-[0.875rem]" /> Import a file…
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2" onClick={() => void loadSample()}>
            <span className="w-3.5 text-center">◆</span> Load the US 500 weekly sample
          </button>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => fileRef.current?.click()}>
        <FileUp className="size-[0.9375rem]" /> Import
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.json,text/csv,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      <div className="flex-1" />
      <div className="hidden items-center sm:flex">
        <IconButton label="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}>
          <Undo2 className="size-[1rem]" />
        </IconButton>
        <IconButton label="Redo (Shift+Ctrl+Z)" disabled={!future.length} onClick={redo}>
          <Redo2 className="size-[1rem]" />
        </IconButton>
      </div>
      <IconButton
        label={ui.measuring ? 'Clear measurement (M)' : 'Measure: click two points (M)'}
        active={ui.measuring}
        disabled={!meta}
        onClick={() => {
          const e = getEngine();
          if (!e) return;
          if (ui.measuring) {
            e.clearMeasure();
            ui.set({ measuring: false });
          } else {
            e.startMeasure();
            ui.set({ measuring: true });
          }
        }}
      >
        <Ruler className="size-[1rem]" />
      </IconButton>
      <IconButton label={`Theme: ${theme} (click for ${nextTheme})`} onClick={() => setTheme(nextTheme)}>
        <ThemeIcon className="size-[1rem]" />
      </IconButton>
      <IconButton label="Export" disabled={!meta} onClick={() => ui.set({ exportOpen: true })}>
        <Download className="size-[1rem]" />
      </IconButton>
      <IconButton label="Chart settings" active={ui.settingsOpen} onClick={() => ui.set({ settingsOpen: !ui.settingsOpen })}>
        <Settings2 className="size-[1rem]" />
      </IconButton>
      <Link href="/credits" className="hidden px-1 text-xs text-muted hover:text-ink lg:inline">
        Credits
      </Link>
    </header>
  );
}
