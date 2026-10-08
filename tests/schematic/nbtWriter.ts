import { gzipSync } from 'fflate';

export type W =
  | { t: 'byte'; v: number }
  | { t: 'short'; v: number }
  | { t: 'int'; v: number }
  | { t: 'long'; v: bigint }
  | { t: 'float'; v: number }
  | { t: 'double'; v: number }
  | { t: 'bytes'; v: number[] }
  | { t: 'string'; v: string }
  | { t: 'list'; of: number; v: W[] }
  | { t: 'compound'; v: Record<string, W> }
  | { t: 'ints'; v: number[] }
  | { t: 'longs'; v: bigint[] };

export const byte = (v: number): W => ({ t: 'byte', v });
export const short = (v: number): W => ({ t: 'short', v });
export const int = (v: number): W => ({ t: 'int', v });
export const long = (v: bigint): W => ({ t: 'long', v });
export const float = (v: number): W => ({ t: 'float', v });
export const double = (v: number): W => ({ t: 'double', v });
export const bytes = (v: number[]): W => ({ t: 'bytes', v });
export const str = (v: string): W => ({ t: 'string', v });
export const ints = (v: number[]): W => ({ t: 'ints', v });
export const longs = (v: bigint[]): W => ({ t: 'longs', v });
export const compound = (v: Record<string, W>): W => ({ t: 'compound', v });
export const list = (of: number, v: W[]): W => ({ t: 'list', of, v });

const TYPE: Record<W['t'], number> = {
  byte: 1,
  short: 2,
  int: 3,
  long: 4,
  float: 5,
  double: 6,
  bytes: 7,
  string: 8,
  list: 9,
  compound: 10,
  ints: 11,
  longs: 12,
};

export function varintBytes(values: number[]): number[] {
  const out: number[] = [];
  for (let v of values) {
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(v);
  }
  return out;
}

class Out {
  parts: number[] = [];
  u8(v: number): void {
    this.parts.push(v & 0xff);
  }
  u16(v: number): void {
    this.u8(v >> 8);
    this.u8(v);
  }
  i32(v: number): void {
    this.u16(v >> 16);
    this.u16(v);
  }
  i64(v: bigint): void {
    const u = BigInt.asUintN(64, v);
    this.i32(Number(u >> 32n));
    this.i32(Number(u & 0xffffffffn));
  }
  str(s: string): void {
    const b = encodeModified(s);
    this.u16(b.length);
    for (const x of b) this.u8(x);
  }
}

export function encodeModified(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 0 && c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

function payload(o: Out, w: W): void {
  switch (w.t) {
    case 'byte':
      o.u8(w.v);
      break;
    case 'short':
      o.u16(w.v);
      break;
    case 'int':
      o.i32(w.v);
      break;
    case 'long':
      o.i64(w.v);
      break;
    case 'float': {
      const b = new DataView(new ArrayBuffer(4));
      b.setFloat32(0, w.v);
      o.i32(b.getInt32(0));
      break;
    }
    case 'double': {
      const b = new DataView(new ArrayBuffer(8));
      b.setFloat64(0, w.v);
      o.i32(b.getInt32(0));
      o.i32(b.getInt32(4));
      break;
    }
    case 'bytes':
      o.i32(w.v.length);
      for (const x of w.v) o.u8(x);
      break;
    case 'string':
      o.str(w.v);
      break;
    case 'list':
      o.u8(w.of);
      o.i32(w.v.length);
      for (const x of w.v) payload(o, x);
      break;
    case 'compound':
      for (const k of Object.keys(w.v)) {
        const child = w.v[k] as W;
        o.u8(TYPE[child.t]);
        o.str(k);
        payload(o, child);
      }
      o.u8(0);
      break;
    case 'ints':
      o.i32(w.v.length);
      for (const x of w.v) o.i32(x);
      break;
    case 'longs':
      o.i32(w.v.length);
      for (const x of w.v) o.i64(x);
      break;
  }
}

export function writeNbt(root: Record<string, W>, name = ''): Uint8Array {
  const o = new Out();
  o.u8(10);
  o.str(name);
  payload(o, compound(root));
  return Uint8Array.from(o.parts);
}

export function gzipNbt(root: Record<string, W>, name = ''): ArrayBuffer {
  const gz = gzipSync(writeNbt(root, name));
  return gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer;
}
