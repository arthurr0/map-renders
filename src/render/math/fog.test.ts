import { describe, expect, it } from 'vitest';
import { fogRange } from './fog';
import type { Bounds } from './vec';

const small: Bounds = { min: [0, 0, 0], max: [16, 16, 16] };
const large: Bounds = { min: [0, 0, 0], max: [64, 59, 64] };

describe('fogRange', () => {
  it('starts the fog just in front of the model center', () => {
    const range = fogRange(small, [8, 8, 48], 0.006);
    const radius = Math.hypot(16, 16, 16) / 2;
    expect(range.near).toBeCloseTo(40 - radius * 0.25);
    expect(range.far).toBeGreaterThan(range.near);
  });

  it('keeps the haze depth independent of camera distance and scales it with the model', () => {
    const near = fogRange(small, [8, 8, 38], 0.006);
    const far = fogRange(small, [8, 8, 308], 0.006);
    expect(far.far - far.near).toBeCloseTo(near.far - near.near);
    const big = fogRange(large, [32, 29.5, 192], 0.006);
    expect((big.far - big.near) / (near.far - near.near)).toBeGreaterThan(3);
  });

  it('gets thicker as density grows', () => {
    const thin = fogRange(small, [8, 8, 40], 0.002);
    const thick = fogRange(small, [8, 8, 40], 0.05);
    expect(thick.far - thick.near).toBeLessThan(thin.far - thin.near);
  });
});
