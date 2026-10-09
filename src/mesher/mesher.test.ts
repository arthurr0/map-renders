import { describe, expect, it } from 'vitest';
import type { MeshBuffers, MeshOptions, MeshResult } from '../core/types';
import { AO_LEVELS, buildMesh } from './index';
import { atlasFor, readSpongeV3, VolumeBuilder } from './test-utils';

const NODE_FS = 'node:fs';

async function readFixture(name: string): Promise<Uint8Array> {
  const fs = await import(NODE_FS);
  const here = import.meta.url;
  return new Uint8Array(fs.readFileSync(new URL(`../../tests/fixtures/${name}`, here)));
}

const textured: MeshOptions = {
  mode: 'textured',
  ambientOcclusion: false,
  chunkSize: 32,
  hideBlocks: [],
};

function mesh(v: VolumeBuilder, opts: Partial<MeshOptions> = {}): MeshResult {
  const volume = v.build();
  return buildMesh(volume, atlasFor(volume), { ...textured, ...opts });
}

function quads(r: MeshResult, filter: (m: MeshBuffers) => boolean = () => true): number {
  return r.meshes.filter(filter).reduce((n, m) => n + m.indices.length / 6, 0);
}

function vertices(m: MeshBuffers): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    out.push([
      m.positions[i]! + m.origin[0],
      m.positions[i + 1]! + m.origin[1],
      m.positions[i + 2]! + m.origin[2],
    ]);
  }
  return out;
}

describe('culling', () => {
  it('2x2x2 stone cube has 24 faces', () => {
    const r = mesh(new VolumeBuilder(2, 2, 2).fill(0, 0, 0, 1, 1, 1, 'stone'));
    expect(r.stats.faces).toBe(24);
    expect(quads(r)).toBe(24);
    expect(r.stats.blocks).toBe(8);
    expect(r.bounds).toEqual({ min: [0, 0, 0], max: [2, 2, 2] });
  });

  it('boundary faces of the schematic are rendered', () => {
    const r = mesh(new VolumeBuilder(1, 1, 1).set(0, 0, 0, 'stone'));
    expect(r.stats.faces).toBe(6);
  });

  it('culls internal faces between same glass but not leaves', () => {
    const glass = mesh(new VolumeBuilder(2, 1, 1).fill(0, 0, 0, 1, 0, 0, 'glass'));
    expect(glass.stats.faces).toBe(10);
    const mixed = mesh(
      new VolumeBuilder(2, 1, 1)
        .set(0, 0, 0, 'red_stained_glass')
        .set(1, 0, 0, 'blue_stained_glass'),
    );
    expect(mixed.stats.faces).toBe(12);
    const leaves = mesh(new VolumeBuilder(2, 1, 1).fill(0, 0, 0, 1, 0, 0, 'oak_leaves'));
    expect(leaves.stats.faces).toBe(12);
  });

  it('slab double occludes, bottom slab only below', () => {
    const doubleSlab = mesh(
      new VolumeBuilder(1, 2, 1).set(0, 0, 0, 'stone').set(0, 1, 0, 'stone_slab[type=double]'),
    );
    expect(doubleSlab.stats.faces).toBe(10);
    const bottom = mesh(
      new VolumeBuilder(1, 2, 1).set(0, 0, 0, 'stone').set(0, 1, 0, 'stone_slab[type=bottom]'),
    );
    expect(bottom.stats.faces).toBe(5 + 5);
    const top = mesh(
      new VolumeBuilder(1, 2, 1).set(0, 0, 0, 'stone').set(0, 1, 0, 'stone_slab[type=top]'),
    );
    expect(top.stats.faces).toBe(6 + 6);
  });

  it('stairs back face is culled by a neighbour', () => {
    const r = mesh(
      new VolumeBuilder(2, 1, 1)
        .set(0, 0, 0, 'oak_stairs[facing=east,half=bottom,shape=straight]')
        .set(1, 0, 0, 'stone'),
    );
    expect(r.stats.faces).toBe(11 - 2 + 5);
  });

  it('hides barriers and requested blocks', () => {
    const v = new VolumeBuilder(3, 1, 1)
      .set(0, 0, 0, 'barrier')
      .set(1, 0, 0, 'stone')
      .set(2, 0, 0, 'dirt');
    const r = mesh(v, { hideBlocks: ['dirt'] });
    expect(r.stats.blocks).toBe(1);
    expect(r.stats.faces).toBe(6);
  });
});

