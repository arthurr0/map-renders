import { describe, expect, it } from 'vitest';
import type { CameraState } from '../../core/types';
import { interpolateCamera } from './cameraTween';

const a: CameraState = {
  projection: 'perspective',
  position: [10, 5, 0],
  target: [0, 0, 0],
  fov: 40,
  zoom: 1,
};
const b: CameraState = {
  projection: 'perspective',
  position: [0, 5, 20],
  target: [2, 1, 2],
  fov: 60,
  zoom: 4,
};

describe('interpolateCamera', () => {
  it('hits both endpoints', () => {
    const s0 = interpolateCamera(a, b, 0);
    const s1 = interpolateCamera(a, b, 1);
    s0.position.forEach((v, i) => expect(v).toBeCloseTo(a.position[i]!));
    s1.position.forEach((v, i) => expect(v).toBeCloseTo(b.position[i]!));
    s1.target.forEach((v, i) => expect(v).toBeCloseTo(b.target[i]!));
    expect(s1.fov).toBeCloseTo(60);
    expect(s1.zoom).toBeCloseTo(4);
  });

  it('orbits around the target instead of cutting through it', () => {
    const mid = interpolateCamera(
      { ...a, position: [10, 0, 0] },
      { ...a, position: [-10, 0, 0.001] },
      0.5,
    );
    expect(Math.hypot(...mid.position)).toBeCloseTo(10, 3);
  });

  it('interpolates zoom geometrically', () => {
    expect(interpolateCamera(a, b, 0.5).zoom).toBeCloseTo(2);
  });
});
