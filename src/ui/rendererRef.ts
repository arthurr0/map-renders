import type { SceneRenderer } from '../render';

let current: SceneRenderer | null = null;
const listeners = new Set<(renderer: SceneRenderer | null) => void>();

export function setRenderer(renderer: SceneRenderer | null): void {
  current = renderer;
  for (const listener of listeners) listener(renderer);
}

export function getRenderer(): SceneRenderer | null {
  return current;
}

export function onRendererChange(listener: (renderer: SceneRenderer | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