describe('ambient occlusion', () => {
  it('darkens corners next to occluders', () => {
    const v = new VolumeBuilder(3, 2, 3).set(1, 0, 1, 'stone').set(2, 1, 1, 'stone');
    const r = mesh(v, { ambientOcclusion: true });
    const m = r.meshes.find((x) => x.layer === 'opaque')!;
    const verts = vertices(m);
    let found = 0;
    for (let i = 0; i < verts.length; i++) {
      const [x, y] = verts[i]!;
      const ny = m.normals[i * 3 + 1]!;
      if (ny !== 1 || y !== 1 || verts[i]![2] < 1 || verts[i]![2] > 2) continue;
      if (verts[i]![0] < 1 || verts[i]![0] > 2) continue;
      const c = m.colors[i * 3]!;
      if (x === 2) expect(c).toBeCloseTo(AO_LEVELS[1]!, 5);
      else expect(c).toBeCloseTo(1, 5);
      found++;
    }
    expect(found).toBe(4);
  });

  it('two sides give the darkest corner', () => {
    const v = new VolumeBuilder(3, 2, 3)
      .set(1, 0, 1, 'stone')
      .set(2, 1, 1, 'stone')
      .set(1, 1, 2, 'stone');
    const r = mesh(v, { ambientOcclusion: true });
    const m = r.meshes.find((x) => x.layer === 'opaque')!;
    const verts = vertices(m);
    const idx = verts.findIndex(
      ([x, y, z], i) =>
        x === 2 && y === 1 && z === 2 && m.normals[i * 3 + 1] === 1 && verts[i]![0] === 2,
    );
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(m.colors[idx * 3]!).toBeCloseTo(AO_LEVELS[3]!, 5);
  });

  it('no AO when disabled', () => {
    const v = new VolumeBuilder(3, 2, 3).set(1, 0, 1, 'stone').set(2, 1, 1, 'stone');
    const r = mesh(v, { ambientOcclusion: false });
    for (const m of r.meshes) for (const c of m.colors) expect(c).toBe(1);
  });
});

describe('liquids', () => {
  it('lone water source has averaged corner heights', () => {
    const r = mesh(new VolumeBuilder(3, 1, 3).set(1, 0, 1, 'water[level=0]'));
    const water = r.meshes.find((m) => m.isWater)!;
    expect(water.layer).toBe('translucent');
    const tops = vertices(water).filter((_, i) => water.normals[i * 3 + 1]! > 0.5);
    const expected = ((8 / 9) * 10) / 12 - 0.001;
    expect(tops).toHaveLength(4);
    for (const v of tops) expect(v[1]).toBeCloseTo(expected, 4);
  });

  it('water next to solid blocks keeps the source height', () => {
    const v = new VolumeBuilder(3, 1, 3)
      .fill(0, 0, 0, 2, 0, 2, 'stone')
      .set(1, 0, 1, 'water[level=0]');
    const r = mesh(v);
    const water = r.meshes.find((m) => m.isWater)!;
    expect(water.indices.length / 6).toBe(3);
    const tops = vertices(water).filter((_, i) => water.normals[i * 3 + 1]! > 0.5);
    for (const t of tops) expect(t[1]).toBeCloseTo(8 / 9 - 0.001, 4);
  });

  it('water under water is full height and internal faces are culled', () => {
    const r = mesh(
      new VolumeBuilder(1, 2, 1).set(0, 0, 0, 'water[level=0]').set(0, 1, 0, 'water[level=0]'),
    );
    const water = r.meshes.find((m) => m.isWater)!;
    const verts = vertices(water);
    expect(verts.some(([, y]) => y > 1 && y < 1.9)).toBe(true);
    expect(water.indices.length / 6).toBe(2 + 1 + 8);
  });

  it('waterlogged stairs emit water and stairs geometry', () => {
    const r = mesh(
      new VolumeBuilder(1, 1, 1).set(
        0,
        0,
        0,
        'oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=true]',
      ),
    );
    expect(r.meshes.some((m) => m.isWater)).toBe(true);
    expect(r.meshes.some((m) => m.layer === 'opaque' && !m.isWater)).toBe(true);
  });

  it('water faces against waterlogged neighbours are culled', () => {
    const r = mesh(
      new VolumeBuilder(2, 1, 1)
        .set(0, 0, 0, 'water')
        .set(1, 0, 0, 'oak_slab[type=bottom,waterlogged=true]'),
    );
    const water = r.meshes.find((m) => m.isWater)!;
    const eastFacing = [...Array(water.normals.length / 3).keys()].filter(
      (i) => water.normals[i * 3]! > 0.5 && water.positions[i * 3]! + water.origin[0] === 1,
    );
    expect(eastFacing).toHaveLength(0);
  });

  it('lava is opaque and emissive', () => {
    const r = mesh(new VolumeBuilder(1, 1, 1).set(0, 0, 0, 'lava'));
    const m = r.meshes.find((x) => x.layer === 'opaque')!;
    expect(m.isWater).toBe(false);
    expect([...m.emissive].every((e) => e === 1)).toBe(true);
  });
});

