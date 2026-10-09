import { box as b, el, face, part, single, type Part } from '../build';
import { flag, num, prop, yaw, YAW_NORTH, type Family } from '../context';
import { TINT_RGB } from '../tints';
import type { ModelElement, Vec3 } from '../types';
import { cutout } from './common';

export const ladderFamily: Family = {
  id: 'ladder',
  match: (name) => name === 'ladder',
  build: (ctx) => {
    const f = face('ladder');
    const element = el([0, 0, 15.2], [16, 16, 15.2], { north: f, south: f }, { shade: false });
    return { parts: [part([element], 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))], ...cutout };
  },
};

export const cauldronFamily: Family = {
  id: 'cauldron',
  match: (name) => name.endsWith('cauldron'),
  build: (ctx) => {
    const side = 'cauldron_side';
    const top = 'cauldron_top';
    const inner = 'cauldron_inner';
    const bottom = 'cauldron_bottom';
    const elements: ModelElement[] = [
      el([0, 3, 0], [2, 16, 16], {
        north: side,
        east: inner,
        south: side,
        west: side,
        up: top,
        down: inner,
      }),
      el([2, 3, 2], [14, 4, 14], { up: inner, down: inner }),
      el([14, 3, 0], [16, 16, 16], {
        north: side,
        east: side,
        south: side,
        west: inner,
        up: top,
        down: inner,
      }),
      el([2, 3, 0], [14, 16, 2], { north: side, south: inner, up: top, down: inner }),
      el([2, 3, 14], [14, 16, 16], { north: inner, south: side, up: top, down: inner }),
      el([0, 0, 0], [4, 3, 2], { north: side, east: side, south: side, west: side, down: bottom }),
      el([0, 0, 2], [2, 3, 4], { east: side, south: side, west: side, down: bottom }),
      el([12, 0, 0], [16, 3, 2], {
        north: side,
        east: side,
        south: side,
        west: side,
        down: bottom,
      }),
      el([14, 0, 2], [16, 3, 4], { east: side, south: side, west: side, down: bottom }),
      el([0, 0, 14], [4, 3, 16], {
        north: side,
        east: side,
        south: side,
        west: side,
        down: bottom,
      }),
      el([0, 0, 12], [2, 3, 14], { north: side, east: side, west: side, down: bottom }),
      el([12, 0, 14], [16, 3, 16], {
        north: side,
        east: side,
        south: side,
        west: side,
        down: bottom,
      }),
      el([14, 0, 12], [16, 3, 14], { north: side, east: side, west: side, down: bottom }),
    ];
    let emissive = 0;
    let layer: 'opaque' | 'translucent' = 'opaque';
    if (ctx.name === 'water_cauldron') {
      const level = Math.max(1, Math.min(3, num(ctx, 'level', 3)));
      const h = [9, 12, 15][level - 1]!;
      elements.push(
        el([2, h, 2], [14, h, 14], {
          up: face('water_still', {
            tint: 'water',
            tintColor: TINT_RGB.water,
            layer: 'translucent',
          }),
        }),
      );
      layer = 'opaque';
    } else if (ctx.name === 'lava_cauldron') {
      elements.push(el([2, 15, 2], [14, 15, 14], { up: face('lava_still', { emissive: 1 }) }));
      emissive = 0;
    } else if (ctx.name === 'powder_snow_cauldron') {
      const level = Math.max(1, Math.min(3, num(ctx, 'level', 3)));
      const h = [9, 12, 15][level - 1]!;
      elements.push(el([2, h, 2], [14, h, 14], { up: 'powder_snow' }));
    }
    return single(elements, { layer, emissive, shadeOccluder: false, solid: true });
  },
};

export const anvilFamily: Family = {
  id: 'anvil',
  match: (name) => name === 'anvil' || name === 'chipped_anvil' || name === 'damaged_anvil',
  build: (ctx) => {
    const s = 'anvil';
    const top = `${ctx.name}_top`;
    const elements = [
      b([2, 0, 2], [14, 4, 14], s),
      b([4, 4, 3], [12, 5, 13], s),
      b([6, 5, 4], [10, 10, 12], s),
      el([3, 10, 0], [13, 16, 16], {
        down: s,
        up: face(top, { uv: [3, 0, 13, 16] }),
        north: s,
        south: s,
        west: s,
        east: s,
      }),
    ];
    const y =
      ({ east: 270, north: 180, south: 0, west: 90 } as Record<string, number>)[
        prop(ctx, 'facing', 'south')
      ] ?? 0;
    return { parts: [part(elements, 0, y)], shadeOccluder: false, solid: true };
  },
};

export const farmlandFamily: Family = {
  id: 'farmland',
  match: (name) => name === 'farmland' || name === 'dirt_path' || name === 'grass_path',
  build: (ctx) => {
    if (ctx.name === 'farmland') {
      const top = num(ctx, 'moisture', 0) >= 7 ? 'farmland_moist' : 'farmland';
      return single(
        [
          el([0, 0, 0], [16, 15, 16], {
            down: 'dirt',
            up: top,
            north: 'dirt',
            south: 'dirt',
            west: 'dirt',
            east: 'dirt',
          }),
        ],
        { solid: true },
      );
    }
    const legacy = ctx.name === 'grass_path';
    const top = face(legacy ? 'grass_path_top' : 'dirt_path_top', {
      fallback: [legacy ? 'block/dirt_path_top' : 'block/grass_path_top'],
    });
    const side = face(legacy ? 'grass_path_side' : 'dirt_path_side', {
      fallback: [legacy ? 'block/dirt_path_side' : 'block/grass_path_side'],
    });
    return single(
      [
        el([0, 0, 0], [16, 15, 16], {
          down: 'dirt',
          up: top,
          north: side,
          south: side,
          west: side,
          east: side,
        }),
      ],
      { solid: true },
    );
  },
};

