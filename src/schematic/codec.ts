import { SchematicParseError, corrupted } from './errors';

export const MAX_CELLS = 100_000_000;
export const MISSING = 0xffffffff;

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
    const mapped = value < limit ? (remap[value] as number) : MISSING;
    if (mapped === MISSING) throw corrupted('block data refers to a missing palette entry');
    out[i] = mapped;
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
  out: Uint32Array = new Uint32Array(count),
): Uint32Array {
  if (bits < 1 || bits > 32) throw corrupted('invalid bit width');
  if (Math.ceil((count * bits) / 32) > words.length) {
    throw corrupted('packed block data is shorter than expected');
  }
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  const limit = remap.length;
  let bit = 0;
  for (let i = 0; i < count; i++) {
    const w = bit >>> 5;
    const s = bit & 31;
    let v = (words[w] as number) >>> s;
    if (s + bits > 32) v |= (words[w + 1] as number) << (32 - s);
    v = (v & mask) >>> 0;
    const mapped = v < limit ? (remap[v] as number) : MISSING;
    if (mapped === MISSING) throw corrupted('block data refers to a missing palette entry');
    out[i] = mapped;
    bit += bits;
  }
  return out;
}
