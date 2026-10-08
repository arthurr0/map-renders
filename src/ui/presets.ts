import { DEFAULT_RENDER_SETTINGS, type RenderSettings } from '../core';

export interface StylePreset {
  id: string;
  label: string;
  description: string;
  settings: Partial<RenderSettings>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'clean-studio',
    label: 'Clean studio',
    description: 'Soft light on a neutral backdrop with a shadow on the floor.',
    settings: {
      background: { type: 'gradient', top: '#f4f5f7', bottom: '#c9ced6' },
      ground: 'shadow-catcher',
      sun: { azimuth: 140, elevation: 55, intensity: 2.2, color: '#ffffff' },
      ambient: { intensity: 0.9, color: '#ffffff' },
      shadows: { enabled: true, softness: 3, mapSize: 2048 },
      ssao: { enabled: true, intensity: 1, radius: 0.6 },
      bloom: { enabled: false, strength: 0.3, threshold: 0.9, radius: 0.4 },
      fog: { enabled: false, density: 0.01, color: '#e5e7eb' },
      toneMapping: 'neutral',
      exposure: 1,
    },
  },
  {
    id: 'golden-hour',
    label: 'Golden hour',
    description: 'Low warm sun, long shadows and a gentle glow.',
    settings: {
      background: { type: 'sky', timeOfDay: 17.5, turbidity: 6 },
      ground: 'grass',
      sun: { azimuth: 250, elevation: 14, intensity: 3.4, color: '#ffb866' },
      ambient: { intensity: 0.45, color: '#ffd9b0' },
      useBackgroundLighting: false,
      shadows: { enabled: true, softness: 2, mapSize: 4096 },
      ssao: { enabled: true, intensity: 1, radius: 0.5 },
      bloom: { enabled: true, strength: 0.25, threshold: 0.85, radius: 0.5 },
      fog: { enabled: true, density: 0.006, color: '#f6c590' },
      toneMapping: 'agx',
      exposure: 1.05,
    },
  },
  {
    id: 'overcast',
    label: 'Overcast',
    description: 'Flat grey sky with soft, even light.',
    settings: {
      background: { type: 'gradient', top: '#aeb6bf', bottom: '#dfe3e8' },
      ground: 'grass',
      sun: { azimuth: 135, elevation: 60, intensity: 1.1, color: '#e8eef5' },
      ambient: { intensity: 1.2, color: '#d7dde5' },
      shadows: { enabled: true, softness: 5, mapSize: 2048 },
      ssao: { enabled: true, intensity: 1.2, radius: 0.7 },
      bloom: { enabled: false, strength: 0.3, threshold: 0.9, radius: 0.4 },
      fog: { enabled: true, density: 0.008, color: '#cfd5dc' },
      toneMapping: 'neutral',
      exposure: 1,
    },
  },
  {
    id: 'night-lanterns',
    label: 'Night with lanterns',
    description: 'Dark blue night where light sources glow.',
    settings: {
      background: { type: 'gradient', top: '#050816', bottom: '#1b2447' },
      ground: 'grass',
      sun: { azimuth: 200, elevation: 30, intensity: 0.35, color: '#8fa8ff' },
      ambient: { intensity: 0.25, color: '#5a6fb5' },
      shadows: { enabled: true, softness: 2, mapSize: 2048 },
      ssao: { enabled: true, intensity: 1.3, radius: 0.5 },
      bloom: { enabled: true, strength: 0.9, threshold: 0.6, radius: 0.7 },
      fog: { enabled: true, density: 0.012, color: '#0d1430' },
      toneMapping: 'aces',
      exposure: 1.2,
    },
  },
  {
    id: 'blueprint',
    label: 'Blueprint simplified',
    description: 'Flat colors on a blueprint blue grid.',
    settings: {
      textureMode: 'simplified',
      background: { type: 'solid', color: '#12337a' },
      ground: 'grid',
      sun: { azimuth: 135, elevation: 50, intensity: 2, color: '#ffffff' },
      ambient: { intensity: 1, color: '#ffffff' },
      shadows: { enabled: false, softness: 1, mapSize: 2048 },
      ssao: { enabled: true, intensity: 0.8, radius: 0.5 },
      bloom: { enabled: false, strength: 0.3, threshold: 0.9, radius: 0.4 },
      fog: { enabled: false, density: 0.01, color: '#12337a' },
      toneMapping: 'none',
      exposure: 1,
    },
  },
];

export function applyPreset(current: RenderSettings, preset: StylePreset): RenderSettings {
  return {
    ...DEFAULT_RENDER_SETTINGS,
    ...preset.settings,
    textureMode: preset.settings.textureMode ?? current.textureMode,
    ambientOcclusionVertex: current.ambientOcclusionVertex,
  };
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isValidRenderSettings(s: RenderSettings): boolean {
  const colors = [s.sun.color, s.ambient.color, s.fog.color];
  if (s.background.type === 'solid') colors.push(s.background.color);
  if (s.background.type === 'gradient') colors.push(s.background.top, s.background.bottom);
  if (!colors.every((c) => HEX.test(c))) return false;
  if (s.background.type === 'sky') {
    if (!inRange(s.background.timeOfDay, 0, 24)) return false;
    if (!inRange(s.background.turbidity, 1, 20)) return false;
  }
  return (
    ['textured', 'simplified'].includes(s.textureMode) &&
    ['none', 'shadow-catcher', 'grass', 'grid', 'water'].includes(s.ground) &&
    ['aces', 'agx', 'neutral', 'none'].includes(s.toneMapping) &&
    [1024, 2048, 4096].includes(s.shadows.mapSize) &&
    inRange(s.sun.azimuth, 0, 360) &&
    inRange(s.sun.elevation, 0, 90) &&
    inRange(s.sun.intensity, 0, 10) &&
    inRange(s.ambient.intensity, 0, 3) &&
    inRange(s.shadows.softness, 0, 10) &&
    inRange(s.ssao.intensity, 0, 4) &&
    inRange(s.ssao.radius, 0, 4) &&
    inRange(s.bloom.strength, 0, 3) &&
    inRange(s.bloom.threshold, 0, 1) &&
    inRange(s.bloom.radius, 0, 1) &&
    inRange(s.fog.density, 0, 0.1) &&
    inRange(s.exposure, 0.1, 4)
  );
}
