import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_SETTINGS } from '../core';
import { sanitizeClouds, sanitizeSettings } from './persist';

const defaults = DEFAULT_RENDER_SETTINGS.clouds;

describe('cloud settings', () => {
  it('are disabled by default', () => {
    expect(defaults.enabled).toBe(false);
    expect(sanitizeSettings({}).clouds).toEqual(defaults);
  });

  it('survive a round trip', () => {
    const custom = {
      enabled: true,
      coverage: 0.8,
      density: 1.5,
      height: -0.4,
      thickness: 1.2,
      scale: 2,
      windOffset: 3.5,
      sunInfluence: 0.6,
      color: '#eceaff',
      shadowColor: '#5a5fb4',
      quality: 'high' as const,
    };
    expect(sanitizeSettings({ clouds: custom }).clouds).toEqual(custom);
  });

  it('clamps numbers and rejects invalid values', () => {
    const result = sanitizeClouds(
      {
        enabled: 'yes',
        coverage: 4,
        density: -2,
        height: -9,
        thickness: 0,
        scale: 100,
        windOffset: Number.NaN,
        sunInfluence: 7,
        color: 'white',
        shadowColor: '#12345',
        quality: 'ultra',
      },
      defaults,
    );
    expect(result).toEqual({
      ...defaults,
      coverage: 1,
      density: 0,
      height: -2,
      thickness: 0.05,
      scale: 4,
      sunInfluence: 3,
    });
  });

  it('falls back to defaults for a broken object', () => {
    expect(sanitizeClouds(null, defaults)).toEqual(defaults);
    expect(sanitizeClouds([1, 2], defaults)).toEqual(defaults);
  });
});
