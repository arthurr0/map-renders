import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SchematicVolume } from '../../src/core/types';
import { getBlock, stateKey } from '../../src/core/volume';
import { SchematicParseError, detectFormat, parseSchematic } from '../../src/schematic';
import {
  bytes,
  compound,
  int,
  list,
  longs,
  short,
  str,
  varintBytes,
  gzipNbt,
  writeNbt,
} from './nbtWriter';

function load(name: string): { buffer: ArrayBuffer; bytes: Uint8Array } {
  const buf = readFileSync(`tests/fixtures/${name}`);
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return { buffer: copy.buffer, bytes: copy };
}

function parse(name: string): SchematicVolume {
  return parseSchematic(load(name).buffer, name);
}

function keys(vol: SchematicVolume): string[] {
  const out: string[] = [];
  for (let i = 0; i < vol.blocks.length; i++) {
    out.push(stateKey(vol.palette[vol.blocks[i] as number] as never));
  }
  return out;
}

function invariants(vol: SchematicVolume): void {
  expect(vol.palette[0]?.name).toBe('minecraft:air');
  expect(vol.blocks.length).toBe(vol.width * vol.length * vol.height);
  const seen = new Set<string>();
  for (const p of vol.palette) {
    expect(p.name.startsWith('minecraft:') || p.name.includes(':')).toBe(true);
    expect(['minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void']).not.toContain(
      p.name,
    );
    const k = stateKey(p);
    expect(seen.has(k)).toBe(false);
    seen.add(k);
    for (const v of Object.values(p.properties)) expect(typeof v).toBe('string');
  }
  for (let i = 0; i < vol.blocks.length; i++) {
    if ((vol.blocks[i] as number) >= vol.palette.length) throw new Error('bad index');
  }
}

describe('fixtures', () => {
  const house = {
    'house_v2.schem': 'sponge-v2',
    'house_v3.schem': 'sponge-v3',
    'house.litematic': 'litematic',
    'house.nbt': 'structure-nbt',
  } as const;

  for (const [file, format] of Object.entries(house)) {
    it(`parses ${file}`, () => {
      const vol = parse(file);
      expect(vol.metadata.format).toBe(format);
      expect([vol.width, vol.height, vol.length]).toEqual([16, 16, 16]);
      invariants(vol);
      expect(vol.blocks.some((b) => b !== 0)).toBe(true);
      expect(detectFormat(load(file).bytes, file)).toBe(format);
    });
  }

  it('produces identical house grids across formats', () => {
    const ref = keys(parse('house_v2.schem'));
    for (const file of ['house_v3.schem', 'house.litematic', 'house.nbt']) {
      expect(keys(parse(file))).toEqual(ref);
    }
  });

  it('keeps block entities consistent', () => {
    for (const file of Object.keys(house)) {
      const vol = parse(file);
      for (const be of vol.blockEntities) {
        expect(be.id.includes(':')).toBe(true);
        expect(be.pos.every((n) => Number.isInteger(n))).toBe(true);
        expect(getBlock(vol, be.pos[0], be.pos[1], be.pos[2]).name).not.toBe('minecraft:air');
      }
    }
  });

  it('parses the village fixtures quickly and consistently', () => {
    const a = load('village_v3.schem').buffer;
    const b = load('village.litematic').buffer;
    parseSchematic(a, 'a');
    const t0 = performance.now();
    const v3 = parseSchematic(a, 'village_v3.schem');
    const dt = performance.now() - t0;
    const lit = parseSchematic(b, 'village.litematic');
    expect([v3.width, v3.height, v3.length]).toEqual([64, 95, 64]);
    expect([lit.width, lit.height, lit.length]).toEqual([64, 95, 64]);
    invariants(v3);
    invariants(lit);
    expect(keys(lit)).toEqual(keys(v3));
    expect(dt).toBeLessThan(100);
  });
});

