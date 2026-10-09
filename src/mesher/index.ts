import type {
  AtlasData,
  BlockState,
  MeshBuffers,
  MeshOptions,
  MeshResult,
  RenderLayer,
  SchematicVolume,
} from '../core/types';
import {
  FACE_DIRS,
  faceCorners,
  isAlwaysHidden,
  isKnownBlock,
  modelDependsOnNeighbors,
  resolveBlockModel,
  srgbToLinear,
  TINT_RGB,
  type BlockModel,
  type NeighborLookup,
  type Vec3,
} from '../blocks';
import { bakeModel, createTextureLookup, type BakedModel, type TextureLookup } from './bake';
import { GeometryBuilder } from './builder';

export const AO_SHADE = 0.2;

export const AO_LEVELS: number[] = [0, 1, 2, 3, 4].map((k) => {
  const v = (k * AO_SHADE + (4 - k)) / 4;
  return srgbToLinear(v);
});

const DX = [0, 0, 0, 0, -1, 1];
const DY = [-1, 1, 0, 0, 0, 0];
const DZ = [0, 0, -1, 1, 0, 0];
const OPP = [1, 0, 3, 2, 5, 4];
const T1 = [0, 0, 0, 0, 2, 2];
const T2 = [2, 2, 1, 1, 1, 1];
const AXIS_N = [1, 1, 2, 2, 0, 0];
const LAYERS: RenderLayer[] = ['opaque', 'cutout', 'translucent'];
const DIR_OCC: Record<string, number> = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 };

const AIR: BlockState = { name: 'minecraft:air', properties: {} };

function normalizeName(name: string): string {
  return name.includes(':') ? name : `minecraft:${name}`;
}

interface PaletteInfo {
  size: number;
  hidden: Uint8Array;
  occ: Uint8Array;
  shade: Uint8Array;
  group: Int32Array;
  fluid: Uint8Array;
  fluidH: Float32Array;
  solid: Uint8Array;
  dyn: Uint8Array;
  models: (BlockModel | null)[];
  baked: (BakedModel | null)[];
  styleBase: Int32Array;
  styleCount: number;
}

function occBits(model: BlockModel): number {
  let bits = 0;
  for (const [dir, v] of Object.entries(model.occludes)) if (v) bits |= 1 << DIR_OCC[dir]!;
  return bits;
}

