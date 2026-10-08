import type { SchematicFormat, SchematicVolume } from '../core/types';
import { SchematicParseError } from './errors';
import { isLitematic, parseLitematic } from './litematic';
import {
  type NbtCompound,
  getCompound,
  getInt8Array,
  getNumber,
  readCompressedNbtCached,
  takeCachedNbt,
} from './nbt';
import { isSponge, parseSponge, spongeRoot } from './sponge';
import { isStructure, parseStructure } from './structure';

export { SchematicParseError } from './errors';
export { readNbt, readCompressedNbt, NbtLongArray } from './nbt';
export type { NbtValue, NbtCompound, NbtRoot } from './nbt';

const UNSUPPORTED =
  'This file is not a supported schematic. Supported formats are Sponge .schem (v1, v2, v3), Litematica .litematic and structure block .nbt.';

function classify(root: NbtCompound): SchematicFormat {
  if (isLitematic(root)) return 'litematic';
  if (isSponge(root)) {
    const schem = spongeRoot(root);
    if (getCompound(schem, 'Blocks')) return 'sponge-v3';
    const version = getNumber(schem, 'Version');
    return version === 2 ? 'sponge-v2' : version === 3 ? 'sponge-v3' : 'sponge-v1';
  }
  if (isStructure(root)) return 'structure-nbt';
  if (
    getInt8Array(root, 'Blocks') &&
    (root['Materials'] !== undefined || getInt8Array(root, 'Data'))
  ) {
    throw new SchematicParseError(
      'This is a legacy MCEdit .schematic file with numeric block ids. Only Minecraft 1.13 and newer formats are supported. Convert it to .schem first.',
    );
  }
  throw new SchematicParseError(UNSUPPORTED);
}

export function detectFormat(data: Uint8Array, _fileName: string): SchematicFormat {
  return classify(readCompressedNbtCached(data).value);
}

export function parseSchematic(data: ArrayBuffer, _fileName: string): SchematicVolume {
  const root = takeCachedNbt(data).value;
  switch (classify(root)) {
    case 'litematic':
      return parseLitematic(root);
    case 'structure-nbt':
      return parseStructure(root);
    default:
      return parseSponge(root);
  }
}
