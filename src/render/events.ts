// Tiny typed emitter for high-frequency chart events (crosshair), kept out of React state.

export interface HoverBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  line: number | null;
  smooth: number | null;
  flags: number;
  /** Close of the previous bar, for change readouts. */
  prevClose: number | null;
}

type Listener<T> = (value: T) => void;

export class Emitter<T> {
  private listeners = new Set<Listener<T>>();
  private last: T;
  constructor(initial: T) {
    this.last = initial;
  }
  emit(value: T): void {
    this.last = value;
    for (const l of this.listeners) l(value);
  }
  get(): T {
    return this.last;
  }
  subscribe(l: Listener<T>): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const hoverBus = new Emitter<HoverBar | null>(null);
