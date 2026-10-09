import type { RenderLayer } from '../core/types';
import {
  FACE_DIRS,
  coverageMask,
  FULL_COVERAGE,
  faceArea,
  onBoundary,
  rotateElement,
} from './geometry';
import type { BlockModel, ElementRotation, FaceDir, ModelElement, ModelFace, Vec3 } from './types';

export type FaceInput = string | ModelFace;

export type FaceMap = Partial<Record<FaceDir, FaceInput>>;

export interface Part {
  elements: ModelElement[];
  x?: number;
  y?: number;
  uvlock?: boolean;
}

export interface ModelSpec {
  parts: Part[];
  layer?: RenderLayer;
  emissive?: number;
  cullGroup?: string;
  shadeOccluder?: boolean;
  solid?: boolean;
  liquid?: 'water' | 'lava';
  liquidLevel?: number;
  unknown?: boolean;
  noOcclusion?: boolean;
  occluding?: boolean;
}

export function tex(name: string): string {
  return name.includes('/') ? name : `block/${name}`;
}

export function face(input: FaceInput, extra?: Partial<ModelFace>): ModelFace {
  const base: ModelFace = typeof input === 'string' ? { texture: tex(input) } : { ...input };
  return extra ? { ...base, ...extra } : base;
}

export function el(
  from: Vec3,
  to: Vec3,
  faces: FaceMap,
  opts?: { rotation?: ElementRotation; shade?: boolean },
): ModelElement {
  const out: ModelElement = { from, to, faces: {} };
  for (const dir of FACE_DIRS) {
    const f = faces[dir];
    if (f !== undefined) out.faces[dir] = face(f);
  }
  if (opts?.rotation) out.rotation = opts.rotation;
  if (opts?.shade === false) out.shade = false;
  return out;
}

export function all(input: FaceInput, extra?: Partial<ModelFace>): FaceMap {
  const f = face(input, extra);
  return { down: f, up: f, north: f, south: f, west: f, east: f };
}

export function box(from: Vec3, to: Vec3, input: FaceInput | FaceMap): ModelElement {
  if (typeof input === 'string' || 'texture' in input) return el(from, to, all(input as FaceInput));
  return el(from, to, input);
}

export function part(elements: ModelElement[], x = 0, y = 0, uvlock = false): Part {
  return { elements, x, y, uvlock };
}

export function single(elements: ModelElement[], opts: Omit<ModelSpec, 'parts'> = {}): ModelSpec {
  return { parts: [{ elements }], ...opts };
}

export function finalize(spec: ModelSpec): BlockModel {
  const elements: ModelElement[] = [];
  for (const p of spec.parts) {
    for (const e of p.elements) {
      const r = rotateElement(e, p.x ?? 0, p.y ?? 0, p.uvlock ?? false);
      elements.push({ ...r, faces: { ...r.faces } });
    }
  }
  const layer: RenderLayer = spec.layer ?? 'opaque';
  for (const e of elements) {
    const rotated = !!e.rotation && e.rotation.angle !== 0;
    for (const dir of FACE_DIRS) {
      const f = e.faces[dir];
      if (!f) continue;
      if (faceArea(e.from, e.to, dir) <= 1e-6) {
        delete e.faces[dir];
        continue;
      }
      if (!rotated && f.cullface === undefined && onBoundary(e.from, e.to, dir)) {
        e.faces[dir] = { ...f, cullface: dir };
      }
      if (rotated && f.cullface !== undefined) {
        const copy = { ...f };
        delete copy.cullface;
        e.faces[dir] = copy;
      }
    }
  }
  let fullCube = false;
  for (const e of elements) {
    if (e.rotation && e.rotation.angle !== 0) continue;
    if (
      e.from[0] <= 0 &&
      e.from[1] <= 0 &&
      e.from[2] <= 0 &&
      e.to[0] >= 16 &&
      e.to[1] >= 16 &&
      e.to[2] >= 16 &&
      FACE_DIRS.every((d) => !!e.faces[d])
    ) {
      fullCube = true;
      break;
    }
  }
  const occludes: Partial<Record<FaceDir, boolean>> = {};
  const coverage: Partial<Record<FaceDir, number>> = {};
  if ((layer === 'opaque' || spec.occluding) && !spec.noOcclusion) {
    const opaqueElements = elements.filter((e) =>
      FACE_DIRS.every((d) => {
        const f = e.faces[d];
        return !f || f.layer === undefined || f.layer === 'opaque' || !!spec.occluding;
      }),
    );
    for (const dir of FACE_DIRS) {
      const mask = coverageMask(opaqueElements, dir);
      if (mask) coverage[dir] = mask;
      if (mask === FULL_COVERAGE) occludes[dir] = true;
    }
  }
  const model: BlockModel = {
    elements,
    layer,
    fullCube,
    occludes,
    coverage,
    shadeOccluder: spec.shadeOccluder ?? fullCube,
    solid: spec.solid ?? (elements.length > 0 && (layer === 'opaque' || fullCube)),
  };
  if (spec.liquid) model.liquid = spec.liquid;
  if (spec.liquidLevel !== undefined) model.liquidLevel = spec.liquidLevel;
  if (spec.emissive) model.emissive = spec.emissive;
  if (spec.cullGroup) model.cullGroup = spec.cullGroup;
  if (spec.unknown) model.unknown = true;
  return model;
}
