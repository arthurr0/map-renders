import { describe, expect, it } from 'vitest';
import type { CameraState } from '../../core/types';
import {
  fitCameraToBounds,
  fitPreset,
  orthoVisibleHeight,
  presetDirection,
  viewBasis,
  type CameraPreset,
} from './cameraFit';
import { DEG, boxCorners, dot, length, normalize, sub, type Bounds, type Vec3 } from './vec';

function projectToScreen(state: CameraState, aspect: number, point: Vec3): [number, number] {
  const z = normalize(sub(state.position, state.target));
  const { right, up } = viewBasis(z);
  const rel = sub(point, state.position);
  const x = dot(rel, right);
  const y = dot(rel, up);
  const depth = -dot(rel, z);
  const tanV = Math.tan((state.fov * DEG) / 2);
  if (state.projection === 'perspective') {
    return [x / (depth * tanV * aspect), y / (depth * tanV)];
  }
  const h = orthoVisibleHeight(state) / 2;
  return [x / (h * aspect), y / h];
}

const bounds: Bounds = { min: [-5, 0, -8], max: [15, 24, 12] };
const presets: CameraPreset[] = ['iso', 'front', 'side', 'top', 'three-quarter'];

describe('presetDirection', () => {
  it('uses a true isometric angle', () => {
    const d = presetDirection('iso');
    const elevation = (Math.asin(d[1]) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(35.264, 2);
    expect(d[0]).toBeCloseTo(d[2]);
  });

  it('returns unit vectors', () => {
    for (const p of presets) expect(length(presetDirection(p))).toBeCloseTo(1);
  });
});

describe('fitCameraToBounds', () => {
  for (const aspect of [0.6, 1, 16 / 9]) {
    for (const preset of presets) {
      for (const projection of ['perspective', 'orthographic'] as const) {
        it(`frames ${preset} ${projection} at aspect ${aspect.toFixed(2)}`, () => {
          const state = fitCameraToBounds(bounds, presetDirection(preset), projection, 45, aspect);
          let maxEdge = 0;
          for (const c of boxCorners(bounds)) {
            const [x, y] = projectToScreen(state, aspect, c);
            expect(Math.abs(x)).toBeLessThanOrEqual(1.0001);
            expect(Math.abs(y)).toBeLessThanOrEqual(1.0001);
            maxEdge = Math.max(maxEdge, Math.abs(x), Math.abs(y));
          }
          expect(maxEdge).toBeGreaterThan(0.75);
        });
      }
    }
  }

  it('looks along the preset direction', () => {
    const state = fitCameraToBounds(bounds, presetDirection('front'), 'perspective', 45, 1.5);
    const d = normalize(sub(state.position, state.target));
    expect(d[2]).toBeCloseTo(1);
  });

  it('iso preset forces orthographic projection', () => {
    expect(fitPreset('iso', bounds, 'perspective', 45, 1).projection).toBe('orthographic');
    expect(fitPreset('front', bounds, 'perspective', 45, 1).projection).toBe('perspective');
  });

  it('orthographic zoom defines the visible height', () => {
    const state = fitCameraToBounds(bounds, presetDirection('front'), 'orthographic', 45, 1);
    expect(orthoVisibleHeight(state)).toBeCloseTo(24 * 1.12, 3);
  });
});
