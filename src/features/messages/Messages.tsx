'use client';

import { AlertTriangle, BellRing, CheckCircle2, Eye, EyeOff, Info, X, XCircle } from 'lucide-react';
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger, cx } from '@/components/ui';
import { useMessages, type Message, type MessageKind } from '@/state/messages';

const ICON: Record<MessageKind, typeof Info> = { info: Info, success: CheckCircle2, warn: AlertTriangle, error: XCircle };
const TONE: Record<MessageKind, string> = { info: 'text-accent', success: 'text-up', warn: 'text-warn', error: 'text-down' };

function Card({ m }: { m: Message }) {
  const { remove, hide, pause, resume } = useMessages();
  const Icon = ICON[m.kind];
  return (
    <div
      role={m.kind === 'error' || m.kind === 'warn' ? 'alert' : 'status'}
      onMouseEnter={() => pause(m.id)}
      onMouseLeave={() => resume(m.id)}
      onFocus={() => pause(m.id)}
      onBlur={() => resume(m.id)}
      className={cx(
        'animate-fade pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-surface px-3 py-2.5 text-sm shadow-pop',
        m.kind === 'error' ? 'border-down/40' : m.kind === 'warn' ? 'border-warn/40' : 'border-line',
      )}
    >
      <Icon className={cx('mt-0.5 size-[1rem]', TONE[m.kind])} />
      <div className="min-w-0 flex-1">
        <p>{m.text}</p>
        {m.detail && <p className="mt-0.5 text-xs text-muted">{m.detail}</p>}
        {m.action && (
          <button
            className="mt-1 text-xs font-medium text-accent hover:underline"
            onClick={() => {
              m.action!.run();
              if (!m.persistent) remove(m.id);
            }}
          >
            {m.action.label}
          </button>
        )}
      </div>
      {m.persistent ? (
        <button aria-label="Hide (kept in the message tray)" title="Hide (kept in the message tray)" className="text-muted hover:text-ink" onClick={() => hide(m.id)}>
          <EyeOff className="size-[0.875rem]" />
        </button>
      ) : (
        <button aria-label="Dismiss" title="Dismiss" className="text-muted hover:text-ink" onClick={() => remove(m.id)}>
          <X className="size-[0.875rem]" />
        </button>
      )}
    </div>
  );
}

/** Floating messages, bottom right, away from the newest candles' price labels. */
export function MessageStack() {
  const messages = useMessages((s) => s.messages);
  const shown = [...messages.filter((m) => m.persistent && !m.hidden), ...messages.filter((m) => !m.persistent)];
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,26rem)] flex-col gap-2">
      {shown.map((m) => (
        <Card key={m.id} m={m} />
      ))}
    </div>
  );
}

/** Tray of persistent messages; hidden ones can be shown again. */
export function MessageTray() {
  const all = useMessages((s) => s.messages);
  const { show, hide } = useMessages();
  const messages = all.filter((m) => m.persistent);
  const hiddenCount = messages.filter((m) => m.hidden).length;
  const label = hiddenCount ? `Messages (${hiddenCount} hidden)` : 'Messages';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" aria-label={label} title={label} className="relative">
          <BellRing className="size-[1rem]" />
          {hiddenCount > 0 && (
            <span className="pointer-events-none absolute right-0 top-0 flex min-w-[1rem] items-center justify-center rounded-full bg-warn px-1 text-[0.625rem] font-semibold leading-4 text-white">
              {hiddenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-1.5">
        <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted">Messages</div>
        {messages.length === 0 && <p className="px-2 py-3 text-sm text-muted">No messages. Warnings that stay on screen can be hidden and found here.</p>}
        <ul className="max-h-[60vh] overflow-y-auto">
          {messages.map((m) => {
            const Icon = ICON[m.kind];
            return (
              <li key={m.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                <Icon className={cx('mt-0.5 size-[1rem]', TONE[m.kind])} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className={cx(m.hidden && 'text-muted')}>{m.text}</p>
                  {m.detail && <p className="mt-0.5 text-xs text-muted">{m.detail}</p>}
                  {m.action && (
                    <button className="mt-1 text-xs font-medium text-accent hover:underline" onClick={m.action.run}>
                      {m.action.label}
                    </button>
                  )}
                </div>
                <IconButton label={m.hidden ? 'Show on screen' : 'Hide'} onClick={() => (m.hidden ? show(m.id) : hide(m.id))}>
                  {m.hidden ? <Eye className="size-[0.875rem]" /> : <EyeOff className="size-[0.875rem]" />}
                </IconButton>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
