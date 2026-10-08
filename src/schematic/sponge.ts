import type { BlockEntity, SchematicFormat, SchematicVolume } from '../core/types';
import { checkVolumeSize, decodeVarints } from './codec';
import { SchematicParseError } from './errors';
import { type NbtCompound, getCompound, getInt8Array, getNumber, getString } from './nbt';
import { PaletteBuilder, compoundList, makeBlockEntity, readIntTriple } from './palette';

function corrupted(what: string): SchematicParseError {
  return new SchematicParseError(`The file is corrupted: ${what}.`);
}

export function spongeRoot(root: NbtCompound): NbtCompound {
  return getCompound(root, 'Schematic') ?? root;
}

export function isSponge(root: NbtCompound): boolean {
  const schem = spongeRoot(root);
  const blocks = getCompound(schem, 'Blocks');
  if (blocks && getCompound(blocks, 'Palette')) return true;
  return (
    getCompound(schem, 'Palette') !== undefined && getInt8Array(schem, 'BlockData') !== undefined
  );
}

function dimension(c: NbtCompound, key: string): number {
  const v = getNumber(c, key);
  if (v === undefined) throw corrupted(`the ${key} field is missing`);
  return v & 0xffff;
}

function buildPalette(raw: NbtCompound, builder: PaletteBuilder): Uint32Array {
  const keys = Object.keys(raw);
  let max = -1;
  const ids: number[] = [];
  for (const key of keys) {
    const id = getNumber(raw, key);
    if (id === undefined || id < 0 || id > 0xffffff) throw corrupted('invalid palette entry');
    ids.push(id);
    if (id > max) max = id;
  }
  const remap = new Uint32Array(max + 1);
  for (let i = 0; i < keys.length; i++) {
    remap[ids[i] as number] = builder.addKey(keys[i] as string);
  }
  return remap;
}

function readEntities(
  list: NbtCompound[],
  width: number,
  height: number,
  length: number,
  v3: boolean,
): BlockEntity[] {
  const out: BlockEntity[] = [];
  for (const entry of list) {
    const pos = readIntTriple(entry['Pos']);
    if (!pos) continue;
    if (
      pos[0] < 0 ||
      pos[1] < 0 ||
      pos[2] < 0 ||
      pos[0] >= width ||
      pos[1] >= height ||
      pos[2] >= length
    ) {
      continue;
    }
    const id = getString(entry, 'Id') ?? getString(entry, 'id');
    const inner = v3 ? getCompound(entry, 'Data') : undefined;
    out.push(
      inner
        ? makeBlockEntity(pos, id, inner, ['id', 'Id'])
        : makeBlockEntity(pos, id, entry, ['Pos', 'Id', 'id']),
    );
  }
  return out;
}

export function parseSponge(root: NbtCompound): SchematicVolume {
  const schem = spongeRoot(root);
  const version = getNumber(schem, 'Version');
  const blocksTag = getCompound(schem, 'Blocks');
  const v3 = blocksTag !== undefined || version === 3;
  const format: SchematicFormat = v3 ? 'sponge-v3' : version === 2 ? 'sponge-v2' : 'sponge-v1';

  const width = dimension(schem, 'Width');
  const height = dimension(schem, 'Height');
  const length = dimension(schem, 'Length');
  const cells = checkVolumeSize(width, height, length);

  const paletteTag = v3
    ? blocksTag && getCompound(blocksTag, 'Palette')
    : getCompound(schem, 'Palette');
  const data = v3 ? blocksTag && getInt8Array(blocksTag, 'Data') : getInt8Array(schem, 'BlockData');
  if (!paletteTag) throw corrupted('the block palette is missing');
  if (!data) throw corrupted('the block data is missing');
  if (data.length < cells) throw corrupted('block data is shorter than the schematic size');

  const builder = new PaletteBuilder();
  const remap = buildPalette(paletteTag, builder);
  const blocks = decodeVarints(data, cells, remap);

  const entityList = v3
    ? blocksTag
      ? compoundList(blocksTag, 'BlockEntities')
      : []
    : [...compoundList(schem, 'BlockEntities'), ...compoundList(schem, 'TileEntities')];

  const meta = getCompound(schem, 'Metadata');
  const dataVersion = getNumber(schem, 'DataVersion');
  return {
    width,
    height,
    length,
    palette: builder.palette,
    blocks,
    blockEntities: readEntities(entityList, width, height, length, v3),
    metadata: {
      name: meta ? getString(meta, 'Name') : undefined,
      author: meta ? getString(meta, 'Author') : undefined,
      dataVersion,
      format,
    },
  };
}
