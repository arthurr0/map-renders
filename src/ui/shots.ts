import type { SavedShot } from '../core';
import { getRenderer } from './rendererRef';
import { useAppStore } from './store';

export function makeShotId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nextShotName(shots: SavedShot[]): string {
  let highest = 0;
  for (const shot of shots) {
    const match = /^Shot (\d+)$/.exec(shot.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Shot ${Math.max(highest, shots.length) + 1}`;
}

export function cleanShotName(name: string, fallback: string): string {
  const trimmed = name.trim().slice(0, 60);
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function saveCurrentShot(): Promise<SavedShot | null> {
  const store = useAppStore.getState();
  const renderer = getRenderer();
  if (!store.volume) {
    store.pushToast('info', 'Open a schematic before saving a shot.');
    return null;
  }
  if (!renderer) {
    store.pushToast('info', 'The viewport is not ready yet.');
    return null;
  }
  const camera = renderer.getCamera();
  let thumbnail: string | undefined;
  try {
    thumbnail = await renderer.captureThumbnail(256);
  } catch {
    thumbnail = undefined;
  }
  const shot: SavedShot = {
    id: makeShotId(),
    name: nextShotName(useAppStore.getState().shots),
    camera,
    thumbnail,
    createdAt: Date.now(),
  };
  useAppStore.getState().addShot(shot);
  useAppStore.getState().pushToast('success', `Saved ${shot.name}`);
  return shot;
}

export function flyToShot(shot: SavedShot): void {
  getRenderer()?.setCamera(shot.camera, true);
}

export function renameShot(id: string, name: string): void {
  const store = useAppStore.getState();
  const existing = store.shots.find((shot) => shot.id === id);
  if (!existing) return;
  store.renameShot(id, cleanShotName(name, existing.name));
}