describe('synthetic sponge v1', () => {
  function build(extra: Record<string, ReturnType<typeof int>> = {}): ArrayBuffer {
    const ids = [0, 1, 2, 1, 3, 0, 1, 2, 300];
    return gzipNbt(
      {
        Version: int(1),
        Width: short(3),
        Height: short(1),
        Length: short(3),
        PaletteMax: int(5),
        Palette: compound({
          'minecraft:air': int(0),
          'minecraft:stone': int(1),
          'oak_stairs[half=bottom,facing=north]': int(2),
          'minecraft:cave_air': int(3),
          'minecraft:dirt': int(300),
        }),
        BlockData: bytes(varintBytes(ids)),
        Metadata: compound({ Name: str('Test'), Author: str('Me') }),
        ...extra,
      },
      'Schematic',
    );
  }

  it('parses palette, varints and metadata', () => {
    const vol = parseSchematic(build(), 'x.schem');
    expect(vol.metadata).toMatchObject({ format: 'sponge-v1', name: 'Test', author: 'Me' });
    expect(vol.palette.map(stateKey)).toEqual([
      'minecraft:air',
      'minecraft:stone',
      'minecraft:oak_stairs[facing=north,half=bottom]',
      'minecraft:dirt',
    ]);
    expect(Array.from(vol.blocks)).toEqual([0, 1, 2, 1, 0, 0, 1, 2, 3]);
    expect(stateKey(getBlock(vol, 1, 0, 1))).toBe('minecraft:air');
    expect(stateKey(getBlock(vol, 2, 0, 2))).toBe('minecraft:dirt');
    expect(detectFormat(new Uint8Array(build()), 'x.schem')).toBe('sponge-v1');
  });

  it('rejects data that is too short', () => {
    const buf = gzipNbt({
      Version: int(1),
      Width: short(5),
      Height: short(5),
      Length: short(5),
      Palette: compound({ 'minecraft:stone': int(0) }),
      BlockData: bytes([0, 0]),
    });
    expect(() => parseSchematic(buf, 'x.schem')).toThrow(SchematicParseError);
  });
});

describe('palette handling', () => {
  it('rejects gaps in sponge palette ids', () => {
    const buf = gzipNbt({
      Version: int(1),
      Width: short(2),
      Height: short(1),
      Length: short(1),
      Palette: compound({ 'minecraft:stone': int(0), 'minecraft:dirt': int(2) }),
      BlockData: bytes([0, 1]),
    });
    expect(() => parseSchematic(buf, 'x.schem')).toThrow(/missing palette entry/);
  });

  it('drops unused palette entries and normalizes empty metadata', () => {
    const buf = gzipNbt({
      Version: int(1),
      Width: short(2),
      Height: short(1),
      Length: short(1),
      Palette: compound({
        'minecraft:air': int(0),
        'minecraft:stone': int(1),
        'minecraft:dirt': int(2),
        'minecraft:sand': int(3),
      }),
      BlockData: bytes([3, 3]),
      Metadata: compound({ Name: str(''), Author: str('  ') }),
    });
    const vol = parseSchematic(buf, 'x.schem');
    expect(vol.palette.map(stateKey)).toEqual(['minecraft:air', 'minecraft:sand']);
    expect(Array.from(vol.blocks)).toEqual([1, 1]);
    expect(vol.metadata.name).toBeUndefined();
    expect(vol.metadata.author).toBeUndefined();
  });
});

