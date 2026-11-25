// Floating message system (design/06 §9).
//
// - Transient messages ("Loaded US500") float for 15 s, paused while hovered or focused, then are
//   deleted.
// - Persistent messages ("data is out of date") float until the user hides them. Hidden ones stay
//   in the message tray and can be shown again. They are removed by their owner when the condition
//   ends (e.g. another dataset is opened).

import { create } from 'zustand';

export type MessageKind = 'info' | 'success' | 'warn' | 'error';

export interface MessageAction {
  label: string;
  run: () => void;
}

export interface Message {
  id: string;
  kind: MessageKind;
  text: string;
  /** Optional second line. */
  detail?: string;
  action?: MessageAction;
  persistent: boolean;
  hidden: boolean;
  createdAt: number;
}

export const TRANSIENT_MS = 15_000;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

interface MessagesState {
  messages: Message[];
  /** Float a transient message; returns its id. */
  notify: (m: { kind: MessageKind; text: string; detail?: string; action?: MessageAction }) => string;
  /** Add or update a persistent message by id. A message the user hid stays hidden. */
  raise: (m: { id: string; kind: MessageKind; text: string; detail?: string; action?: MessageAction; hidden?: boolean }) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  remove: (id: string) => void;
  /** Remove persistent messages whose id starts with `prefix` (except `keep`). */
  removeWhere: (prefix: string, keep?: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
}

const timers = new Map<string, Timer>();
/** Ids the user hid this session; re-raising them keeps them in the tray. */
const hiddenIds = new Set<string>();
let seq = 0;

export const useMessages = create<MessagesState>()((set, get) => {
  const start = (id: string, ms: number) => {
    const t: Timer = { handle: setTimeout(() => get().remove(id), ms), remaining: ms, startedAt: Date.now() };
    timers.set(id, t);
  };
  return {
    messages: [],
    notify: (m) => {
      const id = `t${++seq}`;
      // Keep at most four transient messages on screen.
      const transient = get().messages.filter((x) => !x.persistent);
      for (const old of transient.slice(0, Math.max(0, transient.length - 3))) get().remove(old.id);
      set((s) => ({ messages: [...s.messages, { ...m, id, persistent: false, hidden: false, createdAt: Date.now() }] }));
      start(id, TRANSIENT_MS);
      return id;
    },
    raise: (m) => {
      const hidden = hiddenIds.has(m.id) || !!m.hidden;
      if (m.hidden) hiddenIds.add(m.id);
      set((s) => {
        const existing = s.messages.find((x) => x.id === m.id);
        if (existing) return { messages: s.messages.map((x) => (x.id === m.id ? { ...x, ...m, hidden: x.hidden || hidden } : x)) };
        return { messages: [...s.messages, { ...m, persistent: true, hidden, createdAt: Date.now() }] };
      });
    },
    hide: (id) => {
      hiddenIds.add(id);
      set((s) => ({ messages: s.messages.map((x) => (x.id === id ? { ...x, hidden: true } : x)) }));
    },
    show: (id) => {
      hiddenIds.delete(id);
      set((s) => ({ messages: s.messages.map((x) => (x.id === id ? { ...x, hidden: false } : x)) }));
    },
    remove: (id) => {
      const t = timers.get(id);
      if (t?.handle) clearTimeout(t.handle);
      timers.delete(id);
      set((s) => ({ messages: s.messages.filter((x) => x.id !== id) }));
    },
    removeWhere: (prefix, keep) => {
      set((s) => ({ messages: s.messages.filter((x) => !x.persistent || !x.id.startsWith(prefix) || x.id === keep) }));
    },
    pause: (id) => {
      const t = timers.get(id);
      if (!t?.handle) return;
      clearTimeout(t.handle);
      t.handle = null;
      t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
    },
    resume: (id) => {
      const t = timers.get(id);
      if (!t || t.handle) return;
      start(id, Math.max(1500, t.remaining));
    },
  };
});

/** Shorthand for a transient message from non-React code. */
export function notify(kind: MessageKind, text: string, action?: MessageAction): string {
  return useMessages.getState().notify({ kind, text, action });
}
