import type { AtlasData, AtlasRegion, RenderLayer, TextureMode } from '../core/types';
import {
  DIR_VEC,
  FACE_DIRS,
  autoUV,
  cornerUVs,
  faceCorners,
  srgbToLinear,
  tintColor,
  type BlockModel,
  type FaceDir,
  type ModelElement,
  type ModelFace,
  type Vec3,
} from '../blocks';

export const LAYER_INDEX: Record<RenderLayer, number> = { opaque: 0, cutout: 1, translucent: 2 };

export const DIR_INDEX: Record<FaceDir, number> = {
  down: 0,
  up: 1,
  north: 2,
  south: 3,
  west: 4,
  east: 5,
};

export interface BakedModel {
  count: number;
  pos: Float32Array;
  uv: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  emissive: Float32Array;
  cull: Int8Array;
  layer: Uint8Array;
  aoDir: Int8Array;
  aoInside: Uint8Array;
  fullFace: Uint8Array;
}

export interface TextureLookup {
  mode: TextureMode;
  atlas: AtlasData;
  missing: Set<string>;
  linearColorCache: Map<string, Vec3>;
}

export function createTextureLookup(atlas: AtlasData, mode: TextureMode): TextureLookup {
  return { mode, atlas, missing: new Set(atlas.missing), linearColorCache: new Map() };
}

export function pickTexture(lookup: TextureLookup, face: ModelFace): string {
  if (!face.fallback || !lookup.missing.has(face.texture)) return face.texture;
  for (const alt of face.fallback)
    if (!lookup.missing.has(alt) && lookup.atlas.regions[alt]) return alt;
  return face.texture;
}

export function linearColor(lookup: TextureLookup, texture: string): Vec3 {
  const cached = lookup.linearColorCache.get(texture);
  if (cached) return cached;
  const c = lookup.atlas.colors[texture];
  const out: Vec3 = c
    ? [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])]
    : [0.5, 0.5, 0.5];
  lookup.linearColorCache.set(texture, out);
  return out;
}

