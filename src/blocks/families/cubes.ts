import { el, face, single, tex, type FaceInput, type ModelSpec } from '../build';
import {
  axisOrientation,
  flag,
  num,
  orientNorthFront,
  orientUpFront,
  prop,
  yaw,
  YAW_NORTH,
  YAW_SOUTH,
  type Ctx,
  type Family,
  type Orientation,
} from '../context';
import { stripWaxed } from '../materials';
import { TINT_RGB } from '../tints';
import type { ModelFace } from '../types';

export interface SixFaces {
  down: FaceInput;
  up: FaceInput;
  north: FaceInput;
  south: FaceInput;
  west: FaceInput;
  east: FaceInput;
}

export function cubeElement(f: SixFaces) {
  return el([0, 0, 0], [16, 16, 16], f);
}

export function cube(
  f: SixFaces,
  o: Orientation = { x: 0, y: 0 },
  opts: Omit<ModelSpec, 'parts'> = {},
): ModelSpec {
  return { parts: [{ elements: [cubeElement(f)], x: o.x, y: o.y }], ...opts };
}

export function cubeAll(t: FaceInput, opts: Omit<ModelSpec, 'parts'> = {}): ModelSpec {
  return cube({ down: t, up: t, north: t, south: t, west: t, east: t }, undefined, opts);
}

export function columnFaces(side: FaceInput, end: FaceInput, bottom?: FaceInput): SixFaces {
  return { down: bottom ?? end, up: end, north: side, south: side, west: side, east: side };
}

function column(side: string, end: string, bottom?: string): (ctx: Ctx) => ModelSpec {
  return (ctx) => cube(columnFaces(side, end, bottom), axisOrientation(prop(ctx, 'axis', 'y')));
}

function staticColumn(side: string, end: string, bottom?: string): () => ModelSpec {
  return () => cube(columnFaces(side, end, bottom));
}

function orientable(
  front: string | ((ctx: Ctx) => string),
  side: string,
  top: string,
  bottom?: string,
  frontEmissive?: (ctx: Ctx) => number,
): (ctx: Ctx) => ModelSpec {
  return (ctx) => {
    const fr = typeof front === 'string' ? front : front(ctx);
    const em = frontEmissive ? frontEmissive(ctx) : 0;
    const frontFace: ModelFace = em > 0 ? face(fr, { emissive: em }) : face(fr);
    return cube(
      { down: bottom ?? top, up: top, north: frontFace, south: side, west: side, east: side },
      { x: 0, y: yaw(YAW_NORTH, prop(ctx, 'facing', 'north')) },
    );
  };
}

function emissiveCube(t: string, level: number): () => ModelSpec {
  return () => cubeAll(t, { emissive: level });
}

const lit = (ctx: Ctx) => flag(ctx, 'lit');

