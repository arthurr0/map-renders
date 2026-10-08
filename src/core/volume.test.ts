import { describe, expect, it } from 'vitest';
import { blockIndex, getBlock, parseStateKey, stateKey } from './volume';
import type { SchematicVolume } from './types';

function makeVolume(): SchematicVolume {
  const blocks = new Uint32Array(2 * 3 * 4);
  const volume: SchematicVolume = {
    width: 2,
    height: 3,
    length: 4,
    palette: [
      { name: 'minecraft:air', properties: {} },
      { name: 'minecraft:stone', properties: {} },
      { name: 'minecraft:oak_stairs', properties: { half: 'bottom', facing: 'north' } },
    ],
    blocks,
    blockEntities: [],
    metadata: { format: 'sponge-v2' },
  };
  blocks[blockIndex(volume, 1, 2, 3)] = 1;
  blocks[blockIndex(volume, 0, 1, 2)] = 2;
  return volume;
}

describe('blockIndex', () => {
  it('uses x + z*width + y*width*length', () => {
    const volume = makeVolume();
    expect(blockIndex(volume, 0, 0, 0)).toBe(0);
    expect(blockIndex(volume, 1, 0, 0)).toBe(1);
    expect(blockIndex(volume, 0, 0, 1)).toBe(2);
    expect(blockIndex(volume, 0, 1, 0)).toBe(8);
    expect(blockIndex(volume, 1, 2, 3)).toBe(1 + 3 * 2 + 2 * 8);
  });
});

describe('getBlock', () => {
  it('returns the palette entry', () => {
    const volume = makeVolume();
    expect(getBlock(volume, 1, 2, 3).name).toBe('minecraft:stone');
    expect(getBlock(volume, 0, 1, 2).properties.facing).toBe('north');
  });

  it('returns air for empty cells and out of range', () => {
    const volume = makeVolume();
    expect(getBlock(volume, 0, 0, 0).name).toBe('minecraft:air');
    expect(getBlock(volume, -1, 0, 0).name).toBe('minecraft:air');
    expect(getBlock(volume, 2, 0, 0).name).toBe('minecraft:air');
    expect(getBlock(volume, 0, 3, 0).name).toBe('minecraft:air');
    expect(getBlock(volume, 0, 0, 4).name).toBe('minecraft:air');
  });
});

describe('stateKey', () => {
  it('returns the bare name without properties', () => {
    expect(stateKey({ name: 'minecraft:stone', properties: {} })).toBe('minecraft:stone');
  });

  it('sorts properties', () => {
    expect(
      stateKey({ name: 'minecraft:oak_stairs', properties: { half: 'bottom', facing: 'north' } }),
    ).toBe('minecraft:oak_stairs[facing=north,half=bottom]');
  });
});

describe('parseStateKey', () => {
  it('parses a bare name', () => {
    expect(parseStateKey('minecraft:stone')).toEqual({ name: 'minecraft:stone', properties: {} });
  });

  it('parses properties', () => {
    expect(parseStateKey('minecraft:oak_stairs[facing=north,half=bottom]')).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', half: 'bottom' },
    });
  });

  it('round trips', () => {
    const key = 'minecraft:lever[face=wall,facing=east,powered=true]';
    expect(stateKey(parseStateKey(key))).toBe(key);
  });
});
