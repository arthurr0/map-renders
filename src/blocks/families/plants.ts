import { el, face, part, single, type FaceInput, type ModelSpec, type Part } from '../build';
import {
  flag,
  num,
  orientUpFront,
  prop,
  yaw,
  YAW_NORTH,
  YAW_SOUTH,
  type Ctx,
  type Family,
} from '../context';
import { stemColor, TINT_RGB } from '../tints';
import type { ModelElement, ModelFace } from '../types';

const GRASS_TINT: Partial<ModelFace> = { tint: 'grass', tintColor: TINT_RGB.grass };
const FOLIAGE_TINT: Partial<ModelFace> = { tint: 'foliage', tintColor: TINT_RGB.foliage };

export function crossElements(
  t: FaceInput,
  y0 = 0,
  y1 = 16,
  inset = 0.8,
  uv: [number, number, number, number] = [0, 0, 16, 16],
): ModelElement[] {
  const base = face(t);
  const f = base.uv ? base : { ...base, uv };
  const rotation = {
    origin: [8, 8, 8] as [number, number, number],
    axis: 'y' as const,
    angle: 45,
    rescale: true,
  };
  return [
    el([inset, y0, 8], [16 - inset, y1, 8], { north: f, south: f }, { rotation, shade: false }),
    el([8, y0, inset], [8, y1, 16 - inset], { west: f, east: f }, { rotation, shade: false }),
  ];
}

export function cropElements(t: FaceInput, y0 = -1, y1 = 15): ModelElement[] {
  const base = face(t);
  const f = base.uv ? base : { ...base, uv: [0, 0, 16, 16] as [number, number, number, number] };
  return [
    el([4, y0, 0], [4, y1, 16], { west: f, east: f }, { shade: false }),
    el([12, y0, 0], [12, y1, 16], { west: f, east: f }, { shade: false }),
    el([0, y0, 4], [16, y1, 4], { north: f, south: f }, { shade: false }),
    el([0, y0, 12], [16, y1, 12], { north: f, south: f }, { shade: false }),
  ];
}

const plantOpts = { layer: 'cutout' as const, shadeOccluder: false, solid: false };

function cross(t: FaceInput, extra: Omit<ModelSpec, 'parts'> = {}): ModelSpec {
  return single(crossElements(t), { ...plantOpts, ...extra });
}

const SIMPLE_CROSS = new Set([
  'dandelion',
  'poppy',
  'blue_orchid',
  'allium',
  'azure_bluet',
  'red_tulip',
  'orange_tulip',
  'white_tulip',
  'pink_tulip',
  'oxeye_daisy',
  'cornflower',
  'lily_of_the_valley',
  'wither_rose',
  'torchflower',
  'closed_eyeblossom',
  'brown_mushroom',
  'red_mushroom',
  'crimson_fungus',
  'warped_fungus',
  'crimson_roots',
  'warped_roots',
  'nether_sprouts',
  'dead_bush',
  'cobweb',
  'hanging_roots',
  'twisting_vines',
  'twisting_vines_plant',
  'weeping_vines',
  'weeping_vines_plant',
  'kelp',
  'kelp_plant',
  'short_dry_grass',
  'tall_dry_grass',
  'cactus_flower',
  'mangrove_propagule',
]);

const TINTED_CROSS: Record<string, { texture: string; fallback?: string[] }> = {
  short_grass: { texture: 'short_grass', fallback: ['block/grass'] },
  grass: { texture: 'grass', fallback: ['block/short_grass'] },
  fern: { texture: 'fern' },
  sugar_cane: { texture: 'sugar_cane' },
  bush: { texture: 'bush' },
};

const ALWAYS_WATER = new Set(['kelp', 'kelp_plant', 'seagrass', 'tall_seagrass', 'bubble_column']);

export function implicitlyWaterlogged(name: string): boolean {
  return (
    ALWAYS_WATER.has(name) || (/_coral(_fan|_wall_fan)?$/.test(name) && !name.startsWith('dead_'))
  );
}

