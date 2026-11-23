'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { rootPxFor, usePrefs } from '@/state/prefs';
import { useWorkspace } from '@/state/workspace';
import { useDatasets } from '@/state/datasets';
import { chartTheme, type ThemeName } from '@/render/theme';
import { hoverBus, type HoverBar } from '@/render/events';
import type { DatasetMeta } from '@/core/model/types';

function subscribeDark(cb: () => void) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** Resolved light/dark theme; keeps the `dark` class on <html> in sync. */
export function useThemeName(): ThemeName {
  const pref = usePrefs((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribeDark, () => matchMedia('(prefers-color-scheme: dark)').matches, () => false);
  const name: ThemeName = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', name === 'dark');
  }, [name]);
  return name;
}

/** Root font size in px for the chosen interface size; keeps <html> in sync. */
export function useRootPx(): number {
  const scale = usePrefs((s) => s.uiScale);
  const px = rootPxFor(scale);
  useEffect(() => {
    document.documentElement.style.fontSize = `${px}px`;
  }, [px]);
  return px;
}

export function useChartTheme() {
  const name = useThemeName();
  const convention = usePrefs((s) => s.colorConvention);
  const rootPx = useRootPx();
  return useMemo(() => chartTheme(name, convention, rootPx / 16), [name, convention, rootPx]);
}

export function useActiveMeta(): DatasetMeta | null {
  const id = useWorkspace((s) => s.spec.datasetId);
  return useDatasets((s) => (id ? (s.metas[id] ?? null) : null));
}

export function useHover(): HoverBar | null {
  return useSyncExternalStore(
    (cb) => hoverBus.subscribe(cb),
    () => hoverBus.get(),
    () => null,
  );
}
