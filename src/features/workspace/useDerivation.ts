'use client';

import { useUi } from '@/state/ui';

/** Effective derivation (resolved interval / auto step) of the visible chart. */
export function useDerivation() {
  return useUi((s) => s.derivation);
}