export const simpleCrossFamily: Family = {
  id: 'cross',
  match: (name) =>
    SIMPLE_CROSS.has(name) ||
    (name.endsWith('_sapling') && !name.startsWith('potted_')) ||
    name === 'open_eyeblossom',
  build: (ctx) => {
    if (ctx.name === 'bamboo_sapling') return cross('bamboo_stage0');
    if (ctx.name === 'open_eyeblossom') {
      return single(
        [
          ...crossElements('open_eyeblossom'),
          ...crossElements(face('open_eyeblossom_emissive', { emissive: 1 })),
        ],
        plantOpts,
      );
    }
    return cross(ctx.name);
  },
};

export const tintedCrossFamily: Family = {
  id: 'tinted_cross',
  match: (name) => name in TINTED_CROSS,
  build: (ctx) => {
    const t = TINTED_CROSS[ctx.name]!;
    const f = face(t.texture, { ...GRASS_TINT, ...(t.fallback ? { fallback: t.fallback } : {}) });
    return cross(f);
  },
};

const DOUBLE_PLANTS: Record<string, { tinted: boolean }> = {
  tall_grass: { tinted: true },
  large_fern: { tinted: true },
  lilac: { tinted: false },
  rose_bush: { tinted: false },
  peony: { tinted: false },
  pitcher_plant: { tinted: false },
  sunflower: { tinted: false },
  tall_seagrass: { tinted: false },
};

export const doublePlantFamily: Family = {
  id: 'double_plant',
  match: (name) => name in DOUBLE_PLANTS,
  build: (ctx) => {
    const upper = prop(ctx, 'half', 'lower') === 'upper';
    const cfg = DOUBLE_PLANTS[ctx.name]!;
    const t = `${ctx.name}_${upper ? 'top' : 'bottom'}`;
    const f = face(t, cfg.tinted ? GRASS_TINT : {});
    if (ctx.name === 'sunflower' && upper) {
      const head = el(
        [9.6, -1, 1],
        [9.6, 15, 15],
        {
          west: face('sunflower_back', { uv: [0, 0, 16, 16] }),
          east: face('sunflower_front', { uv: [0, 0, 16, 16] }),
        },
        { rotation: { origin: [8, 8, 8], axis: 'z', angle: 22.5, rescale: true }, shade: false },
      );
      return single([...crossElements(f, 0, 8, 0.8, [0, 8, 16, 16]), head], plantOpts);
    }
    if (ctx.name === 'tall_seagrass') return single(cropElements(f, 0, 16), plantOpts);
    return cross(f);
  },
};

const CROP_STAGES: Record<string, (age: number) => number> = {
  wheat: (a) => Math.max(0, Math.min(7, a)),
  carrots: (a) => [0, 0, 1, 1, 2, 2, 2, 3][a] ?? 3,
  potatoes: (a) => [0, 0, 1, 1, 2, 2, 2, 3][a] ?? 3,
  beetroots: (a) => Math.min(3, a),
  nether_wart: (a) => [0, 1, 1, 2][a] ?? 2,
  torchflower_crop: (a) => Math.min(1, a),
};

export const cropFamily: Family = {
  id: 'crop',
  match: (name) => name in CROP_STAGES,
  build: (ctx) => {
    const stage = CROP_STAGES[ctx.name]!(num(ctx, 'age', 0));
    if (ctx.name === 'torchflower_crop') return cross(`torchflower_crop_stage${stage}`);
    return single(cropElements(`${ctx.name}_stage${stage}`), plantOpts);
  },
};

export const pitcherCropFamily: Family = {
  id: 'pitcher_crop',
  match: (name) => name === 'pitcher_crop',
  build: (ctx) => {
    const upper = prop(ctx, 'half', 'lower') === 'upper';
    return cross(upper ? 'pitcher_crop_top' : 'pitcher_crop_bottom');
  },
};

export const sweetBerryFamily: Family = {
  id: 'sweet_berry_bush',
  match: (name) => name === 'sweet_berry_bush',
  build: (ctx) => cross(`sweet_berry_bush_stage${Math.min(3, num(ctx, 'age', 0))}`),
};