export const CUBE_TABLE: Record<string, (ctx: Ctx) => ModelSpec> = {
  basalt: column('basalt_side', 'basalt_top'),
  polished_basalt: column('polished_basalt_side', 'polished_basalt_top'),
  quartz_pillar: column('quartz_pillar', 'quartz_pillar_top'),
  purpur_pillar: column('purpur_pillar', 'purpur_pillar_top'),
  bone_block: column('bone_block_side', 'bone_block_top'),
  hay_block: column('hay_block_side', 'hay_block_top'),
  deepslate: column('deepslate', 'deepslate_top'),
  infested_deepslate: column('deepslate', 'deepslate_top'),
  bamboo_block: column('bamboo_block', 'bamboo_block_top'),
  stripped_bamboo_block: column('stripped_bamboo_block', 'stripped_bamboo_block_top'),
  muddy_mangrove_roots: column('muddy_mangrove_roots_side', 'muddy_mangrove_roots_top'),
  creaking_heart: column('creaking_heart', 'creaking_heart_top'),
  ochre_froglight: (ctx) => ({
    ...column('ochre_froglight_side', 'ochre_froglight_top')(ctx),
    emissive: 1,
  }),
  verdant_froglight: (ctx) => ({
    ...column('verdant_froglight_side', 'verdant_froglight_top')(ctx),
    emissive: 1,
  }),
  pearlescent_froglight: (ctx) => ({
    ...column('pearlescent_froglight_side', 'pearlescent_froglight_top')(ctx),
    emissive: 1,
  }),
  blackstone: staticColumn('blackstone', 'blackstone_top'),
  chiseled_tuff: staticColumn('chiseled_tuff', 'chiseled_tuff_top'),
  chiseled_tuff_bricks: staticColumn('chiseled_tuff_bricks', 'chiseled_tuff_bricks_top'),
  suspicious_sand: (ctx) => cubeAll(`suspicious_sand_${Math.min(3, num(ctx, 'dusted', 0))}`),
  suspicious_gravel: (ctx) => cubeAll(`suspicious_gravel_${Math.min(3, num(ctx, 'dusted', 0))}`),
  structure_block: (ctx) => cubeAll(`structure_block_${prop(ctx, 'mode', 'save')}`),
  jigsaw: (ctx) =>
    cube(
      columnFaces('jigsaw_side', 'jigsaw_top', 'jigsaw_bottom'),
      orientUpFront(prop(ctx, 'orientation', 'up_north').split('_')[0] ?? 'up'),
    ),
  command_block: (ctx) => commandBlock(ctx, 'command_block'),
  repeating_command_block: (ctx) => commandBlock(ctx, 'repeating_command_block'),
  chain_command_block: (ctx) => commandBlock(ctx, 'chain_command_block'),
  quartz_block: staticColumn('quartz_block_side', 'quartz_block_top'),
  chiseled_quartz_block: staticColumn('chiseled_quartz_block', 'chiseled_quartz_block_top'),
  chiseled_sandstone: staticColumn('chiseled_sandstone', 'sandstone_top'),
  cut_sandstone: staticColumn('cut_sandstone', 'sandstone_top'),
  chiseled_red_sandstone: staticColumn('chiseled_red_sandstone', 'red_sandstone_top'),
  cut_red_sandstone: staticColumn('cut_red_sandstone', 'red_sandstone_top'),
  sandstone: staticColumn('sandstone', 'sandstone_top', 'sandstone_bottom'),
  red_sandstone: staticColumn('red_sandstone', 'red_sandstone_top', 'red_sandstone_bottom'),
  smooth_sandstone: () => cubeAll('sandstone_top'),
  smooth_red_sandstone: () => cubeAll('red_sandstone_top'),
  smooth_quartz: () => cubeAll('quartz_block_bottom'),
  pumpkin: staticColumn('pumpkin_side', 'pumpkin_top'),
  melon: staticColumn('melon_side', 'melon_top'),
  ancient_debris: staticColumn('ancient_debris_side', 'ancient_debris_top'),
  lodestone: staticColumn('lodestone_side', 'lodestone_top'),
  jukebox: staticColumn('jukebox_side', 'jukebox_top'),
  target: staticColumn('target_side', 'target_top'),
  bookshelf: staticColumn('bookshelf', 'oak_planks'),
  tnt: staticColumn('tnt_side', 'tnt_top', 'tnt_bottom'),
  dried_kelp_block: staticColumn('dried_kelp_side', 'dried_kelp_top', 'dried_kelp_bottom'),
  sculk_catalyst: staticColumn(
    'sculk_catalyst_side',
    'sculk_catalyst_top',
    'sculk_catalyst_bottom',
  ),
  reinforced_deepslate: staticColumn(
    'reinforced_deepslate_side',
    'reinforced_deepslate_top',
    'reinforced_deepslate_bottom',
  ),
  mycelium: (ctx) =>
    flag(ctx, 'snowy')
      ? cube(columnFaces('grass_block_snow', 'snow', 'dirt'))
      : cube(columnFaces('mycelium_side', 'mycelium_top', 'dirt')),
  podzol: (ctx) =>
    flag(ctx, 'snowy')
      ? cube(columnFaces('grass_block_snow', 'snow', 'dirt'))
      : cube(columnFaces('podzol_side', 'podzol_top', 'dirt')),
  crimson_nylium: staticColumn('crimson_nylium_side', 'crimson_nylium', 'netherrack'),
  warped_nylium: staticColumn('warped_nylium_side', 'warped_nylium', 'netherrack'),
  snow_block: () => cubeAll('snow'),
  magma_block: () => cubeAll('magma', { emissive: 0.6 }),
  glowstone: emissiveCube('glowstone', 1),
  sea_lantern: emissiveCube('sea_lantern', 1),
  shroomlight: emissiveCube('shroomlight', 1),
  crying_obsidian: emissiveCube('crying_obsidian', 0.5),
  beacon: () => ({
    parts: [
      {
        elements: [
          el([0, 0, 0], [16, 16, 16], {
            down: 'glass',
            up: 'glass',
            north: 'glass',
            south: 'glass',
            west: 'glass',
            east: 'glass',
          }),
          el([2, 0.1, 2], [14, 3, 14], {
            down: 'obsidian',
            up: 'obsidian',
            north: 'obsidian',
            south: 'obsidian',
            west: 'obsidian',
            east: 'obsidian',
          }),
          el([3, 3, 3], [13, 14, 13], {
            down: face('beacon', { emissive: 1 }),
            up: face('beacon', { emissive: 1 }),
            north: face('beacon', { emissive: 1 }),
            south: face('beacon', { emissive: 1 }),
            west: face('beacon', { emissive: 1 }),
            east: face('beacon', { emissive: 1 }),
          }),
        ],
      },
    ],
    layer: 'cutout',
    shadeOccluder: false,
  }),
  redstone_lamp: (ctx) =>
    lit(ctx) ? cubeAll('redstone_lamp_on', { emissive: 1 }) : cubeAll('redstone_lamp'),
  redstone_ore: (ctx) => cubeAll('redstone_ore', lit(ctx) ? { emissive: 0.5 } : {}),
  deepslate_redstone_ore: (ctx) =>
    cubeAll('deepslate_redstone_ore', lit(ctx) ? { emissive: 0.5 } : {}),
  respawn_anchor: (ctx) => {
    const c = Math.max(0, Math.min(4, num(ctx, 'charges', 0)));
    return cube(
      columnFaces(
        `respawn_anchor_side${c}`,
        c > 0 ? 'respawn_anchor_top' : 'respawn_anchor_top_off',
        'respawn_anchor_bottom',
      ),
      undefined,
      c > 0 ? { emissive: 0.3 + c * 0.15 } : {},
    );
  },
  crafting_table: () =>
    cube({
      down: 'oak_planks',
      up: 'crafting_table_top',
      north: 'crafting_table_front',
      south: 'crafting_table_side',
      east: 'crafting_table_side',
      west: 'crafting_table_front',
    }),
  cartography_table: () =>
    cube({
      down: 'dark_oak_planks',
      up: 'cartography_table_top',
      north: 'cartography_table_side3',
      south: 'cartography_table_side1',
      east: 'cartography_table_side3',
      west: 'cartography_table_side2',
    }),
  fletching_table: () =>
    cube({
      down: 'birch_planks',
      up: 'fletching_table_top',
      north: 'fletching_table_front',
      south: 'fletching_table_front',
      east: 'fletching_table_side',
      west: 'fletching_table_side',
    }),
  smithing_table: () =>
    cube({
      down: 'smithing_table_bottom',
      up: 'smithing_table_top',
      north: 'smithing_table_front',
      south: 'smithing_table_front',
      east: 'smithing_table_side',
      west: 'smithing_table_side',
    }),
  furnace: orientable(
    (c) => (lit(c) ? 'furnace_front_on' : 'furnace_front'),
    'furnace_side',
    'furnace_top',
    undefined,
    (c) => (lit(c) ? 0.8 : 0),
  ),
  blast_furnace: orientable(
    (c) => (lit(c) ? 'blast_furnace_front_on' : 'blast_furnace_front'),
    'blast_furnace_side',
    'blast_furnace_top',
    undefined,
    (c) => (lit(c) ? 0.8 : 0),
  ),
  smoker: orientable(
    (c) => (lit(c) ? 'smoker_front_on' : 'smoker_front'),
    'smoker_side',
    'smoker_top',
    'smoker_bottom',
    (c) => (lit(c) ? 0.8 : 0),
  ),
  carved_pumpkin: orientable('carved_pumpkin', 'pumpkin_side', 'pumpkin_top'),
  jack_o_lantern: orientable('jack_o_lantern', 'pumpkin_side', 'pumpkin_top', undefined, () => 1),
  loom: orientable('loom_front', 'loom_side', 'loom_top', 'loom_bottom'),
  beehive: orientable(
    (c) => (num(c, 'honey_level', 0) >= 5 ? 'beehive_front_honey' : 'beehive_front'),
    'beehive_side',
    'beehive_end',
  ),
  bee_nest: orientable(
    (c) => (num(c, 'honey_level', 0) >= 5 ? 'bee_nest_front_honey' : 'bee_nest_front'),
    'bee_nest_side',
    'bee_nest_top',
    'bee_nest_bottom',
  ),
  chiseled_bookshelf: orientable(
    'chiseled_bookshelf_occupied',
    'chiseled_bookshelf_side',
    'chiseled_bookshelf_top',
  ),
  dispenser: (ctx) => dispenserLike(ctx, 'dispenser'),
  dropper: (ctx) => dispenserLike(ctx, 'dropper'),
  observer: (ctx) => {
    const facing = prop(ctx, 'facing', 'south');
    const back = flag(ctx, 'powered') ? 'observer_back_on' : 'observer_back';
    const o = orientNorthFront(facing);
    return cube(
      {
        down: 'observer_top',
        up: 'observer_top',
        north: 'observer_front',
        south: back,
        west: 'observer_side',
        east: 'observer_side',
      },
      o,
    );
  },
  barrel: (ctx) => {
    const top = flag(ctx, 'open') ? 'barrel_top_open' : 'barrel_top';
    return cube(
      columnFaces('barrel_side', top, 'barrel_bottom'),
      orientUpFront(prop(ctx, 'facing', 'up')),
    );
  },
  frosted_ice: (ctx) =>
    cubeAll(`frosted_ice_${Math.min(3, num(ctx, 'age', 0))}`, {
      layer: 'translucent',
      cullGroup: 'ice',
      noOcclusion: true,
    }),
  ice: () => cubeAll('ice', { layer: 'translucent', cullGroup: 'ice', noOcclusion: true }),
  glass: () => cubeAll('glass', { layer: 'cutout', cullGroup: 'glass', shadeOccluder: false }),
  tinted_glass: () =>
    cubeAll('tinted_glass', {
      layer: 'translucent',
      cullGroup: 'tinted_glass',
      shadeOccluder: false,
    }),
  spawner: () => cubeAll('spawner', { layer: 'cutout', shadeOccluder: false }),
  mangrove_roots: () =>
    cube(columnFaces('mangrove_roots_side', 'mangrove_roots_top'), undefined, {
      layer: 'cutout',
      shadeOccluder: false,
    }),
  scaffolding: (ctx) => scaffolding(ctx),
  slime_block: () => ({
    parts: [
      {
        elements: [
          el([3, 3, 3], [13, 13, 13], allSix('slime_block')),
          el([0, 0, 0], [16, 16, 16], allSix('slime_block')),
        ],
      },
    ],
    layer: 'translucent',
    cullGroup: 'slime_block',
    shadeOccluder: false,
  }),
  honey_block: () => ({
    parts: [
      {
        elements: [
          el([1, 1, 1], [15, 15, 15], {
            down: 'honey_block_bottom',
            up: 'honey_block_top',
            north: 'honey_block_side',
            south: 'honey_block_side',
            west: 'honey_block_side',
            east: 'honey_block_side',
          }),
          el([0, 0, 0], [16, 16, 16], {
            down: 'honey_block_bottom',
            up: 'honey_block_top',
            north: 'honey_block_side',
            south: 'honey_block_side',
            west: 'honey_block_side',
            east: 'honey_block_side',
          }),
        ],
      },
    ],
    layer: 'translucent',
    cullGroup: 'honey_block',
    shadeOccluder: false,
  }),
  grass_block: (ctx) => grassBlock(ctx),
  copper_bulb: (ctx) => copperBulb(ctx, 'copper_bulb'),
  exposed_copper_bulb: (ctx) => copperBulb(ctx, 'exposed_copper_bulb'),
  weathered_copper_bulb: (ctx) => copperBulb(ctx, 'weathered_copper_bulb'),
  oxidized_copper_bulb: (ctx) => copperBulb(ctx, 'oxidized_copper_bulb'),
  trial_spawner: () =>
    cube(
      columnFaces(
        'trial_spawner_side_inactive',
        'trial_spawner_top_inactive',
        'trial_spawner_bottom',
      ),
      undefined,
      {
        layer: 'cutout',
        shadeOccluder: false,
      },
    ),
  vault: (ctx) =>
    cube(
      {
        down: 'vault_bottom',
        up: 'vault_top',
        north: 'vault_front_off',
        south: 'vault_side_off',
        west: 'vault_side_off',
        east: 'vault_side_off',
      },
      { x: 0, y: yaw(YAW_NORTH, prop(ctx, 'facing', 'north')) },
      { layer: 'cutout', shadeOccluder: false },
    ),
  crafter: (ctx) =>
    cube(
      {
        down: 'crafter_bottom',
        up: 'crafter_top',
        north: 'crafter_north',
        south: 'crafter_south',
        west: 'crafter_west',
        east: 'crafter_east',
      },
      { x: 0, y: yaw(YAW_NORTH, prop(ctx, 'orientation', 'north_up').split('_')[0] ?? 'north') },
    ),
};

