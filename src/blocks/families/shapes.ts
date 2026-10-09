import { box, el, face, part, single, type Part } from '../build';
import {
  flag,
  num,
  prop,
  yaw,
  YAW_EAST,
  YAW_NORTH,
  YAW_SOUTH,
  type Ctx,
  type Family,
} from '../context';
import { materialTextures, stripWaxed } from '../materials';
import type { BlockState } from '../../core/types';
import type { ModelElement } from '../types';
import { cubeAll, cube, columnFaces } from './cubes';

function baseOf(name: string, suffix: string): string {
  return stripWaxed(name).slice(0, -suffix.length);
}

export const slabFamily: Family = {
  id: 'slab',
  match: (name) => name.endsWith('_slab'),
  build: (ctx) => {
    const m = materialTextures(baseOf(ctx.name, '_slab'));
    const type = prop(ctx, 'type', 'bottom');
    if (type === 'double') {
      return cube(columnFaces(m.side, m.top, m.bottom));
    }
    const y0 = type === 'top' ? 8 : 0;
    return single([
      el([0, y0, 0], [16, y0 + 8, 16], {
        down: m.bottom,
        up: m.top,
        north: m.side,
        south: m.side,
        west: m.side,
        east: m.side,
      }),
    ]);
  },
};

function stairsElements(
  shape: 'straight' | 'inner' | 'outer',
  side: string,
  top: string,
  bottom: string,
): ModelElement[] {
  const base = el([0, 0, 0], [16, 8, 16], {
    down: bottom,
    up: top,
    north: side,
    south: side,
    west: side,
    east: side,
  });
  const stepFaces = { up: top, north: side, south: side, west: side, east: side };
  if (shape === 'straight') return [base, el([8, 8, 0], [16, 16, 16], stepFaces)];
  if (shape === 'inner') {
    return [
      base,
      el([8, 8, 0], [16, 16, 16], stepFaces),
      el([0, 8, 8], [8, 16, 16], { up: top, north: side, south: side, west: side }),
    ];
  }
  return [base, el([8, 8, 8], [16, 16, 16], stepFaces)];
}

export function stairsParts(
  props: Record<string, string>,
  side: string,
  top: string,
  bottom: string,
): Part[] {
  const facing = props.facing ?? 'north';
  const half = props.half ?? 'bottom';
  const shapeProp = props.shape ?? 'straight';
  const base = yaw(YAW_EAST, facing);
  const kind = shapeProp.startsWith('inner')
    ? 'inner'
    : shapeProp.startsWith('outer')
      ? 'outer'
      : 'straight';
  const left = shapeProp.endsWith('_left');
  const right = shapeProp.endsWith('_right');
  let x = 0;
  let y = base;
  if (half === 'top') {
    x = 180;
    if (right) y = base + 90;
  } else if (left) {
    y = base - 90;
  }
  y = ((y % 360) + 360) % 360;
  return [part(stairsElements(kind, side, top, bottom), x, y, x !== 0 || y !== 0)];
}

export const stairsFamily: Family = {
  id: 'stairs',
  match: (name) => name.endsWith('_stairs'),
  build: (ctx) => {
    const m = materialTextures(baseOf(ctx.name, '_stairs'));
    return { parts: stairsParts(ctx.props, m.side, m.top, m.bottom) };
  },
};

function fenceTexture(name: string): string {
  const base = baseOf(name, '_fence');
  if (base === 'nether_brick') return 'nether_bricks';
  return materialTextures(base).side;
}

type Conn = { north: boolean; east: boolean; south: boolean; west: boolean };

const HORIZONTAL = ['north', 'east', 'south', 'west'] as const;
const OFFSETS: Record<(typeof HORIZONTAL)[number], [number, number, number]> = {
  north: [0, 0, -1],
  east: [1, 0, 0],
  south: [0, 0, 1],
  west: [-1, 0, 0],
};

function hasConnectionProps(props: Record<string, string>): boolean {
  return HORIZONTAL.some((d) => props[d] !== undefined);
}

