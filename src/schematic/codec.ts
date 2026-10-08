import { SchematicParseError } from './errors';

export const MAX_CELLS = 100_000_000;

function corrupted(what: string): SchematicParseError {
  return new SchematicParseError(`The file is corrupted: ${what}.`);
}

export function checkVolumeSize(width: number, height: number, length: number): number {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !Number.isInteger(length) ||
    width <= 0 ||
    height <= 0 ||
    length <= 0
  ) {
    throw new SchematicParseError('The schematic has an invalid or empty size.');
  }
  const cells = width * height * length;
  if (cells > MAX_CELLS) {
    throw new SchematicParseError(
      `The schematic is too large (${width} x ${height} x ${length}, ${cells.toLocaleString('en-US')} blocks). The limit is 100 million blocks.`,
    );
  }
  return cells;
}

export function decodeVarints(
  data: ArrayLike<number>,
  count: number,
  remap: Uint32Array,
): Uint32Array {
  const out = new Uint32Array(count);
  const len = data.length;
  const limit = remap.length;
  let p = 0;
  for (let i = 0; i < count; i++) {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (p >= len) throw corrupted('block data ended too early');
      const b = (data[p++] as number) & 0xff;
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw corrupted('invalid block data');
    }
    value >>>= 0;
    if (value >= limit) throw corrupted('block data refers to a missing palette entry');
    out[i] = remap[value] as number;
  }
  return out;
}

export function bitsPerEntry(paletteSize: number): number {
  if (paletteSize <= 4) return 2;
  return Math.max(2, 32 - Math.clz32(paletteSize - 1));
}

export function readPacked(
  words: Uint32Array,
  bits: number,
  count: number,
  remap: Uint32Array,
): Uint32Array {
  if (bits < 1 || bits > 32) throw corrupted('invalid bit width');
  if (Math.ceil((count * bits) / 32) > words.length) {
    throw corrupted('packed block data is shorter than expected');
  }
  const out = new Uint32Array(count);
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  const limit = remap.length;
  let bit = 0;
  for (let i = 0; i < count; i++) {
    const w = bit >>> 5;
    const s = bit & 31;
    let v = (words[w] as number) >>> s;
    if (s + bits > 32) v |= (words[w + 1] as number) << (32 - s);
    v = (v & mask) >>> 0;
    if (v >= limit) throw corrupted('block data refers to a missing palette entry');
    out[i] = remap[v] as number;
    bit += bits;
  }
  return out;
}

export function unpackLongs(words: Uint32Array, bits: number, count: number): Uint32Array {
  const identity = new Uint32Array(bits >= 32 ? 0 : 1 << bits);
  for (let i = 0; i < identity.length; i++) identity[i] = i;
  return readPacked(words, bits, count, identity);
}