export const stemFamily: Family = {
  id: 'stem',
  match: (name) =>
    name === 'melon_stem' ||
    name === 'pumpkin_stem' ||
    name === 'attached_melon_stem' ||
    name === 'attached_pumpkin_stem',
  build: (ctx) => {
    if (ctx.name.startsWith('attached_')) {
      const plain = ctx.name.slice(9);
      const tint = { tint: 'foliage' as const, tintColor: stemColor(7) };
      const elements = [
        el(
          [0, 0, 8],
          [16, 10, 8],
          {
            north: face(ctx.name, { ...tint, uv: [16, 0, 0, 10] }),
            south: face(ctx.name, { ...tint, uv: [0, 0, 16, 10] }),
          },
          { shade: false },
        ),
        ...crossElements(face(plain, { ...tint, uv: [0, 0, 16, 10] }), -1, 9),
      ];
      return {
        parts: [part(elements, 0, (yaw(YAW_NORTH, prop(ctx, 'facing', 'west')) + 90) % 360)],
        ...plantOpts,
      };
    }
    const age = Math.min(7, num(ctx, 'age', 0));
    const h = 2 * (age + 1);
    const f = face(ctx.name, { tint: 'foliage', tintColor: stemColor(age), uv: [0, 0, 16, h] });
    return single(crossElements(f, -1, h - 1, 0), plantOpts);
  },
};

export const seagrassFamily: Family = {
  id: 'seagrass',
  match: (name) => name === 'seagrass',
  build: () => single(cropElements('seagrass', 0, 16), plantOpts),
};

export const lilyPadFamily: Family = {
  id: 'lily_pad',
  match: (name) => name === 'lily_pad',
  build: () => {
    const tint = { tint: 'foliage' as const, tintColor: TINT_RGB.lilyPad };
    return single(
      [
        el([0, 0.25, 0], [16, 0.25, 16], {
          down: face('lily_pad', { ...tint, uv: [16, 16, 0, 0] }),
          up: face('lily_pad', { ...tint, uv: [16, 0, 0, 16] }),
        }),
      ],
      plantOpts,
    );
  },
};

function wallPlanes(
  ctx: Ctx,
  f: ModelFace,
  dirs: string[],
  inset: number,
  defaultTrue = false,
): Part[] {
  const plane = el(
    [0, 0, inset],
    [16, 16, inset],
    { north: { ...f, uv: [16, 0, 0, 16] }, south: { ...f, uv: [0, 0, 16, 16] } },
    { shade: false },
  );
  const parts: Part[] = [];
  const yawFor: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };
  for (const d of dirs) {
    const v = ctx.props[d];
    const on = v === undefined ? defaultTrue && d === 'north' : v === 'true';
    if (!on) continue;
    if (d === 'up') parts.push(part([plane], 270, 0));
    else if (d === 'down') parts.push(part([plane], 90, 0));
    else parts.push(part([plane], 0, yawFor[d] ?? 0));
  }
  return parts;
}

export const vineFamily: Family = {
  id: 'vine',
  match: (name) => name === 'vine',
  build: (ctx) => ({
    parts: wallPlanes(
      ctx,
      face('vine', FOLIAGE_TINT),
      ['north', 'east', 'south', 'west', 'up'],
      0.8,
      true,
    ),
    ...plantOpts,
  }),
};

export const lichenFamily: Family = {
  id: 'multiface',
  match: (name) => name === 'glow_lichen' || name === 'sculk_vein' || name === 'resin_clump',
  build: (ctx) => ({
    parts: wallPlanes(
      ctx,
      face(ctx.name),
      ['north', 'east', 'south', 'west', 'up', 'down'],
      0.1,
      true,
    ),
    ...plantOpts,
    emissive: ctx.name === 'glow_lichen' ? 0.5 : 0,
  }),
};

export const cactusFamily: Family = {
  id: 'cactus',
  match: (name) => name === 'cactus',
  build: () =>
    single(
      [
        el([0, 0, 0], [16, 16, 16], { down: 'cactus_bottom', up: 'cactus_top' }),
        el([0, 0, 1], [16, 16, 15], { north: 'cactus_side', south: 'cactus_side' }),
        el([1, 0, 0], [15, 16, 16], { west: 'cactus_side', east: 'cactus_side' }),
      ],
      { layer: 'cutout', shadeOccluder: false, solid: true },
    ),
};

