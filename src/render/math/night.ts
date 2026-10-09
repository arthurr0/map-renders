import { DEG, clamp, lerp, smoothstep } from './vec';

export const NIGHT_MIN_ELEVATION = -14;
export const NIGHT_MAX_ELEVATION = -3.5;
export const STAR_CELLS = 260;

export function nightSkyElevation(twilight: number): number {
  return lerp(NIGHT_MIN_ELEVATION, NIGHT_MAX_ELEVATION, clamp(twilight, 0, 1));
}

export function starProbability(density: number): number {
  const d = clamp(density, 0, 1);
  return 0.02 * d * d;
}

export function moonRadiusRad(sizeDeg: number): number {
  return Math.max(0.05, sizeDeg) * DEG;
}

export function moonCosRadius(sizeDeg: number): number {
  return Math.cos(moonRadiusRad(sizeDeg));
}

export function twilightAmount(sunElevationDeg: number): number {
  const rise = smoothstep(-14, -4, sunElevationDeg);
  const fall = 1 - smoothstep(2, 10, sunElevationDeg);
  return rise * fall;
}

export function nightVisibility(sunElevationDeg: number): number {
  return 1 - clamp((sunElevationDeg + 8) / 10, 0, 1);
}
