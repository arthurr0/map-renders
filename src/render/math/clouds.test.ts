import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_SETTINGS } from '../../core/defaults';
import type { CloudSettings } from '../../core/types';
import { cloudLayout, cloudSteps } from './clouds';
import type { Bounds } from './vec';

const base: CloudSettings = { ...DEFAULT_RENDER_SETTINGS.clouds, enabled: true };
const map: Bounds = { min: [10, 5, -20], max: [74, 64, 12] };

describe('cloudLayout', () => {
  it('scales the layer with the larger horizontal map size', () => {
    const layout = cloudLayout(map, { ...base, height: 0.25, thickness: 0.5 });
    expect(layout.unit).toBe(64);
    expect(layout.center).toEqual([42, 5, -4]);
    expect(layout.top).toBeCloseTo(5 + 16);
    expect(layout.bottom).toBeCloseTo(5 + 16 - 32);
    expect(layout.mapBottom).toBe(5);
    expect(layout.clearHalf).toEqual([32, 16]);
  });

  it('places the layer below the map for negative heights', () => {
    const layout = cloudLayout(map, { ...base, height: -0.5, thickness: 0.25 });
    expect(layout.top).toBeLessThan(map.min[1]);
    expect(layout.bottom).toBeCloseTo(layout.top - 16);
  });

  it('keeps clouds above a visible ground plane', () => {
    const below = { ...base, height: 0.1, thickness: 1 };
    expect(cloudLayout(map, below, 'grass').bottom).toBe(5);
    expect(cloudLayout(map, below, 'water').bottom).toBe(5);
    expect(cloudLayout(map, below, 'shadow-catcher').bottom).toBeLessThan(5);
    expect(cloudLayout(map, below, 'none').bottom).toBeLessThan(5);
    const buried = cloudLayout(map, { ...base, height: -0.5 }, 'grass');
    expect(buried.bottom).toBeLessThanOrEqual(buried.top);
  });

  it('uses a minimum size for tiny or missing models', () => {
    const tiny = cloudLayout({ min: [0, 0, 0], max: [2, 2, 2] }, base);
    expect(tiny.unit).toBe(16);
    const none = cloudLayout(null, base);
    expect(none.unit).toBe(16);
    expect(none.center).toEqual([0, 0, 0]);
  });

  it('turns density, scale and wind into world units', () => {
    const a = cloudLayout(map, { ...base, density: 1, scale: 1, windOffset: 0 });
    const b = cloudLayout(map, { ...base, density: 2, scale: 2, windOffset: 1 });
    expect(b.extinction).toBeCloseTo(a.extinction * 2);
    expect(b.tileSize).toBeCloseTo(a.tileSize * 2);
    expect(a.wind).toEqual([0, 0]);
    expect(Math.hypot(b.wind[0], b.wind[1])).toBeCloseTo(64, 0);
    expect(cloudLayout(map, { ...base, density: -1 }).extinction).toBe(0);
  });

  it('keeps extinction independent of map size in map units', () => {
    const small = cloudLayout({ min: [0, 0, 0], max: [32, 10, 32] }, base);
    const large = cloudLayout({ min: [0, 0, 0], max: [256, 10, 256] }, base);
    expect(small.extinction * small.unit).toBeCloseTo(large.extinction * large.unit);
    expect(large.farRadius / large.unit).toBeCloseTo(small.farRadius / small.unit);
  });
});

describe('cloudSteps', () => {
  it('adds steps as quality rises', () => {
    const low = cloudSteps('low');
    const medium = cloudSteps('medium');
    const high = cloudSteps('high');
    expect(low.steps).toBeLessThan(medium.steps);
    expect(medium.steps).toBeLessThan(high.steps);
    expect(low.lightSteps).toBeLessThanOrEqual(high.lightSteps);
    expect(low.resolution).toBe(0.5);
    expect(high.resolution).toBe(1);
  });

  it('marches at full resolution for direct exports and half for supersampled ones', () => {
    expect(cloudSteps('low', 1).resolution).toBe(1);
    expect(cloudSteps('medium', 2).resolution).toBe(0.5);
    expect(cloudSteps('high', 4).resolution).toBe(0.5);
    expect(cloudSteps('low', 1).steps).toBeGreaterThanOrEqual(64);
    expect(cloudSteps('high', 1).steps).toBe(cloudSteps('high').steps);
  });
});
