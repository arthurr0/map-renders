import type {
  AtlasData,
  MeshBuffers,
  MeshOptions,
  MeshResult,
  RenderLayer,
  SchematicVolume,
} from '../core/types';
import { isKnownBlock, neighborVariantKey, resolveBlockModel } from '../blocks';
import { bakeModel, type BakedModel } from './bake';
import { MeshContext } from './context';
import { emitBaked as importedEmitBaked } from './emit';
import { GreedyMerger } from './greedy';
import { LiquidMesher } from './liquid';
import { normalizeName } from './palette';

export { AO_LEVELS, AO_SHADE } from './context';

const emitBaked = importedEmitBaked;

const LAYERS: RenderLayer[] = ['opaque', 'cutout', 'translucent'];

function dynamicModel(
  ctx: MeshContext,
  p: number,
  x: number,
  y: number,
  z: number,
): BakedModel | null {
  const state = ctx.palette[p]!;
  const lookup = ctx.at(x, y, z);
  const key = neighborVariantKey(state, lookup);
  const cache = ctx.info.variants[p]!;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const model = resolveBlockModel(state, lookup);
  const baked = model ? bakeModel(model, ctx.lookup) : null;
  cache.set(key, baked);
  return baked;
}

interface Totals {
  blocks: number;
  faces: number;
  min: [number, number, number];
  max: [number, number, number];
  used: Uint8Array;
}

function meshChunk(
  ctx: MeshContext,
  liquid: LiquidMesher,
  greedy: GreedyMerger | null,
  ox: number,
  oy: number,
  oz: number,
  totals: Totals,
  out: MeshBuffers[],
): void {
  const { info, blocks, W, WL, paletteLen } = ctx;
  const ex = Math.min(ctx.W, ox + ctx.cs);
  const ey = Math.min(ctx.H, oy + ctx.cs);
  const ez = Math.min(ctx.L, oz + ctx.cs);
  for (const b of ctx.layers) b.reset();
  ctx.water.reset();
  const { min, max, used } = totals;
  for (let y = oy; y < ey; y++) {
    for (let z = oz; z < ez; z++) {
      let idx = ox + z * W + y * WL;
      for (let x = ox; x < ex; x++, idx++) {
        let p = blocks[idx]!;
        if (p >= paletteLen) p = info.oob;
        if (info.hidden[p]) continue;
        used[p] = 1;
        totals.blocks++;
        if (x < min[0]) min[0] = x;
        if (y < min[1]) min[1] = y;
        if (z < min[2]) min[2] = z;
        if (x + 1 > max[0]) max[0] = x + 1;
        if (y + 1 > max[1]) max[1] = y + 1;
        if (z + 1 > max[2]) max[2] = z + 1;
        const lx = x - ox;
        const ly = y - oy;
        const lz = z - oz;
        const dyn = info.dyn[p] === 1;
        const bm = dyn ? dynamicModel(ctx, p, x, y, z) : info.baked[p];
        if (bm && bm.count > 0) emitBaked(ctx, bm, p, x, y, z, lx, ly, lz, !!greedy && !dyn);
        const f = info.fluid[p]!;
        if (f) liquid.emit(p, x, y, z, f, lx, ly, lz);
      }
    }
  }
  if (greedy) greedy.flush(ex - ox, ey - oy, ez - oz);
  const origin: [number, number, number] = [ox, oy, oz];
  for (let li = 0; li < 3; li++) {
    const b = ctx.layers[li]!;
    if (b.vertexCount === 0) continue;
    totals.faces += b.quadCount;
    out.push(b.toBuffers(LAYERS[li]!, false, origin));
  }
  if (ctx.water.vertexCount > 0) {
    totals.faces += ctx.water.quadCount;
    out.push(ctx.water.toBuffers('translucent', true, origin));
  }
}

function unknownBlocks(ctx: MeshContext, used: Uint8Array): string[] {
  const unknown = new Set<string>();
  for (let p = 0; p < ctx.paletteLen; p++) {
    if (!used[p]) continue;
    const model = ctx.info.models[p];
    const name = normalizeName(ctx.palette[p]!.name);
    if ((model && model.unknown) || !isKnownBlock(name)) unknown.add(name);
  }
  return [...unknown].sort();
}

export function buildMesh(
  volume: SchematicVolume,
  atlas: AtlasData,
  options: MeshOptions,
): MeshResult {
  const ctx = new MeshContext(volume, atlas, options);
  const liquid = new LiquidMesher(ctx);
  const greedy = ctx.simplified ? new GreedyMerger(ctx) : null;
  const totals: Totals = {
    blocks: 0,
    faces: 0,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    used: new Uint8Array(ctx.info.size),
  };
  const meshes: MeshBuffers[] = [];
  for (let oy = 0; oy < ctx.H; oy += ctx.cs) {
    for (let oz = 0; oz < ctx.L; oz += ctx.cs) {
      for (let ox = 0; ox < ctx.W; ox += ctx.cs) {
        meshChunk(ctx, liquid, greedy, ox, oy, oz, totals, meshes);
      }
    }
  }
  const empty = totals.blocks === 0;
  return {
    meshes,
    bounds: {
      min: empty ? [0, 0, 0] : totals.min,
      max: empty ? [0, 0, 0] : totals.max,
    },
    stats: {
      blocks: totals.blocks,
      faces: totals.faces,
      unknownBlocks: unknownBlocks(ctx, totals.used),
    },
  };
}
