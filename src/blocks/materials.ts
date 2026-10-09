export const WOODS = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'pale_oak',
  'bamboo',
  'crimson',
  'warped',
];

export const COLORS = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
];

export interface MaterialTextures {
  side: string;
  top: string;
  bottom: string;
}

function same(name: string): MaterialTextures {
  return { side: name, top: name, bottom: name };
}

const SPECIAL_MATERIALS: Record<string, MaterialTextures> = {
  quartz: { side: 'quartz_block_side', top: 'quartz_block_top', bottom: 'quartz_block_bottom' },
  smooth_quartz: same('quartz_block_bottom'),
  sandstone: { side: 'sandstone', top: 'sandstone_top', bottom: 'sandstone_bottom' },
  red_sandstone: {
    side: 'red_sandstone',
    top: 'red_sandstone_top',
    bottom: 'red_sandstone_bottom',
  },
  smooth_sandstone: same('sandstone_top'),
  smooth_red_sandstone: same('red_sandstone_top'),
  cut_sandstone: { side: 'cut_sandstone', top: 'sandstone_top', bottom: 'sandstone_top' },
  cut_red_sandstone: {
    side: 'cut_red_sandstone',
    top: 'red_sandstone_top',
    bottom: 'red_sandstone_top',
  },
  purpur: same('purpur_block'),
  smooth_stone: { side: 'smooth_stone_slab_side', top: 'smooth_stone', bottom: 'smooth_stone' },
  blackstone: { side: 'blackstone', top: 'blackstone_top', bottom: 'blackstone_top' },
  petrified_oak: same('oak_planks'),
  brick: same('bricks'),
  bamboo_mosaic: same('bamboo_mosaic'),
  stone: same('stone'),
};

export function stripNamespace(id: string): string {
  const i = id.indexOf(':');
  return i === -1 ? id : id.slice(i + 1);
}

export function stripWaxed(name: string): string {
  return name.startsWith('waxed_') ? name.slice(6) : name;
}

export function materialTextures(baseName: string): MaterialTextures {
  const base = stripWaxed(baseName);
  const special = SPECIAL_MATERIALS[base];
  if (special) return special;
  if (WOODS.includes(base)) return same(`${base}_planks`);
  if (base.endsWith('_brick')) return same(`${base}s`);
  if (base.endsWith('_tile')) return same(`${base}s`);
  return same(base);
}

export function colorOf(name: string): string | null {
  for (const c of [...COLORS].sort((a, b) => b.length - a.length)) {
    if (name.startsWith(`${c}_`)) return c;
  }
  return null;
}
