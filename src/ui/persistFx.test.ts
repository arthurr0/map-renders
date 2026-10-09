import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_SETTINGS } from '../core';
import { sanitizeSettings } from './persist';

describe('sanitizeSettings post effects', () => {
  it('keeps defaults when fields are missing', () => {
    const out = sanitizeSettings({});
    expect(out.grading).toEqual(DEFAULT_RENDER_SETTINGS.grading);
    expect(out.vignette).toEqual(DEFAULT_RENDER_SETTINGS.vignette);
    expect(out.dof).toEqual(DEFAULT_RENDER_SETTINGS.dof);
    expect(out.glints).toEqual(DEFAULT_RENDER_SETTINGS.glints);
    expect(out.godRays).toEqual(DEFAULT_RENDER_SETTINGS.godRays);
  });

  it('ships every new effect disabled', () => {
    const s = DEFAULT_RENDER_SETTINGS;
    expect(s.grading.enabled).toBe(false);
    expect(s.vignette.enabled).toBe(false);
    expect(s.dof.enabled).toBe(false);
    expect(s.glints.enabled).toBe(false);
    expect(s.godRays.enabled).toBe(false);
  });

  it('clamps numbers and rejects invalid values', () => {
    const out = sanitizeSettings({
      grading: { enabled: true, contrast: 99, saturation: -4, shadowColor: 'red', grain: 'x' },
      vignette: { enabled: true, strength: 5, softness: -1 },
      dof: { enabled: true, autoFocus: 'yes', focusDistance: 1e9, aperture: 3 },
      glints: { enabled: true, length: 0, threshold: 100 },
      godRays: { enabled: true, samples: 1000.4, decay: 0.1, length: 7 },
    });
    expect(out.grading.enabled).toBe(true);
    expect(out.grading.contrast).toBe(2);
    expect(out.grading.saturation).toBe(0);
    expect(out.grading.shadowColor).toBe(DEFAULT_RENDER_SETTINGS.grading.shadowColor);
    expect(out.grading.grain).toBe(DEFAULT_RENDER_SETTINGS.grading.grain);
    expect(out.vignette.strength).toBe(1);
    expect(out.vignette.softness).toBe(0);
    expect(out.dof.autoFocus).toBe(DEFAULT_RENDER_SETTINGS.dof.autoFocus);
    expect(out.dof.focusDistance).toBe(500);
    expect(out.dof.aperture).toBe(3);
    expect(out.glints.length).toBe(0.5);
    expect(out.glints.threshold).toBe(20);
    expect(out.godRays.samples).toBe(128);
    expect(out.godRays.decay).toBe(0.5);
    expect(out.godRays.length).toBe(1);
  });

  it('round trips valid settings', () => {
    const custom = {
      ...DEFAULT_RENDER_SETTINGS,
      grading: {
        ...DEFAULT_RENDER_SETTINGS.grading,
        enabled: true,
        contrast: 1.3,
        shadowColor: '#112233',
      },
      dof: { ...DEFAULT_RENDER_SETTINGS.dof, enabled: true, aperture: 2.5, autoFocus: false },
    };
    expect(sanitizeSettings(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
  });
});
