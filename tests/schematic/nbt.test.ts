import { describe, expect, it } from 'vitest';
import { gzipSync, zlibSync } from 'fflate';
import { NbtLongArray, readCompressedNbt, readNbt } from '../../src/schematic/nbt';
import { SchematicParseError } from '../../src/schematic';
import { bitsPerEntry, decodeVarints, readPacked } from '../../src/schematic/codec';
import {
  byte,
  bytes,
  compound,
  double,
  float,
  int,
  ints,
  list,
  long,
  longs,
  short,
  str,
  varintBytes,
  writeNbt,
} from './nbtWriter';

const sample = {
  b: byte(-3),
  s: short(-1234),
  i: int(-70000),
  l: long(-5n),
  f: float(1.5),
  d: double(-2.25),
  ba: bytes([1, 255, 3]),
  str: str('abc'),
  li: list(3, [int(1), int(2)]),
  lc: list(10, [compound({ x: int(1) }), compound({ x: int(2) })]),
  empty: list(0, []),
  ia: ints([1, -2, 3]),
  la: longs([1n, -1n, 0x123456789abcdefn]),
  nested: compound({ inner: compound({ v: byte(1) }) }),
};

describe('nbt reader', () => {
  it('reads all tag types', () => {
    const root = readNbt(writeNbt(sample, 'Root'));
    expect(root.name).toBe('Root');
    const v = root.value;
    expect(v['b']).toBe(-3);
    expect(v['s']).toBe(-1234);
    expect(v['i']).toBe(-70000);
    expect(v['l']).toBe(-5n);
    expect(v['f']).toBe(1.5);
    expect(v['d']).toBe(-2.25);
    expect(Array.from(v['ba'] as Int8Array)).toEqual([1, -1, 3]);
    expect(v['str']).toBe('abc');
    expect(v['li']).toEqual([1, 2]);
    expect(v['lc']).toEqual([{ x: 1 }, { x: 2 }]);
    expect(v['empty']).toEqual([]);
    expect(Array.from(v['ia'] as Int32Array)).toEqual([1, -2, 3]);
    const la = v['la'] as NbtLongArray;
    expect(la.length).toBe(3);
    expect(Array.from(toBigInts(la))).toEqual([1n, -1n, 0x123456789abcdefn]);
    expect(Array.from(la.words.slice(4))).toEqual([0x89abcdef, 0x01234567]);
  });

  it('decodes modified utf-8', () => {
    const raw = writeNbt({ k: str('zażółć \u0000 €') });
    expect(readNbt(raw).value['k']).toBe('zażółć \u0000 €');
  });

  it('decodes four byte utf-8 sequences', () => {
    const raw = Uint8Array.from([10, 0, 0, 8, 0, 1, 0x6b, 0, 4, 0xf0, 0x9f, 0x98, 0x80, 0]);
    expect(readNbt(raw).value['k']).toBe('\u{1F600}');
  });

  it('handles gzip, zlib and raw input', () => {
    const raw = writeNbt(sample);
    for (const data of [raw, gzipSync(raw), zlibSync(raw)]) {
      expect(readCompressedNbt(data).value['str']).toBe('abc');
    }
  });

  it('rejects truncated and invalid data', () => {
    const raw = writeNbt(sample);
    expect(() => readNbt(raw.slice(0, raw.length - 10))).toThrow(SchematicParseError);
    expect(() => readNbt(Uint8Array.from([1, 2, 3]))).toThrow(SchematicParseError);
    expect(() => readCompressedNbt(Uint8Array.from([0x1f, 0x8b, 1, 2, 3]))).toThrow(
      SchematicParseError,
    );
  });
});

describe('varint', () => {
  it('decodes multi byte values with remap', () => {
    const values = [0, 1, 127, 128, 300, 16384, 2];
    const remap = new Uint32Array(20000);
    for (let i = 0; i < remap.length; i++) remap[i] = i + 1;
    const out = decodeVarints(varintBytes(values), values.length, remap);
    expect(Array.from(out)).toEqual(values.map((v) => v + 1));
  });

  it('fails on truncated and unknown ids', () => {
    const remap = new Uint32Array(4);
    expect(() => decodeVarints([0x80], 1, remap)).toThrow(SchematicParseError);
    expect(() => decodeVarints([9], 1, remap)).toThrow(SchematicParseError);
    expect(() => decodeVarints([1], 2, remap)).toThrow(SchematicParseError);
  });
});

function toBigInts(a: NbtLongArray): BigInt64Array {
  const out = new BigInt64Array(a.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = BigInt.asIntN(
      64,
      (BigInt(a.words[i * 2 + 1] as number) << 32n) | BigInt(a.words[i * 2] as number),
    );
  }
  return out;
}

function unpackLongs(words: Uint32Array, bits: number, count: number): Uint32Array {
  const identity = new Uint32Array(1 << bits);
  for (let i = 0; i < identity.length; i++) identity[i] = i;
  return readPacked(words, bits, count, identity);
}

function pack(values: number[], bits: number): Uint32Array {
  const total = Math.ceil((values.length * bits) / 64);
  const longsOut = new BigUint64Array(total);
  values.forEach((v, i) => {
    const start = i * bits;
    const idx = Math.floor(start / 64);
    const off = start % 64;
    const big = BigInt(v);
    longsOut[idx] = BigInt.asUintN(64, (longsOut[idx] as bigint) | (big << BigInt(off)));
    if (off + bits > 64) {
      longsOut[idx + 1] = (longsOut[idx + 1] as bigint) | (big >> BigInt(64 - off));
    }
  });
  const words = new Uint32Array(total * 2);
  longsOut.forEach((l, i) => {
    words[i * 2] = Number(l & 0xffffffffn);
    words[i * 2 + 1] = Number(l >> 32n);
  });
  return words;
}

describe('litematic bit packing', () => {
  it('computes bits per entry', () => {
    expect(bitsPerEntry(1)).toBe(2);
    expect(bitsPerEntry(4)).toBe(2);
    expect(bitsPerEntry(5)).toBe(3);
    expect(bitsPerEntry(8)).toBe(3);
    expect(bitsPerEntry(9)).toBe(4);
    expect(bitsPerEntry(17)).toBe(5);
    expect(bitsPerEntry(1000)).toBe(10);
  });

  it('unpacks entries inside a single long', () => {
    const values = [0, 1, 2, 3, 3, 2, 1, 0, 1];
    expect(Array.from(unpackLongs(pack(values, 2), 2, values.length))).toEqual(values);
  });

  it('unpacks entries that span two longs', () => {
    for (const bits of [3, 5, 7, 10, 13]) {
      const max = (1 << bits) - 1;
      const values = Array.from({ length: 100 }, (_, i) => (i * 37 + 11) % (max + 1));
      expect(Array.from(unpackLongs(pack(values, bits), bits, values.length))).toEqual(values);
    }
  });

  it('spans a long boundary as in the litematica layout', () => {
    const words = pack([5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6], 3);
    const out = unpackLongs(words, 3, 23);
    expect(out[21]).toBe(5);
    expect(out[22]).toBe(6);
    expect(Array.from(out.slice(0, 3))).toEqual([5, 6, 7]);
  });

  it('rejects data that is too short', () => {
    expect(() => unpackLongs(new Uint32Array(2), 4, 100)).toThrow(SchematicParseError);
  });
});
