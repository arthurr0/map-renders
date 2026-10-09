import type { AntialiasMode } from './post/pipeline';

export interface RenderOptions {
  antialias: AntialiasMode;
  sunFollowsBackground: boolean;
  skyClouds: number;
  animateWater: boolean;
  maxPixelRatio: number;
  emissiveStrength: number;
  cameraTransitionMs: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  antialias: 'msaa',
  sunFollowsBackground: true,
  skyClouds: 0.3,
  animateWater: false,
  maxPixelRatio: 2,
  emissiveStrength: 2.2,
  cameraTransitionMs: 700,
};
