import type { SchematicVolume } from '../core';

export interface BlockCount {
  name: string;
  count: number;
}

export interface BlockStats {
  total: number;
  counts: BlockCount[];
}

const AIR_NAMES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

export function computeBlockStats(volume: SchematicVolume): BlockStats {
  const perIndex = new Float64Array(volume.palette.length);
  const blocks = volume.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const index = blocks[i] ?? 0;
    if (index < perIndex.length) perIndex[index] = (perIndex[index] ?? 0) + 1;
  }
  const byName = new Map<string, number>();
  let total = 0;
  volume.palette.forEach((state, index) => {
    const count = perIndex[index] ?? 0;
    if (count === 0 || AIR_NAMES.has(state.name)) return;
    total += count;
    byName.set(state.name, (byName.get(state.name) ?? 0) + count);
  });
  const counts = [...byName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { total, counts };
}

export function prettyBlockName(name: string): string {
  const short = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  return short.replace(/_/g, ' ');
}
