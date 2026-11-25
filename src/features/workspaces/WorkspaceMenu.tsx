'use client';

import { useRef, useState } from 'react';
import { ChevronDown, Copy, Download, FilePlus2, LayoutDashboard, Trash2, Upload } from 'lucide-react';
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger, cx } from '@/components/ui';
import { dataLabel } from '@/core/model/workspace';
import { formatDateShort } from '@/render/format';
import { useWorkspace } from '@/state/workspace';
import {
  createWorkspace,
  duplicateWorkspace,
  exportWorkspace,
  importWorkspaceFile,
  openWorkspace,
  refreshList,
  removeWorkspace,
  renameWorkspace,
  useWorkspaceList,
} from './actions';

const item = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-40';

/** Workspace name (rename in place) and the workspaces menu (design/08 §1.5). */
export function WorkspaceMenu() {
  const current = useWorkspace((s) => s.current);
  const hasData = useWorkspace((s) => !!s.spec.data);
  const items = useWorkspaceList((s) => s.items);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!current) return null;

  return (
    <div className="flex min-w-0 items-center">
      {editing ? (
        <input
          autoFocus
          aria-label="Workspace name"
          defaultValue={current.name}
          maxLength={200}
          onBlur={(e) => {
            renameWorkspace(e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-8 w-48 rounded-lg border border-accent bg-surface px-2 text-sm"
        />
      ) : (
        <button
          className="h-8 max-w-[14rem] truncate rounded-lg px-2 text-sm font-medium hover:bg-surface-2"
          title="Rename workspace"
          onClick={() => setEditing(true)}
        >
          {current.name}
        </button>
      )}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setConfirmDelete(null);
          if (o) void refreshList();
        }}
      >
        <PopoverTrigger asChild>
          <Button size="icon" aria-label="Workspaces" title="Workspaces">
            <ChevronDown className="size-[0.875rem] text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-1.5">
          <button
            className={item}
            onClick={() => {
              setOpen(false);
              void createWorkspace();
            }}
          >
            <FilePlus2 className="size-[0.875rem]" /> New workspace
          </button>
          <button
            className={item}
            disabled={!hasData}
            onClick={() => {
              setOpen(false);
              void duplicateWorkspace();
            }}
          >
            <Copy className="size-[0.875rem]" /> Duplicate
          </button>
          <button
            className={item}
            disabled={!hasData}
            onClick={() => {
              setOpen(false);
              exportWorkspace();
            }}
          >
            <Download className="size-[0.875rem]" /> Export to file…
          </button>
          <button className={item} onClick={() => fileRef.current?.click()}>
            <Upload className="size-[0.875rem]" /> Import from file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) {
                setOpen(false);
                void importWorkspaceFile(f);
              }
            }}
          />
          <div className="my-1 h-px bg-line" />
          <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted">Saved on this device</div>
          {items.length === 0 && <p className="px-2 py-2 text-sm text-muted">Workspaces save themselves once they have data.</p>}
          <ul className="max-h-[50vh] overflow-y-auto">
            {items.map((w) => (
              <li key={w.id} className={cx('group flex items-center gap-1 rounded-lg hover:bg-surface-2', w.id === current.id && 'bg-accent-soft')}>
                <button
                  className="min-w-0 flex-1 px-2 py-1.5 text-left"
                  onClick={() => {
                    setOpen(false);
                    if (w.id !== current.id) void openWorkspace(w.id);
                  }}
                >
                  <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <LayoutDashboard className="size-[0.8125rem] shrink-0 text-muted" />
                    <span className="truncate">{w.name}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {w.charts.map((c) => dataLabel(c.spec.data)).join(', ')} · {formatDateShort(w.updatedAt)}
                  </div>
                </button>
                {confirmDelete === w.id ? (
                  <Button size="sm" variant="outline" className="mr-1 border-down/40 text-down" onClick={() => void removeWorkspace(w.id).then(() => setConfirmDelete(null))}>
                    Delete
                  </Button>
                ) : (
                  <IconButton label={`Delete ${w.name}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setConfirmDelete(w.id)}>
                    <Trash2 className="size-[0.875rem]" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
