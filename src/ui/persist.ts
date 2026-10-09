import {
  DEFAULT_MESH_OPTIONS,
  DEFAULT_RENDER_SETTINGS,
  type Background,
  type MeshOptions,
  type RenderSettings,
  type SavedShot,
} from '../core';

import { sanitizeSky, sanitizeWater } from './persistEffects';
import { RANGES, numberInRange } from './settingsRanges';

const PREFIX = 'mr:';

export function readJson(key: string): unknown {
  try {
    const raw = globalThis.localStorage.getItem(PREFIX + key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function pick<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function sanitizeBackground(raw: unknown, fallback: Background): Background {
  if (!isRecord(raw)) return fallback;
  switch (raw.type) {
    case 'solid':
      return { type: 'solid', color: color(raw.color, '#1a1c21') };
    case 'gradient':
      return {
        type: 'gradient',
        top: color(raw.top, '#6fa8dc'),
        bottom: color(raw.bottom, '#dbeafe'),
      };
    case 'sky':
      return {
        type: 'sky',
        timeOfDay: numberInRange(raw.timeOfDay, 12, RANGES.timeOfDay),
        turbidity: numberInRange(raw.turbidity, 4, RANGES.turbidity),
      };
    case 'night-sky':
      return { type: 'night-sky', twilight: numberInRange(raw.twilight, 0.2, RANGES.twilight) };
    case 'hdri':
      return {
        type: 'hdri',
        id: typeof raw.id === 'string' ? raw.id : '',
        blur: numberInRange(raw.blur, 0, RANGES.hdriBlur),
        rotation: numberInRange(raw.rotation, 0, RANGES.hdriRotation),
      };
    case 'transparent':
      return { type: 'transparent' };
    default:
      return fallback;
  }
}

export function sanitizeSettings(raw: unknown): RenderSettings {
  const base = DEFAULT_RENDER_SETTINGS;
  if (!isRecord(raw)) return base;
  const sun = isRecord(raw.sun) ? raw.sun : {};
  const ambient = isRecord(raw.ambient) ? raw.ambient : {};
  const shadows = isRecord(raw.shadows) ? raw.shadows : {};
  const ssao = isRecord(raw.ssao) ? raw.ssao : {};
  const bloom = isRecord(raw.bloom) ? raw.bloom : {};
  const fog = isRecord(raw.fog) ? raw.fog : {};
  const grading = isRecord(raw.grading) ? raw.grading : {};
  const vignette = isRecord(raw.vignette) ? raw.vignette : {};
  const dof = isRecord(raw.dof) ? raw.dof : {};
  const glints = isRecord(raw.glints) ? raw.glints : {};
  const godRays = isRecord(raw.godRays) ? raw.godRays : {};
  return {
    textureMode: pick(raw.textureMode, ['textured', 'simplified'] as const, base.textureMode),
    background: sanitizeBackground(raw.background, base.background),
    ground: pick(
      raw.ground,
      ['none', 'shadow-catcher', 'grass', 'grid', 'water'] as const,
      base.ground,
    ),
    water: sanitizeWater(raw.water),
    sky: sanitizeSky(raw.sky),
    sun: {
      azimuth: numberInRange(sun.azimuth, base.sun.azimuth, RANGES.azimuth),
      elevation: numberInRange(sun.elevation, base.sun.elevation, RANGES.elevation),
      intensity: numberInRange(sun.intensity, base.sun.intensity, RANGES.sunIntensity),
      color: color(sun.color, base.sun.color),
    },
    ambient: {
      intensity: numberInRange(ambient.intensity, base.ambient.intensity, RANGES.ambientIntensity),
      color: color(ambient.color, base.ambient.color),
    },
    useBackgroundLighting: bool(raw.useBackgroundLighting, base.useBackgroundLighting),
    shadows: {
      enabled: bool(shadows.enabled, base.shadows.enabled),
      softness: numberInRange(shadows.softness, base.shadows.softness, RANGES.shadowSoftness),
      mapSize: pick(shadows.mapSize, [1024, 2048, 4096] as const, base.shadows.mapSize),
    },
    ssao: {
      enabled: bool(ssao.enabled, base.ssao.enabled),
      intensity: numberInRange(ssao.intensity, base.ssao.intensity, RANGES.ssaoIntensity),
      radius: numberInRange(ssao.radius, base.ssao.radius, RANGES.ssaoRadius),
    },
    bloom: {
      enabled: bool(bloom.enabled, base.bloom.enabled),
      strength: numberInRange(bloom.strength, base.bloom.strength, RANGES.bloomStrength),
      threshold: numberInRange(bloom.threshold, base.bloom.threshold, RANGES.bloomThreshold),
      radius: numberInRange(bloom.radius, base.bloom.radius, RANGES.bloomRadius),
    },
    fog: {
      enabled: bool(fog.enabled, base.fog.enabled),
      density: numberInRange(fog.density, base.fog.density, RANGES.fogDensity),
      color: color(fog.color, base.fog.color),
    },
    grading: {
      enabled: bool(grading.enabled, base.grading.enabled),
      contrast: numberInRange(grading.contrast, base.grading.contrast, RANGES.gradingContrast),
      saturation: numberInRange(
        grading.saturation,
        base.grading.saturation,
        RANGES.gradingSaturation,
      ),
      vibrance: numberInRange(grading.vibrance, base.grading.vibrance, RANGES.gradingVibrance),
      temperature: numberInRange(
        grading.temperature,
        base.grading.temperature,
        RANGES.gradingTemperature,
      ),
      tint: numberInRange(grading.tint, base.grading.tint, RANGES.gradingTint),
      gamma: numberInRange(grading.gamma, base.grading.gamma, RANGES.gradingGamma),
      shadowColor: color(grading.shadowColor, base.grading.shadowColor),
      shadowAmount: numberInRange(
        grading.shadowAmount,
        base.grading.shadowAmount,
        RANGES.gradingTone,
      ),
      highlightColor: color(grading.highlightColor, base.grading.highlightColor),
      highlightAmount: numberInRange(
        grading.highlightAmount,
        base.grading.highlightAmount,
        RANGES.gradingTone,
      ),
      grain: numberInRange(grading.grain, base.grading.grain, RANGES.gradingGrain),
      aberration: numberInRange(
        grading.aberration,
        base.grading.aberration,
        RANGES.gradingAberration,
      ),
    },
    vignette: {
      enabled: bool(vignette.enabled, base.vignette.enabled),
      strength: numberInRange(vignette.strength, base.vignette.strength, RANGES.vignetteStrength),
      softness: numberInRange(vignette.softness, base.vignette.softness, RANGES.vignetteSoftness),
    },
    dof: {
      enabled: bool(dof.enabled, base.dof.enabled),
      autoFocus: bool(dof.autoFocus, base.dof.autoFocus),
      focusDistance: numberInRange(
        dof.focusDistance,
        base.dof.focusDistance,
        RANGES.dofFocusDistance,
      ),
      aperture: numberInRange(dof.aperture, base.dof.aperture, RANGES.dofAperture),
      maxBlur: numberInRange(dof.maxBlur, base.dof.maxBlur, RANGES.dofMaxBlur),
      tiltShift: numberInRange(dof.tiltShift, base.dof.tiltShift, RANGES.dofTiltShift),
    },
    glints: {
      enabled: bool(glints.enabled, base.glints.enabled),
      strength: numberInRange(glints.strength, base.glints.strength, RANGES.glintStrength),
      length: numberInRange(glints.length, base.glints.length, RANGES.glintLength),
      threshold: numberInRange(glints.threshold, base.glints.threshold, RANGES.glintThreshold),
    },
    godRays: {
      enabled: bool(godRays.enabled, base.godRays.enabled),
      strength: numberInRange(godRays.strength, base.godRays.strength, RANGES.godRaysStrength),
      decay: numberInRange(godRays.decay, base.godRays.decay, RANGES.godRaysDecay),
      samples: Math.round(
        numberInRange(godRays.samples, base.godRays.samples, RANGES.godRaysSamples),
      ),
      length: numberInRange(godRays.length, base.godRays.length, RANGES.godRaysLength),
    },
    toneMapping: pick(
      raw.toneMapping,
      ['aces', 'agx', 'neutral', 'none'] as const,
      base.toneMapping,
    ),
    exposure: numberInRange(raw.exposure, base.exposure, RANGES.exposure),
    ambientOcclusionVertex: bool(raw.ambientOcclusionVertex, base.ambientOcclusionVertex),
  };
}

export function meshOptionsFromSettings(
  settings: RenderSettings,
  hideBlocks: string[] = [],
): MeshOptions {
  return {
    ...DEFAULT_MESH_OPTIONS,
    mode: settings.textureMode,
    ambientOcclusion: settings.ambientOcclusionVertex,
    hideBlocks,
  };
}

function vec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [a, b, c] = value as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number' || typeof c !== 'number') return null;
  return [a, b, c];
}

export function sanitizeShots(raw: unknown): SavedShot[] {
  if (!Array.isArray(raw)) return [];
  const shots: SavedShot[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string' || !isRecord(item.camera)) continue;
    const camera = item.camera;
    const position = vec3(camera.position);
    const target = vec3(camera.target);
    if (!position || !target) continue;
    shots.push({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : 'Shot',
      camera: {
        projection: camera.projection === 'orthographic' ? 'orthographic' : 'perspective',
        position,
        target,
        fov: num(camera.fov, 50),
        zoom: num(camera.zoom, 1),
      },
      thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : undefined,
      createdAt: num(item.createdAt, 0),
    });
  }
  return shots;
}

export interface PersistedUi {
  openSections: Record<string, boolean>;
  exportTab: 'image' | 'turntable';
}

export function loadUi(): PersistedUi {
  const raw = readJson('ui');
  const sections: Record<string, boolean> = {};
  if (isRecord(raw) && isRecord(raw.openSections)) {
    for (const [key, value] of Object.entries(raw.openSections)) {
      if (typeof value === 'boolean') sections[key] = value;
    }
  }
  return {
    openSections: sections,
    exportTab: isRecord(raw) && raw.exportTab === 'turntable' ? 'turntable' : 'image',
  };
}

export function shotsKey(fileName: string, width: number, height: number, length: number): string {
  return `shots:${fileName}|${width}x${height}x${length}`;
}
