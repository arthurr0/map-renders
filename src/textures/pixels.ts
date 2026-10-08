import type { RenderLayer } from '../core/types';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface AnimationLayout {
  frameWidth: number;
  frameHeight: number;
  frames: number;
  firstFrame: number;
}

export interface GridLayout {
  width: number;
  height: number;
  cols: number;
  rows: number;
}

export function nextPow2(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

export function classifyLayer(data: ArrayLike<number>): RenderLayer {
  let hasTransparent = false;
  let hasPartial = false;
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i] ?? 0;
    if (alpha === 255) continue;
    if (alpha === 0) hasTransparent = true;
    else {
      hasPartial = true;
      break;
    }
  }
  if (hasPartial) return 'translucent';
  return hasTransparent ? 'cutout' : 'opaque';
}

export function averageColor(data: ArrayLike<number>): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let alphaSum = 0;
  const pixels = Math.floor(data.length / 4);
  for (let i = 0; i < pixels; i++) {
    const a = data[i * 4 + 3] ?? 0;
    r += (data[i * 4] ?? 0) * a;
    g += (data[i * 4 + 1] ?? 0) * a;
    b += (data[i * 4 + 2] ?? 0) * a;
    alphaSum += a;
  }
  if (alphaSum === 0 || pixels === 0) return [0, 0, 0, 0];
  return [r / alphaSum / 255, g / alphaSum / 255, b / alphaSum / 255, alphaSum / (pixels * 255)];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveAnimation(width: number, height: number, mcmeta: unknown): AnimationLayout {
  const animation =
    mcmeta && typeof mcmeta === 'object'
      ? ((mcmeta as Record<string, unknown>).animation as Record<string, unknown> | undefined)
      : undefined;
  const hasAnimation = animation !== undefined && typeof animation === 'object';
  let frameWidth = width;
  let frameHeight = height;
  if (hasAnimation) {
    const aw = numberOr(animation.width, 0);
    const ah = numberOr(animation.height, 0);
    frameWidth = aw > 0 && aw <= width ? aw : width;
    frameHeight = ah > 0 && ah <= height ? ah : aw > 0 ? Math.min(aw, height) : width;
  } else if (height > width && height % width === 0) {
    frameHeight = width;
  }
  if (frameHeight > height || frameHeight <= 0) frameHeight = height;
  const columns = Math.max(1, Math.floor(width / frameWidth));
  const rows = Math.max(1, Math.floor(height / frameHeight));
  const frames = columns * rows;
  let firstFrame = 0;
  if (hasAnimation && Array.isArray(animation.frames) && animation.frames.length > 0) {
    const first: unknown = animation.frames[0];
    const index =
      typeof first === 'number'
        ? first
        : first && typeof first === 'object'
          ? (first as Record<string, unknown>).index
          : 0;
    if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < frames) {
      firstFrame = index;
    }
  }
  return { frameWidth, frameHeight, frames, firstFrame };
}

export function extractFrame(image: RgbaImage, layout: AnimationLayout): RgbaImage {
  const { frameWidth, frameHeight, firstFrame } = layout;
  const columns = Math.max(1, Math.floor(image.width / frameWidth));
  const originX = (firstFrame % columns) * frameWidth;
  const originY = Math.floor(firstFrame / columns) * frameHeight;
  const data = new Uint8ClampedArray(frameWidth * frameHeight * 4);
  for (let y = 0; y < frameHeight; y++) {
    const srcStart = ((originY + y) * image.width + originX) * 4;
    data.set(image.data.subarray(srcStart, srcStart + frameWidth * 4), y * frameWidth * 4);
  }
  return { width: frameWidth, height: frameHeight, data };
}

export function scaleNearest(image: RgbaImage, size: number): RgbaImage {
  if (image.width === size && image.height === size) return image;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y * image.height) / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x * image.width) / size));
      const src = (sy * image.width + sx) * 4;
      const dst = (y * size + x) * 4;
      data[dst] = image.data[src] ?? 0;
      data[dst + 1] = image.data[src + 1] ?? 0;
      data[dst + 2] = image.data[src + 2] ?? 0;
      data[dst + 3] = image.data[src + 3] ?? 0;
    }
  }
  return { width: size, height: size, data };
}

export function solidTile(size: number, color: readonly [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: size, height: size, data };
}

export function chooseGrid(count: number, cell: number): GridLayout {
  const total = Math.max(1, count);
  let best: GridLayout | null = null;
  for (let width = nextPow2(cell); width <= 16384; width *= 2) {
    const cols = Math.floor(width / cell);
    if (cols < 1) continue;
    const rows = Math.ceil(total / cols);
    const height = nextPow2(rows * cell);
    const area = width * height;
    const bestArea = best ? best.width * best.height : Infinity;
    const bestMax = best ? Math.max(best.width, best.height) : Infinity;
    if (area < bestArea || (area === bestArea && Math.max(width, height) < bestMax)) {
      best = { width, height, cols, rows };
    }
    if (cols >= total) break;
  }
  if (!best) throw new Error('Atlas does not fit into 16384 pixels');
  return best;
}

export function blitPadded(
  dest: Uint8ClampedArray,
  destWidth: number,
  tile: RgbaImage,
  cellX: number,
  cellY: number,
  padding: number,
): void {
  const size = tile.width;
  const cell = size + padding * 2;
  for (let y = 0; y < cell; y++) {
    const sy = Math.min(size - 1, Math.max(0, y - padding));
    for (let x = 0; x < cell; x++) {
      const sx = Math.min(size - 1, Math.max(0, x - padding));
      const src = (sy * size + sx) * 4;
      const dst = ((cellY + y) * destWidth + cellX + x) * 4;
      dest[dst] = tile.data[src] ?? 0;
      dest[dst + 1] = tile.data[src + 1] ?? 0;
      dest[dst + 2] = tile.data[src + 2] ?? 0;
      dest[dst + 3] = tile.data[src + 3] ?? 0;
    }
  }
}
