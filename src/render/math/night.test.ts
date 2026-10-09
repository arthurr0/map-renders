import { describe, expect, it } from 'vitest';
import {
  moonCosRadius,
  nightSkyElevation,
  nightVisibility,
  starProbability,
  twilightAmount,
} from './night';

describe('night sky math', () => {
  it('maps twilight to a sun elevation below the horizon', () => {
    expect(nightSkyElevation(0)).toBeCloseTo(-14);
    expect(nightSkyElevation(1)).toBeCloseTo(-3.5);
    expect(nightSkyElevation(-2)).toBeCloseTo(-14);
    expect(nightSkyElevation(0.5)).toBeLessThan(0);
  });

  it('keeps star probability monotonic and bounded', () => {
    expect(starProbability(0)).toBe(0);
    expect(starProbability(0.5)).toBeGreaterThan(0);
    expect(starProbability(1)).toBeGreaterThan(starProbability(0.5));
    expect(starProbability(5)).toBe(starProbability(1));
  });

  it('shrinks the cosine of the moon radius as the moon grows', () => {
    expect(moonCosRadius(1)).toBeGreaterThan(moonCosRadius(5));
    expect(moonCosRadius(0)).toBeLessThan(1);
  });

  it('peaks the twilight belt around dusk and fades in full day and night', () => {
    expect(twilightAmount(-20)).toBe(0);
    expect(twilightAmount(30)).toBe(0);
    expect(twilightAmount(-2)).toBeGreaterThan(0.8);
    expect(twilightAmount(-8)).toBeLessThan(twilightAmount(-2));
  });

  it('shows the night only when the sun is well below the horizon', () => {
    expect(nightVisibility(20)).toBe(0);
    expect(nightVisibility(-20)).toBe(1);
    expect(nightVisibility(-3)).toBeGreaterThan(0);
    expect(nightVisibility(-3)).toBeLessThan(1);
  });
});
