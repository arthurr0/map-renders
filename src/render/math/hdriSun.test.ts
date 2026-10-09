import { describe, expect, it } from 'vitest';
import { equirectPixelToDirection, findBrightestDirection, rotateY } from './hdriSun';

describe('equirectPixelToDirection', () => {
  it('maps the top row to up and the middle to the horizon', () => {
    expect(equirectPixelToDirection(10, 0, 64, 32)[1]).toBeGreaterThan(0.99);
    expect(Math.abs(equirectPixelToDirection(10, 15.5, 64, 32)[1])).toBeLessThan(1e-9);
  });

  it('matches the three.js equirect uv convention', () => {
    const d = equirectPixelToDirection(47.5, 15.5, 64, 32);
    const u = Math.atan2(d[2], d[0]) / (2 * Math.PI) + 0.5;
    expect(u).toBeCloseTo(48 / 64, 6);
  });
});

describe('findBrightestDirection', () => {
  it('finds a bright spot in the upper hemisphere', () => {
    const w = 128;
    const h = 64;
    const lum = new Float32Array(w * h).fill(0.2);
    lum[90 + 20 * w] = 500;
    lum[91 + 20 * w] = 400;
    lum[10 + 60 * w] = 1000;
    const spot = findBrightestDirection(lum, w, h);
    const expected = equirectPixelToDirection(90.4, 20, w, h);
    expect(spot.direction[0]).toBeCloseTo(expected[0], 1);
    expect(spot.direction[1]).toBeCloseTo(expected[1], 1);
    expect(spot.direction[2]).toBeCloseTo(expected[2], 1);
    expect(spot.peak).toBe(500);
  });
});

describe('rotateY', () => {
  it('rotates +X towards -Z for a positive angle', () => {
    const r = rotateY([1, 0, 0], Math.PI / 2);
    expect(r[0]).toBeCloseTo(0);
    expect(r[2]).toBeCloseTo(-1);
  });
});
