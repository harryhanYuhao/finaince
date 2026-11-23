import type { KlcEngine } from '@/render/klc/KlcEngine';

// The single chart engine of the workspace, for toolbar actions (measure, export, keyboard).
let current: KlcEngine | null = null;

export function setEngine(e: KlcEngine | null): void {
  current = e;
}

export function getEngine(): KlcEngine | null {
  return current;
}