function connections(ctx: Ctx, test: (n: BlockState) => boolean): Conn {
  const out: Conn = { north: false, east: false, south: false, west: false };
  for (const d of HORIZONTAL) {
    const v = ctx.props[d];
    if (v !== undefined) out[d] = v !== 'false' && v !== 'none';
    else if (!hasConnectionProps(ctx.props)) {
      const [dx, dy, dz] = OFFSETS[d];
      out[d] = test(ctx.neighbors(dx, dy, dz));
    }
  }
  return out;
}

function solidNeighbor(n: BlockState): boolean {
  const name = n.name;
  if (name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air')
    return false;
  if (
    /(_slab|_stairs|_leaves|_sapling|_flower|_carpet|_button|_pressure_plate|_torch|_sign|_door|_trapdoor)$/.test(
      name,
    )
  ) {
    return false;
  }
  return true;
}

function fenceLike(n: BlockState): boolean {
  return /(_fence|_fence_gate)$/.test(n.name) || solidNeighbor(n);
}

function paneLike(n: BlockState): boolean {
  return /(_pane|iron_bars|_wall)$/.test(n.name) || solidNeighbor(n);
}

function wallLike(n: BlockState): boolean {
  return /(_wall|_pane|iron_bars|_fence_gate)$/.test(n.name) || solidNeighbor(n);
}

const sideYaw: Record<(typeof HORIZONTAL)[number], number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

export const fenceFamily: Family = {
  id: 'fence',
  match: (name) => name.endsWith('_fence'),
  dynamic: (ctx) => !hasConnectionProps(ctx.props),
  build: (ctx) => {
    const t = fenceTexture(ctx.name);
    const conn = connections(ctx, fenceLike);
    const post = el([6, 0, 6], [10, 16, 10], {
      down: t,
      up: t,
      north: t,
      south: t,
      west: t,
      east: t,
    });
    const sideEls = [
      el([7, 12, 0], [9, 15, 9], { down: t, up: t, north: t, west: t, east: t }),
      el([7, 6, 0], [9, 9, 9], { down: t, up: t, north: t, west: t, east: t }),
    ];
    const parts: Part[] = [part([post])];
    for (const d of HORIZONTAL) if (conn[d]) parts.push(part(sideEls, 0, sideYaw[d], true));
    return { parts };
  },
};

export const fenceGateFamily: Family = {
  id: 'fence_gate',
  match: (name) => name.endsWith('_fence_gate'),
  build: (ctx) => {
    const t = materialTextures(baseOf(ctx.name, '_fence_gate')).side;
    const open = flag(ctx, 'open');
    const dy = flag(ctx, 'in_wall') ? -3 : 0;
    const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      el([x0, y0 + dy, z0], [x1, y1 + dy, z1], {
        down: t,
        up: t,
        north: t,
        south: t,
        west: t,
        east: t,
      });
    const elements = [b(0, 5, 7, 2, 16, 9), b(14, 5, 7, 16, 16, 9)];
    if (open) {
      elements.push(
        b(0, 6, 13, 2, 15, 15),
        b(14, 6, 13, 16, 15, 15),
        b(0, 6, 9, 2, 9, 13),
        b(0, 12, 9, 2, 15, 13),
        b(14, 6, 9, 16, 9, 13),
        b(14, 12, 9, 16, 15, 13),
      );
    } else {
      elements.push(
        b(6, 6, 7, 8, 15, 9),
        b(8, 6, 7, 10, 15, 9),
        b(2, 6, 7, 6, 9, 9),
        b(2, 12, 7, 6, 15, 9),
        b(10, 6, 7, 14, 9, 9),
        b(10, 12, 7, 14, 15, 9),
      );
    }
    return { parts: [part(elements, 0, yaw(YAW_SOUTH, prop(ctx, 'facing', 'south')), true)] };
  },
};

function wallTexture(name: string): string {
  return materialTextures(baseOf(name, '_wall')).side;
}

export const wallFamily: Family = {
  id: 'wall',
  match: (name) => name.endsWith('_wall'),
  dynamic: (ctx) => !hasConnectionProps(ctx.props),
  build: (ctx) => {
    const t = wallTexture(ctx.name);
    const parts: Part[] = [];
    const levels: Record<string, string> = {};
    if (hasConnectionProps(ctx.props)) {
      for (const d of HORIZONTAL) {
        const v = ctx.props[d];
        levels[d] = v === 'true' ? 'low' : v === undefined || v === 'false' ? 'none' : v;
      }
    } else {
      const conn = connections(ctx, wallLike);
      for (const d of HORIZONTAL) levels[d] = conn[d] ? 'low' : 'none';
    }
    const connectedCount = HORIZONTAL.filter((d) => levels[d] !== 'none').length;
    const straight =
      connectedCount === 2 &&
      ((levels.north !== 'none' && levels.south !== 'none') ||
        (levels.east !== 'none' && levels.west !== 'none'));
    const up = ctx.props.up !== undefined ? ctx.props.up === 'true' : !straight;
    if (up) {
      parts.push(
        part([
          el([4, 0, 4], [12, 16, 12], { down: t, up: t, north: t, south: t, west: t, east: t }),
        ]),
      );
    }
    for (const d of HORIZONTAL) {
      const level = levels[d];
      if (!level || level === 'none') continue;
      const h = level === 'tall' ? 16 : 14;
      parts.push(
        part(
          [el([5, 0, 0], [11, h, 8], { down: t, up: t, north: t, west: t, east: t })],
          0,
          sideYaw[d],
          true,
        ),
      );
    }
    return { parts };
  },
};

function paneTextures(name: string): { pane: string; edge: string } {
  if (name === 'glass_pane') return { pane: 'glass', edge: 'glass_pane_top' };
  const color = name.slice(0, -'_stained_glass_pane'.length);
  return { pane: `${color}_stained_glass`, edge: `${color}_stained_glass_pane_top` };
}

export const paneFamily: Family = {
  id: 'pane',
  match: (name) => name === 'glass_pane' || name.endsWith('_stained_glass_pane'),
  dynamic: (ctx) => !hasConnectionProps(ctx.props),
  build: (ctx) => {
    const { pane, edge } = paneTextures(ctx.name);
    const conn = connections(ctx, paneLike);
    const parts: Part[] = [];
    parts.push(
      part([
        el([7, 0, 7], [9, 16, 9], {
          down: face(edge, { uv: [7, 7, 9, 9] }),
          up: face(edge, { uv: [7, 7, 9, 9] }),
        }),
      ]),
    );
    const side = el([7, 0, 0], [9, 16, 7], {
      north: face(edge, { uv: [7, 0, 9, 16], cullface: 'north' }),
      west: face(pane, { uv: [16, 0, 9, 16] }),
      east: face(pane, { uv: [9, 0, 16, 16] }),
      down: face(edge, { uv: [7, 0, 9, 7] }),
      up: face(edge, { uv: [7, 0, 9, 7] }),
    });
    const sideAlt = el([7, 0, 9], [9, 16, 16], {
      south: face(edge, { uv: [7, 0, 9, 16], cullface: 'south' }),
      west: face(pane, { uv: [7, 0, 0, 16] }),
      east: face(pane, { uv: [0, 0, 7, 16] }),
      down: face(edge, { uv: [7, 0, 9, 7], rotation: 180 }),
      up: face(edge, { uv: [7, 0, 9, 7], rotation: 180 }),
    });
    const noside = el([7, 0, 7], [9, 16, 9], { north: face(pane, { uv: [9, 0, 7, 16] }) });
    const nosideAlt = el([7, 0, 7], [9, 16, 9], { south: face(pane, { uv: [7, 0, 9, 16] }) });
    parts.push(conn.north ? part([side]) : part([noside]));
    parts.push(conn.east ? part([side], 0, 90) : part([nosideAlt]));
    parts.push(conn.south ? part([sideAlt]) : part([nosideAlt], 0, 90));
    parts.push(conn.west ? part([sideAlt], 0, 90) : part([noside], 0, 270));
    const translucent = ctx.name !== 'glass_pane';
    return {
      parts,
      layer: translucent ? 'translucent' : 'cutout',
      shadeOccluder: false,
      solid: false,
      cullGroup: ctx.name,
    };
  },
};

export const ironBarsFamily: Family = {
  id: 'iron_bars',
  match: (name) =>
    name === 'iron_bars' || /^(waxed_)?(exposed_|weathered_|oxidized_)?copper_bars$/.test(name),
  dynamic: (ctx) => !hasConnectionProps(ctx.props),
  build: (ctx) => {
    const t = stripWaxed(ctx.name);
    const conn = connections(ctx, paneLike);
    const any = HORIZONTAL.some((d) => conn[d]);
    const parts: Part[] = [];
    const cap = { uv: [7, 7, 9, 9] as [number, number, number, number] };
    parts.push(
      part([
        el([7, 0.001, 7], [9, 0.001, 9], { down: face(t, cap), up: face(t, cap) }),
        el([7, 15.999, 7], [9, 15.999, 9], { down: face(t, cap), up: face(t, cap) }),
      ]),
    );
    if (!any) {
      parts.push(
        part([
          el([8, 0, 7], [8, 16, 9], {
            west: face(t, { uv: [7, 0, 9, 16] }),
            east: face(t, { uv: [9, 0, 7, 16] }),
          }),
          el([7, 0, 8], [9, 16, 8], {
            north: face(t, { uv: [7, 0, 9, 16] }),
            south: face(t, { uv: [9, 0, 7, 16] }),
          }),
        ]),
      );
    }
    const side: ModelElement[] = [
      el([8, 0, 0], [8, 16, 8], {
        west: face(t, { uv: [16, 0, 8, 16] }),
        east: face(t, { uv: [8, 0, 16, 16] }),
      }),
      el([7, 0, 0], [9, 16, 0.001], { north: face(t, { uv: [7, 0, 9, 16] }) }),
      el([7, 0.001, 0], [9, 0.001, 8], {
        down: face(t, { uv: [9, 0, 7, 8] }),
        up: face(t, { uv: [7, 0, 9, 8] }),
      }),
      el([7, 15.999, 0], [9, 15.999, 8], {
        down: face(t, { uv: [9, 0, 7, 8] }),
        up: face(t, { uv: [7, 0, 9, 8] }),
      }),
    ];
    for (const d of HORIZONTAL) if (conn[d]) parts.push(part(side, 0, sideYaw[d]));
    return { parts, layer: 'cutout', shadeOccluder: false, solid: false, cullGroup: t };
  },
};

function doorTextures(name: string): { bottom: string; top: string } {
  const base = stripWaxed(name);
  return { bottom: `${base}_bottom`, top: `${base}_top` };
}

export const doorFamily: Family = {
  id: 'door',
  match: (name) => name.endsWith('_door'),
  build: (ctx) => {
    const t = doorTextures(ctx.name);
    const lower = prop(ctx, 'half', 'lower') === 'lower';
    const texture = lower ? t.bottom : t.top;
    const hinge = prop(ctx, 'hinge', 'left');
    const open = flag(ctx, 'open');
    const mirrored = (hinge === 'right') !== open;
    const faces = {
      north: face(texture, { uv: [3, 0, 0, 16] }),
      south: face(texture, { uv: [0, 0, 3, 16] }),
      west: face(texture, { uv: mirrored ? [16, 0, 0, 16] : [0, 0, 16, 16] }),
      east: face(texture, { uv: mirrored ? [0, 0, 16, 16] : [16, 0, 0, 16] }),
      ...(lower
        ? { down: face(texture, { uv: [13, 0, 16, 16] }) }
        : { up: face(texture, { uv: [13, 0, 16, 16] }) }),
    };
    let y = yaw(YAW_EAST, prop(ctx, 'facing', 'east'));
    if (open) y += hinge === 'right' ? 270 : 90;
    return {
      parts: [part([el([0, 0, 0], [3, 16, 16], faces)], 0, y % 360)],
      layer: 'cutout',
      shadeOccluder: false,
    };
  },
};

export const trapdoorFamily: Family = {
  id: 'trapdoor',
  match: (name) => name.endsWith('_trapdoor'),
  build: (ctx) => {
    const t = stripWaxed(ctx.name);
    const open = flag(ctx, 'open');
    const top = prop(ctx, 'half', 'bottom') === 'top';
    const facingYaw = yaw(YAW_NORTH, prop(ctx, 'facing', 'north'));
    const edge: [number, number, number, number] = [0, 16, 16, 13];
    if (open) {
      const element = el([0, 0, 13], [16, 16, 16], {
        down: face(t, { uv: [0, 13, 16, 16] }),
        up: face(t, { uv: [0, 16, 16, 13] }),
        north: face(t),
        south: face(t),
        west: face(t, { uv: [16, 0, 13, 16], rotation: 90 }),
        east: face(t, { uv: [13, 0, 16, 16], rotation: 270 }),
      });
      const x = top ? 180 : 0;
      const y = top ? (facingYaw + 180) % 360 : facingYaw;
      return { parts: [part([element], x, y)], layer: 'cutout', shadeOccluder: false };
    }
    const y0 = top ? 13 : 0;
    const element = el([0, y0, 0], [16, y0 + 3, 16], {
      down: face(t),
      up: face(t),
      north: face(t, { uv: edge }),
      south: face(t, { uv: edge }),
      west: face(t, { uv: edge }),
      east: face(t, { uv: edge }),
    });
    return { parts: [part([element], 0, facingYaw)], layer: 'cutout', shadeOccluder: false };
  },
};

function attachedOrientation(ctx: Ctx): { x: number; y: number; uvlock: boolean } {
  const f = prop(ctx, 'face', 'floor');
  const facing = prop(ctx, 'facing', 'north');
  const base = yaw(YAW_NORTH, facing);
  if (f === 'ceiling') return { x: 180, y: (base + 180) % 360, uvlock: false };
  if (f === 'wall') return { x: 90, y: base, uvlock: true };
  return { x: 0, y: base, uvlock: false };
}

function buttonTexture(name: string): string {
  const base = baseOf(name, '_button');
  if (base === 'stone') return 'stone';
  if (base === 'polished_blackstone') return 'polished_blackstone';
  return materialTextures(base).side;
}

export const buttonFamily: Family = {
  id: 'button',
  match: (name) => name.endsWith('_button'),
  build: (ctx) => {
    const t = buttonTexture(ctx.name);
    const h = flag(ctx, 'powered') ? 1 : 2;
    const o = attachedOrientation(ctx);
    const element = el([5, 0, 6], [11, h, 10], {
      down: t,
      up: t,
      north: t,
      south: t,
      west: t,
      east: t,
    });
    return { parts: [part([element], o.x, o.y, o.uvlock)], solid: false };
  },
};

function plateTexture(name: string): string {
  const base = baseOf(name, '_pressure_plate');
  if (base === 'light_weighted') return 'gold_block';
  if (base === 'heavy_weighted') return 'iron_block';
  return materialTextures(base).side;
}

export const pressurePlateFamily: Family = {
  id: 'pressure_plate',
  match: (name) => name.endsWith('_pressure_plate'),
  build: (ctx) => {
    const t = plateTexture(ctx.name);
    const down = flag(ctx, 'powered') || num(ctx, 'power', 0) > 0;
    return single([box([1, 0, 1], [15, down ? 0.5 : 1, 15], t)], { solid: false });
  },
};

export const carpetFamily: Family = {
  id: 'carpet',
  match: (name) => name.endsWith('_carpet') && name !== 'pale_moss_carpet',
  build: (ctx) => {
    const base = ctx.name.slice(0, -'_carpet'.length);
    const t =
      base === 'moss' ? 'moss_block' : base === 'pale_moss' ? 'pale_moss_carpet' : `${base}_wool`;
    return single([box([0, 0, 0], [16, 1, 16], t)], { solid: false });
  },
};

export const paleMossCarpetFamily: Family = {
  id: 'pale_moss_carpet',
  match: (name) => name === 'pale_moss_carpet',
  build: () => single([box([0, 0, 0], [16, 1, 16], 'pale_moss_carpet')], { solid: false }),
};

export const snowLayerFamily: Family = {
  id: 'snow',
  match: (name) => name === 'snow',
  build: (ctx) => {
    const layers = Math.max(1, Math.min(8, num(ctx, 'layers', 1)));
    if (layers >= 8) return cubeAll('snow');
    return single([box([0, 0, 0], [16, layers * 2, 16], 'snow')], { solid: layers > 1 });
  },
};