describe('synthetic litematic', () => {
  function region(
    pos: [number, number, number],
    size: [number, number, number],
    names: string[],
    values: number[],
  ) {
    const count = values.length;
    const bits = Math.max(2, Math.ceil(Math.log2(names.length)));
    const total = Math.ceil((count * bits) / 64);
    const arr = new Array<bigint>(total).fill(0n);
    values.forEach((v, i) => {
      const start = i * bits;
      const idx = Math.floor(start / 64);
      const off = start % 64;
      arr[idx] = BigInt.asUintN(64, (arr[idx] as bigint) | (BigInt(v) << BigInt(off)));
      if (off + bits > 64)
        arr[idx + 1] = (arr[idx + 1] as bigint) | (BigInt(v) >> BigInt(64 - off));
    });
    return compound({
      Position: compound({ x: int(pos[0]), y: int(pos[1]), z: int(pos[2]) }),
      Size: compound({ x: int(size[0]), y: int(size[1]), z: int(size[2]) }),
      BlockStatePalette: list(
        10,
        names.map((n) => compound({ Name: str(n) })),
      ),
      BlockStates: longs(arr),
      TileEntities: list(10, []),
    });
  }

  it('does not overwrite earlier regions with air', () => {
    const buf = gzipNbt({
      Regions: compound({
        a: region([0, 0, 0], [2, 1, 1], ['minecraft:air', 'minecraft:stone'], [1, 1]),
        b: region([1, 0, 0], [2, 1, 1], ['minecraft:air', 'minecraft:dirt'], [0, 1]),
      }),
    });
    const vol = parseSchematic(buf, 'x.litematic');
    expect(Array.from({ length: 3 }, (_, x) => getBlock(vol, x, 0, 0).name)).toEqual([
      'minecraft:stone',
      'minecraft:stone',
      'minecraft:dirt',
    ]);
  });

  it('merges regions including negative sizes into one box', () => {
    const buf = gzipNbt({
      MinecraftDataVersion: int(3700),
      Version: int(6),
      Metadata: compound({ Name: str('Merged') }),
      Regions: compound({
        a: region([0, 0, 0], [2, 1, 1], ['minecraft:air', 'minecraft:stone'], [1, 1]),
        b: region(
          [5, 0, 0],
          [-2, 1, 1],
          ['minecraft:air', 'minecraft:dirt', 'minecraft:sand'],
          [2, 1],
        ),
      }),
    });
    const vol = parseSchematic(buf, 'x.litematic');
    expect([vol.width, vol.height, vol.length]).toEqual([6, 1, 1]);
    expect(vol.metadata.dataVersion).toBe(3700);
    expect(Array.from({ length: 6 }, (_, x) => getBlock(vol, x, 0, 0).name)).toEqual([
      'minecraft:stone',
      'minecraft:stone',
      'minecraft:air',
      'minecraft:air',
      'minecraft:sand',
      'minecraft:dirt',
    ]);
  });
});

describe('errors', () => {
  it('rejects legacy MCEdit schematics', () => {
    const buf = gzipNbt(
      {
        Width: short(1),
        Height: short(1),
        Length: short(1),
        Materials: str('Alpha'),
        Blocks: bytes([1]),
        Data: bytes([0]),
      },
      'Schematic',
    );
    expect(() => parseSchematic(buf, 'old.schematic')).toThrow(/legacy MCEdit/);
  });

  it('rejects unknown nbt and non nbt data', () => {
    expect(() => parseSchematic(gzipNbt({ foo: int(1) }), 'x.nbt')).toThrow(
      /not a supported schematic/,
    );
    expect(() => parseSchematic(new Uint8Array([1, 2, 3, 4]).buffer, 'x.schem')).toThrow(
      SchematicParseError,
    );
    expect(() => parseSchematic(new ArrayBuffer(0), 'x.schem')).toThrow(SchematicParseError);
  });

  it('rejects oversized volumes before allocating', () => {
    const buf = gzipNbt({
      Version: int(3),
      DataVersion: int(1),
      Blocks: compound({}),
    });
    expect(() => parseSchematic(buf, 'x.schem')).toThrow(SchematicParseError);
    const big = gzipNbt({
      size: list(3, [int(2000), int(2000), int(2000)]),
      palette: list(10, [compound({ Name: str('minecraft:stone') })]),
      blocks: list(10, []),
    });
    expect(() => parseSchematic(big, 'x.nbt')).toThrow(/too large/);
  });

  it('treats structure void and air variants as air', () => {
    const raw = writeNbt({
      size: list(3, [int(2), int(1), int(1)]),
      DataVersion: int(3700),
      palette: list(10, [
        compound({ Name: str('minecraft:structure_void') }),
        compound({ Name: str('stone') }),
      ]),
      blocks: list(10, [
        compound({ pos: list(3, [int(0), int(0), int(0)]), state: int(0) }),
        compound({ pos: list(3, [int(1), int(0), int(0)]), state: int(1) }),
      ]),
    });
    const vol = parseSchematic(raw.buffer.slice(0) as ArrayBuffer, 'x.nbt');
    expect(Array.from(vol.blocks)).toEqual([0, 1]);
    expect(vol.palette[1]?.name).toBe('minecraft:stone');
  });
});