describe('emissive', () => {
  it('flags light emitting blocks', () => {
    const r = mesh(new VolumeBuilder(3, 1, 1).set(0, 0, 0, 'glowstone').set(2, 0, 0, 'stone'));
    const m = r.meshes.find((x) => x.layer === 'opaque')!;
    const verts = vertices(m);
    verts.forEach(([x], i) => {
      if (x <= 1) expect(m.emissive[i]).toBe(1);
      else expect(m.emissive[i]).toBe(0);
    });
  });

  it('torch faces are emissive', () => {
    const r = mesh(new VolumeBuilder(1, 1, 1).set(0, 0, 0, 'torch'));
    const m = r.meshes.find((x) => x.layer === 'cutout')!;
    expect([...m.emissive].every((e) => e === 1)).toBe(true);
  });
});

describe('chunks and output', () => {
  it('splits by chunk size with relative positions', () => {
    const r = mesh(new VolumeBuilder(40, 1, 1).fill(0, 0, 0, 39, 0, 0, 'stone'), { chunkSize: 16 });
    const opaque = r.meshes.filter((m) => m.layer === 'opaque');
    expect(opaque.map((m) => m.origin[0])).toEqual([0, 16, 32]);
    for (const m of opaque) {
      for (let i = 0; i < m.positions.length; i += 3) {
        expect(m.positions[i]).toBeGreaterThanOrEqual(0);
        expect(m.positions[i]).toBeLessThanOrEqual(16);
      }
    }
    expect(r.stats.faces).toBe(40 * 4 + 2);
  });

  it('separates layers', () => {
    const r = mesh(
      new VolumeBuilder(3, 1, 1)
        .set(0, 0, 0, 'stone')
        .set(1, 0, 0, 'poppy')
        .set(2, 0, 0, 'red_stained_glass'),
    );
    expect(r.meshes.map((m) => m.layer).sort()).toEqual(['cutout', 'opaque', 'translucent']);
  });

  it('buffers have consistent sizes', () => {
    const r = mesh(
      new VolumeBuilder(2, 2, 2)
        .fill(0, 0, 0, 1, 0, 1, 'grass_block[snowy=false]')
        .set(0, 1, 0, 'oak_fence'),
    );
    for (const m of r.meshes) {
      const n = m.positions.length / 3;
      expect(m.normals.length).toBe(n * 3);
      expect(m.colors.length).toBe(n * 3);
      expect(m.uvs.length).toBe(n * 2);
      expect(m.emissive.length).toBe(n);
      expect(m.indices.length).toBe((n / 4) * 6);
      expect(m.indices).toBeInstanceOf(Uint32Array);
    }
  });

  it('maps uvs into atlas regions', () => {
    const volume = new VolumeBuilder(1, 1, 1).set(0, 0, 0, 'stone').build();
    const atlas = atlasFor(volume);
    const r = buildMesh(volume, atlas, textured);
    const region = atlas.regions['block/stone']!;
    const m = r.meshes[0]!;
    for (let i = 0; i < m.uvs.length; i += 2) {
      expect(m.uvs[i]).toBeGreaterThanOrEqual(region.u0 - 1e-6);
      expect(m.uvs[i]).toBeLessThanOrEqual(region.u1 + 1e-6);
      expect(m.uvs[i + 1]).toBeGreaterThanOrEqual(region.v0 - 1e-6);
      expect(m.uvs[i + 1]).toBeLessThanOrEqual(region.v1 + 1e-6);
    }
  });

  it('orients face uvs like vanilla, top-left of the texture at the top', () => {
    const volume = new VolumeBuilder(1, 1, 1).set(0, 0, 0, 'stone').build();
    const atlas = atlasFor(volume);
    const region = atlas.regions['block/stone']!;
    const m = buildMesh(volume, atlas, textured).meshes[0]!;
    const verts = vertices(m);
    const find = (nx: number, nz: number, x: number, y: number, z: number) =>
      verts.findIndex(
        (v, i) =>
          m.normals[i * 3] === nx &&
          m.normals[i * 3 + 2] === nz &&
          v[0] === x &&
          v[1] === y &&
          v[2] === z,
      );
    const north = find(0, -1, 1, 1, 0);
    expect(m.uvs[north * 2]).toBeCloseTo(region.u0, 6);
    expect(m.uvs[north * 2 + 1]).toBeCloseTo(region.v0, 6);
    const south = find(0, 1, 0, 1, 1);
    expect(m.uvs[south * 2]).toBeCloseTo(region.u0, 6);
    expect(m.uvs[south * 2 + 1]).toBeCloseTo(region.v0, 6);
    const east = find(1, 0, 1, 0, 0);
    expect(m.uvs[east * 2]).toBeCloseTo(region.u1, 6);
    expect(m.uvs[east * 2 + 1]).toBeCloseTo(region.v1, 6);
  });

  it('reports unknown blocks and uses fallback textures', () => {
    const volume = new VolumeBuilder(2, 1, 1)
      .set(0, 0, 0, 'mystery_block')
      .set(1, 0, 0, 'short_grass')
      .build();
    const atlas = atlasFor(volume, []);
    atlas.missing.push('block/short_grass');
    const r = buildMesh(volume, atlas, textured);
    expect(r.stats.unknownBlocks).toEqual(['minecraft:mystery_block']);
    const cutout = r.meshes.find((m) => m.layer === 'cutout')!;
    const grass = atlas.regions['block/grass']!;
    expect(cutout.uvs[0]).toBeGreaterThanOrEqual(grass.u0 - 1e-6);
    expect(cutout.uvs[0]).toBeLessThanOrEqual(grass.u1 + 1e-6);
  });
});

