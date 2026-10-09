import type { BlockState, SchematicVolume } from '../core/types';
import {
  FACE_DIRS,
  isAlwaysHidden,
  modelDependsOnNeighbors,
  resolveBlockModel,
  type BlockModel,
  type NeighborLookup,
} from '../blocks';
import { bakeModel, type BakedModel, type TextureLookup } from './bake';

export const AIR: BlockState = { name: 'minecraft:air', properties: {} };

export function normalizeName(name: string): string {
  return name.includes(':') ? name : `minecraft:${name}`;
}

export interface PaletteInfo {
  size: number;
  oob: number;
  hidden: Uint8Array;
  cover: Uint16Array;
  shade: Uint8Array;
  group: Int32Array;
  fluid: Uint8Array;
  fluidH: Float32Array;
  solid: Uint8Array;
  dyn: Uint8Array;
  models: (BlockModel | null)[];
  baked: (BakedModel | null)[];
  variants: Map<string, BakedModel | null>[];
  styleBase: Int32Array;
  styleCount: number;
}

export function analyzePalette(
  volume: SchematicVolume,
  lookup: TextureLookup,
  hide: Set<string>,
): PaletteInfo {
  const n = volume.palette.length;
  const size = n + 1;
  const info: PaletteInfo = {
    size,
    oob: n,
    hidden: new Uint8Array(size),
    cover: new Uint16Array(size * 6),
    shade: new Uint8Array(size),
    group: new Int32Array(size),
    fluid: new Uint8Array(size),
    fluidH: new Float32Array(size),
    solid: new Uint8Array(size),
    dyn: new Uint8Array(size),
    models: new Array(size).fill(null),
    baked: new Array(size).fill(null),
    variants: [],
    styleBase: new Int32Array(size),
    styleCount: 0,
  };
  const groups = new Map<string, number>();
  const airLookup: NeighborLookup = () => AIR;
  for (let p = 0; p < n; p++) {
    info.variants.push(new Map());
    const state = volume.palette[p]!;
    const name = normalizeName(state.name);
    if (isAlwaysHidden(name) || hide.has(name)) {
      info.hidden[p] = 1;
      continue;
    }
    const model = resolveBlockModel(state, airLookup);
    if (!model) {
      info.hidden[p] = 1;
      continue;
    }
    info.models[p] = model;
    if (model.coverage) {
      FACE_DIRS.forEach((d, i) => {
        info.cover[p * 6 + i] = model.coverage![d] ?? 0;
      });
    }
    info.shade[p] = model.shadeOccluder ? 1 : 0;
    info.solid[p] = model.solid ? 1 : 0;
    if (model.cullGroup) {
      let g = groups.get(model.cullGroup);
      if (g === undefined) {
        g = groups.size + 1;
        groups.set(model.cullGroup, g);
      }
      info.group[p] = g;
    }
    if (model.liquid) {
      info.fluid[p] = model.liquid === 'water' ? 1 : 2;
      const level = model.liquidLevel ?? 0;
      info.fluidH[p] = level >= 8 ? 8 / 9 : (8 - level) / 9;
    }
    if (modelDependsOnNeighbors(state)) {
      info.dyn[p] = 1;
    } else {
      const baked = bakeModel(model, lookup);
      info.baked[p] = baked;
      info.styleBase[p] = info.styleCount;
      info.styleCount += baked.count;
    }
  }
  info.variants.push(new Map());
  info.hidden[n] = 1;
  return info;
}
