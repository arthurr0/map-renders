export interface Range {
  min: number;
  max: number;
}

export const RANGES = {
  azimuth: { min: 0, max: 360 },
  elevation: { min: 0, max: 90 },
  sunIntensity: { min: 0, max: 10 },
  ambientIntensity: { min: 0, max: 3 },
  shadowSoftness: { min: 0, max: 10 },
  ssaoIntensity: { min: 0, max: 4 },
  ssaoRadius: { min: 0, max: 4 },
  bloomStrength: { min: 0, max: 3 },
  bloomThreshold: { min: 0, max: 1 },
  bloomRadius: { min: 0, max: 1 },
  fogDensity: { min: 0, max: 0.1 },
  exposure: { min: 0.1, max: 4 },
  timeOfDay: { min: 0, max: 24 },
  turbidity: { min: 1, max: 20 },
  hdriBlur: { min: 0, max: 1 },
  hdriRotation: { min: 0, max: 360 },
  cloudCoverage: { min: 0, max: 1 },
  cloudDensity: { min: 0, max: 3 },
  cloudHeight: { min: -2, max: 2 },
  cloudThickness: { min: 0.05, max: 2 },
  cloudScale: { min: 0.2, max: 4 },
  cloudWindOffset: { min: 0, max: 10 },
  cloudSunInfluence: { min: 0, max: 3 },
} as const satisfies Record<string, Range>;

export function clampToRange(value: number, range: Range): number {
  return Math.min(range.max, Math.max(range.min, value));
}

export function numberInRange(value: unknown, fallback: number, range: Range): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampToRange(value, range);
}