function commandBlock(ctx: Ctx, base: string): ModelSpec {
  const cond = flag(ctx, 'conditional') ? '_conditional' : '';
  return cube(
    {
      down: `${base}_side`,
      up: `${base}_side`,
      north: `${base}_front`,
      south: `${base}_back`,
      west: `${base}${cond ? '_conditional' : '_side'}`,
      east: `${base}${cond ? '_conditional' : '_side'}`,
    },
    orientNorthFront(prop(ctx, 'facing', 'north')),
  );
}

function copperBulb(ctx: Ctx, base: string): ModelSpec {
  const isLit = lit(ctx);
  const powered = flag(ctx, 'powered');
  const t = `${base}${isLit ? '_lit' : ''}${powered ? '_powered' : ''}`;
  return cubeAll(t, isLit ? { emissive: 1 } : {});
}

function allSix(t: string): SixFaces {
  return { down: t, up: t, north: t, south: t, west: t, east: t };
}

function dispenserLike(ctx: Ctx, base: string): ModelSpec {
  const facing = prop(ctx, 'facing', 'north');
  if (facing === 'up' || facing === 'down') {
    return cube(
      {
        down: 'furnace_top',
        up: `${base}_front_vertical`,
        north: 'furnace_top',
        south: 'furnace_top',
        west: 'furnace_top',
        east: 'furnace_top',
      },
      { x: facing === 'down' ? 180 : 0, y: 0 },
    );
  }
  return cube(
    {
      down: 'furnace_top',
      up: 'furnace_top',
      north: `${base}_front`,
      south: 'furnace_side',
      west: 'furnace_side',
      east: 'furnace_side',
    },
    { x: 0, y: yaw(YAW_NORTH, facing) },
  );
}

