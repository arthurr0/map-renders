import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_SETTINGS } from '../../core/defaults';
import {
  cocFraction,
  focusDepth,
  fxMarginPixels,
  glintDivisor,
  gradePixel,
  gradeParams,
  linearDepth,
  luma,
  lumaNormalized,
  smoothstep,
  sunFacingFade,
  vignetteFactor,
  whiteBalanceGain,
} from './effects';
import type { Vec3 } from './vec';

const neutral = () => gradeParams(DEFAULT_RENDER_SETTINGS.grading, [0.3, 0.3, 0.8], [1, 0.85, 0.6]);

describe('whiteBalanceGain', () => {
  it('is identity at neutral', () => {
    const g = whiteBalanceGain(0, 0);
    expect(g[0]).toBeCloseTo(1, 6);
    expect(g[1]).toBeCloseTo(1, 6);
    expect(g[2]).toBeCloseTo(1, 6);
  });

  it('warms with positive temperature and keeps luminance', () => {
    const g = whiteBalanceGain(0.6, 0);
    expect(g[0]).toBeGreaterThan(g[2]);
    expect(luma(g)).toBeCloseTo(1, 6);
  });

  it('shifts green with tint', () => {
    expect(whiteBalanceGain(0, 0.5)[1]).toBeLessThan(whiteBalanceGain(0, -0.5)[1]);
  });
});

