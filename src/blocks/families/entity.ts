import { el, part, type Part } from '../build';
import type { FaceDir, ModelElement, ModelFace, Vec3 } from '../types';

export interface TexSize {
  w: number;
  h: number;
}

type Rect = [number, number, number, number];

function scale(r: Rect, size: TexSize): [number, number, number, number] {
  return [(r[0] * 16) / size.w, (r[1] * 16) / size.h, (r[2] * 16) / size.w, (r[3] * 16) / size.h];
}

export interface BoxUV {
  u: number;
  v: number;
  dx: number;
  dy: number;
  dz: number;
}

export function boxFaceRects(b: BoxUV): Record<FaceDir, Rect> {
  const { u, v, dx, dy, dz } = b;
  return {
    up: [u + dz + dx, v + dz, u + dz, v],
    down: [u + dz + 2 * dx, v + dz, u + dz + dx, v],
    north: [u + dz, v + dz, u + dz + dx, v + dz + dy],
    east: [u, v + dz, u + dz, v + dz + dy],
    west: [u + dz + dx, v + dz, u + 2 * dz + dx, v + dz + dy],
    south: [u + 2 * dz + dx, v + dz, u + 2 * dz + 2 * dx, v + dz + dy],
  };
}

export function entityBox(
  from: Vec3,
  to: Vec3,
  texture: string,
  size: TexSize,
  b: BoxUV,
  only?: FaceDir[],
  extra?: Partial<ModelFace>,
): ModelElement {
  const rects = boxFaceRects(b);
  const faces: Partial<Record<FaceDir, ModelFace>> = {};
  for (const dir of only ?? (Object.keys(rects) as FaceDir[])) {
    faces[dir] = { texture, uv: scale(rects[dir], size), ...extra };
  }
  return el(from, to, faces);
}

export function rect(
  texture: string,
  size: TexSize,
  r: Rect,
  extra?: Partial<ModelFace>,
): ModelFace {
  return { texture, uv: scale(r, size), ...extra };
}

export function yawParts(elements: ModelElement[], degrees: number): Part[] {
  const d = ((degrees % 360) + 360) % 360;
  const steps = Math.floor(d / 90) * 90;
  const rem = d - steps;
  if (rem === 0) return [part(elements, 0, steps)];
  const rotated = elements.map((e) =>
    e.rotation
      ? e
      : { ...e, rotation: { origin: [8, 8, 8] as Vec3, axis: 'y' as const, angle: -rem } },
  );
  return [part(rotated, 0, steps)];
}
