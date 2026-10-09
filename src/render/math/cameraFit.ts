import type { CameraState, Projection } from '../../core/types';
import {
  DEG,
  add,
  boxCenter,
  boxCorners,
  cross,
  dot,
  length,
  normalize,
  scale,
  sub,
  type Bounds,
  type Vec3,
} from './vec';

export type CameraPreset = 'iso' | 'front' | 'side' | 'top' | 'three-quarter';

export const ISO_ELEVATION = Math.atan(1 / Math.SQRT2) / DEG;

export function presetDirection(preset: CameraPreset): Vec3 {
  switch (preset) {
    case 'iso':
      return normalize([1, 1, 1]);
    case 'front':
      return [0, 0, 1];
    case 'side':
      return [1, 0, 0];
    case 'top':
      return normalize([0, 1, 0.0001]);
    case 'three-quarter': {
      const az = 35 * DEG;
      const el = 24 * DEG;
      return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    }
  }
}

export function presetProjection(preset: CameraPreset, current: Projection): Projection {
  return preset === 'iso' ? 'orthographic' : current;
}

export function viewBasis(dirToCamera: Vec3): { right: Vec3; up: Vec3; forward: Vec3 } {
  const z = normalize(dirToCamera);
  let upHint: Vec3 = [0, 1, 0];
  if (Math.abs(z[1]) > 0.9999) upHint = [0, 0, -1];
  const right = normalize(cross(upHint, z));
  const up = cross(z, right);
  return { right, up, forward: scale(z, -1) };
}

export function orthoVisibleHeight(state: CameraState): number {
  const d = length(sub(state.position, state.target));
  return (2 * d * Math.tan((state.fov * DEG) / 2)) / Math.max(1e-6, state.zoom);
}

export interface FitOptions {
  margin?: number;
}

export function fitCameraToBounds(
  bounds: Bounds,
  dirToCamera: Vec3,
  projection: Projection,
  fov: number,
  aspect: number,
  options: FitOptions = {},
): CameraState {
  const margin = options.margin ?? 1.12;
  const center = boxCenter(bounds);
  const { right, up } = viewBasis(dirToCamera);
  const z = normalize(dirToCamera);
  const corners = boxCorners(bounds).map((p) => sub(p, center));
  const tanV = Math.tan((fov * DEG) / 2);
  const tanH = tanV * aspect;
  let radius = 0;
  for (const c of corners) radius = Math.max(radius, length(c));
  radius = Math.max(radius, 1);

  if (projection === 'perspective') {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      minX = Math.min(minX, dot(c, right));
      maxX = Math.max(maxX, dot(c, right));
      minY = Math.min(minY, dot(c, up));
      maxY = Math.max(maxY, dot(c, up));
    }
    const shift = add(scale(right, (minX + maxX) / 2), scale(up, (minY + maxY) / 2));
    const target = add(center, shift);
    let distance = 0;
    for (const c0 of corners) {
      const c = sub(c0, shift);
      const depth = dot(c, z);
      const x = Math.abs(dot(c, right)) * margin;
      const y = Math.abs(dot(c, up)) * margin;
      distance = Math.max(distance, depth + x / tanH, depth + y / tanV);
    }
    distance = Math.max(distance, 1);
    return {
      projection,
      position: add(target, scale(z, distance)),
      target,
      fov,
      zoom: 1,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, dot(c, right));
    maxX = Math.max(maxX, dot(c, right));
    minY = Math.min(minY, dot(c, up));
    maxY = Math.max(maxY, dot(c, up));
  }
  const halfW = (maxX - minX) / 2;
  const halfH = (maxY - minY) / 2;
  const target = add(center, add(scale(right, (minX + maxX) / 2), scale(up, (minY + maxY) / 2)));
  const visibleHeight = Math.max(halfH, halfW / aspect) * 2 * margin;
  const distance = radius * 3 + 10;
  const zoom = (2 * distance * tanV) / visibleHeight;
  return {
    projection,
    position: add(target, scale(z, distance)),
    target,
    fov,
    zoom,
  };
}

export function fitPreset(
  preset: CameraPreset,
  bounds: Bounds,
  currentProjection: Projection,
  fov: number,
  aspect: number,
): CameraState {
  return fitCameraToBounds(
    bounds,
    presetDirection(preset),
    presetProjection(preset, currentProjection),
    fov,
    aspect,
  );
}

export function projectToScreen(state: CameraState, aspect: number, point: Vec3): [number, number] {
  const z = normalize(sub(state.position, state.target));
  const { right, up } = viewBasis(z);
  const rel = sub(point, state.position);
  const x = dot(rel, right);
  const y = dot(rel, up);
  const depth = -dot(rel, z);
  const tanV = Math.tan((state.fov * DEG) / 2);
  if (state.projection === 'perspective') {
    return [x / (depth * tanV * aspect), y / (depth * tanV)];
  }
  const h = orthoVisibleHeight(state) / 2;
  return [x / (h * aspect), y / h];
}
