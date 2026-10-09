import type { ExportOptions, MeshOptions, RenderSettings } from './types';

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  textureMode: 'textured',
  background: { type: 'gradient', top: '#6fa8dc', bottom: '#dbeafe' },
  ground: 'none',
  sun: { azimuth: 135, elevation: 45, intensity: 2.5, color: '#fff4e0' },
  ambient: { intensity: 0.6, color: '#cfe3ff' },
  useBackgroundLighting: false,
  shadows: { enabled: true, softness: 1, mapSize: 2048 },
  ssao: { enabled: false, intensity: 1, radius: 0.5 },
  bloom: { enabled: false, strength: 0.3, threshold: 0.9, radius: 0.4 },
  fog: { enabled: false, density: 0.01, color: '#dbeafe' },
  toneMapping: 'neutral',
  exposure: 1,
  ambientOcclusionVertex: true,
  clouds: {
    enabled: false,
    coverage: 0.6,
    density: 1,
    height: 0.15,
    thickness: 0.6,
    scale: 1,
    windOffset: 0,
    sunInfluence: 1,
    color: '#ffffff',
    shadowColor: '#8f9cc8',
    quality: 'medium',
  },
};

export const DEFAULT_MESH_OPTIONS: MeshOptions = {
  mode: 'textured',
  ambientOcclusion: true,
  chunkSize: 32,
  hideBlocks: [],
};

export interface ResolutionPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '720p', label: '720p (1280x720)', width: 1280, height: 720 },
  { id: '1080p', label: '1080p (1920x1080)', width: 1920, height: 1080 },
  { id: '1440p', label: '1440p (2560x1440)', width: 2560, height: 1440 },
  { id: '4k', label: '4K (3840x2160)', width: 3840, height: 2160 },
  { id: '8k', label: '8K (7680x4320)', width: 7680, height: 4320 },
  { id: 'square-2048', label: 'Square 2048', width: 2048, height: 2048 },
  { id: 'square-4096', label: 'Square 4096', width: 4096, height: 4096 },
  { id: 'portrait-1080', label: 'Portrait 1080x1920', width: 1080, height: 1920 },
];

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080,
  supersample: 1,
  transparent: false,
  format: 'png',
  quality: 0.92,
};
