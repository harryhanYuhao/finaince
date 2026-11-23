'use client';

import dynamic from 'next/dynamic';

// The whole interactive workspace is one client island (design/01 §1): KLineChart and the data
// worker must never run during server rendering.
const Workspace = dynamic(() => import('@/features/workspace/Workspace'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col">
      <div className="h-12 border-b border-line" />
      <div className="m-6 h-10 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="mx-6 flex-1 animate-pulse rounded-xl bg-surface-2" />
    </div>
  ),
});

export default function WorkspaceLoader() {
  return <Workspace />;
}