export const bambooFamily: Family = {
  id: 'bamboo',
  match: (name) => name === 'bamboo',
  build: (ctx) => {
    const thick = num(ctx, 'age', 0) === 1;
    const a = thick ? 6.5 : 7;
    const b = thick ? 9.5 : 9;
    const w = b - a;
    const side = face('bamboo_stalk', { uv: [thick ? 3 : 0, 0, thick ? 3 + w : w, 16] });
    const top = face('bamboo_stalk', { uv: [13, 0, 13 + w, w] });
    const elements: ModelElement[] = [
      el([a, 0, a], [b, 16, b], {
        down: top,
        up: top,
        north: side,
        south: side,
        west: side,
        east: side,
      }),
    ];
    const leaves = prop(ctx, 'leaves', 'none');
    if (leaves === 'small') elements.push(...crossElements('bamboo_small_leaves'));
    if (leaves === 'large') elements.push(...crossElements('bamboo_large_leaves'));
    return single(elements, plantOpts);
  },
};

export const coralFamily: Family = {
  id: 'coral',
  match: (name) => /_coral(_fan|_wall_fan)?$/.test(name),
  build: (ctx) => {
    if (ctx.name.endsWith('_wall_fan')) {
      const t = face(ctx.name.replace('_wall_fan', '_fan'));
      const rot = (angle: number) => ({
        origin: [8, 4, 16] as [number, number, number],
        axis: 'x' as const,
        angle,
      });
      const elements = [
        el([0, 4, 0], [16, 4, 16], { up: t, down: t }, { rotation: rot(22.5), shade: false }),
      ];
      return {
        parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
        ...plantOpts,
      };
    }
    if (ctx.name.endsWith('_fan')) {
      const t = face(ctx.name);
      const elements = [
        el(
          [8, 0, 0],
          [24, 0, 16],
          { up: t, down: t },
          { rotation: { origin: [8, 0, 8], axis: 'z', angle: 22.5 }, shade: false },
        ),
        el(
          [-8, 0, 0],
          [8, 0, 16],
          { up: t, down: t },
          { rotation: { origin: [8, 0, 8], axis: 'z', angle: -22.5 }, shade: false },
        ),
        el(
          [0, 0, 8],
          [16, 0, 24],
          { up: t, down: t },
          { rotation: { origin: [8, 0, 8], axis: 'x', angle: -22.5 }, shade: false },
        ),
        el(
          [0, 0, -8],
          [16, 0, 8],
          { up: t, down: t },
          { rotation: { origin: [8, 0, 8], axis: 'x', angle: 22.5 }, shade: false },
        ),
      ];
      return single(elements.map(clipFan), plantOpts);
    }
    return cross(ctx.name);
  },
};

function clipFan(e: ModelElement): ModelElement {
  const from: [number, number, number] = [
    Math.max(0, e.from[0]),
    e.from[1],
    Math.max(0, e.from[2]),
  ];
  const to: [number, number, number] = [Math.min(16, e.to[0]), e.to[1], Math.min(16, e.to[2])];
  return { ...e, from, to };
}

export const pointedDripstoneFamily: Family = {
  id: 'pointed_dripstone',
  match: (name) => name === 'pointed_dripstone',
  build: (ctx) => {
    const dir = prop(ctx, 'vertical_direction', 'up');
    const thickness = prop(ctx, 'thickness', 'tip');
    return cross(`pointed_dripstone_${dir}_${thickness}`);
  },
};

export const amethystFamily: Family = {
  id: 'amethyst',
  match: (name) => name === 'amethyst_cluster' || name.endsWith('_amethyst_bud'),
  build: (ctx) => {
    const o = orientUpFront(prop(ctx, 'facing', 'up'));
    const emissive = ctx.name === 'amethyst_cluster' ? 0.35 : 0.15;
    return { parts: [part(crossElements(ctx.name), o.x, o.y)], ...plantOpts, emissive };
  },
};

export const caveVinesFamily: Family = {
  id: 'cave_vines',
  match: (name) => name === 'cave_vines' || name === 'cave_vines_plant',
  build: (ctx) => {
    const berries = flag(ctx, 'berries');
    const t = `${ctx.name}${berries ? '_lit' : ''}`;
    return cross(t, berries ? { emissive: 0.8 } : {});
  },
};

