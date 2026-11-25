'use client';

import { useEffect } from 'react';
import { useDatasets } from '@/state/datasets';
import { useUi } from '@/state/ui';
import { AppBar } from '../toolbar/AppBar';
import { Headline } from '../toolbar/Headline';
import { RangeBar } from '../toolbar/RangeBar';
import { Legend } from '../legend/Legend';
import { StatsStrip } from '../legend/StatsStrip';
import { SettingsDrawer } from '../settings/SettingsDrawer';
import { DataNotesDialog, DataProblem, DropOverlay, EmptyState, MappingDialog } from '../data-import/ImportUi';
import { ExportDialog } from '../export/ExportDialog';
import { MassiveDialog } from '../data-import/MassiveDialog';
import { ChartHost } from './ChartHost';
import { OverviewStrip } from './OverviewStrip';
import { MessageStack } from '../messages/Messages';
import { ChartSettingsButton } from '../settings/ChartSettingsButton';
import { useActiveMeta, useThemeName } from './hooks';
import { useShortcuts } from './useShortcuts';
import { useFreshness } from './useFreshness';
import { enterChartTool } from '../workspaces/actions';

export default function Workspace() {
  useThemeName();
  useShortcuts();
  const meta = useActiveMeta();
  const status = useDatasets((s) => s.status);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const loading = useUi((s) => s.loading);
  const dataProblem = useUi((s) => s.dataProblem);

  useFreshness(meta);

  useEffect(() => {
    void enterChartTool();
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppBar />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {meta ? (
            <>
              <div className="shrink-0 space-y-2 px-3 pb-2 pt-3 sm:px-4">
                <Headline />
                <RangeBar />
              </div>
              <div className="relative min-h-[15rem] flex-1 border-t border-line">
                {loading && (
                  <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden">
                    <div className="animate-progress h-full w-1/3 bg-accent" />
                  </div>
                )}
                <ChartHost />
                <Legend />
                <ChartSettingsButton />
              </div>
              <OverviewStrip />
              <StatsStrip />
            </>
          ) : dataProblem ? (
            <DataProblem />
          ) : status === 'loading' ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading your data…</div>
          ) : (
            <EmptyState />
          )}
        </main>
        {meta && settingsOpen && (
          <div className="fixed inset-0 z-30 sm:static sm:inset-auto sm:z-auto">
            <SettingsDrawer />
          </div>
        )}
      </div>
      <DropOverlay />
      <MappingDialog />
      <DataNotesDialog />
      <ExportDialog />
      <MassiveDialog />
      <MessageStack />
    </div>
  );
}
