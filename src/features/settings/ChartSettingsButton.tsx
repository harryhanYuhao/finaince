'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui';
import { useUi } from '@/state/ui';

/** Opens the chart's own settings (design/06 §10). Sits at the chart's top-right corner. */
export function ChartSettingsButton() {
  const open = useUi((s) => s.settingsOpen);
  const set = useUi((s) => s.set);
  return (
    <div className="absolute right-2 top-2 z-10">
      <Button
        variant="outline"
        size="sm"
        active={open}
        aria-pressed={open}
        title="Chart settings"
        onClick={() => set({ settingsOpen: !open })}
        className="bg-surface/90 shadow-sm backdrop-blur"
      >
        <SlidersHorizontal className="size-[0.875rem]" />
        <span className="hidden sm:inline">Chart settings</span>
      </Button>
    </div>
  );
}