describe('simplified mode', () => {
  it('greedy merges flat surfaces', () => {
    const v = new VolumeBuilder(4, 1, 4).fill(0, 0, 0, 3, 0, 3, 'stone');
    const r = mesh(v, { mode: 'simplified', ambientOcclusion: false });
    expect(r.stats.faces).toBe(6);
    const m = r.meshes[0]!;
    expect([...m.uvs].every((u) => u === 0)).toBe(true);
    expect(m.colors[0]).toBeCloseTo(0.214, 2);
  });

  it('keeps AO and does not merge across AO differences', () => {
    const v = new VolumeBuilder(4, 2, 4).fill(0, 0, 0, 3, 0, 3, 'stone').set(0, 1, 0, 'stone');
    const r = mesh(v, { mode: 'simplified', ambientOcclusion: true });
    const flat = mesh(v, { mode: 'simplified', ambientOcclusion: false });
    expect(r.stats.faces).toBeGreaterThan(flat.stats.faces);
  });
});

describe('performance', () => {
  it('meshes the village fixture quickly', async () => {
    const volume = readSpongeV3(await readFixture('village_v3.schem'));
    expect(volume.width).toBe(64);
    const atlas = atlasFor(volume);
    buildMesh(volume, atlas, { ...textured, ambientOcclusion: true });
    const t0 = performance.now();
    const r = buildMesh(volume, atlas, { ...textured, ambientOcclusion: true });
    const dt = performance.now() - t0;
    const t1 = performance.now();
    const s = buildMesh(volume, atlas, { ...textured, mode: 'simplified', ambientOcclusion: true });
    const ds = performance.now() - t1;
    console.log(
      `village textured ${dt.toFixed(1)} ms, ${r.stats.faces} faces; simplified ${ds.toFixed(1)} ms, ${s.stats.faces} faces; unknown ${r.stats.unknownBlocks.join(',')}`,
    );
    expect(r.stats.unknownBlocks).toEqual([]);
    expect(dt).toBeLessThan(300);
  });

  it('handles a dense 256^3 volume', () => {
    const size = 256;
    const v = new VolumeBuilder(size, size, size);
    v.set(0, 0, 0, 'stone');
    v.blocks.fill(1);
    const volume = v.build();
    const atlas = atlasFor(volume);
    const t0 = performance.now();
    const r = buildMesh(volume, atlas, { ...textured, ambientOcclusion: true });
    const dt = performance.now() - t0;
    console.log(`dense 256^3 ${dt.toFixed(0)} ms, ${r.stats.faces} faces`);
    expect(r.stats.faces).toBe(6 * size * size);
  }, 60000);
});
