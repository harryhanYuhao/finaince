'use client';

import { useEffect } from 'react';
import { useWorkspace } from '@/state/workspace';
import { useUi } from '@/state/ui';
import { useDatasets } from '@/state/datasets';
import { getEngine } from './engineRef';

/** Keyboard shortcuts (design/05 §6). Ignored while typing in inputs. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const ws = useWorkspace.getState();
      const ui = useUi.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) ws.redo();
        else ws.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        ws.redo();
        return;
      }
      if (mod || e.altKey) return;
      const engine = getEngine();
      const hasData = !!ws.spec.datasetId;
      switch (e.key) {
        case 'c':
        case 'C': {
          const meta = ws.spec.datasetId ? useDatasets.getState().metas[ws.spec.datasetId] : null;
          if (hasData && !meta?.synthetic) ws.update((s) => void (s.chartType = 'candle'));
          break;
        }
        case 'l':
        case 'L':
          if (hasData) ws.update((s) => void (s.chartType = 'line'));
          break;
        case 'm':
        case 'M':
          if (!engine || !hasData) break;
          if (ui.measuring) {
            engine.clearMeasure();
            ui.set({ measuring: false });
          } else {
            engine.startMeasure();
            ui.set({ measuring: true });
          }
          break;
        case 'Escape':
          if (ui.measuring) {
            engine?.clearMeasure();
            ui.set({ measuring: false });
          } else if (ui.settingsOpen) ui.set({ settingsOpen: false });
          break;
        case '/':
          e.preventDefault();
          ui.set({ settingsOpen: true });
          setTimeout(() => document.querySelector<HTMLButtonElement>('[title="Candle interval"],[title="Sampling step (accuracy)"]')?.click(), 50);
          break;
        case 'ArrowLeft':
          engine?.scrollBars(e.shiftKey ? 20 : 1);
          break;
        case 'ArrowRight':
          engine?.scrollBars(e.shiftKey ? -20 : -1);
          break;
        case '+':
        case '=':
          engine?.zoom(1.25);
          break;
        case '-':
          engine?.zoom(0.8);
          break;
        case 'End':
          engine?.scrollToLatest();
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