function scaffolding(ctx: Ctx): ModelSpec {
  const stable = prop(ctx, 'bottom', 'false') !== 'true';
  const t = { top: 'scaffolding_top', side: 'scaffolding_side', bottom: 'scaffolding_bottom' };
  const elements = [
    el([0, 15.99, 0], [16, 16, 16], { up: t.top, down: t.bottom }),
    el([0, 0, 0], [2, 16, 2], { north: t.side, south: t.side, west: t.side, east: t.side }),
    el([14, 0, 0], [16, 16, 2], { north: t.side, south: t.side, west: t.side, east: t.side }),
    el([0, 0, 14], [2, 16, 16], { north: t.side, south: t.side, west: t.side, east: t.side }),
    el([14, 0, 14], [16, 16, 16], { north: t.side, south: t.side, west: t.side, east: t.side }),
    el([2, 14, 0], [14, 16, 2], { north: t.side, south: t.side, down: t.bottom }),
    el([2, 14, 14], [14, 16, 16], { north: t.side, south: t.side, down: t.bottom }),
    el([0, 14, 2], [2, 16, 14], { west: t.side, east: t.side, down: t.bottom }),
    el([14, 14, 2], [16, 16, 14], { west: t.side, east: t.side, down: t.bottom }),
  ];
  if (!stable) {
    elements.push(
      el([2, 1, 0], [14, 3, 2], { north: t.side, south: t.side, up: t.bottom, down: t.bottom }),
      el([2, 1, 14], [14, 3, 16], { north: t.side, south: t.side, up: t.bottom, down: t.bottom }),
    );
  }
  return single(elements, { layer: 'cutout', shadeOccluder: false });
}

