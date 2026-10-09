import type { AtlasData, AtlasRegion } from '../core/types';
import { fallbackColor } from './fallbackColors';
import { mapLimit } from './limit';
import type { TexturePack } from './pack';
import {
  averageColor,
  bleedTransparent,
  blitPadded,
  layoutAtlas,
  resizeNearest,
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
  maxSize?: number;
  concurrency?: number;
}

export interface LoadedTile {
  id: string;
  image: RgbaImage;
  sheetFrames: number;
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
  maxSize: number;
}

const DEFAULT_PADDING = 4;
const DEFAULT_MAX_SIZE = 4096;
const DEFAULT_CONCURRENCY = 24;
const DEFAULT_MIN_TILE = 16;
const DEFAULT_MAX_TILE = 128;

export function defaultCanvasFactory(width: number, height: number): PixelCanvas {
  return new OffscreenCanvas(width, height) as unknown as PixelCanvas;
}

export function isEntityId(id: string): boolean {
  return id.startsWith('entity/');
}

export function pickTileSize(tiles: LoadedTile[]): number {
  const counts = new Map<number, number>();
  for (const tile of tiles) {
    if (isEntityId(tile.id)) continue;
    counts.set(tile.image.width, (counts.get(tile.image.width) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && size > best)) {
      best = size;
      bestCount = count;
    }
  }
  return best;
}

export function composeAtlas(
  tiles: LoadedTile[],
  missingIds: string[],
  options: ComposeOptions,
): ComposedAtlas {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
  const blockTiles = tiles.filter((tile) => !isEntityId(tile.id)).sort(byId);
  const entityTiles = tiles.filter((tile) => isEntityId(tile.id)).sort(byId);
  const sortedMissing = [...missingIds].sort();

  let tileSize = Math.min(
    Math.max(pickTileSize(blockTiles), options.minTileSize),
    options.maxTileSize,
  );
  let entityScale = 1;
  const padding = options.padding;
  const blockCount = blockTiles.length + sortedMissing.length;

  const scaledEntities = () =>
    entityTiles.map((tile) =>
      resizeNearest(
        tile.image,
        Math.max(1, Math.round(tile.image.width * entityScale)),
        Math.max(1, Math.round(tile.image.height * entityScale)),
      ),
    );
  const rectsOf = (images: RgbaImage[]) =>
    images.map((image) => ({ w: image.width + padding * 2, h: image.height + padding * 2 }));

  let entityImages = scaledEntities();
  let found = layoutAtlas(
    blockCount,
    tileSize + padding * 2,
    rectsOf(entityImages),
    options.maxSize,
  );
  while (!found) {
    tileSize = Math.floor(tileSize / 2);
    entityScale /= 2;
    if (tileSize < 1) throw new Error('Atlas does not fit into the maximum texture size');
    entityImages = scaledEntities();
    found = layoutAtlas(blockCount, tileSize + padding * 2, rectsOf(entityImages), options.maxSize);
  }
  const layout = found;
  const cell = tileSize + padding * 2;
  const pixels = new Uint8ClampedArray(layout.width * layout.height * 4);

  const regions: Record<string, AtlasRegion> = {};
  const colors: AtlasData['colors'] = {};

  const place = (
    id: string,
    tile: RgbaImage,
    cellX: number,
    cellY: number,
    frames: number | undefined,
  ) => {
    blitPadded(pixels, layout.width, tile, cellX, cellY, padding);
    const region: AtlasRegion = {
      u0: (cellX + padding) / layout.width,
      v0: (cellY + padding) / layout.height,
      u1: (cellX + padding + tile.width) / layout.width,
      v1: (cellY + padding + tile.height) / layout.height,
      layer: classifyLayer(tile.data),
    };
    if (frames !== undefined && frames > 1) region.frames = frames;
    regions[id] = region;
  };

  const placeBlock = (id: string, tile: RgbaImage, index: number, frames: number | undefined) => {
    place(id, tile, (index % layout.cols) * cell, Math.floor(index / layout.cols) * cell, frames);
  };

  blockTiles.forEach((tile, index) => {
    colors[tile.id] = averageColor(tile.image.data);
    placeBlock(
      tile.id,
      bleedTransparent(scaleNearest(tile.image, tileSize)),
      index,
      tile.sheetFrames,
    );
  });

  sortedMissing.forEach((id, offset) => {
    const color = fallbackColor(id);
    colors[id] = [color[0], color[1], color[2], 1];
    placeBlock(id, solidTile(tileSize, color), blockTiles.length + offset, undefined);
  });

  entityTiles.forEach((tile, index) => {
    const image = entityImages[index];
    const position = layout.entityPlacements[index];
    if (!image || !position) return;
    colors[tile.id] = averageColor(tile.image.data);
    place(tile.id, bleedTransparent(image), position.x, position.y, undefined);
  });

  return {
    data: {
      width: layout.width,
      height: layout.height,
      regions,
      colors,
      missing: sortedMissing,
    },
    image: { width: layout.width, height: layout.height, data: pixels },
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
    if (isEntityId(id)) return { id, image: full, sheetFrames: 1 };
    const layout = resolveAnimation(full.width, full.height, mcmeta);
    return { id, image: extractFrame(full, layout), sheetFrames: layout.frames };
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
  const loaded = await mapLimit(ids, options.concurrency ?? DEFAULT_CONCURRENCY, (id) =>
    loadTile(pack, id, createCanvas),
  );

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
    maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
  });

  const canvas = createCanvas(composed.image.width, composed.image.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context is not available');
  const imageData = context.createImageData(composed.image.width, composed.image.height);
  imageData.data.set(composed.image.data);
  context.putImageData(imageData, 0, 0);

  return { data: composed.data, image: canvas as unknown as OffscreenCanvas };
}
