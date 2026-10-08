import type { AtlasData, MeshOptions, MeshResult, SchematicVolume } from '../core/types';
import type { MeshRequest, MeshResponse } from './protocol';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (result: MeshResult) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<MeshResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new Error(response.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Mesher worker failed');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  return worker;
}

export function meshInWorker(
  volume: SchematicVolume,
  atlas: AtlasData,
  options: MeshOptions,
): Promise<MeshResult> {
  const id = nextId++;
  const request: MeshRequest = { id, volume, atlas, options };
  return new Promise<MeshResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(request);
  });
}
