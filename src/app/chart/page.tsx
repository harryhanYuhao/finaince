import type { Metadata } from 'next';
import WorkspaceLoader from '../WorkspaceLoader';

export const metadata: Metadata = { title: 'Charts — FinAInce' };

export default function ChartPage() {
  return <WorkspaceLoader />;
}
