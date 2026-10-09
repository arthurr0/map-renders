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
  gradingContrast: { min: 0.5, max: 2 },
  gradingSaturation: { min: 0, max: 2 },
  gradingVibrance: { min: -1, max: 1 },
  gradingTemperature: { min: -1, max: 1 },
  gradingTint: { min: -1, max: 1 },
  gradingGamma: { min: 0.5, max: 2 },
  gradingTone: { min: 0, max: 1 },
  gradingGrain: { min: 0, max: 1 },
  gradingAberration: { min: 0, max: 1 },
  vignetteStrength: { min: 0, max: 1 },
  vignetteSoftness: { min: 0, max: 1 },
  dofFocusDistance: { min: 1, max: 500 },
  dofAperture: { min: 0, max: 10 },
  dofMaxBlur: { min: 0, max: 4 },
  dofTiltShift: { min: 0, max: 1 },
  glintStrength: { min: 0, max: 3 },
  glintLength: { min: 0.5, max: 10 },
  glintThreshold: { min: 0.5, max: 20 },
  godRaysStrength: { min: 0, max: 3 },
  godRaysDecay: { min: 0.5, max: 1 },
  godRaysSamples: { min: 16, max: 128 },
  godRaysLength: { min: 0.1, max: 1 },
  timeOfDay: { min: 0, max: 24 },
  turbidity: { min: 1, max: 20 },
  hdriBlur: { min: 0, max: 1 },
  hdriRotation: { min: 0, max: 360 },
  waterReflectivity: { min: 0, max: 1 },
  waterWaveHeight: { min: 0, max: 2 },
  waterWaveScale: { min: 0.25, max: 4 },
  waterWavePhase: { min: 0, max: 100 },
  waterRoughness: { min: 0, max: 1 },
  waterSunGlitter: { min: 0, max: 4 },
  waterShoreGlow: { min: 0, max: 2 },
  waterLevel: { min: -16, max: 128 },
  twilight: { min: 0, max: 1 },
  starDensity: { min: 0, max: 1 },
  starBrightness: { min: 0, max: 4 },
  moonAzimuth: { min: 0, max: 360 },
  moonElevation: { min: -10, max: 90 },
  moonSize: { min: 0.5, max: 12 },
  moonGlow: { min: 0, max: 3 },
  horizonGlowIntensity: { min: 0, max: 2 },
  horizonGlowHeight: { min: 0.05, max: 1 },
} as const satisfies Record<string, Range>;

export function clampToRange(value: number, range: Range): number {
  return Math.min(range.max, Math.max(range.min, value));
}

export function numberInRange(value: unknown, fallback: number, range: Range): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampToRange(value, range);
}
