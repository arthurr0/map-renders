import type { AtlasData, AtlasRegion } from '../core/types';
import { fallbackColor } from './fallbackColors';
import type { TexturePack } from './pack';
import {
  averageColor,
  blitPadded,
  chooseGrid,
  classifyLayer,
  extractFrame,
  resolveAnimation,
  scaleNearest,
  solidTile,
  type RgbaImage,
} from './pixels';

export interface PixelContext {
  drawImage(image: ImageBitmap, x: number, y: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  createImageData(width: number, height: number): { data: Uint8ClampedArray };
  putImageData(data: { data: Uint8ClampedArray }, x: number, y: number): void;
}

export interface PixelCanvas {
  width: number;
  height: number;
  getContext(type: '2d', options?: { willReadFrequently?: boolean }): PixelContext | null;
}

export type CanvasFactory = (width: number, height: number) => PixelCanvas;

export interface AtlasBuildOptions {
  createCanvas?: CanvasFactory;
  padding?: number;
  minTileSize?: number;
  maxTileSize?: number;
}

export interface LoadedTile {
  id: string;
  image: RgbaImage;
  frames: number;
}

export interface ComposedAtlas {
  data: AtlasData;
  image: RgbaImage;
  tileSize: number;
}

export interface ComposeOptions {
  padding: number;
  minTileSize: number;
  maxTileSize: number;
}

const DEFAULT_PADDING = 2;
const DEFAULT_MIN_TILE = 16;
const DEFAULT_MAX_TILE = 128;

export function defaultCanvasFactory(width: number, height: number): PixelCanvas {
  return new OffscreenCanvas(width, height) as unknown as PixelCanvas;
}

export function composeAtlas(
  tiles: LoadedTile[],
  missingIds: string[],
  options: ComposeOptions,
): ComposedAtlas {
  const sortedTiles = [...tiles].sort((a, b) => (a.id < b.id ? -1 : 1));
  const sortedMissing = [...missingIds].sort();

  let tileSize = options.minTileSize;
  for (const tile of sortedTiles) {
    tileSize = Math.max(tileSize, Math.max(tile.image.width, tile.image.height));
  }
  tileSize = Math.min(tileSize, options.maxTileSize);

  const padding = options.padding;
  const cell = tileSize + padding * 2;
  const count = sortedTiles.length + sortedMissing.length;
  const grid = chooseGrid(count, cell);
  const pixels = new Uint8ClampedArray(grid.width * grid.height * 4);

  const regions: Record<string, AtlasRegion> = {};
  const colors: AtlasData['colors'] = {};

  const place = (id: string, tile: RgbaImage, index: number, frames: number | undefined) => {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    const cellX = col * cell;
    const cellY = row * cell;
    blitPadded(pixels, grid.width, tile, cellX, cellY, padding);
    const region: AtlasRegion = {
      u0: (cellX + padding) / grid.width,
      v0: (cellY + padding) / grid.height,
      u1: (cellX + padding + tileSize) / grid.width,
      v1: (cellY + padding + tileSize) / grid.height,
      layer: classifyLayer(tile.data),
    };
    if (frames !== undefined && frames > 1) region.frames = frames;
    regions[id] = region;
  };

  sortedTiles.forEach((tile, index) => {
    colors[tile.id] = averageColor(tile.image.data);
    place(tile.id, scaleNearest(tile.image, tileSize), index, tile.frames);
  });

  sortedMissing.forEach((id, offset) => {
    const color = fallbackColor(id);
    colors[id] = [color[0], color[1], color[2], 1];
    place(id, solidTile(tileSize, color), sortedTiles.length + offset, undefined);
  });

  return {
    data: {
      width: grid.width,
      height: grid.height,
      regions,
      colors,
      missing: sortedMissing,
    },
    image: { width: grid.width, height: grid.height, data: pixels },
    tileSize,
  };
}

async function loadTile(
  pack: TexturePack,
  id: string,
  canvasFactory: CanvasFactory,
): Promise<LoadedTile | null> {
  const bitmap = await pack.getTexture(id).catch(() => null);
  if (!bitmap) return null;
  try {
    const mcmeta = await pack.getMcmeta(id).catch(() => null);
    const canvas = canvasFactory(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const raw = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const full: RgbaImage = { width: bitmap.width, height: bitmap.height, data: raw.data };
    const layout = resolveAnimation(full.width, full.height, mcmeta);
    return { id, image: extractFrame(full, layout), frames: layout.frames };
  } finally {
    bitmap.close?.();
  }
}

export async function buildAtlas(
  pack: TexturePack,
  textureIds: string[],
  options: AtlasBuildOptions = {},
): Promise<{ data: AtlasData; image: ImageBitmap | OffscreenCanvas }> {
  const createCanvas = options.createCanvas ?? defaultCanvasFactory;
  const ids = [...new Set(textureIds)];
  const loaded = await Promise.all(ids.map((id) => loadTile(pack, id, createCanvas)));

  const tiles: LoadedTile[] = [];
  const missing: string[] = [];
  loaded.forEach((tile, index) => {
    const id = ids[index];
    if (id === undefined) return;
    if (tile) tiles.push(tile);
    else missing.push(id);
  });

  const composed = composeAtlas(tiles, missing, {
    padding: options.padding ?? DEFAULT_PADDING,
    minTileSize: options.minTileSize ?? DEFAULT_MIN_TILE,
    maxTileSize: options.maxTileSize ?? DEFAULT_MAX_TILE,
  });

  const canvas = createCanvas(composed.image.width, composed.image.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context is not available');
  const imageData = context.createImageData(composed.image.width, composed.image.height);
  imageData.data.set(composed.image.data);
  context.putImageData(imageData, 0, 0);

  return { data: composed.data, image: canvas as unknown as OffscreenCanvas };
}