function snowyAbove(ctx: Ctx): boolean {
  if (ctx.props.snowy !== undefined) return ctx.props.snowy === 'true';
  const above = ctx.neighbors(0, 1, 0).name;
  return (
    above === 'minecraft:snow' ||
    above === 'minecraft:snow_block' ||
    above === 'minecraft:powder_snow'
  );
}

function grassBlock(ctx: Ctx): ModelSpec {
  if (snowyAbove(ctx)) return cube(columnFaces('grass_block_snow', 'snow', 'dirt'));
  const tint = { tint: 'grass' as const, tintColor: TINT_RGB.grass };
  const overlay = face('grass_block_side_overlay', { ...tint, layer: 'cutout' });
  return single([
    el([0, 0, 0], [16, 16, 16], {
      down: 'dirt',
      up: face('grass_block_top', tint),
      north: 'grass_block_side',
      south: 'grass_block_side',
      west: 'grass_block_side',
      east: 'grass_block_side',
    }),
    el([0, 0, 0], [16, 16, 16], { north: overlay, south: overlay, west: overlay, east: overlay }),
  ]);
}

function logTextures(name: string): { side: string; end: string } | null {
  const base = stripWaxed(name);
  if (base.endsWith('_log') || /^(stripped_)?(crimson|warped)_stem$/.test(base)) {
    return { side: base, end: `${base}_top` };
  }
  if (base.endsWith('_wood')) {
    const log = base === 'wood' ? 'oak_log' : `${base.slice(0, -5)}_log`;
    return { side: log, end: log };
  }
  if (base.endsWith('_hyphae')) {
    const stem = `${base.slice(0, -7)}_stem`;
    return { side: stem, end: stem };
  }
  return null;
}

