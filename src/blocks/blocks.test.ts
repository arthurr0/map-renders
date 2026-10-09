import { describe, expect, it } from 'vitest';
import { parseStateKey } from '../core/volume';
import {
  isKnownBlock,
  requiredTextures,
  resolveBlockModel,
  type BlockModel,
  type NeighborLookup,
} from './index';
import { rotateElement } from './geometry';
import { el } from './build';

const air: NeighborLookup = () => ({ name: 'minecraft:air', properties: {} });

function model(key: string, neighbors: NeighborLookup = air): BlockModel {
  const m = resolveBlockModel(parseStateKey(key), neighbors);
  if (!m) throw new Error(`no model for ${key}`);
  return m;
}

function occluded(m: BlockModel): string[] {
  return Object.entries(m.occludes)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();
}

describe('full cubes', () => {
  it('stone is an occluding full cube', () => {
    const m = model('minecraft:stone');
    expect(m.fullCube).toBe(true);
    expect(m.layer).toBe('opaque');
    expect(occluded(m)).toEqual(['down', 'east', 'north', 'south', 'up', 'west']);
    expect(m.elements[0]!.faces.up!.texture).toBe('block/stone');
  });

  it('logs rotate with axis', () => {
    const y = model('minecraft:oak_log[axis=y]');
    expect(y.elements[0]!.faces.up!.texture).toBe('block/oak_log_top');
    const x = model('minecraft:oak_log[axis=x]');
    expect(x.elements[0]!.faces.east!.texture).toBe('block/oak_log_top');
    expect(x.elements[0]!.faces.west!.texture).toBe('block/oak_log_top');
    expect(x.elements[0]!.faces.up!.texture).toBe('block/oak_log');
    const z = model('minecraft:oak_log[axis=z]');
    expect(z.elements[0]!.faces.north!.texture).toBe('block/oak_log_top');
  });

  it('grass block has a tinted overlay layer', () => {
    const m = model('minecraft:grass_block[snowy=false]');
    expect(m.elements).toHaveLength(2);
    expect(m.elements[0]!.faces.up!.tint).toBe('grass');
    const overlay = m.elements[1]!.faces.north!;
    expect(overlay.texture).toBe('block/grass_block_side_overlay');
    expect(overlay.layer).toBe('cutout');
    expect(overlay.tint).toBe('grass');
    expect(occluded(m)).toHaveLength(6);
    const snowy = model('minecraft:grass_block[snowy=true]');
    expect(snowy.elements[0]!.faces.north!.texture).toBe('block/grass_block_snow');
  });

  it('furnace front follows facing', () => {
    const m = model('minecraft:furnace[facing=east,lit=true]');
    expect(m.elements[0]!.faces.east!.texture).toBe('block/furnace_front_on');
    expect(m.elements[0]!.faces.east!.emissive).toBeGreaterThan(0);
  });

  it('leaves are cutout, tinted and do not occlude', () => {
    const m = model('minecraft:oak_leaves[distance=1,persistent=true]');
    expect(m.layer).toBe('cutout');
    expect(occluded(m)).toEqual([]);
    expect(m.cullGroup).toBeUndefined();
    expect(m.elements[0]!.faces.up!.tint).toBe('foliage');
    expect(model('minecraft:birch_leaves').elements[0]!.faces.up!.tintColor).not.toEqual(
      model('minecraft:oak_leaves').elements[0]!.faces.up!.tintColor,
    );
  });

  it('stained glass is translucent and culls same type', () => {
    const m = model('minecraft:red_stained_glass');
    expect(m.layer).toBe('translucent');
    expect(m.cullGroup).toBe('red_stained_glass');
  });
});

describe('slabs', () => {
  it('bottom slab occludes only down', () => {
    const m = model('minecraft:stone_brick_slab[type=bottom]');
    expect(m.fullCube).toBe(false);
    expect(occluded(m)).toEqual(['down']);
    expect(m.elements[0]!.faces.north!.texture).toBe('block/stone_bricks');
  });

  it('top slab occludes only up', () => {
    expect(occluded(model('minecraft:oak_slab[type=top]'))).toEqual(['up']);
  });

  it('double slab is a full cube', () => {
    const m = model('minecraft:smooth_stone_slab[type=double]');
    expect(m.fullCube).toBe(true);
    expect(occluded(m)).toHaveLength(6);
    expect(m.elements[0]!.faces.north!.texture).toBe('block/smooth_stone_slab_side');
  });
});

