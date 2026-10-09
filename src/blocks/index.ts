import type { BlockState } from '../core/types';
import { stateKey } from '../core/volume';
import {
  extraTexturesFor,
  isAlwaysHidden,
  modelDependsOnNeighbors,
  neighborVariantKey,
  resolveModel,
} from './registry';
import type { BlockModel, NeighborLookup } from './types';

export type {
  BlockModel,
  ElementRotation,
  FaceDir,
  ModelElement,
  ModelFace,
  NeighborLookup,
  TintKind,
  Vec3,
} from './types';
export {
  isAlwaysHidden,
  isKnownBlock,
  modelDependsOnNeighbors,
  neighborVariantKey,
} from './registry';
export { TINT_HEX, TINT_RGB, hexToRgb, redstoneColor, srgbToLinear, tintColor } from './tints';
export {
  DIR_VEC,
  FACE_DIRS,
  FULL_COVERAGE,
  OPPOSITE,
  autoUV,
  cornerUVs,
  faceCorners,
  faceCoverageRect,
  onBoundary,
  rectCells,
} from './geometry';
export { PROBE_PROPS, knownBlockNames } from './catalog';

const staticCache = new Map<string, BlockModel | null>();

export function resolveBlockModel(state: BlockState, neighbors: NeighborLookup): BlockModel | null {
  const base = stateKey(state);
  const key = modelDependsOnNeighbors(state)
    ? `${base}|${neighborVariantKey(state, neighbors)}`
    : base;
  const cached = staticCache.get(key);
  if (cached !== undefined) return cached;
  const model = resolveModel(state, neighbors);
  staticCache.set(key, model);
  return model;
}

const WATER_TEXTURES = ['block/water_still', 'block/water_flow'];
const LAVA_TEXTURES = ['block/lava_still', 'block/lava_flow'];

export function modelTextures(model: BlockModel, out: Set<string>): void {
  for (const e of model.elements) {
    for (const f of Object.values(e.faces)) {
      if (!f) continue;
      out.add(f.texture);
      if (f.fallback) for (const t of f.fallback) out.add(t);
    }
  }
  if (model.liquid === 'water') for (const t of WATER_TEXTURES) out.add(t);
  if (model.liquid === 'lava') for (const t of LAVA_TEXTURES) out.add(t);
}

export function requiredTextures(palette: BlockState[]): string[] {
  const out = new Set<string>();
  const air: NeighborLookup = () => ({ name: 'minecraft:air', properties: {} });
  for (const state of palette) {
    if (isAlwaysHidden(state.name)) continue;
    const model = resolveBlockModel(state, air);
    if (model) modelTextures(model, out);
    for (const t of extraTexturesFor(state)) out.add(t);
  }
  return [...out].sort();
}
