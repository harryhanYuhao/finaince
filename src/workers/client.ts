import * as Comlink from 'comlink';
import type { DataWorkerApi } from './api';

let remote: Comlink.Remote<DataWorkerApi> | null = null;

/** Lazily started data worker (browser only). */
export function dataWorker(): Comlink.Remote<DataWorkerApi> {
  if (!remote) {
    const worker = new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module', name: 'finaince-data' });
    remote = Comlink.wrap<DataWorkerApi>(worker);
  }
  return remote;
}