export const logFamily: Family = {
  id: 'log',
  match: (name) =>
    logTextures(name) !== null && !name.endsWith('_mushroom_stem') && name !== 'mushroom_stem',
  build: (ctx) => {
    const t = logTextures(ctx.name);
    if (!t) return null;
    return cube(columnFaces(t.side, t.end), axisOrientation(prop(ctx, 'axis', 'y')));
  },
};

function leafTint(name: string): ModelFace['tintColor'] | null {
  if (name.startsWith('spruce')) return TINT_RGB.spruce;
  if (name.startsWith('birch')) return TINT_RGB.birch;
  if (name.startsWith('mangrove')) return TINT_RGB.mangrove;
  if (
    name.startsWith('cherry') ||
    name.startsWith('azalea') ||
    name.startsWith('flowering_azalea') ||
    name.startsWith('pale_oak')
  ) {
    return null;
  }
  return TINT_RGB.foliage;
}

export const leavesFamily: Family = {
  id: 'leaves',
  match: (name) => name.endsWith('_leaves'),
  build: (ctx) => {
    const color = leafTint(ctx.name);
    const f = color ? face(ctx.name, { tint: 'foliage', tintColor: color }) : face(ctx.name);
    return cube({ down: f, up: f, north: f, south: f, west: f, east: f }, undefined, {
      layer: 'cutout',
      shadeOccluder: true,
      solid: true,
    });
  },
};

