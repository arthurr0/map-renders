import { clamp, type Bounds, type Vec3 } from './vec';

export const WATER_BASE_OFFSET = 0.12;
export const WATER_FOAM_BAND = 0.5;
export const WATER_FAR_DEPTH = 64;

export function waterSurfaceY(baseY: number, level: number): number {
  return baseY - WATER_BASE_OFFSET + level;
}

export function mirrorY(v: Vec3, planeY: number): Vec3 {
  return [v[0], 2 * planeY - v[1], v[2]];
}

export function mirrorDirectionY(v: Vec3): Vec3 {
  return [v[0], -v[1], v[2]];
}

export function waterDepthFactor(depth: number, scale: number): number {
  if (!(depth > 0)) return 0;
  return 1 - Math.exp(-depth / Math.max(scale, 1e-4));
}

export function fresnel(cosTheta: number, reflectivity: number): number {
  const c = clamp(cosTheta, 0, 1);
  return clamp(reflectivity * (0.03 + 0.97 * Math.pow(1 - c, 5)) * 1.2, 0, 1);
}

export interface DepthMapLayout {
  x: number;
  z: number;
  sizeX: number;
  sizeZ: number;
  width: number;
  height: number;
  blocksPerTexel: number;
}

export function depthMapLayout(bounds: Bounds, maxTexels = 2048, margin = 3): DepthMapLayout {
  const sizeX = Math.max(1, bounds.max[0] - bounds.min[0] + margin * 2);
  const sizeZ = Math.max(1, bounds.max[2] - bounds.min[2] + margin * 2);
  const longest = Math.max(sizeX, sizeZ);
  const blocksPerTexel = Math.max(0.5, longest / maxTexels);
  return {
    x: bounds.min[0] - margin,
    z: bounds.min[2] - margin,
    sizeX,
    sizeZ,
    width: Math.max(1, Math.ceil(sizeX / blocksPerTexel)),
    height: Math.max(1, Math.ceil(sizeZ / blocksPerTexel)),
    blocksPerTexel,
  };
}

export function reflectionTargetSize(
  width: number,
  height: number,
  scale = 0.5,
  max = 2048,
): [number, number] {
  const w = clamp(Math.round(width * scale), 64, max);
  const h = clamp(Math.round(height * scale), 64, max);
  return [w, h];
}
