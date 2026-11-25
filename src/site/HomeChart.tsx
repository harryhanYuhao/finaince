'use client';

import dynamic from 'next/dynamic';

// KLineChart needs the browser; the card shows a skeleton until the client island loads.
export const HomeChart = dynamic(() => import('./HomeChartCard'), {
  ssr: false,
  loading: () => <div className="h-[22rem] animate-pulse rounded-2xl border border-line bg-surface-2" />,
});