export const stainedGlassFamily: Family = {
  id: 'stained_glass',
  match: (name) => name.endsWith('_stained_glass'),
  build: (ctx) =>
    cubeAll(ctx.name, { layer: 'translucent', cullGroup: ctx.name, shadeOccluder: false }),
};

export const glazedTerracottaFamily: Family = {
  id: 'glazed_terracotta',
  match: (name) => name.endsWith('_glazed_terracotta'),
  build: (ctx) => {
    const t = tex(ctx.name);
    const f = (rotation: 0 | 90 | 180 | 270): ModelFace =>
      rotation ? { texture: t, rotation } : { texture: t };
    return cube(
      { down: f(0), up: f(90), north: f(0), south: f(180), west: f(270), east: f(90) },
      { x: 0, y: yaw(YAW_SOUTH, prop(ctx, 'facing', 'south')) },
    );
  },
};

export const mushroomBlockFamily: Family = {
  id: 'mushroom_block',
  match: (name) =>
    name === 'brown_mushroom_block' || name === 'red_mushroom_block' || name === 'mushroom_stem',
  build: (ctx) => {
    const outside = ctx.name;
    const pick = (dir: string) =>
      prop(ctx, dir, 'true') === 'true' ? outside : 'mushroom_block_inside';
    return cube({
      down: pick('down'),
      up: pick('up'),
      north: pick('north'),
      south: pick('south'),
      west: pick('west'),
      east: pick('east'),
    });
  },
};

export const infestedFamily: Family = {
  id: 'infested',
  match: (name) => name.startsWith('infested_'),
  build: (ctx) => {
    const base = ctx.name.slice(9);
    return cubeAll(base);
  },
};

export const shulkerBoxFamily: Family = {
  id: 'shulker_box',
  match: (name) => name === 'shulker_box' || name.endsWith('_shulker_box'),
  build: (ctx) => cubeAll(ctx.name),
};

export const copperGrateFamily: Family = {
  id: 'copper_grate',
  match: (name) => stripWaxed(name).endsWith('copper_grate'),
  build: (ctx) => cubeAll(stripWaxed(ctx.name), { layer: 'cutout', shadeOccluder: false }),
};

export const waxedFamily: Family = {
  id: 'waxed_cube',
  match: (name) => name.startsWith('waxed_') && !/_(stairs|slab|door|trapdoor)$/.test(name),
  build: (ctx) => {
    const base = stripWaxed(ctx.name);
    if (base.endsWith('copper_bulb')) return copperBulb(ctx, base);
    return cubeAll(base);
  },
};

export function unknownCube(ctx: Ctx): ModelSpec {
  const n = ctx.name;
  const hasAxis = ctx.props.axis !== undefined;
  const looksColumn = hasAxis || /(_log|_stem|_pillar|_column)$/.test(n);
  const opts: Omit<ModelSpec, 'parts'> = {
    unknown: true,
    layer: 'cutout',
    occluding: true,
    shadeOccluder: true,
    solid: true,
  };
  if (looksColumn) {
    const side = face(`${n}_side`, { fallback: [tex(n)] });
    const end = face(`${n}_top`, { fallback: [tex(n)] });
    return cube(columnFaces(side, end), axisOrientation(prop(ctx, 'axis', 'y')), opts);
  }
  return cubeAll(n, opts);
}
