import type { SchematicVolume } from '../core';
import type { ParseRequest, ParseResponse } from './parse.worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (volume: SchematicVolume) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<ParseResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) {
      entry.resolve(response.volume);
    } else {
      const error = new Error(response.error);
      error.name = response.name;
      entry.reject(error);
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Parser worker failed');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function parseInWorker(data: ArrayBuffer, fileName: string): Promise<SchematicVolume> {
  const id = nextId++;
  const request: ParseRequest = { id, data, fileName };
  return new Promise<SchematicVolume>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(request, { transfer: [data] });
  });
}