describe('gradePixel', () => {
  it('leaves colors untouched with neutral settings', () => {
    for (const c of [
      [0, 0, 0],
      [0.2, 0.5, 0.8],
      [1, 1, 1],
    ] as Vec3[]) {
      const out = gradePixel(c, neutral());
      expect(out[0]).toBeCloseTo(c[0], 5);
      expect(out[1]).toBeCloseTo(c[1], 5);
      expect(out[2]).toBeCloseTo(c[2], 5);
    }
  });

  it('removes color at zero saturation', () => {
    const p = { ...neutral(), saturation: 0 };
    const out = gradePixel([0.8, 0.3, 0.1], p);
    expect(out[0]).toBeCloseTo(out[1], 5);
    expect(out[1]).toBeCloseTo(out[2], 5);
  });

  it('increases contrast around the mid grey', () => {
    const p = { ...neutral(), contrast: 1.5 };
    expect(gradePixel([0.3, 0.3, 0.3], p)[0]).toBeLessThan(0.3);
    expect(gradePixel([0.7, 0.7, 0.7], p)[0]).toBeGreaterThan(0.7);
    expect(gradePixel([0.5, 0.5, 0.5], p)[0]).toBeCloseTo(0.5, 6);
  });

  it('boosts muted colors more than saturated ones with vibrance', () => {
    const p = { ...neutral(), vibrance: 1 };
    const muted = gradePixel([0.5, 0.45, 0.4], p);
    const vivid = gradePixel([0.9, 0.1, 0.1], p);
    const chroma = (c: Vec3) => Math.max(...c) - Math.min(...c);
    expect(chroma(muted) / 0.1).toBeGreaterThan(chroma(vivid) / 0.8);
  });

  it('tints shadows blue without touching bright pixels', () => {
    const p = { ...neutral(), shadowTint: lumaNormalized([0.2, 0.2, 1]), shadowAmount: 1 };
    const dark = gradePixel([0.1, 0.1, 0.1], p);
    expect(dark[2]).toBeGreaterThan(dark[0]);
    const bright = gradePixel([0.95, 0.95, 0.95], p);
    expect(bright[2]).toBeCloseTo(bright[0], 3);
  });

  it('stays inside the display range', () => {
    const p = { ...neutral(), contrast: 2, saturation: 2, vibrance: 1 };
    for (const c of [
      [1, 0, 0],
      [0, 0, 1],
      [0.9, 0.9, 0.9],
    ] as Vec3[]) {
      for (const v of gradePixel(c, p)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('lumaNormalized', () => {
  it('has unit luminance', () => {
    expect(luma(lumaNormalized([0.2, 0.4, 1]))).toBeCloseTo(1, 6);
  });

  it('falls back for black', () => {
    expect(lumaNormalized([0, 0, 0])).toEqual([1, 1, 1]);
  });
});

describe('vignetteFactor', () => {
  it('does not darken the center', () => {
    expect(vignetteFactor(0, 1, 0.5)).toBe(1);
  });

  it('darkens the corners by the strength', () => {
    expect(vignetteFactor(1.1, 0.6, 0.5)).toBeCloseTo(0.4, 6);
  });

  it('is monotonic towards the edge', () => {
    let prev = 1;
    for (let r = 0; r <= 1.2; r += 0.1) {
      const v = vignetteFactor(r, 0.7, 0.6);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('is softer with larger softness', () => {
    expect(vignetteFactor(0.7, 0.5, 0.9)).toBeLessThan(vignetteFactor(0.7, 0.5, 0.1));
  });
});

describe('depth of field', () => {
  it('has no blur at the focus plane', () => {
    expect(cocFraction(30, 30, 3, false)).toBe(0);
    expect(cocFraction(30, 30, 3, true)).toBe(0);
  });

  it('grows with distance from focus and with aperture', () => {
    expect(cocFraction(60, 30, 2, false)).toBeGreaterThan(cocFraction(40, 30, 2, false));
    expect(cocFraction(40, 30, 2, false)).toBeGreaterThan(cocFraction(40, 30, 1, false));
  });

  it('is clamped to one', () => {
    expect(cocFraction(1000, 5, 10, false)).toBe(1);
    expect(cocFraction(0.1, 50, 10, true)).toBe(1);
  });

  it('blurs near objects more than the same distance behind focus', () => {
    expect(cocFraction(20, 30, 2, false)).toBeGreaterThan(cocFraction(40, 30, 2, false));
  });

  it('projects the focus point on the view axis', () => {
    expect(focusDepth([0, 0, 10], [0, 0, -1], [3, 0, -20])).toBeCloseTo(30, 6);
    expect(focusDepth([0, 0, 0], [0, 0, -1], [0, 0, 5])).toBeCloseTo(0.01, 6);
  });

  it('linearizes perspective and orthographic depth', () => {
    expect(linearDepth(0, 0.1, 100, false)).toBeCloseTo(0.1, 6);
    expect(linearDepth(1, 0.1, 100, false)).toBeCloseTo(100, 4);
    expect(linearDepth(0.5, 1, 11, true)).toBeCloseTo(6, 6);
  });
});

describe('sun and glints helpers', () => {
  it('fades god rays out when the sun is behind the camera', () => {
    expect(sunFacingFade(-0.5)).toBe(0);
    expect(sunFacingFade(0.25)).toBe(1);
    expect(sunFacingFade(0.1)).toBeGreaterThan(0);
    expect(sunFacingFade(0.1)).toBeLessThan(1);
  });

  it('picks a larger glint divisor for long streaks', () => {
    expect(glintDivisor(10)).toBe(2);
    expect(glintDivisor(96)).toBe(2);
    expect(glintDivisor(400)).toBe(5);
  });

  it('matches the GLSL smoothstep', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });
});

describe('fxMarginPixels', () => {
  const base = DEFAULT_RENDER_SETTINGS;

  it('is zero with everything off', () => {
    expect(fxMarginPixels(base, 1920, 1080)).toBe(0);
  });

  it('covers the depth of field radius', () => {
    const margin = fxMarginPixels(
      { ...base, dof: { ...base.dof, enabled: true, maxBlur: 2 } },
      1920,
      1000,
    );
    expect(margin).toBeGreaterThanOrEqual(20);
  });

  it('covers the glint streak length', () => {
    const margin = fxMarginPixels(
      { ...base, glints: { ...base.glints, enabled: true, length: 5 } },
      1920,
      2000,
    );
    expect(margin).toBeGreaterThanOrEqual(100);
  });

  it('covers chromatic aberration', () => {
    const margin = fxMarginPixels(
      { ...base, grading: { ...base.grading, enabled: true, aberration: 1 } },
      4000,
      2000,
    );
    expect(margin).toBeGreaterThanOrEqual(20);
  });

  it('ignores disabled effects', () => {
    const margin = fxMarginPixels(
      { ...base, dof: { ...base.dof, enabled: false, maxBlur: 4 } },
      1920,
      1000,
    );
    expect(margin).toBe(0);
  });
});
