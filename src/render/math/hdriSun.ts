import type { Vec3 } from './vec';

export function equirectPixelToDirection(
  x: number,
  row: number,
  width: number,
  height: number,
): Vec3 {
  const u = (x + 0.5) / width;
  const v = 1 - (row + 0.5) / height;
  const phi = (u - 0.5) * 2 * Math.PI;
  const theta = (v - 0.5) * Math.PI;
  return [Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi)];
}

export function rotateY(dir: Vec3, radians: number): Vec3 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [dir[0] * c + dir[2] * s, dir[1], -dir[0] * s + dir[2] * c];
}

export interface BrightSpot {
  direction: Vec3;
  peak: number;
  average: number;
}

export function findBrightestDirection(
  luminance: Float32Array,
  width: number,
  height: number,
): BrightSpot {
  const upperRows = Math.ceil(height / 2);
  let total = 0;
  let count = 0;
  let best = -1;
  let bestIndex = 0;
  for (let row = 0; row < upperRows; row++) {
    for (let x = 0; x < width; x++) {
      const i = x + row * width;
      const l = luminance[i] ?? 0;
      total += l;
      count++;
      if (l > best) {
        best = l;
        bestIndex = i;
      }
    }
  }
  const bx = bestIndex % width;
  const by = Math.floor(bestIndex / width);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  const threshold = best * 0.5;
  const r = Math.max(2, Math.round(width / 128));
  for (let dy = -r; dy <= r; dy++) {
    const row = by + dy;
    if (row < 0 || row >= height) continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = (bx + dx + width) % width;
      const l = luminance[x + row * width] ?? 0;
      if (l < threshold) continue;
      const d = equirectPixelToDirection(x, row, width, height);
      sx += d[0] * l;
      sy += d[1] * l;
      sz += d[2] * l;
    }
  }
  const len = Math.hypot(sx, sy, sz);
  const direction: Vec3 =
    len > 0 ? [sx / len, sy / len, sz / len] : equirectPixelToDirection(bx, by, width, height);
  return { direction, peak: best, average: count ? total / count : 0 };
}