export function linearTint(face: ModelFace): Vec3 {
  if (!face.tint || face.tint === 'none') return [1, 1, 1];
  const c = face.tintColor ?? tintColor(face.tint);
  return [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
}

function upgradeLayer(faceLayer: RenderLayer, region: AtlasRegion | undefined): RenderLayer {
  if (faceLayer === 'cutout' && region && region.layer === 'translucent') return 'translucent';
  return faceLayer;
}

const DEG = Math.PI / 180;

function rotatePoint(p: Vec3, el: ModelElement): Vec3 {
  const r = el.rotation;
  if (!r || r.angle === 0) return p;
  const a = r.angle * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - r.origin[0];
  const y = p[1] - r.origin[1];
  const z = p[2] - r.origin[2];
  let nx = x;
  let ny = y;
  let nz = z;
  if (r.axis === 'x') {
    ny = y * c - z * s;
    nz = y * s + z * c;
  } else if (r.axis === 'y') {
    nx = x * c + z * s;
    nz = -x * s + z * c;
  } else {
    nx = x * c - y * s;
    ny = x * s + y * c;
  }
  if (r.rescale && Math.abs(c) > 1e-6) {
    const k = 1 / Math.abs(c);
    if (r.axis !== 'x') nx *= k;
    if (r.axis !== 'y') ny *= k;
    if (r.axis !== 'z') nz *= k;
  }
  return [nx + r.origin[0], ny + r.origin[1], nz + r.origin[2]];
}

function rotateNormal(n: Vec3, el: ModelElement): Vec3 {
  const r = el.rotation;
  if (!r || r.angle === 0) return n;
  const a = r.angle * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y, z] = n;
  if (r.axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (r.axis === 'y') return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

function isBoundary(el: ModelElement, dir: FaceDir): boolean {
  switch (dir) {
    case 'down':
      return el.from[1] <= 0;
    case 'up':
      return el.to[1] >= 16;
    case 'north':
      return el.from[2] <= 0;
    case 'south':
      return el.to[2] >= 16;
    case 'west':
      return el.from[0] <= 0;
    case 'east':
      return el.to[0] >= 16;
  }
}

function coversFace(el: ModelElement, dir: FaceDir): boolean {
  const [x0, y0, z0] = el.from;
  const [x1, y1, z1] = el.to;
  if (dir === 'up' || dir === 'down') return x0 <= 0 && z0 <= 0 && x1 >= 16 && z1 >= 16;
  if (dir === 'north' || dir === 'south') return x0 <= 0 && y0 <= 0 && x1 >= 16 && y1 >= 16;
  return z0 <= 0 && y0 <= 0 && z1 >= 16 && y1 >= 16;
}

const clamp16 = (v: number) => (v < 0 ? 0 : v > 16 ? 16 : v);

export function bakeModel(model: BlockModel, lookup: TextureLookup): BakedModel {
  let count = 0;
  for (const el of model.elements) for (const d of FACE_DIRS) if (el.faces[d]) count++;
  const out: BakedModel = {
    count: 0,
    pos: new Float32Array(count * 12),
    uv: new Float32Array(count * 8),
    normal: new Float32Array(count * 3),
    color: new Float32Array(count * 3),
    emissive: new Float32Array(count),
    cull: new Int8Array(count),
    layer: new Uint8Array(count),
    aoDir: new Int8Array(count),
    aoInside: new Uint8Array(count),
    fullFace: new Uint8Array(count),
  };
  const simplified = lookup.mode === 'simplified';
  let q = 0;
  for (const el of model.elements) {
    const rotated = !!el.rotation && el.rotation.angle !== 0;
    for (const dir of FACE_DIRS) {
      const face = el.faces[dir];
      if (!face) continue;
      const faceLayer: RenderLayer = face.layer ?? model.layer;
      if (simplified && face.layer === 'cutout' && model.layer === 'opaque') continue;
      const texture = pickTexture(lookup, face);
      const region = lookup.atlas.regions[texture];
      const corners = faceCorners(el.from, el.to, dir);
      const uvs = cornerUVs(face.uv ?? autoUV(el.from, el.to, dir), face.rotation ?? 0);
      for (let i = 0; i < 4; i++) {
        const p = rotatePoint(corners[i]!, el);
        out.pos[q * 12 + i * 3] = p[0] / 16;
        out.pos[q * 12 + i * 3 + 1] = p[1] / 16;
        out.pos[q * 12 + i * 3 + 2] = p[2] / 16;
        if (!simplified && region) {
          const [u, v] = uvs[i]!;
          out.uv[q * 8 + i * 2] = region.u0 + (clamp16(u) / 16) * (region.u1 - region.u0);
          out.uv[q * 8 + i * 2 + 1] = region.v0 + (clamp16(v) / 16) * (region.v1 - region.v0);
        }
      }
      const n = rotateNormal(DIR_VEC[dir], el);
      out.normal[q * 3] = n[0];
      out.normal[q * 3 + 1] = n[1];
      out.normal[q * 3 + 2] = n[2];
      const tint = linearTint(face);
      const base: Vec3 = simplified ? linearColor(lookup, texture) : [1, 1, 1];
      out.color[q * 3] = base[0] * tint[0];
      out.color[q * 3 + 1] = base[1] * tint[1];
      out.color[q * 3 + 2] = base[2] * tint[2];
      out.emissive[q] = face.emissive ?? model.emissive ?? 0;
      out.cull[q] = face.cullface && !rotated ? DIR_INDEX[face.cullface] : -1;
      out.layer[q] = LAYER_INDEX[upgradeLayer(faceLayer, region)];
      out.aoDir[q] = rotated ? -1 : DIR_INDEX[dir];
      const boundary = isBoundary(el, dir);
      out.aoInside[q] = boundary ? 0 : 1;
      out.fullFace[q] = !rotated && boundary && coversFace(el, dir) ? 1 : 0;
      q++;
    }
  }
  out.count = q;
  return out;
}
