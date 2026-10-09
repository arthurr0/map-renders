import {
  add,
  boxCenter,
  boxCorners,
  boxSize,
  cross,
  dot,
  length,
  normalize,
  scale,
  sub,
  type Bounds,
  type Vec3,
} from './vec';

export interface ShadowFit {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  texelSize: number;
  normalBias: number;
  bias: number;
}

export interface ShadowFitOptions {
  groundY?: number;
  padding?: number;
  maxShadowLength?: number;
  softness?: number;
}

export function lightBasis(toSun: Vec3): { right: Vec3; up: Vec3; upHint: Vec3 } {
  const z = normalize(toSun);
  let upHint: Vec3 = [0, 1, 0];
  if (Math.abs(z[1]) > 0.999) upHint = [0, 0, -1];
  const right = normalize(cross(upHint, z));
  const up = cross(z, right);
  return { right, up, upHint };
}

export function shadowCasterPoints(
  bounds: Bounds,
  toSun: Vec3,
  options: ShadowFitOptions = {},
): Vec3[] {
  const pad = options.padding ?? 1;
  const padded: Bounds = {
    min: [bounds.min[0] - pad, bounds.min[1] - pad, bounds.min[2] - pad],
    max: [bounds.max[0] + pad, bounds.max[1] + pad, bounds.max[2] + pad],
  };
  const points = boxCorners(padded);
  const dir = normalize(toSun);
  if (options.groundY !== undefined && dir[1] > 1e-4) {
    const size = boxSize(bounds);
    const maxLen = options.maxShadowLength ?? Math.max(size[0], size[1], size[2]) * 4;
    const gy = options.groundY;
    for (const p of boxCorners(padded)) {
      const h = p[1] - gy;
      if (h <= 0) continue;
      const t = Math.min(h / dir[1], maxLen);
      const q = sub(p, scale(dir, t));
      q[1] = Math.max(q[1], gy);
      points.push(q);
    }
  }
  return points;
}

export function fitShadowCamera(
  bounds: Bounds,
  toSun: Vec3,
  mapSize: number,
  options: ShadowFitOptions = {},
): ShadowFit {
  const dir = normalize(toSun);
  const points = shadowCasterPoints(bounds, dir, options);
  const center = boxCenter(bounds);
  let radius = 0;
  for (const p of points) radius = Math.max(radius, length(sub(p, center)));
  const distance = radius + 10;
  const position = add(center, scale(dir, distance));
  const { right, up, upHint } = lightBasis(dir);
  let left = Infinity;
  let rightE = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  let near = Infinity;
  let far = -Infinity;
  for (const p of points) {
    const rel = sub(p, position);
    const x = dot(rel, right);
    const y = dot(rel, up);
    const d = -dot(rel, dir);
    left = Math.min(left, x);
    rightE = Math.max(rightE, x);
    bottom = Math.min(bottom, y);
    top = Math.max(top, y);
    near = Math.min(near, d);
    far = Math.max(far, d);
  }
  const width = rightE - left;
  const height = top - bottom;
  const extent = Math.max(width, height);
  const texelSize = extent / mapSize;
  const softness = options.softness ?? 1;
  const edge = texelSize * (2 + softness * 2);
  left -= edge;
  rightE += edge;
  bottom -= edge;
  top += edge;
  near = Math.max(0.05, near - 2);
  far = far + 2;
  const normalBias = Math.min(0.08, texelSize * (1.2 + softness * 0.6));
  const bias = -Math.min(0.002, (texelSize * 0.4) / (far - near));
  return {
    position,
    target: center,
    up: upHint,
    left,
    right: rightE,
    top,
    bottom,
    near,
    far,
    texelSize,
    normalBias,
    bias,
  };
}
