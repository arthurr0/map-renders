import { describe, expect, it } from 'vitest';
import { fitShadowCamera, lightBasis, type ShadowFit } from './shadowFit';
import { sunDirection } from './sun';
import { dot, sub, type Bounds, type Vec3 } from './vec';

const bounds: Bounds = { min: [0, 0, 0], max: [20, 30, 10] };

function lightSpace(fit: ShadowFit, dir: Vec3, p: Vec3) {
  const { right, up } = lightBasis(dir);
  const rel = sub(p, fit.position);
  return { x: dot(rel, right), y: dot(rel, up), d: -dot(rel, dir) };
}

describe('fitShadowCamera', () => {
  it('contains every corner of the bounds', () => {
    const dir = sunDirection(135, 40);
    const fit = fitShadowCamera(bounds, dir, 2048);
    for (let i = 0; i < 8; i++) {
      const p: Vec3 = [i & 1 ? 20 : 0, i & 2 ? 30 : 0, i & 4 ? 10 : 0];
      const s = lightSpace(fit, dir, p);
      expect(s.x).toBeGreaterThanOrEqual(fit.left);
      expect(s.x).toBeLessThanOrEqual(fit.right);
      expect(s.y).toBeGreaterThanOrEqual(fit.bottom);
      expect(s.y).toBeLessThanOrEqual(fit.top);
      expect(s.d).toBeGreaterThanOrEqual(fit.near);
      expect(s.d).toBeLessThanOrEqual(fit.far);
    }
  });

  it('includes the ground area where the shadow falls', () => {
    const dir = sunDirection(180, 30);
    const fit = fitShadowCamera(bounds, dir, 2048, { groundY: 0 });
    const reach = 31 / Math.tan((30 * Math.PI) / 180);
    const tip: Vec3 = [10, 0, -1 - reach + 0.5];
    const s = lightSpace(fit, dir, tip);
    expect(s.x).toBeGreaterThanOrEqual(fit.left);
    expect(s.x).toBeLessThanOrEqual(fit.right);
    expect(s.y).toBeGreaterThanOrEqual(fit.bottom);
    expect(s.y).toBeLessThanOrEqual(fit.top);
    expect(s.d).toBeGreaterThanOrEqual(fit.near);
    expect(s.d).toBeLessThanOrEqual(fit.far);
    const plain = fitShadowCamera(bounds, dir, 2048);
    expect(lightSpace(plain, dir, tip).d).toBeGreaterThan(plain.far);
  });

  it('is tight around the projected box', () => {
    const fit = fitShadowCamera(bounds, sunDirection(180, 89.99), 2048, { padding: 0 });
    const w = fit.right - fit.left;
    const h = fit.top - fit.bottom;
    expect(Math.max(w, h)).toBeLessThan(21);
    expect(Math.min(w, h)).toBeGreaterThan(9.9);
  });

  it('handles a sun straight overhead', () => {
    const fit = fitShadowCamera(bounds, [0, 1, 0], 1024);
    expect(Number.isFinite(fit.left + fit.right + fit.top + fit.bottom)).toBe(true);
    expect(fit.up).toEqual([0, 0, -1]);
  });

  it('scales bias with texel size', () => {
    const dir = sunDirection(135, 45);
    const small = fitShadowCamera(bounds, dir, 4096);
    const large = fitShadowCamera(bounds, dir, 1024);
    expect(large.texelSize).toBeGreaterThan(small.texelSize);
    expect(large.normalBias).toBeGreaterThan(small.normalBias);
    expect(small.bias).toBeLessThanOrEqual(0);
  });
});