export const sporeBlossomFamily: Family = {
  id: 'spore_blossom',
  match: (name) => name === 'spore_blossom',
  build: () =>
    single(
      [
        el([1, 15.9, 1], [15, 15.9, 15], { down: 'spore_blossom', up: 'spore_blossom' }),
        el([2, 15.8, 2], [14, 15.8, 14], { down: 'spore_blossom_base' }),
      ],
      plantOpts,
    ),
};

function flatCover(t: FaceInput, y: number, extra: Omit<ModelSpec, 'parts'> = {}): ModelSpec {
  const f = face(t);
  return single([el([0, y, 0], [16, y, 16], { up: f, down: f }, { shade: false })], {
    ...plantOpts,
    ...extra,
  });
}

export const flatCoverFamily: Family = {
  id: 'flat_cover',
  match: (name) =>
    name === 'pink_petals' ||
    name === 'wildflowers' ||
    name === 'leaf_litter' ||
    name === 'frogspawn',
  build: (ctx) => {
    if (ctx.name === 'frogspawn') return flatCover('frogspawn', 1.5);
    if (ctx.name === 'leaf_litter') return flatCover('leaf_litter', 0.25);
    return flatCover(ctx.name, 3);
  },
};

export const fireflyBushFamily: Family = {
  id: 'firefly_bush',
  match: (name) => name === 'firefly_bush',
  build: () =>
    single(
      [
        ...crossElements('firefly_bush'),
        ...crossElements(face('firefly_bush_emissive', { emissive: 1 })),
      ],
      plantOpts,
    ),
};

export const azaleaFamily: Family = {
  id: 'azalea',
  match: (name) => name === 'azalea' || name === 'flowering_azalea',
  build: (ctx) => {
    const top = `${ctx.name}_top`;
    const side = `${ctx.name}_side`;
    return single(
      [
        el([0, 15.9, 0], [16, 16, 16], { up: top, down: top }),
        el([0, 0, 0.1], [16, 16, 0.1], { north: side, south: side }),
        el([0, 0, 15.9], [16, 16, 15.9], { north: side, south: side }),
        el([0.1, 0, 0], [0.1, 16, 16], { west: side, east: side }),
        el([15.9, 0, 0], [15.9, 16, 16], { west: side, east: side }),
        ...crossElements('azalea_plant', 0, 16),
      ],
      plantOpts,
    );
  },
};

export const bigDripleafFamily: Family = {
  id: 'dripleaf',
  match: (name) =>
    name === 'big_dripleaf' || name === 'big_dripleaf_stem' || name === 'small_dripleaf',
  build: (ctx) => {
    if (ctx.name === 'big_dripleaf_stem') return cross('big_dripleaf_stem');
    if (ctx.name === 'small_dripleaf') {
      const upper = prop(ctx, 'half', 'lower') === 'upper';
      if (!upper) return cross('small_dripleaf_stem_bottom');
      return single(
        [
          el([0, 13, 0], [16, 13, 16], { up: 'small_dripleaf_top', down: 'small_dripleaf_top' }),
          ...crossElements('small_dripleaf_stem_top', 0, 13),
        ],
        plantOpts,
      );
    }
    const tilt = prop(ctx, 'tilt', 'none');
    const angle = tilt === 'partial' ? 22.5 : tilt === 'full' ? 45 : 0;
    const leaf = el(
      [0, 15, 0],
      [16, 15, 16],
      { up: 'big_dripleaf_top', down: 'big_dripleaf_top' },
      angle ? { rotation: { origin: [8, 15, 16], axis: 'x', angle: -angle } } : undefined,
    );
    return {
      parts: [
        part(
          [leaf, ...crossElements('big_dripleaf_stem', 0, 15)],
          0,
          yaw(YAW_NORTH, prop(ctx, 'facing', 'north')),
        ),
      ],
      ...plantOpts,
      solid: true,
    };
  },
};

