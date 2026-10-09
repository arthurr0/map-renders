import { describe, expect, it } from 'vitest';
import {
  depthMapLayout,
  fresnel,
  mirrorDirectionY,
  mirrorY,
  reflectionTargetSize,
  waterDepthFactor,
  waterSurfaceY,
} from './water';

describe('water math', () => {
  it('places the surface just under the base and lifts it with the level', () => {
    expect(waterSurfaceY(10, 0)).toBeCloseTo(9.88);
    expect(waterSurfaceY(10, 5)).toBeCloseTo(14.88);
  });

  it('mirrors points and directions across the surface', () => {
    expect(mirrorY([1, 7, 3], 4)).toEqual([1, 1, 3]);
    expect(mirrorDirectionY([0.2, -0.5, 0.1])).toEqual([0.2, 0.5, 0.1]);
  });

  it('turns depth into a monotonic 0 to 1 factor', () => {
    expect(waterDepthFactor(0, 5)).toBe(0);
    expect(waterDepthFactor(-3, 5)).toBe(0);
    const a = waterDepthFactor(2, 5);
    const b = waterDepthFactor(10, 5);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(1);
  });

  it('raises fresnel toward grazing angles and scales with reflectivity', () => {
    expect(fresnel(1, 0.5)).toBeLessThan(fresnel(0.1, 0.5));
    expect(fresnel(0.3, 0)).toBe(0);
    expect(fresnel(0.3, 1)).toBeGreaterThan(fresnel(0.3, 0.4));
    expect(fresnel(0, 1)).toBeLessThanOrEqual(1);
  });

  it('lays out the depth map around the bounds within the texel budget', () => {
    const layout = depthMapLayout({ min: [10, 0, 20], max: [74, 40, 84] }, 2048, 3);
    expect(layout.x).toBe(7);
    expect(layout.z).toBe(17);
    expect(layout.sizeX).toBe(70);
    expect(layout.width).toBe(140);
    const big = depthMapLayout({ min: [0, 0, 0], max: [4000, 40, 1000] }, 2048, 3);
    expect(big.width).toBeLessThanOrEqual(2048);
    expect(big.blocksPerTexel).toBeGreaterThan(1);
  });

  it('keeps the reflection target within sane limits', () => {
    expect(reflectionTargetSize(1920, 1080)).toEqual([960, 540]);
    expect(reflectionTargetSize(10, 10)).toEqual([64, 64]);
    expect(reflectionTargetSize(16000, 9000)[0]).toBe(2048);
  });
});
