import { DEFAULT_RENDER_SETTINGS, type SkySettings, type WaterSettings } from '../core';
import { RANGES, numberInRange } from './settingsRanges';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function sanitizeWater(raw: unknown): WaterSettings {
  const base = DEFAULT_RENDER_SETTINGS.water;
  if (!isRecord(raw)) return base;
  return {
    enabled: bool(raw.enabled, base.enabled),
    colorShallow: color(raw.colorShallow, base.colorShallow),
    colorDeep: color(raw.colorDeep, base.colorDeep),
    reflectivity: numberInRange(raw.reflectivity, base.reflectivity, RANGES.waterReflectivity),
    waveHeight: numberInRange(raw.waveHeight, base.waveHeight, RANGES.waterWaveHeight),
    waveScale: numberInRange(raw.waveScale, base.waveScale, RANGES.waterWaveScale),
    wavePhase: numberInRange(raw.wavePhase, base.wavePhase, RANGES.waterWavePhase),
    roughness: numberInRange(raw.roughness, base.roughness, RANGES.waterRoughness),
    sunGlitter: numberInRange(raw.sunGlitter, base.sunGlitter, RANGES.waterSunGlitter),
    shoreGlow: numberInRange(raw.shoreGlow, base.shoreGlow, RANGES.waterShoreGlow),
    level: numberInRange(raw.level, base.level, RANGES.waterLevel),
  };
}

export function sanitizeSky(raw: unknown): SkySettings {
  const base = DEFAULT_RENDER_SETTINGS.sky;
  if (!isRecord(raw)) return base;
  const stars = isRecord(raw.stars) ? raw.stars : {};
  const moon = isRecord(raw.moon) ? raw.moon : {};
  const glow = isRecord(raw.horizonGlow) ? raw.horizonGlow : {};
  return {
    stars: {
      enabled: bool(stars.enabled, base.stars.enabled),
      density: numberInRange(stars.density, base.stars.density, RANGES.starDensity),
      brightness: numberInRange(stars.brightness, base.stars.brightness, RANGES.starBrightness),
    },
    moon: {
      enabled: bool(moon.enabled, base.moon.enabled),
      azimuth: numberInRange(moon.azimuth, base.moon.azimuth, RANGES.moonAzimuth),
      elevation: numberInRange(moon.elevation, base.moon.elevation, RANGES.moonElevation),
      size: numberInRange(moon.size, base.moon.size, RANGES.moonSize),
      glow: numberInRange(moon.glow, base.moon.glow, RANGES.moonGlow),
      color: color(moon.color, base.moon.color),
    },
    horizonGlow: {
      enabled: bool(glow.enabled, base.horizonGlow.enabled),
      intensity: numberInRange(
        glow.intensity,
        base.horizonGlow.intensity,
        RANGES.horizonGlowIntensity,
      ),
      height: numberInRange(glow.height, base.horizonGlow.height, RANGES.horizonGlowHeight),
      color: color(glow.color, base.horizonGlow.color),
    },
  };
}
