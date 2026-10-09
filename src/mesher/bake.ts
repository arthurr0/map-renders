import type { AtlasData, AtlasRegion, RenderLayer, TextureMode } from '../core/types';
import {
  DIR_VEC,
  FACE_DIRS,
  FULL_COVERAGE,
  autoUV,
  cornerUVs,
  faceCorners,
  faceCoverageRect,
  onBoundary,
  rectCells,
  srgbToLinear,
  tintColor,
  type BlockModel,
  type FaceDir,
  type ModelElement,
  type ModelFace,
  type Vec3,
} from '../blocks';

export const LAYER_INDEX: Record<RenderLayer, number> = { opaque: 0, cutout: 1, translucent: 2 };

export const DIR_INDEX = Object.fromEntries(FACE_DIRS.map((d, i) => [d, i])) as Record<
  FaceDir,
  number
>;

export interface BakedModel {
  count: number;
  pos: Float32Array;
  uv: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  emissive: Float32Array;
  cull: Int8Array;
  cullMask: Uint16Array;
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

function rotateAround(p: Vec3, el: ModelElement, scale: boolean): Vec3 {
  const r = el.rotation;
  if (!r || r.angle === 0) return p;
  const a = r.angle * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = scale ? r.origin : ([0, 0, 0] as Vec3);
  const x = p[0] - o[0];
  const y = p[1] - o[1];
  const z = p[2] - o[2];
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
  if (scale && r.rescale && Math.abs(c) > 1e-6) {
    const k = 1 / Math.abs(c);
    if (r.axis !== 'x') nx *= k;
    if (r.axis !== 'y') ny *= k;
    if (r.axis !== 'z') nz *= k;
  }
  return [nx + o[0], ny + o[1], nz + o[2]];
}

function coversFace(el: ModelElement, dir: FaceDir): boolean {
  const [a0, b0, a1, b1] = faceCoverageRect(el.from, el.to, dir);
  return a0 <= 0 && b0 <= 0 && a1 >= 16 && b1 >= 16;
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
    cullMask: new Uint16Array(count),
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
        const p = rotateAround(corners[i]!, el, true);
        out.pos[q * 12 + i * 3] = p[0] / 16;
        out.pos[q * 12 + i * 3 + 1] = p[1] / 16;
        out.pos[q * 12 + i * 3 + 2] = p[2] / 16;
        if (!simplified && region) {
          const [u, v] = uvs[i]!;
          out.uv[q * 8 + i * 2] = region.u0 + (clamp16(u) / 16) * (region.u1 - region.u0);
          out.uv[q * 8 + i * 2 + 1] = region.v0 + (clamp16(v) / 16) * (region.v1 - region.v0);
        }
      }
      const n = rotateAround(DIR_VEC[dir], el, false);
      out.normal[q * 3] = n[0];
      out.normal[q * 3 + 1] = n[1];
      out.normal[q * 3 + 2] = n[2];
      const tint = linearTint(face);
      const base: Vec3 = simplified ? linearColor(lookup, texture) : [1, 1, 1];
      out.color[q * 3] = base[0] * tint[0];
      out.color[q * 3 + 1] = base[1] * tint[1];
      out.color[q * 3 + 2] = base[2] * tint[2];
      out.emissive[q] = face.emissive ?? model.emissive ?? 0;
      const cull = face.cullface && !rotated ? DIR_INDEX[face.cullface] : -1;
      out.cull[q] = cull;
      if (cull >= 0) {
        const [a0, b0, a1, b1] = faceCoverageRect(el.from, el.to, dir);
        out.cullMask[q] = face.cullface === dir ? rectCells(a0, b0, a1, b1) : FULL_COVERAGE;
      }
      out.layer[q] = LAYER_INDEX[upgradeLayer(faceLayer, region)];
      out.aoDir[q] = rotated ? -1 : DIR_INDEX[dir];
      const boundary = onBoundary(el.from, el.to, dir);
      out.aoInside[q] = boundary ? 0 : 1;
      out.fullFace[q] = !rotated && boundary && coversFace(el, dir) ? 1 : 0;
      q++;
    }
  }
  out.count = q;
  return out;
}
