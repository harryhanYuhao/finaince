'use client';

import { X } from 'lucide-react';
import { useUi } from '@/state/ui';
import { cx } from '@/components/ui';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cx(
            'animate-fade pointer-events-auto flex items-center gap-3 rounded-xl border bg-surface px-3 py-2 text-sm shadow-pop',
            t.kind === 'error' ? 'border-down/40' : 'border-line',
          )}
        >
          <span className={cx('h-2 w-2 shrink-0 rounded-full', t.kind === 'error' ? 'bg-down' : t.kind === 'success' ? 'bg-up' : 'bg-accent')} />
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              className="font-medium text-accent hover:underline"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => dismiss(t.id)}>
            <X className="size-[0.875rem]" />
          </button>
        </div>
      ))}
    </div>
  );
}
