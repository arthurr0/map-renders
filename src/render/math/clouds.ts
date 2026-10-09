import type { CloudQuality, CloudSettings, GroundType } from '../../core/types';
import type { Bounds, Vec3 } from './vec';

export interface CloudLayout {
  unit: number;
  center: Vec3;
  bottom: number;
  top: number;
  mapBottom: number;
  clearHalf: [number, number];
  clearMargin: number;
  farRadius: number;
  tileSize: number;
  wind: [number, number];
  extinction: number;
}

export interface CloudSteps {
  steps: number;
  lightSteps: number;
  resolution: number;
}

const DEFAULT_BOUNDS: Bounds = { min: [-8, 0, -8], max: [8, 8, 8] };
const WIND_DIRECTION: [number, number] = [0.83, 0.557];
const MIN_UNIT = 16;

export function cloudLayout(
  bounds: Bounds | null,
  settings: CloudSettings,
  ground: GroundType = 'none',
): CloudLayout {
  const b = bounds ?? DEFAULT_BOUNDS;
  const sx = Math.max(0, b.max[0] - b.min[0]);
  const sz = Math.max(0, b.max[2] - b.min[2]);
  const unit = Math.max(MIN_UNIT, sx, sz);
  const center: Vec3 = [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];
  const top = b.min[1] + settings.height * unit;
  let bottom = top - Math.max(0.02, settings.thickness) * unit;
  const floor = ground !== 'none' && ground !== 'shadow-catcher' ? b.min[1] : -Infinity;
  bottom = Math.max(bottom, floor);
  const clearMargin = unit * 0.035;
  return {
    unit,
    center,
    bottom: Math.min(bottom, top),
    top,
    mapBottom: b.min[1],
    clearHalf: [sx / 2, sz / 2],
    clearMargin,
    farRadius: unit * 7,
    tileSize: unit * 1.6 * Math.max(0.05, settings.scale),
    wind: [
      WIND_DIRECTION[0] * settings.windOffset * unit,
      WIND_DIRECTION[1] * settings.windOffset * unit,
    ],
    extinction: (60 * Math.max(0, settings.density)) / unit,
  };
}

const QUALITY_STEPS: Record<CloudQuality, CloudSteps> = {
  low: { steps: 32, lightSteps: 4, resolution: 0.5 },
  medium: { steps: 80, lightSteps: 5, resolution: 0.5 },
  high: { steps: 112, lightSteps: 6, resolution: 1 },
};

export function cloudSteps(quality: CloudQuality, exportSupersample?: number): CloudSteps {
  const base = QUALITY_STEPS[quality] ?? QUALITY_STEPS.medium;
  if (exportSupersample === undefined) return { ...base };
  const resolution = exportSupersample > 1 ? 0.5 : 1;
  return { ...base, steps: Math.max(base.steps, 64), resolution };
}
