import { describe, expect, it } from 'vitest';
import { directionToSunAngles, sunDirection, sunLookForElevation, timeOfDayToSun } from './sun';

describe('sunDirection', () => {
  it('maps compass azimuth to world axes', () => {
    const north = sunDirection(0, 0);
    expect(north[0]).toBeCloseTo(0);
    expect(north[2]).toBeCloseTo(-1);
    expect(sunDirection(90, 0)[0]).toBeCloseTo(1);
    expect(sunDirection(180, 0)[2]).toBeCloseTo(1);
    expect(sunDirection(270, 0)[0]).toBeCloseTo(-1);
  });

  it('points straight up at elevation 90', () => {
    const d = sunDirection(123, 90);
    expect(d[1]).toBeCloseTo(1);
    expect(Math.hypot(d[0], d[2])).toBeCloseTo(0);
  });

  it('round trips through directionToSunAngles', () => {
    const cases: Array<[number, number]> = [
      [10, 20],
      [135, 45],
      [250, 5],
      [359, 80],
    ];
    for (const [az, el] of cases) {
      const a = directionToSunAngles(sunDirection(az, el));
      expect(a.azimuth).toBeCloseTo(az, 6);
      expect(a.elevation).toBeCloseTo(el, 6);
    }
  });
});

describe('timeOfDayToSun', () => {
  it('keeps the sun a few degrees up at 6.5 and 18 and peaks at noon', () => {
    expect(timeOfDayToSun(6.5).elevation).toBeCloseTo(4, 6);
    expect(timeOfDayToSun(12).elevation).toBeGreaterThan(55);
    expect(timeOfDayToSun(18).elevation).toBeCloseTo(4, 6);
    expect(timeOfDayToSun(16.5).elevation).toBeGreaterThan(10);
    expect(timeOfDayToSun(19).elevation).toBeLessThan(-5);
    expect(timeOfDayToSun(0).elevation).toBeLessThan(-50);
    expect(timeOfDayToSun(9).elevation).toBeGreaterThan(0);
    expect(timeOfDayToSun(21).elevation).toBeLessThan(0);
  });

  it('moves from east to west through the noon azimuth', () => {
    expect(timeOfDayToSun(6.5, 180).azimuth).toBeCloseTo(90);
    expect(timeOfDayToSun(12, 180).azimuth).toBeCloseTo(180);
    expect(timeOfDayToSun(18, 180).azimuth).toBeCloseTo(270);
    expect(timeOfDayToSun(12, 135).azimuth).toBeCloseTo(135);
  });

  it('wraps hours and is continuous around midnight', () => {
    expect(timeOfDayToSun(36).elevation).toBeCloseTo(timeOfDayToSun(12).elevation);
    const a = timeOfDayToSun(23.999);
    const b = timeOfDayToSun(0.001);
    expect(Math.abs(a.elevation - b.elevation)).toBeLessThan(0.5);
    const dAz = Math.abs(((a.azimuth - b.azimuth + 540) % 360) - 180);
    expect(dAz).toBeLessThan(1);
  });
});

describe('sunLookForElevation', () => {
  it('is warmer and dimmer near the horizon', () => {
    const low = sunLookForElevation(2);
    const high = sunLookForElevation(50);
    expect(low.color[2]).toBeLessThan(high.color[2]);
    expect(low.intensity).toBeLessThan(high.intensity);
    expect(sunLookForElevation(-10).intensity).toBe(0);
  });

  it('keeps warm direct light at golden hour and never drops the ambient fill', () => {
    const golden = sunLookForElevation(4);
    expect(golden.intensity).toBeGreaterThan(0.8);
    expect(golden.color[2]).toBeLessThan(0.4);
    expect(golden.lightElevation).toBe(4);
    expect(sunLookForElevation(-3).lightElevation).toBe(2);
    for (const el of [-40, -10, -3, 0, 5, 30]) {
      expect(sunLookForElevation(el).ambientIntensity).toBeGreaterThan(0.4);
    }
    expect(sunLookForElevation(-20).moon).toBe(1);
    expect(sunLookForElevation(10).moon).toBe(0);
  });
});
