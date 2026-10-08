import type { BlockEntity, SchematicVolume } from '../core/types';
import { checkVolumeSize } from './codec';
import { corrupted } from './errors';
import { type NbtCompound, getCompound, getList, getNumber, getString, isCompound } from './nbt';
import {
  PaletteBuilder,
  compactPalette,
  compoundList,
  makeBlockEntity,
  optionalString,
  readIntTriple,
} from './palette';

export function isStructure(root: NbtCompound): boolean {
  return (
    (getList(root, 'size') !== undefined || root['size'] instanceof Int32Array) &&
    getList(root, 'blocks') !== undefined &&
    (getList(root, 'palette') !== undefined || getList(root, 'palettes') !== undefined)
  );
}

export function parseStructure(root: NbtCompound): SchematicVolume {
  const size = readIntTriple(root['size']);
  if (!size) throw corrupted('the size is missing');
  const [width, height, length] = size;
  const cells = checkVolumeSize(width, height, length);

  let paletteList = getList(root, 'palette');
  if (!paletteList) {
    const palettes = getList(root, 'palettes');
    const first = palettes ? palettes[0] : undefined;
    paletteList = Array.isArray(first) ? first : undefined;
  }
  if (!paletteList) throw corrupted('the block palette is missing');

  const builder = new PaletteBuilder();
  const remap = new Uint32Array(paletteList.length);
  for (let i = 0; i < paletteList.length; i++) {
    const entry = paletteList[i];
    if (!isCompound(entry)) throw corrupted('invalid palette entry');
    remap[i] = builder.addCompound(entry);
  }

  const raw = new Uint32Array(cells);
  const blockEntities: BlockEntity[] = [];
  for (const entry of compoundList(root, 'blocks')) {
    const pos = readIntTriple(entry['pos']);
    const state = getNumber(entry, 'state');
    if (!pos || state === undefined) continue;
    const [x, y, z] = pos;
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) continue;
    if (state < 0 || state >= remap.length) {
      throw corrupted('a block refers to a missing palette entry');
    }
    raw[x + z * width + y * width * length] = remap[state] as number;
    const nbt = getCompound(entry, 'nbt');
    if (nbt) {
      blockEntities.push(makeBlockEntity(pos, getString(nbt, 'id'), nbt, ['x', 'y', 'z', 'id']));
    }
  }

  const { palette, blocks } = compactPalette(builder.palette, raw);
  return {
    width,
    height,
    length,
    palette,
    blocks,
    blockEntities,
    metadata: {
      name: optionalString(root, 'name'),
      author: optionalString(root, 'author'),
      dataVersion: getNumber(root, 'DataVersion'),
      format: 'structure-nbt',
    },
  };
}