function analyzePalette(
  volume: SchematicVolume,
  lookup: TextureLookup,
  hide: Set<string>,
): PaletteInfo {
  const n = volume.palette.length;
  const size = n + 1;
  const info: PaletteInfo = {
    size,
    hidden: new Uint8Array(size),
    occ: new Uint8Array(size),
    shade: new Uint8Array(size),
    group: new Int32Array(size),
    fluid: new Uint8Array(size),
    fluidH: new Float32Array(size),
    solid: new Uint8Array(size),
    dyn: new Uint8Array(size),
    models: new Array(size).fill(null),
    baked: new Array(size).fill(null),
    styleBase: new Int32Array(size),
    styleCount: 0,
  };
  const groups = new Map<string, number>();
  const airLookup: NeighborLookup = () => AIR;
  for (let p = 0; p < n; p++) {
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
    info.occ[p] = occBits(model);
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
  info.hidden[n] = 1;
  return info;
}

interface ChunkBuilders {
  layers: GeometryBuilder[];
  water: GeometryBuilder;
}

export function buildMesh(
  volume: SchematicVolume,
  atlas: AtlasData,
  options: MeshOptions,
): MeshResult {
  const { width: W, height: H, length: L } = volume;
  const blocks = volume.blocks;
  const lookup = createTextureLookup(atlas, options.mode);
  const hide = new Set(options.hideBlocks.map(normalizeName));
  const info = analyzePalette(volume, lookup, hide);
  const OOB = info.size - 1;
  const paletteLen = volume.palette.length;
  const simplified = options.mode === 'simplified';
  const useAO = options.ambientOcclusion;
  const cs = options.chunkSize > 0 ? Math.floor(options.chunkSize) : 32;
  const { hidden, occ, shade, group, fluid, fluidH, solid, dyn, baked, models } = info;

  const WL = W * L;
  const pal = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L) return OOB;
    const v = blocks[x + z * W + y * WL]!;
    return v < paletteLen ? v : OOB;
  };

  const builders: ChunkBuilders = {
    layers: [new GeometryBuilder(), new GeometryBuilder(), new GeometryBuilder()],
    water: new GeometryBuilder(),
  };

  const styleCount = info.styleCount;
  const styleColor = new Float32Array(Math.max(1, styleCount) * 3);
  const styleEm = new Float32Array(Math.max(1, styleCount));
  const styleLayer = new Uint8Array(Math.max(1, styleCount));
  if (simplified) {
    for (let p = 0; p < paletteLen; p++) {
      const b = baked[p];
      if (!b) continue;
      const base = info.styleBase[p]!;
      for (let k = 0; k < b.count; k++) {
        styleColor.set(b.color.subarray(k * 3, k * 3 + 3), (base + k) * 3);
        styleEm[base + k] = b.emissive[k]!;
        styleLayer[base + k] = b.layer[k]!;
      }
    }
  }
  const mask = simplified ? Array.from({ length: 6 }, () => new Int32Array(cs * cs * cs)) : [];

  const used = new Uint8Array(info.size);
  const meshes: MeshBuffers[] = [];
  let blockCount = 0;
  let faceCount = 0;
  const bmin: [number, number, number] = [Infinity, Infinity, Infinity];
  const bmax: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const grid = new Uint8Array(9);
  const aoCount = new Uint8Array(4);
  const aoVal = new Float32Array(4);
  const vtxCol = new Float32Array(12);
  const vtxAO = new Float32Array(4);
  const posScratch = new Float32Array(12);
  const uvScratch = new Float32Array(8);
  const zeroUV = new Float32Array(8);
  const revPos = new Float32Array(12);
  const revUV = new Float32Array(8);

  const computeAO = (x: number, y: number, z: number, d: number, inside: boolean): void => {
    let bx = x;
    let by = y;
    let bz = z;
    if (!inside) {
      bx += DX[d]!;
      by += DY[d]!;
      bz += DZ[d]!;
    }
    const t1 = T1[d]!;
    const t2 = T2[d]!;
    for (let b = -1; b <= 1; b++) {
      for (let a = -1; a <= 1; a++) {
        let sx = bx;
        let sy = by;
        let sz = bz;
        if (t1 === 0) sx += a;
        else if (t1 === 1) sy += a;
        else sz += a;
        if (t2 === 0) sx += b;
        else if (t2 === 1) sy += b;
        else sz += b;
        grid[a + 1 + (b + 1) * 3] = shade[pal(sx, sy, sz)]!;
      }
    }
    const center = grid[4]!;
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const a = i === 0 ? 0 : 2;
        const bb = j === 0 ? 0 : 2;
        const s1 = grid[a + 3]!;
        const s2 = grid[1 + bb * 3]!;
        const c = s1 && s2 ? 1 : grid[a + bb * 3]!;
        const k = s1 + s2 + c + center;
        aoCount[i + 2 * j] = k;
        aoVal[i + 2 * j] = AO_LEVELS[k]!;
      }
    }
  };

  const emitBaked = (
    bm: BakedModel,
    p: number,
    x: number,
    y: number,
    z: number,
    lx: number,
    ly: number,
    lz: number,
    allowGreedy: boolean,
  ): void => {
    const g = group[p]!;
    let aoKey = -1;
    for (let k = 0; k < bm.count; k++) {
      const cd = bm.cull[k]!;
      if (cd >= 0) {
        const q = pal(x + DX[cd]!, y + DY[cd]!, z + DZ[cd]!);
        if ((occ[q]! >> OPP[cd]!) & 1) continue;
        if (g !== 0 && group[q] === g) continue;
      }
      const ad = bm.aoDir[k]!;
      let uniform = true;
      let level = 0;
      const c0 = bm.color[k * 3]!;
      const c1 = bm.color[k * 3 + 1]!;
      const c2 = bm.color[k * 3 + 2]!;
      if (useAO && ad >= 0) {
        const inside = bm.aoInside[k] === 1;
        const key = ad * 2 + (inside ? 1 : 0);
        if (key !== aoKey) {
          computeAO(x, y, z, ad, inside);
          aoKey = key;
        }
        const t1 = T1[ad]!;
        const t2 = T2[ad]!;
        for (let i = 0; i < 4; i++) {
          let u = bm.pos[k * 12 + i * 3 + t1]!;
          let v = bm.pos[k * 12 + i * 3 + t2]!;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          const top = aoVal[0]! + (aoVal[1]! - aoVal[0]!) * u;
          const bot = aoVal[2]! + (aoVal[3]! - aoVal[2]!) * u;
          vtxAO[i] = top + (bot - top) * v;
        }
        uniform =
          aoCount[0] === aoCount[1] && aoCount[1] === aoCount[2] && aoCount[2] === aoCount[3];
        level = aoCount[0]!;
      } else {
        vtxAO[0] = 1;
        vtxAO[1] = 1;
        vtxAO[2] = 1;
        vtxAO[3] = 1;
      }
      if (allowGreedy && bm.fullFace[k] === 1 && uniform) {
        const d = ad >= 0 ? ad : -1;
        if (d >= 0) {
          mask[d]![lx + cs * (ly + cs * lz)] = (info.styleBase[p]! + k) * 8 + level + 1;
          continue;
        }
      }
      for (let i = 0; i < 4; i++) {
        vtxCol[i * 3] = c0 * vtxAO[i]!;
        vtxCol[i * 3 + 1] = c1 * vtxAO[i]!;
        vtxCol[i * 3 + 2] = c2 * vtxAO[i]!;
      }
      const flip = vtxAO[1]! + vtxAO[3]! > vtxAO[0]! + vtxAO[2]! + 1e-6;
      const builder = builders.layers[bm.layer[k]!]!;
      builder.quad(
        bm.pos.subarray(k * 12, k * 12 + 12),
        lx,
        ly,
        lz,
        bm.normal[k * 3]!,
        bm.normal[k * 3 + 1]!,
        bm.normal[k * 3 + 2]!,
        simplified ? zeroUV : bm.uv.subarray(k * 8, k * 8 + 8),
        vtxCol,
        bm.emissive[k]!,
        flip,
      );
    }
  };

  const fluidHeight = (x: number, y: number, z: number, kind: number): number => {
    const q = pal(x, y, z);
    if (fluid[q] === kind) return fluid[pal(x, y + 1, z)] === kind ? 1 : fluidH[q]!;
    return solid[q] ? -1 : 0;
  };

  let sumH = 0;
  let sumW = 0;
  const addWeighted = (h: number) => {
    if (h >= 0.8) {
      sumH += h * 10;
      sumW += 10;
    } else if (h >= 0) {
      sumH += h;
      sumW += 1;
    }
  };
  const avgHeight = (
    self: number,
    a: number,
    b: number,
    dx: number,
    dy: number,
    dz: number,
    kind: number,
  ): number => {
    if (a >= 1 || b >= 1) return 1;
    sumH = 0;
    sumW = 0;
    if (a > 0 || b > 0) {
      const d = fluidHeight(dx, dy, dz, kind);
      if (d >= 1) return 1;
      addWeighted(d);
    }
    addWeighted(self);
    addWeighted(b);
    addWeighted(a);
    return sumW > 0 ? sumH / sumW : self;
  };

  const waterTexture = { still: 'block/water_still', flow: 'block/water_flow' };
  const lavaTexture = { still: 'block/lava_still', flow: 'block/lava_flow' };
  const waterTint: Vec3 = [
    srgbToLinear(TINT_RGB.water[0]),
    srgbToLinear(TINT_RGB.water[1]),
    srgbToLinear(TINT_RGB.water[2]),
  ];
  const regionUV = (texture: string, u16: number, v16: number, out: Float32Array, o: number) => {
    const r = atlas.regions[texture];
    if (!r || simplified) {
      out[o] = 0;
      out[o + 1] = 0;
      return;
    }
    out[o] = r.u0 + (u16 / 16) * (r.u1 - r.u0);
    out[o + 1] = r.v0 + (v16 / 16) * (r.v1 - r.v0);
  };
  const liquidColor = (kind: number, texture: string): Vec3 => {
    const base: Vec3 = kind === 1 ? waterTint : [1, 1, 1];
    if (!simplified) return base;
    const c = atlas.colors[texture];
    if (!c) return base;
    return [
      base[0] * srgbToLinear(c[0]),
      base[1] * srgbToLinear(c[1]),
      base[2] * srgbToLinear(c[2]),
    ];
  };
  const unitCorners = FACE_DIRS.map((d) => faceCorners([0, 0, 0], [1, 1, 1], d));

  const emitLiquid = (
    x: number,
    y: number,
    z: number,
    kind: number,
    lx: number,
    ly: number,
    lz: number,
  ): void => {
    const builder = kind === 1 ? builders.water : builders.layers[0]!;
    const tex = kind === 1 ? waterTexture : lavaTexture;
    const em = kind === 2 ? 1 : 0;
    const self = fluidHeight(x, y, z, kind);
    let hNW = 1;
    let hNE = 1;
    let hSW = 1;
    let hSE = 1;
    const aboveSame = fluid[pal(x, y + 1, z)] === kind;
    if (self < 1) {
      const n = fluidHeight(x, y, z - 1, kind);
      const s = fluidHeight(x, y, z + 1, kind);
      const e = fluidHeight(x + 1, y, z, kind);
      const w = fluidHeight(x - 1, y, z, kind);
      hNE = avgHeight(self, n, e, x + 1, y, z - 1, kind);
      hNW = avgHeight(self, n, w, x - 1, y, z - 1, kind);
      hSE = avgHeight(self, s, e, x + 1, y, z + 1, kind);
      hSW = avgHeight(self, s, w, x - 1, y, z + 1, kind);
    }
    const hAt = (cx: number, cz: number) =>
      cx === 0 ? (cz === 0 ? hNW : hSW) : cz === 0 ? hNE : hSE;
    const stillColor = liquidColor(kind, tex.still);
    const flowColor = liquidColor(kind, tex.flow);
    if (!aboveSame) {
      const c = unitCorners[1]!;
      for (let i = 0; i < 4; i++) {
        const cx = c[i]![0];
        const cz = c[i]![2];
        posScratch[i * 3] = cx;
        posScratch[i * 3 + 1] = hAt(cx, cz) - 0.001;
        posScratch[i * 3 + 2] = cz;
        regionUV(tex.still, cx * 16, cz * 16, uvScratch, i * 2);
        vtxCol[i * 3] = stillColor[0];
        vtxCol[i * 3 + 1] = stillColor[1];
        vtxCol[i * 3 + 2] = stillColor[2];
      }
      const ax = posScratch[6]! - posScratch[0]!;
      const ay = posScratch[7]! - posScratch[1]!;
      const az = posScratch[8]! - posScratch[2]!;
      const bx = posScratch[9]! - posScratch[3]!;
      const by = posScratch[10]! - posScratch[4]!;
      const bz = posScratch[11]! - posScratch[5]!;
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      builder.quad(posScratch, lx, ly, lz, nx, ny, nz, uvScratch, vtxCol, em, false);
      if (kind === 1) {
        const rp = revPos;
        const ru = revUV;
        const order = [0, 3, 2, 1];
        for (let i = 0; i < 4; i++) {
          const o = order[i]!;
          rp[i * 3] = posScratch[o * 3]!;
          rp[i * 3 + 1] = posScratch[o * 3 + 1]!;
          rp[i * 3 + 2] = posScratch[o * 3 + 2]!;
          ru[i * 2] = uvScratch[o * 2]!;
          ru[i * 2 + 1] = uvScratch[o * 2 + 1]!;
        }
        builder.quad(rp, lx, ly, lz, -nx, -ny, -nz, ru, vtxCol, em, false);
      }
    }
    const below = pal(x, y - 1, z);
    if (fluid[below] !== kind && !((occ[below]! >> 1) & 1)) {
      const c = unitCorners[0]!;
      for (let i = 0; i < 4; i++) {
        posScratch[i * 3] = c[i]![0];
        posScratch[i * 3 + 1] = 0.001;
        posScratch[i * 3 + 2] = c[i]![2];
        regionUV(tex.still, c[i]![0] * 16, (1 - c[i]![2]) * 16, uvScratch, i * 2);
        vtxCol[i * 3] = stillColor[0];
        vtxCol[i * 3 + 1] = stillColor[1];
        vtxCol[i * 3 + 2] = stillColor[2];
      }
      builder.quad(posScratch, lx, ly, lz, 0, -1, 0, uvScratch, vtxCol, em, false);
    }
    for (let d = 2; d < 6; d++) {
      const q = pal(x + DX[d]!, y, z + DZ[d]!);
      if (fluid[q] === kind) continue;
      if ((occ[q]! >> OPP[d]!) & 1) continue;
      const c = unitCorners[d]!;
      for (let i = 0; i < 4; i++) {
        const cx = c[i]![0];
        const cy = c[i]![1];
        const cz = c[i]![2];
        const yy = cy > 0 ? hAt(cx, cz) : 0;
        posScratch[i * 3] = cx;
        posScratch[i * 3 + 1] = yy;
        posScratch[i * 3 + 2] = cz;
        const a = i < 2 ? 0 : 1;
        regionUV(tex.flow, a * 8, (1 - yy) * 8, uvScratch, i * 2);
        vtxCol[i * 3] = flowColor[0];
        vtxCol[i * 3 + 1] = flowColor[1];
        vtxCol[i * 3 + 2] = flowColor[2];
      }
      builder.quad(posScratch, lx, ly, lz, DX[d]!, 0, DZ[d]!, uvScratch, vtxCol, em, false);
    }
  };

  const emitGreedy = (sx: number, sy: number, sz: number) => {
    const size = [sx, sy, sz];
    const coord = [0, 0, 0];
    const from: Vec3 = [0, 0, 0];
    const to: Vec3 = [0, 0, 0];
    for (let d = 0; d < 6; d++) {
      const m = mask[d]!;
      const n = AXIS_N[d]!;
      const t1 = T1[d]!;
      const t2 = T2[d]!;
      const dirName = FACE_DIRS[d]!;
      const idx = () => coord[0]! + cs * (coord[1]! + cs * coord[2]!);
      for (let s = 0; s < size[n]!; s++) {
        coord[n] = s;
        for (let b = 0; b < size[t2]!; b++) {
          for (let a = 0; a < size[t1]!; a++) {
            coord[t1] = a;
            coord[t2] = b;
            const key = m[idx()]!;
            if (key === 0) continue;
            let w = 1;
            while (a + w < size[t1]!) {
              coord[t1] = a + w;
              if (m[idx()] !== key) break;
              w++;
            }
            let h = 1;
            outer: while (b + h < size[t2]!) {
              coord[t2] = b + h;
              for (let k = 0; k < w; k++) {
                coord[t1] = a + k;
                if (m[idx()] !== key) break outer;
              }
              h++;
            }
            for (let hh = 0; hh < h; hh++) {
              coord[t2] = b + hh;
              for (let k = 0; k < w; k++) {
                coord[t1] = a + k;
                m[idx()] = 0;
              }
            }
            from[n] = s;
            to[n] = s + 1;
            from[t1] = a;
            to[t1] = a + w;
            from[t2] = b;
            to[t2] = b + h;
            const corners = faceCorners(from, to, dirName);
            for (let i = 0; i < 4; i++) {
              posScratch[i * 3] = corners[i]![0];
              posScratch[i * 3 + 1] = corners[i]![1];
              posScratch[i * 3 + 2] = corners[i]![2];
            }
            const style = Math.floor((key - 1) / 8);
            const level = (key - 1) % 8;
            const ao = useAO ? AO_LEVELS[level]! : 1;
            for (let i = 0; i < 4; i++) {
              vtxCol[i * 3] = styleColor[style * 3]! * ao;
              vtxCol[i * 3 + 1] = styleColor[style * 3 + 1]! * ao;
              vtxCol[i * 3 + 2] = styleColor[style * 3 + 2]! * ao;
            }
            builders.layers[styleLayer[style]!]!.quad(
              posScratch,
              0,
              0,
              0,
              DX[d]!,
              DY[d]!,
              DZ[d]!,
              zeroUV,
              vtxCol,
              styleEm[style]!,
              false,
            );
            coord[t1] = a;
            coord[t2] = b;
          }
        }
      }
    }
  };

  const neighborLookupAt =
    (x: number, y: number, z: number): NeighborLookup =>
    (dx, dy, dz) => {
      const q = pal(x + dx, y + dy, z + dz);
      return q === OOB ? AIR : volume.palette[q]!;
    };

  for (let oy = 0; oy < H; oy += cs) {
    for (let oz = 0; oz < L; oz += cs) {
      for (let ox = 0; ox < W; ox += cs) {
        const ex = Math.min(W, ox + cs);
        const ey = Math.min(H, oy + cs);
        const ez = Math.min(L, oz + cs);
        for (const b of builders.layers) b.reset();
        builders.water.reset();
        for (let y = oy; y < ey; y++) {
          for (let z = oz; z < ez; z++) {
            let idx = ox + z * W + y * WL;
            for (let x = ox; x < ex; x++, idx++) {
              let p = blocks[idx]!;
              if (p >= paletteLen) p = OOB;
              if (hidden[p]) continue;
              used[p] = 1;
              blockCount++;
              if (x < bmin[0]) bmin[0] = x;
              if (y < bmin[1]) bmin[1] = y;
              if (z < bmin[2]) bmin[2] = z;
              if (x + 1 > bmax[0]) bmax[0] = x + 1;
              if (y + 1 > bmax[1]) bmax[1] = y + 1;
              if (z + 1 > bmax[2]) bmax[2] = z + 1;
              const lx = x - ox;
              const ly = y - oy;
              const lz = z - oz;
              let bm = baked[p];
              if (dyn[p]) {
                const model = resolveBlockModel(volume.palette[p]!, neighborLookupAt(x, y, z));
                bm = model ? bakeModel(model, lookup) : null;
              }
              if (bm && bm.count > 0) emitBaked(bm, p, x, y, z, lx, ly, lz, simplified && !dyn[p]);
              if (fluid[p]) emitLiquid(x, y, z, fluid[p]!, lx, ly, lz);
            }
          }
        }
        if (simplified) emitGreedy(ex - ox, ey - oy, ez - oz);
        const origin: [number, number, number] = [ox, oy, oz];
        for (let li = 0; li < 3; li++) {
          const b = builders.layers[li]!;
          if (b.vertexCount === 0) continue;
          faceCount += b.quadCount;
          meshes.push(b.toBuffers(LAYERS[li]!, false, origin));
        }
        if (builders.water.vertexCount > 0) {
          faceCount += builders.water.quadCount;
          meshes.push(builders.water.toBuffers('translucent', true, origin));
        }
      }
    }
  }

  const unknown = new Set<string>();
  for (let p = 0; p < paletteLen; p++) {
    if (!used[p]) continue;
    const model = models[p];
    const name = normalizeName(volume.palette[p]!.name);
    if ((model && model.unknown) || !isKnownBlock(name)) unknown.add(name);
  }

  const empty = blockCount === 0;
  return {
    meshes,
    bounds: {
      min: empty ? [0, 0, 0] : bmin,
      max: empty ? [0, 0, 0] : bmax,
    },
    stats: { blocks: blockCount, faces: faceCount, unknownBlocks: [...unknown].sort() },
  };
}