describe('stairs', () => {
  it('straight bottom stairs facing east', () => {
    const m = model('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]');
    expect(m.elements).toHaveLength(2);
    expect(occluded(m)).toEqual(['down', 'east']);
    const step = m.elements[1]!;
    expect(step.from).toEqual([8, 8, 0]);
    expect(step.to).toEqual([16, 16, 16]);
  });

  it('straight stairs facing north and top half', () => {
    expect(
      occluded(model('minecraft:oak_stairs[facing=north,half=bottom,shape=straight]')),
    ).toEqual(['down', 'north']);
    expect(occluded(model('minecraft:oak_stairs[facing=west,half=top,shape=straight]'))).toEqual([
      'up',
      'west',
    ]);
  });

  it('inner corners occlude two sides', () => {
    expect(
      occluded(model('minecraft:oak_stairs[facing=east,half=bottom,shape=inner_right]')),
    ).toEqual(['down', 'east', 'south']);
    expect(
      occluded(model('minecraft:oak_stairs[facing=east,half=bottom,shape=inner_left]')),
    ).toEqual(['down', 'east', 'north']);
    expect(occluded(model('minecraft:oak_stairs[facing=north,half=top,shape=inner_left]'))).toEqual(
      ['north', 'up', 'west'],
    );
  });

  it('outer corners occlude only the base', () => {
    const m = model('minecraft:oak_stairs[facing=east,half=bottom,shape=outer_right]');
    expect(occluded(m)).toEqual(['down']);
    expect(m.elements[1]!.from).toEqual([8, 8, 8]);
    const left = model('minecraft:oak_stairs[facing=east,half=bottom,shape=outer_left]');
    expect(left.elements[1]!.from).toEqual([8, 8, 0]);
    expect(left.elements[1]!.to).toEqual([16, 16, 8]);
    const top = model('minecraft:oak_stairs[facing=east,half=top,shape=outer_right]');
    expect(occluded(top)).toEqual(['up']);
    expect(top.elements[1]!.from).toEqual([8, 0, 8]);
  });

  it('uses uvlock so the top texture stays world aligned', () => {
    const m = model('minecraft:oak_stairs[facing=south,half=bottom,shape=straight]');
    const up = m.elements[0]!.faces.up!;
    expect(up.uv).toEqual([0, 0, 16, 16]);
    expect(up.rotation ?? 0).toBe(0);
  });
});

describe('connections', () => {
  it('fence has a post and arms per connection', () => {
    const none = model('minecraft:oak_fence[east=false,north=false,south=false,west=false]');
    expect(none.elements).toHaveLength(1);
    const two = model('minecraft:oak_fence[east=true,north=true,south=false,west=false]');
    expect(two.elements).toHaveLength(5);
    const east = two.elements.filter((e) => e.to[0] === 16);
    expect(east).toHaveLength(2);
    expect(two.elements[1]!.faces.north!.texture).toBe('block/oak_planks');
    expect(occluded(two)).toEqual([]);
  });

  it('fence connects from neighbours when properties are missing', () => {
    const lookup: NeighborLookup = (dx, _dy, dz) =>
      dx === 1 && dz === 0
        ? { name: 'minecraft:stone', properties: {} }
        : { name: 'minecraft:air', properties: {} };
    expect(model('minecraft:oak_fence', lookup).elements).toHaveLength(3);
  });

  it('walls use posts and tall sides', () => {
    const m = model(
      'minecraft:cobblestone_wall[east=none,north=tall,south=low,up=true,west=none,waterlogged=false]',
    );
    expect(m.elements).toHaveLength(3);
    expect(m.elements.some((e) => e.to[1] === 16 && e.from[2] === 0)).toBe(true);
    expect(m.elements.some((e) => e.to[1] === 14 && e.to[2] === 16)).toBe(true);
  });

  it('glass pane sides follow properties', () => {
    const m = model(
      'minecraft:glass_pane[east=true,north=false,south=false,west=true,waterlogged=false]',
    );
    expect(m.layer).toBe('cutout');
    const xs = m.elements.filter((e) => e.to[0] === 16 || e.from[0] === 0);
    expect(xs).toHaveLength(2);
  });
});

describe('entity and newer blocks', () => {
  it('maps chest lid top to the full sheet coordinates', () => {
    const m = model('minecraft:chest[facing=north,type=single,waterlogged=false]');
    const lid = m.elements[1]!;
    expect(lid.faces.up!.texture).toBe('entity/chest/normal');
    expect(lid.faces.up!.uv).toEqual([7, 0, 10.5, 3.5]);
    const front = lid.faces.north!.uv!;
    expect(front[0]).toBeCloseTo(10.5);
    expect(front[1]).toBeGreaterThan(front[3]);
  });

  it('uses grown pitcher textures and the new blocks resolve', () => {
    expect(model('minecraft:pitcher_plant[half=upper]').elements[0]!.faces.north!.texture).toBe(
      'block/pitcher_crop_top_stage_4',
    );
    for (const k of [
      'minecraft:oak_shelf[facing=north]',
      'minecraft:copper_golem_statue[facing=south]',
      'minecraft:dried_ghast[facing=east,hydration=2]',
      'minecraft:pale_hanging_moss[tip=true]',
      'minecraft:bamboo_fence[east=true,north=false,south=false,west=false]',
      'minecraft:bamboo_fence_gate[facing=north,open=false]',
    ]) {
      expect(model(k).unknown).toBeUndefined();
    }
    expect(
      model('minecraft:bamboo_fence[east=true,north=false,south=false,west=false]').elements[0]!
        .faces.north!.texture,
    ).toBe('block/bamboo_fence');
  });

  it('declares snow textures for neighbour dependent grass', () => {
    expect(requiredTextures([parseStateKey('minecraft:grass_block')])).toEqual(
      expect.arrayContaining(['block/grass_block_snow', 'block/snow']),
    );
  });

  it('exposes coarse coverage masks', () => {
    const slab = model('minecraft:oak_slab[type=bottom]');
    expect(slab.coverage?.down).toBe(0xffff);
    expect(slab.coverage?.north).toBeGreaterThan(0);
    expect(slab.coverage?.north).toBeLessThan(0xffff);
  });
});