export const cocoaFamily: Family = {
  id: 'cocoa',
  match: (name) => name === 'cocoa',
  build: (ctx) => {
    const age = Math.min(2, num(ctx, 'age', 0));
    const t = `cocoa_stage${age}`;
    const sizes = [
      [6, 7, 11, 10, 12, 15],
      [5, 5, 9, 11, 12, 15],
      [4, 3, 7, 12, 12, 15],
    ][age]!;
    const [x0, y0, z0, x1, y1, z1] = sizes as [number, number, number, number, number, number];
    const w = x1 - x0;
    const h = y1 - y0;
    const side = face(t, { uv: [11 - w, 4, 11, 4 + h] });
    const topF = face(t, { uv: [0, 0, w, w] });
    const elements = [
      el([x0, y0, z0], [x1, y1, z1], {
        down: topF,
        up: topF,
        north: side,
        south: side,
        west: side,
        east: side,
      }),
      el([8, 12, 12], [8, 16, 16], {
        west: face(t, { uv: [16, 0, 12, 4] }),
        east: face(t, { uv: [12, 0, 16, 4] }),
      }),
    ];
    return {
      parts: [part(elements, 0, yaw(YAW_SOUTH, prop(ctx, 'facing', 'south')))],
      ...plantOpts,
    };
  },
};

export const seaPickleFamily: Family = {
  id: 'sea_pickle',
  match: (name) => name === 'sea_pickle',
  build: (ctx) => {
    const n = Math.max(1, Math.min(4, num(ctx, 'pickles', 1)));
    const lit = flag(ctx, 'waterlogged');
    const positions: [number, number, number][] = [
      [6, 6, 6],
      [3, 4, 3],
      [8, 6, 8],
      [10, 4, 2],
    ];
    const layout: number[][] = [[0], [1, 2], [1, 2, 3], [0, 1, 2, 3]];
    const elements: ModelElement[] = [];
    for (const i of layout[n - 1]!) {
      const [x, h, z] = positions[i]!;
      const side = face('sea_pickle', { uv: [0, 5, 4, 5 + h] });
      const top = face('sea_pickle', { uv: [4, 0, 8, 4] });
      elements.push(
        el([x, 0, z], [x + 4, h, z + 4], {
          down: top,
          up: top,
          north: side,
          south: side,
          west: side,
          east: side,
        }),
      );
    }
    return single(elements, { ...plantOpts, emissive: lit ? 0.4 + n * 0.15 : 0 });
  },
};

export const turtleEggFamily: Family = {
  id: 'turtle_egg',
  match: (name) => name === 'turtle_egg' || name === 'sniffer_egg' || name === 'dragon_egg',
  build: (ctx) => {
    if (ctx.name === 'sniffer_egg') {
      return single(
        [
          el([1, 0, 2], [15, 16, 14], {
            down: 'sniffer_egg_not_cracked_bottom',
            up: 'sniffer_egg_not_cracked_top',
            north: 'sniffer_egg_not_cracked_north',
            south: 'sniffer_egg_not_cracked_south',
            west: 'sniffer_egg_not_cracked_west',
            east: 'sniffer_egg_not_cracked_east',
          }),
        ],
        { solid: true },
      );
    }
    if (ctx.name === 'dragon_egg') {
      const t = 'dragon_egg';
      const layers: [number, number, number][] = [
        [6, 15, 16],
        [5, 14, 15],
        [4, 13, 14],
        [3, 11, 13],
        [2, 8, 11],
        [1, 3, 8],
        [2, 1, 3],
        [5, 0, 1],
      ];
      return single(
        layers.map(([i, y0, y1]) =>
          el([i, y0, i], [16 - i, y1, 16 - i], {
            down: t,
            up: t,
            north: t,
            south: t,
            west: t,
            east: t,
          }),
        ),
        { solid: true },
      );
    }
    const n = Math.max(1, Math.min(4, num(ctx, 'eggs', 1)));
    const spots: [number, number, number, number][] = [
      [5, 4, 7, 7],
      [1, 7, 4, 5],
      [8, 1, 5, 4],
      [10, 10, 4, 4],
    ];
    const elements: ModelElement[] = [];
    for (let i = 0; i < n; i++) {
      const [x, z, w, h] = spots[i]!;
      const side = face('turtle_egg', { uv: [1, 4, 1 + w, 4 + h] });
      const top = face('turtle_egg', { uv: [0, 0, w, w] });
      elements.push(
        el([x, 0, z], [x + w, h, z + w], {
          down: top,
          up: top,
          north: side,
          south: side,
          west: side,
          east: side,
        }),
      );
    }
    return single(elements, plantOpts);
  },
};