export const candleFamily: Family = {
  id: 'candle',
  match: (name) => name === 'candle' || (name.endsWith('_candle') && !name.endsWith('candle_cake')),
  build: (ctx) => {
    const isLit = flag(ctx, 'lit');
    const t = isLit ? `${ctx.name}_lit` : ctx.name;
    const n = Math.max(1, Math.min(4, num(ctx, 'candles', 1)));
    const layouts: [number, number, number][][] = [
      [[7, 7, 6]],
      [
        [5, 7, 6],
        [9, 6, 5],
      ],
      [
        [7, 9, 6],
        [5, 6, 5],
        [8, 5, 3],
      ],
      [
        [6, 9, 5],
        [8, 8, 6],
        [5, 5, 3],
        [9, 5, 5],
      ],
    ];
    const elements: ModelElement[] = [];
    for (const [x, z, h] of layouts[n - 1]!) elements.push(...candleElements(t, x, z, h, isLit));
    return single(elements, cutout);
  },
};

function candleElements(t: string, x: number, z: number, h: number, lit: boolean): ModelElement[] {
  const side = face(t, { uv: [0, 8, 2, 8 + h] });
  const top = face(t, { uv: [0, 6, 2, 8] });
  const wick = face(t, { uv: [0, 5, 1, 6], ...(lit ? { emissive: 1 } : {}) });
  return [
    el([x, 0, z], [x + 2, h, z + 2], {
      down: top,
      up: top,
      north: side,
      south: side,
      west: side,
      east: side,
    }),
    el(
      [x + 0.5, h, z + 1],
      [x + 1.5, h + 1, z + 1],
      { north: wick, south: wick },
      { shade: false },
    ),
    el([x + 1, h, z + 0.5], [x + 1, h + 1, z + 1.5], { west: wick, east: wick }, { shade: false }),
  ];
}

export const cakeFamily: Family = {
  id: 'cake',
  match: (name) => name === 'cake' || name.endsWith('candle_cake'),
  build: (ctx) => {
    const bites = ctx.name === 'cake' ? Math.max(0, Math.min(6, num(ctx, 'bites', 0))) : 0;
    const x0 = 1 + bites * 2;
    const elements: ModelElement[] = [
      el([x0, 0, 1], [15, 8, 15], {
        down: 'cake_bottom',
        up: 'cake_top',
        north: 'cake_side',
        south: 'cake_side',
        west: bites > 0 ? 'cake_inner' : 'cake_side',
        east: 'cake_side',
      }),
    ];
    if (ctx.name !== 'cake') {
      const candle = ctx.name.slice(0, -'_cake'.length);
      const isLit = flag(ctx, 'lit');
      elements.push(
        ...candleElements(isLit ? `${candle}_lit` : candle, 7, 7, 6, isLit).map((e) => ({
          ...e,
          from: [e.from[0], e.from[1] + 8, e.from[2]] as Vec3,
          to: [e.to[0], e.to[1] + 8, e.to[2]] as Vec3,
        })),
      );
    }
    return single(elements, { layer: 'cutout', shadeOccluder: false, solid: true });
  },
};

export const hopperFamily: Family = {
  id: 'hopper',
  match: (name) => name === 'hopper',
  build: (ctx) => {
    const o = 'hopper_outside';
    const i = 'hopper_inside';
    const tp = 'hopper_top';
    const elements: ModelElement[] = [
      el([0, 10, 0], [16, 11, 16], { down: o, up: i, north: o, south: o, west: o, east: o }),
      el([0, 11, 0], [2, 16, 16], { up: tp, north: o, south: o, west: o, east: o }),
      el([14, 11, 0], [16, 16, 16], { up: tp, north: o, south: o, west: o, east: o }),
      el([2, 11, 0], [14, 16, 2], { up: tp, north: o, south: o }),
      el([2, 11, 14], [14, 16, 16], { up: tp, north: o, south: o }),
      b([4, 4, 4], [12, 10, 12], o),
    ];
    const facing = prop(ctx, 'facing', 'down');
    if (facing === 'down') {
      elements.push(b([6, 0, 6], [10, 4, 10], o));
      return single(elements, { shadeOccluder: false, solid: true });
    }
    const spoutParts: Part[] = [part([b([6, 4, 0], [10, 8, 4], o)], 0, yaw(YAW_NORTH, facing))];
    return { parts: [part(elements), ...spoutParts], shadeOccluder: false, solid: true };
  },
};

export const composterFamily: Family = {
  id: 'composter',
  match: (name) => name === 'composter',
  build: (ctx) => {
    const s = 'composter_side';
    const t = 'composter_top';
    const bt = 'composter_bottom';
    const elements: ModelElement[] = [
      el([0, 0, 0], [16, 2, 16], { down: bt, up: bt, north: s, south: s, west: s, east: s }),
      el([0, 0, 0], [2, 16, 16], { up: t, north: s, south: s, west: s, east: s }),
      el([14, 0, 0], [16, 16, 16], { up: t, north: s, south: s, west: s, east: s }),
      el([2, 0, 0], [14, 16, 2], { up: t, north: s, south: s }),
      el([2, 0, 14], [14, 16, 16], { up: t, north: s, south: s }),
    ];
    const level = Math.max(0, Math.min(8, num(ctx, 'level', 0)));
    if (level > 0) {
      const h = level >= 8 ? 15 : 1 + level * 2;
      elements.push(
        el([2, h, 2], [14, h, 14], { up: level >= 8 ? 'composter_ready' : 'composter_compost' }),
      );
    }
    return single(elements, { shadeOccluder: false, solid: true });
  },
};
