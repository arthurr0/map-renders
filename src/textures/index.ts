import type { AtlasData } from '../core/types';

export interface TexturePack {
  id: string;
  name: string;
  attribution: string;
  getTexture(textureId: string): Promise<ImageBitmap | null>;
  getMcmeta(textureId: string): Promise<unknown | null>;
}

export const BIOME_TINTS = {
  grass: '#79c05a',
  foliage: '#59ae30',
  water: '#3f76e4',
} as const;

export async function loadBundledPack(): Promise<TexturePack> {
  throw new Error('not implemented');
}

export async function loadZipPack(_file: ArrayBuffer, _name: string): Promise<TexturePack> {
  throw new Error('not implemented');
}

export async function buildAtlas(
  _pack: TexturePack,
  _textureIds: string[],
): Promise<{ data: AtlasData; image: ImageBitmap | OffscreenCanvas }> {
  throw new Error('not implemented');
}
