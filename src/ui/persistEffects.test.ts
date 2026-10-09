import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_SETTINGS } from '../core';
import { sanitizeBackground, sanitizeSettings } from './persist';
import { sanitizeSky, sanitizeWater } from './persistEffects';

describe('water and sky defaults', () => {
  it('keep the advanced effects off so existing renders do not change', () => {
    expect(DEFAULT_RENDER_SETTINGS.water.enabled).toBe(false);
    expect(DEFAULT_RENDER_SETTINGS.sky.stars.enabled).toBe(false);
    expect(DEFAULT_RENDER_SETTINGS.sky.moon.enabled).toBe(false);
    expect(DEFAULT_RENDER_SETTINGS.sky.horizonGlow.enabled).toBe(false);
    expect(DEFAULT_RENDER_SETTINGS.water.level).toBe(0);
  });
});

describe('sanitizeWater', () => {
  it('falls back to defaults for missing or malformed data', () => {
    expect(sanitizeWater(undefined)).toEqual(DEFAULT_RENDER_SETTINGS.water);
    expect(sanitizeWater('x')).toEqual(DEFAULT_RENDER_SETTINGS.water);
  });

  it('clamps numbers and rejects bad colors', () => {
    const result = sanitizeWater({
      enabled: true,
      colorShallow: 'red',
      colorDeep: '#112233',
      reflectivity: 9,
      waveHeight: -1,
      waveScale: Number.NaN,
      level: 1000,
    });
    expect(result.enabled).toBe(true);
    expect(result.colorShallow).toBe(DEFAULT_RENDER_SETTINGS.water.colorShallow);
    expect(result.colorDeep).toBe('#112233');
    expect(result.reflectivity).toBe(1);
    expect(result.waveHeight).toBe(0);
    expect(result.waveScale).toBe(DEFAULT_RENDER_SETTINGS.water.waveScale);
    expect(result.level).toBe(128);
  });
});

describe('sanitizeSky', () => {
  it('clamps star, moon and horizon values', () => {
    const result = sanitizeSky({
      stars: { enabled: true, density: 4, brightness: -2 },
      moon: { enabled: true, azimuth: 720, elevation: -90, size: 0, glow: 2, color: '#ffffff' },
      horizonGlow: { enabled: true, intensity: 5, height: 0, color: 'nope' },
    });
    expect(result.stars).toEqual({ enabled: true, density: 1, brightness: 0 });
    expect(result.moon.azimuth).toBe(360);
    expect(result.moon.elevation).toBe(-10);
    expect(result.moon.size).toBe(0.5);
    expect(result.horizonGlow.intensity).toBe(2);
    expect(result.horizonGlow.height).toBe(0.05);
    expect(result.horizonGlow.color).toBe(DEFAULT_RENDER_SETTINGS.sky.horizonGlow.color);
  });
});

describe('persisted settings', () => {
  it('reads the night-sky background and fills in water and sky for old data', () => {
    expect(
      sanitizeBackground({ type: 'night-sky', twilight: 3 }, DEFAULT_RENDER_SETTINGS.background),
    ).toEqual({
      type: 'night-sky',
      twilight: 1,
    });
    const settings = sanitizeSettings({ ground: 'water', background: { type: 'night-sky' } });
    expect(settings.water).toEqual(DEFAULT_RENDER_SETTINGS.water);
    expect(settings.sky).toEqual(DEFAULT_RENDER_SETTINGS.sky);
    expect(settings.background).toEqual({ type: 'night-sky', twilight: 0.2 });
  });
});
