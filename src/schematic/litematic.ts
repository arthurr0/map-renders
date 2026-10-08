import type { BlockEntity, SchematicVolume } from '../core/types';
import { bitsPerEntry, checkVolumeSize, readPacked } from './codec';
import { SchematicParseError } from './errors';
import { type NbtCompound, getCompound, getLongArray, getNumber, getString } from './nbt';
import { PaletteBuilder, compoundList, makeBlockEntity, readXyz } from './palette';

function corrupted(what: string): SchematicParseError {
  return new SchematicParseError(`The file is corrupted: ${what}.`);
}

export function isLitematic(root: NbtCompound): boolean {
  return getCompound(root, 'Regions') !== undefined;
}

interface Region {
  name: string;
  min: [number, number, number];
  size: [number, number, number];
  data: NbtCompound;
}

function readRegion(name: string, data: NbtCompound): Region {
  const pos = readXyz(getCompound(data, 'Position'));
  const size = readXyz(getCompound(data, 'Size'));
  if (!pos || !size) throw corrupted(`region "${name}" has no position or size`);
  const min: [number, number, number] = [0, 0, 0];
  const abs: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const s = size[i] as number;
    const p = pos[i] as number;
    abs[i] = Math.abs(s);
    min[i] = s < 0 ? p + s + 1 : p;
  }
  return { name, min, size: abs, data };
}

export function parseLitematic(root: NbtCompound): SchematicVolume {
  const regionsTag = getCompound(root, 'Regions');
  if (!regionsTag) throw corrupted('the file has no regions');

  const regions: Region[] = [];
  for (const name of Object.keys(regionsTag)) {
    const data = getCompound(regionsTag, name);
    if (!data) continue;
    const region = readRegion(name, data);
    if (region.size[0] === 0 || region.size[1] === 0 || region.size[2] === 0) continue;
    regions.push(region);
  }
  if (regions.length === 0) throw new SchematicParseError('The schematic contains no blocks.');

  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const r of regions) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i] as number, r.min[i] as number);
      hi[i] = Math.max(hi[i] as number, (r.min[i] as number) + (r.size[i] as number));
    }
  }
  const width = (hi[0] as number) - (lo[0] as number);
  const height = (hi[1] as number) - (lo[1] as number);
  const length = (hi[2] as number) - (lo[2] as number);
  const cells = checkVolumeSize(width, height, length);
  for (const r of regions) checkVolumeSize(r.size[0], r.size[1], r.size[2]);

  const builder = new PaletteBuilder();
  const blocks = new Uint32Array(cells);
  const blockEntities: BlockEntity[] = [];

  for (const r of regions) {
    const paletteList = compoundList(r.data, 'BlockStatePalette');
    if (paletteList.length === 0) throw corrupted(`region "${r.name}" has no block palette`);
    const states = getLongArray(r.data, 'BlockStates');
    if (!states) throw corrupted(`region "${r.name}" has no block data`);
    const remap = new Uint32Array(paletteList.length);
    for (let i = 0; i < paletteList.length; i++) {
      remap[i] = builder.addCompound(paletteList[i] as NbtCompound);
    }
    const [sx, sy, sz] = r.size;
    const local = readPacked(states.words, bitsPerEntry(paletteList.length), sx * sy * sz, remap);
    const ox = (r.min[0] as number) - (lo[0] as number);
    const oy = (r.min[1] as number) - (lo[1] as number);
    const oz = (r.min[2] as number) - (lo[2] as number);
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        const src = (y * sz + z) * sx;
        const dst = ox + (oz + z) * width + (oy + y) * width * length;
        blocks.set(local.subarray(src, src + sx), dst);
      }
    }
    for (const te of compoundList(r.data, 'TileEntities')) {
      const x = getNumber(te, 'x');
      const y = getNumber(te, 'y');
      const z = getNumber(te, 'z');
      if (x === undefined || y === undefined || z === undefined) continue;
      blockEntities.push(
        makeBlockEntity([x + ox, y + oy, z + oz], getString(te, 'id'), te, ['x', 'y', 'z', 'id']),
      );
    }
  }

  const meta = getCompound(root, 'Metadata');
  return {
    width,
    height,
    length,
    palette: builder.palette,
    blocks,
    blockEntities,
    metadata: {
      name: meta ? getString(meta, 'Name') : undefined,
      author: meta ? getString(meta, 'Author') : undefined,
      dataVersion: getNumber(root, 'MinecraftDataVersion'),
      format: 'litematic',
    },
  };
}
