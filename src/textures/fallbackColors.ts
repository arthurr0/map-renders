type Rgb = readonly [number, number, number];

const DYES: ReadonlyArray<readonly [string, Rgb]> = [
  ['light_blue', [0.25, 0.55, 0.8]],
  ['light_gray', [0.6, 0.6, 0.58]],
  ['white', [0.92, 0.93, 0.93]],
  ['orange', [0.85, 0.4, 0.07]],
  ['magenta', [0.7, 0.2, 0.65]],
  ['yellow', [0.95, 0.8, 0.2]],
  ['lime', [0.45, 0.75, 0.12]],
  ['pink', [0.93, 0.52, 0.65]],
  ['gray', [0.28, 0.3, 0.32]],
  ['cyan', [0.08, 0.5, 0.55]],
  ['purple', [0.5, 0.2, 0.7]],
  ['blue', [0.2, 0.25, 0.65]],
  ['brown', [0.45, 0.3, 0.17]],
  ['green', [0.35, 0.45, 0.15]],
  ['red', [0.65, 0.15, 0.12]],
  ['black', [0.08, 0.08, 0.1]],
];

const WOODS: ReadonlyArray<readonly [string, Rgb]> = [
  ['dark_oak', [0.26, 0.17, 0.08]],
  ['pale_oak', [0.9, 0.88, 0.85]],
  ['oak', [0.64, 0.52, 0.31]],
  ['spruce', [0.45, 0.33, 0.19]],
  ['birch', [0.78, 0.7, 0.46]],
  ['jungle', [0.65, 0.46, 0.33]],
  ['acacia', [0.66, 0.36, 0.2]],
  ['mangrove', [0.46, 0.2, 0.2]],
  ['cherry', [0.89, 0.7, 0.7]],
  ['bamboo', [0.8, 0.7, 0.3]],
  ['crimson', [0.45, 0.2, 0.3]],
  ['warped', [0.2, 0.45, 0.45]],
];

const WOOD_PARTS = [
  'planks',
  'log',
  'wood',
  'stem',
  'door',
  'fence',
  'trapdoor',
  'sign',
  'slab',
  'stairs',
  'button',
  'pressure_plate',
  'shelf',
  'hyphae',
];

const MATERIALS: ReadonlyArray<readonly [readonly string[], Rgb]> = [
  [
    ['leaves', 'azalea', 'fern', 'grass', 'vine', 'bush', 'sapling', 'lily_pad'],
    [0.3, 0.55, 0.2],
  ],
  [['moss'], [0.35, 0.45, 0.2]],
  [['water'], [0.25, 0.4, 0.85]],
  [
    ['lava', 'magma'],
    [0.9, 0.4, 0.1],
  ],
  [
    ['glowstone', 'shroomlight', 'lantern', 'torch'],
    [0.95, 0.75, 0.4],
  ],
  [
    ['snow', 'powder_snow'],
    [0.95, 0.97, 0.98],
  ],
  [['ice'], [0.55, 0.7, 0.95]],
  [['glass'], [0.75, 0.88, 0.92]],
  [
    ['sandstone', 'sand'],
    [0.85, 0.8, 0.58],
  ],
  [
    ['dirt', 'mud', 'podzol', 'path', 'farmland', 'roots'],
    [0.45, 0.32, 0.2],
  ],
  [['gravel'], [0.52, 0.5, 0.49]],
  [['clay'], [0.62, 0.65, 0.72]],
  [['terracotta'], [0.6, 0.38, 0.28]],
  [
    ['nether_bricks', 'netherrack', 'nether'],
    [0.4, 0.15, 0.15],
  ],
  [['end_stone'], [0.88, 0.88, 0.6]],
  [['purpur'], [0.65, 0.45, 0.65]],
  [['quartz'], [0.92, 0.9, 0.86]],
  [['obsidian'], [0.1, 0.07, 0.15]],
  [['copper'], [0.75, 0.45, 0.32]],
  [['gold'], [0.95, 0.8, 0.25]],
  [['iron'], [0.82, 0.82, 0.82]],
  [['diamond'], [0.4, 0.85, 0.85]],
  [['emerald'], [0.2, 0.75, 0.35]],
  [['lapis'], [0.15, 0.3, 0.7]],
  [['redstone'], [0.7, 0.1, 0.05]],
  [['coal'], [0.15, 0.15, 0.15]],
  [
    ['brick', 'bricks'],
    [0.58, 0.35, 0.3],
  ],
  [
    ['deepslate', 'blackstone', 'basalt'],
    [0.25, 0.25, 0.28],
  ],
  [
    ['stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'tuff', 'calcite', 'ore'],
    [0.5, 0.5, 0.5],
  ],
];

function hasWord(base: string, word: string): boolean {
  return `_${base}_`.includes(`_${word}_`);
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const table: Array<[number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[sector] ?? [0, 0, 0];
  return [r + m, g + m, b + m];
}

function baseColor(base: string): Rgb | null {
  for (const [wood, color] of WOODS) {
    if (hasWord(base, wood) && WOOD_PARTS.some((part) => hasWord(base, part))) return color;
  }
  if (['planks', 'log', 'wood', 'stem'].some((part) => hasWord(base, part))) {
    return [0.55, 0.4, 0.22];
  }
  for (const [dye, color] of DYES) {
    const dyed = [
      'wool',
      'concrete',
      'carpet',
      'glass',
      'terracotta',
      'candle',
      'bed',
      'banner',
      'shulker',
      'powder',
    ];
    if (hasWord(base, dye) && dyed.some((part) => base.includes(part))) return color;
  }
  for (const [words, color] of MATERIALS) {
    if (words.some((word) => hasWord(base, word))) return color;
  }
  for (const [dye, color] of DYES) {
    if (hasWord(base, dye)) return color;
  }
  return null;
}

export function fallbackColor(textureId: string): [number, number, number] {
  const slash = textureId.lastIndexOf('/');
  const base = textureId.slice(slash + 1);
  const hash = hashString(base);
  const jitter = ((hash % 1000) / 1000 - 0.5) * 0.08;
  const known = baseColor(base);
  if (known) {
    return [
      Math.min(1, Math.max(0, known[0] + jitter)),
      Math.min(1, Math.max(0, known[1] + jitter)),
      Math.min(1, Math.max(0, known[2] + jitter)),
    ];
  }
  return hslToRgb(hash % 360, 0.28, 0.5 + jitter);
}
