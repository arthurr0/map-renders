import type { Bounds, Vec3 } from './vec';

export function fogRange(
  bounds: Bounds | null,
  camera: Vec3,
  density: number,
): { near: number; far: number } {
  const b = bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
  const center: Vec3 = [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ];
  const radius = Math.max(
    4,
    Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
  );
  const distance = Math.hypot(camera[0] - center[0], camera[1] - center[1], camera[2] - center[2]);
  const near = Math.max(0, distance - radius * 0.25);
  const far = near + radius * Math.min(60, 0.06 / Math.max(1e-4, density));
  return { near, far };
}
