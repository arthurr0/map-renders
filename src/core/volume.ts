import type { BlockState, SchematicVolume } from './types';

export const AIR_NAME = 'minecraft:air';

export function createAirState(): BlockState {
  return { name: AIR_NAME, properties: {} };
}

export function blockIndex(vol: SchematicVolume, x: number, y: number, z: number): number {
  return x + z * vol.width + y * vol.width * vol.length;
}

export function inBounds(vol: SchematicVolume, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < vol.width && y < vol.height && z < vol.length;
}

export function getBlock(vol: SchematicVolume, x: number, y: number, z: number): BlockState {
  if (!inBounds(vol, x, y, z)) return createAirState();
  const paletteIndex = vol.blocks[blockIndex(vol, x, y, z)] ?? 0;
  return vol.palette[paletteIndex] ?? createAirState();
}

export function stateKey(state: BlockState): string {
  const keys = Object.keys(state.properties).sort();
  if (keys.length === 0) return state.name;
  const body = keys.map((key) => `${key}=${state.properties[key]}`).join(',');
  return `${state.name}[${body}]`;
}

export function parseStateKey(key: string): BlockState {
  const open = key.indexOf('[');
  if (open === -1 || !key.endsWith(']')) return { name: key, properties: {} };
  const name = key.slice(0, open);
  const properties: Record<string, string> = {};
  const body = key.slice(open + 1, -1);
  if (body.length > 0) {
    for (const pair of body.split(',')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      properties[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return { name, properties };
}