export const pottedFamily: Family = {
  id: 'flower_pot',
  match: (name) => name === 'flower_pot' || name.startsWith('potted_'),
  build: (ctx) => {
    const pot = 'flower_pot';
    const elements: ModelElement[] = [
      el([5, 0, 5], [6, 6, 11], {
        down: face(pot, { uv: [5, 5, 6, 11] }),
        up: face(pot, { uv: [5, 5, 6, 11] }),
        north: face(pot, { uv: [10, 10, 11, 16] }),
        south: face(pot, { uv: [5, 10, 6, 16] }),
        west: face(pot, { uv: [5, 10, 11, 16] }),
        east: face(pot, { uv: [5, 10, 11, 16] }),
      }),
      el([10, 0, 5], [11, 6, 11], {
        down: face(pot, { uv: [10, 5, 11, 11] }),
        up: face(pot, { uv: [10, 5, 11, 11] }),
        north: face(pot, { uv: [5, 10, 6, 16] }),
        south: face(pot, { uv: [10, 10, 11, 16] }),
        west: face(pot, { uv: [5, 10, 11, 16] }),
        east: face(pot, { uv: [5, 10, 11, 16] }),
      }),
      el([6, 0, 5], [10, 6, 6], {
        down: face(pot, { uv: [6, 10, 10, 11] }),
        up: face(pot, { uv: [6, 5, 10, 6] }),
        north: face(pot, { uv: [6, 10, 10, 16] }),
        south: face(pot, { uv: [6, 10, 10, 16] }),
      }),
      el([6, 0, 10], [10, 6, 11], {
        down: face(pot, { uv: [6, 5, 10, 6] }),
        up: face(pot, { uv: [6, 10, 10, 11] }),
        north: face(pot, { uv: [6, 10, 10, 16] }),
        south: face(pot, { uv: [6, 10, 10, 16] }),
      }),
      el([6, 0, 6], [10, 4, 10], {
        down: face(pot, { uv: [6, 12, 10, 16] }),
        up: face('dirt', { uv: [6, 6, 10, 10] }),
      }),
    ];
    if (ctx.name !== 'flower_pot') {
      const plant = ctx.name.slice(7);
      elements.push(...pottedPlant(plant));
    }
    return single(elements, { layer: 'cutout', shadeOccluder: false, solid: false });
  },
};

function pottedPlant(plant: string): ModelElement[] {
  if (plant === 'cactus') {
    const s = face('cactus_side', { uv: [6, 0, 10, 12] });
    const top = face('cactus_top', { uv: [6, 6, 10, 10] });
    return [el([6, 4, 6], [10, 16, 10], { up: top, north: s, south: s, west: s, east: s })];
  }
  if (plant === 'bamboo') {
    const s = face('bamboo_stalk', { uv: [0, 0, 2, 16] });
    return [
      el([7, 4, 7], [9, 16, 9], {
        up: face('bamboo_stalk', { uv: [13, 0, 15, 2] }),
        north: s,
        south: s,
        west: s,
        east: s,
      }),
    ];
  }
  if (plant === 'azalea_bush' || plant === 'flowering_azalea_bush') {
    const base = plant === 'azalea_bush' ? 'azalea' : 'flowering_azalea';
    const top = face(`potted_${plant}_top`, { fallback: [`block/${base}_top`] });
    const side = face(`potted_${plant}_side`, { fallback: [`block/${base}_side`] });
    return [
      el([4, 8, 4], [12, 15.9, 12], { up: top, north: side, south: side, west: side, east: side }),
      ...crossElements(face('azalea_plant'), 4, 12, 2.6),
    ];
  }
  let f: ModelFace;
  if (plant === 'fern') f = face('fern', GRASS_TINT);
  else if (plant === 'open_eyeblossom' || plant === 'closed_eyeblossom') f = face(plant);
  else f = face(plant);
  const rotation = {
    origin: [8, 8, 8] as [number, number, number],
    axis: 'y' as const,
    angle: 45,
    rescale: true,
  };
  return [
    el([2.6, 4, 8], [13.4, 16, 8], { north: f, south: f }, { rotation, shade: false }),
    el([8, 4, 2.6], [8, 16, 13.4], { west: f, east: f }, { rotation, shade: false }),
  ];
}