describe('other families', () => {
  it('doors, trapdoors, torches, lanterns, plants resolve', () => {
    expect(
      model('minecraft:spruce_door[facing=north,half=lower,hinge=left,open=false,powered=false]')
        .elements[0]!.faces.north!.texture,
    ).toBe('block/spruce_door_bottom');
    const torch = model('minecraft:wall_torch[facing=north]');
    expect(torch.elements[0]!.faces.up!.emissive).toBe(1);
    const lantern = model('minecraft:lantern[hanging=true,waterlogged=false]');
    expect(lantern.elements[0]!.from[1]).toBe(1);
    const grass = model('minecraft:short_grass');
    expect(grass.elements[0]!.rotation!.angle).toBe(45);
    expect(grass.elements[0]!.faces.north!.fallback).toEqual(['block/grass']);
    const wheat = model('minecraft:wheat[age=7]');
    expect(wheat.elements[0]!.faces.west!.texture).toBe('block/wheat_stage7');
    expect(model('minecraft:carrots[age=5]').elements[0]!.faces.west!.texture).toBe(
      'block/carrots_stage2',
    );
    const tall = model('minecraft:tall_grass[half=upper]');
    expect(tall.elements[0]!.faces.north!.texture).toBe('block/tall_grass_top');
  });

  it('waterlogged blocks carry water', () => {
    expect(
      model('minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=true]').liquid,
    ).toBe('water');
    expect(model('minecraft:seagrass').liquid).toBe('water');
    const w = model('minecraft:water[level=3]');
    expect(w.liquid).toBe('water');
    expect(w.liquidLevel).toBe(3);
    expect(w.elements).toHaveLength(0);
  });

  it('hidden blocks resolve to null', () => {
    expect(resolveBlockModel(parseStateKey('minecraft:barrier'), air)).toBeNull();
    expect(resolveBlockModel(parseStateKey('minecraft:structure_void'), air)).toBeNull();
    expect(resolveBlockModel(parseStateKey('minecraft:air'), air)).toBeNull();
  });

  it('unknown blocks fall back to a cube', () => {
    const m = model('minecraft:mystery_block');
    expect(m.unknown).toBe(true);
    expect(m.fullCube).toBe(true);
    expect(m.elements[0]!.faces.up!.texture).toBe('block/mystery_block');
    expect(occluded(m)).toHaveLength(6);
    const col = model('minecraft:mystery_pillar[axis=y]');
    expect(col.elements[0]!.faces.up!.texture).toBe('block/mystery_pillar_top');
    expect(col.elements[0]!.faces.north!.fallback).toEqual(['block/mystery_pillar']);
    expect(isKnownBlock('minecraft:mystery_block')).toBe(false);
    expect(isKnownBlock('minecraft:stone')).toBe(true);
  });

  it('rails ascend toward the named side', () => {
    const m = model('minecraft:rail[shape=ascending_north]');
    expect(m.elements[0]!.rotation!.axis).toBe('x');
    expect(m.elements[0]!.rotation!.angle).toBe(45);
  });

  it('requiredTextures collects all faces and water', () => {
    const ids = requiredTextures([
      parseStateKey('minecraft:grass_block[snowy=false]'),
      parseStateKey(
        'minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=true]',
      ),
      parseStateKey('minecraft:air'),
    ]);
    expect(ids).toEqual(
      expect.arrayContaining([
        'block/grass_block_top',
        'block/grass_block_side',
        'block/grass_block_side_overlay',
        'block/dirt',
        'block/oak_planks',
        'block/water_still',
        'block/water_flow',
      ]),
    );
  });
});

describe('model rotation', () => {
  it('keeps texture attached to geometry without uvlock', () => {
    const e = el([0, 0, 0], [16, 16, 16], { north: { texture: 'a', uv: [0, 0, 16, 8] } });
    const r = rotateElement(e, 0, 90, false);
    const f = r.faces.east!;
    expect(f.texture).toBe('a');
    expect(f.uv).toEqual([0, 0, 16, 8]);
  });

  it('rotates up face texture for y rotation', () => {
    const e = el([0, 0, 0], [16, 16, 16], { up: { texture: 'a' } });
    const r = rotateElement(e, 0, 90, false);
    expect(r.faces.up!.rotation).toBe(90);
  });
});
