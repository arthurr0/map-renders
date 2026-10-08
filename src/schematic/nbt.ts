import { gunzipSync, unzlibSync } from 'fflate';
import { SchematicParseError } from './errors';

export class NbtLongArray {
  readonly words: Uint32Array;
  constructor(words: Uint32Array) {
    this.words = words;
  }
  get length(): number {
    return this.words.length >>> 1;
  }
  toBigInts(): BigInt64Array {
    const out = new BigInt64Array(this.length);
    for (let i = 0; i < out.length; i++) {
      const lo = BigInt(this.words[i * 2] ?? 0);
      const hi = BigInt(this.words[i * 2 + 1] ?? 0);
      out[i] = BigInt.asIntN(64, (hi << 32n) | lo);
    }
    return out;
  }
}

export type NbtValue =
  number | bigint | string | Int8Array | Int32Array | NbtLongArray | NbtValue[] | NbtCompound;

export interface NbtCompound {
  [key: string]: NbtValue;
}

export interface NbtRoot {
  name: string;
  value: NbtCompound;
}

const MAX_DEPTH = 512;

function corrupted(): SchematicParseError {
  return new SchematicParseError('The file is corrupted or truncated and could not be read.');
}

export function decompress(data: Uint8Array): Uint8Array {
  const b0 = data[0] ?? 0;
  const b1 = data[1] ?? 0;
  try {
    if (b0 === 0x1f && b1 === 0x8b) return gunzipSync(data);
    if (b0 === 0x78 && ((b0 << 8) | b1) % 31 === 0) return unzlibSync(data);
  } catch {
    throw corrupted();
  }
  return data;
}

class Reader {
  private pos = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private need(n: number): void {
    if (n < 0 || this.pos + n > this.bytes.length) throw corrupted();
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.pos++] as number;
  }

  i8(): number {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }

  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  i64(): bigint {
    this.need(8);
    const v = this.view.getBigInt64(this.pos);
    this.pos += 8;
    return v;
  }

  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }

  string(): string {
    const len = this.u16();
    this.need(len);
    const start = this.pos;
    this.pos += len;
    return decodeModifiedUtf8(this.bytes, start, start + len);
  }

  int8Array(): Int8Array {
    const len = this.i32();
    this.need(len);
    const out = new Int8Array(this.bytes.buffer, this.bytes.byteOffset + this.pos, len);
    this.pos += len;
    return out;
  }

  int32Array(): Int32Array {
    const len = this.i32();
    this.need(len * 4);
    const out = new Int32Array(len);
    for (let i = 0; i < len; i++) out[i] = this.view.getInt32(this.pos + i * 4);
    this.pos += len * 4;
    return out;
  }

  longArray(): NbtLongArray {
    const len = this.i32();
    this.need(len * 8);
    const words = new Uint32Array(len * 2);
    for (let i = 0; i < len; i++) {
      const p = this.pos + i * 8;
      words[i * 2] = this.view.getUint32(p + 4);
      words[i * 2 + 1] = this.view.getUint32(p);
    }
    this.pos += len * 8;
    return new NbtLongArray(words);
  }

  payload(type: number, depth: number): NbtValue {
    switch (type) {
      case 1:
        return this.i8();
      case 2:
        return this.i16();
      case 3:
        return this.i32();
      case 4:
        return this.i64();
      case 5:
        return this.f32();
      case 6:
        return this.f64();
      case 7:
        return this.int8Array();
      case 8:
        return this.string();
      case 9:
        return this.list(depth);
      case 10:
        return this.compound(depth);
      case 11:
        return this.int32Array();
      case 12:
        return this.longArray();
      default:
        throw corrupted();
    }
  }

  list(depth: number): NbtValue[] {
    if (depth > MAX_DEPTH) throw corrupted();
    const type = this.u8();
    const len = this.i32();
    if (len < 0) throw corrupted();
    if (len === 0) return [];
    if (type === 0) throw corrupted();
    this.need(len);
    const out = new Array<NbtValue>(len);
    for (let i = 0; i < len; i++) out[i] = this.payload(type, depth + 1);
    return out;
  }

  compound(depth: number): NbtCompound {
    if (depth > MAX_DEPTH) throw corrupted();
    const out: NbtCompound = Object.create(null) as NbtCompound;
    for (;;) {
      const type = this.u8();
      if (type === 0) return out;
      const name = this.string();
      out[name] = this.payload(type, depth + 1);
    }
  }
}

export function decodeModifiedUtf8(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  let chunk: number[] = [];
  let i = start;
  while (i < end) {
    const a = bytes[i++] as number;
    let code: number;
    if (a < 0x80) {
      code = a;
    } else if ((a & 0xe0) === 0xc0) {
      if (i >= end) throw corrupted();
      code = ((a & 0x1f) << 6) | ((bytes[i++] as number) & 0x3f);
    } else if ((a & 0xf0) === 0xe0) {
      if (i + 1 >= end) throw corrupted();
      const b = bytes[i++] as number;
      const c = bytes[i++] as number;
      code = ((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f);
    } else {
      throw corrupted();
    }
    chunk.push(code);
    if (chunk.length >= 4096) {
      out += String.fromCharCode(...chunk);
      chunk = [];
    }
  }
  if (chunk.length > 0) out += String.fromCharCode(...chunk);
  return out;
}

export function readNbt(bytes: Uint8Array): NbtRoot {
  const reader = new Reader(bytes);
  if (reader.u8() !== 10) {
    throw new SchematicParseError(
      'This file is not a Minecraft NBT file. Supported formats are .schem, .litematic and .nbt.',
    );
  }
  const name = reader.string();
  const value = reader.compound(0);
  return { name, value };
}

export function readCompressedNbt(data: Uint8Array): NbtRoot {
  return readNbt(decompress(data));
}

export function isCompound(value: unknown): value is NbtCompound {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof NbtLongArray)
  );
}

export function getCompound(c: NbtCompound, key: string): NbtCompound | undefined {
  const v = c[key];
  return isCompound(v) ? v : undefined;
}

export function getList(c: NbtCompound, key: string): NbtValue[] | undefined {
  const v = c[key];
  return Array.isArray(v) ? v : undefined;
}

export function getNumber(c: NbtCompound, key: string): number | undefined {
  const v = c[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return undefined;
}

export function getString(c: NbtCompound, key: string): string | undefined {
  const v = c[key];
  return typeof v === 'string' ? v : undefined;
}

export function getInt8Array(c: NbtCompound, key: string): Int8Array | undefined {
  const v = c[key];
  return v instanceof Int8Array ? v : undefined;
}

export function getInt32Array(c: NbtCompound, key: string): Int32Array | undefined {
  const v = c[key];
  return v instanceof Int32Array ? v : undefined;
}

export function getLongArray(c: NbtCompound, key: string): NbtLongArray | undefined {
  const v = c[key];
  return v instanceof NbtLongArray ? v : undefined;
}
