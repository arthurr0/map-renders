export const BIOME_TINTS = {
  grass: '#79c05a',
  foliage: '#59ae30',
  water: '#3f76e4',
} as const;

export type TintKind =
  'grass' | 'foliage' | 'water' | 'spruce_leaves' | 'birch_leaves' | 'lily_pad';

const FIXED_TINTS: Partial<Record<TintKind, string>> = {
  spruce_leaves: '#619961',
  birch_leaves: '#80a755',
  lily_pad: '#208030',
};

const BIOME_OVERRIDES: Record<string, Partial<Record<'grass' | 'foliage' | 'water', string>>> = {
  desert: { grass: '#bfb755', foliage: '#aea42a' },
  savanna: { grass: '#bfb755', foliage: '#aea42a' },
  badlands: { grass: '#90814d', foliage: '#9e814d' },
  jungle: { grass: '#59c93c', foliage: '#30bb0b' },
  swamp: { grass: '#6a7039', foliage: '#6a7039', water: '#617b64' },
  mangrove_swamp: { grass: '#6a7039', foliage: '#8db127', water: '#3a7a6a' },
  taiga: { grass: '#86b783', foliage: '#68a464' },
  snowy_plains: { grass: '#80b497', foliage: '#60a17b' },
  snowy_taiga: { grass: '#80b497', foliage: '#60a17b' },
  ocean: { water: '#3f76e4' },
  warm_ocean: { water: '#43d5ee' },
  lukewarm_ocean: { water: '#45adf2' },
  cold_ocean: { water: '#3d57d6' },
  frozen_ocean: { water: '#3938c9' },
  frozen_river: { water: '#3938c9' },
};

function normalizeBiome(biome: string): string {
  const name = biome.includes(':') ? biome.slice(biome.indexOf(':') + 1) : biome;
  return name.toLowerCase();
}

export function tintFor(kind: TintKind, biome?: string): string {
  const fixed = FIXED_TINTS[kind];
  if (fixed) return fixed;
  const base: 'grass' | 'foliage' | 'water' =
    kind === 'foliage' || kind === 'water' ? kind : 'grass';
  if (biome) {
    const override = BIOME_OVERRIDES[normalizeBiome(biome)]?.[base];
    if (override) return override;
  }
  return BIOME_TINTS[base];
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.startsWith('#') ? hex.slice(1) : hex;
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
