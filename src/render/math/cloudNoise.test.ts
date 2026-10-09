import { describe, expect, it } from 'vitest';
import {
  generateDetailNoise,
  generateShapeNoise,
  hash3,
  perlinLattice,
  tilingPerlin,
  tilingWorley,
  worleyCells,
  type CloudNoiseVolume,
} from './cloudNoise';

function at(volume: CloudNoiseVolume, x: number, y: number, z: number): number {
  const n = volume.size;
  return volume.data[(z * n + y) * n + x]!;
}

function seamRatio(volume: CloudNoiseVolume): number {
  const n = volume.size;
  let inner = 0;
  let seam = 0;
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n - 1; x++)
        inner += Math.abs(at(volume, x + 1, y, z) - at(volume, x, y, z));
      seam += Math.abs(at(volume, 0, y, z) - at(volume, n - 1, y, z));
    }
  }
  return seam / (n * n) / (inner / (n * n * (n - 1)));
}

describe('hash3', () => {
  it('is deterministic and stays in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash3(i, i * 7 - 3, i * 13 + 1, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash3(i, i * 7 - 3, i * 13 + 1, 42)).toBe(v);
    }
    expect(hash3(1, 2, 3, 1)).not.toBe(hash3(1, 2, 3, 2));
  });
});

describe('tilingPerlin', () => {
  it('repeats with its period on every axis', () => {
    const lattice = perlinLattice(8, 3);
    for (const [x, y, z] of [
      [0.3, 1.7, 2.2],
      [5.9, 0.1, 7.5],
      [3.33, 6.66, 0.5],
    ] as const) {
      const v = tilingPerlin(lattice, x, y, z);
      expect(tilingPerlin(lattice, x + 8, y, z)).toBeCloseTo(v, 10);
      expect(tilingPerlin(lattice, x, y + 8, z)).toBeCloseTo(v, 10);
      expect(tilingPerlin(lattice, x, y, z - 8)).toBeCloseTo(v, 10);
    }
  });

  it('is zero on lattice points and bounded elsewhere', () => {
    const lattice = perlinLattice(4, 9);
    expect(tilingPerlin(lattice, 2, 3, 1)).toBe(0);
    for (let i = 0; i < 100; i++) {
      const v = tilingPerlin(lattice, i * 0.137, i * 0.291, i * 0.073);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.5);
    }
  });

  it('rounds the period to a power of two', () => {
    expect(perlinLattice(6, 1).period).toBe(8);
    expect(perlinLattice(16, 1).period).toBe(16);
  });
});

describe('tilingWorley', () => {
  it('is continuous across the wrap boundary', () => {
    const grid = worleyCells(4, 5);
    for (const [y, z] of [
      [0.5, 1.5],
      [2.2, 3.9],
      [3.1, 0.2],
    ] as const) {
      const before = tilingWorley(grid, 4 - 1e-6, y, z);
      const after = tilingWorley(grid, 0, y, z);
      expect(Math.abs(before - after)).toBeLessThan(1e-4);
    }
  });

  it('peaks at feature points and stays in [0, 1]', () => {
    const grid = worleyCells(4, 8);
    const px = grid.padded[((1 * 6 + 1) * 6 + 1) * 3]!;
    const py = grid.padded[((1 * 6 + 1) * 6 + 1) * 3 + 1]!;
    const pz = grid.padded[((1 * 6 + 1) * 6 + 1) * 3 + 2]!;
    expect(tilingWorley(grid, px, py, pz)).toBeCloseTo(1, 6);
    for (let i = 0; i < 100; i++) {
      const v = tilingWorley(grid, (i * 0.37) % 4, (i * 0.61) % 4, (i * 0.13) % 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('cloud noise volumes', () => {
  it('fill the full [0, 1] range', () => {
    for (const volume of [generateShapeNoise(16), generateDetailNoise(16)]) {
      expect(volume.size).toBe(16);
      expect(volume.data).toHaveLength(16 ** 3);
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of volume.data) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      expect(lo).toBeCloseTo(0, 6);
      expect(hi).toBeCloseTo(1, 6);
    }
  });

  it('tile without a visible seam', () => {
    expect(seamRatio(generateShapeNoise(16))).toBeLessThan(2);
    expect(seamRatio(generateDetailNoise(16))).toBeLessThan(2);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = generateShapeNoise(8, 3);
    const b = generateShapeNoise(8, 3);
    const c = generateShapeNoise(8, 4);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
  });
});
