import { el, face, part, single, type FaceInput, type ModelSpec, type Part } from '../build';
import {
  flag,
  num,
  orientUpFront,
  prop,
  yaw,
  YAW_EAST,
  YAW_NORTH,
  YAW_SOUTH,
  axisOrientation,
  type Ctx,
  type Family,
} from '../context';
import { colorOf, stripWaxed, WOODS } from '../materials';
import { redstoneColor, TINT_RGB } from '../tints';
import type { ModelElement, ModelFace, Vec3 } from '../types';
import { crossElements } from './plants';
import { entityBox, rect, yawParts, type TexSize } from './entity';

type Six = Partial<Record<'down' | 'up' | 'north' | 'south' | 'west' | 'east', FaceInput>>;

function b(from: Vec3, to: Vec3, t: FaceInput | Six): ModelElement {
  if (typeof t === 'string' || 'texture' in t) {
    return el(from, to, { down: t, up: t, north: t, south: t, west: t, east: t });
  }
  return el(from, to, t as Six);
}

const cutout = { layer: 'cutout' as const, shadeOccluder: false, solid: false };

function torchElements(t: FaceInput): ModelElement[] {
  const f = (uv: [number, number, number, number]) => face(t, { uv });
  return [
    el([7, 0, 7], [9, 10, 9], { down: f([7, 13, 9, 15]), up: f([7, 6, 9, 8]) }, { shade: false }),
    el(
      [7, 0, 0],
      [9, 16, 16],
      { west: f([0, 0, 16, 16]), east: f([0, 0, 16, 16]) },
      { shade: false },
    ),
    el(
      [0, 0, 7],
      [16, 16, 9],
      { north: f([0, 0, 16, 16]), south: f([0, 0, 16, 16]) },
      { shade: false },
    ),
  ];
}

function wallTorchElements(t: FaceInput): ModelElement[] {
  const f = (uv: [number, number, number, number]) => face(t, { uv });
  const rotation = { origin: [0, 3.5, 8] as Vec3, axis: 'z' as const, angle: -22.5 };
  return [
    el(
      [-1, 3.5, 7],
      [1, 13.5, 9],
      { down: f([7, 13, 9, 15]), up: f([7, 6, 9, 8]) },
      { rotation, shade: false },
    ),
    el(
      [-1, 3.5, 0],
      [1, 19.5, 16],
      { west: f([0, 0, 16, 16]), east: f([0, 0, 16, 16]) },
      { rotation, shade: false },
    ),
    el(
      [-8, 3.5, 7],
      [8, 19.5, 9],
      { north: f([0, 0, 16, 16]), south: f([0, 0, 16, 16]) },
      { rotation, shade: false },
    ),
  ];
}

export const torchFamily: Family = {
  id: 'torch',
  match: (name) => /^(soul_|redstone_|copper_)?(wall_)?torch$/.test(name),
  build: (ctx) => {
    const wall = ctx.name.includes('wall_torch');
    const kind = ctx.name.replace('wall_torch', 'torch');
    const isRedstone = kind === 'redstone_torch';
    const lit = !isRedstone || prop(ctx, 'lit', 'true') === 'true';
    const t = isRedstone && !lit ? 'redstone_torch_off' : kind;
    const emissive = lit ? (isRedstone ? 0.7 : 1) : 0;
    const f = face(t, emissive ? { emissive } : {});
    if (wall) {
      return {
        parts: [part(wallTorchElements(f), 0, yaw(YAW_EAST, prop(ctx, 'facing', 'east')))],
        ...cutout,
      };
    }
    return single(torchElements(f), cutout);
  },
};

function lanternElements(t: FaceInput, hanging: boolean): ModelElement[] {
  const f = (uv: [number, number, number, number]) => face(t, { uv });
  const o = hanging ? 1 : 0;
  const els: ModelElement[] = [
    el([5, o, 5], [11, 7 + o, 11], {
      down: f([0, 9, 6, 15]),
      up: f([0, 9, 6, 15]),
      north: f([0, 2, 6, 9]),
      south: f([0, 2, 6, 9]),
      west: f([0, 2, 6, 9]),
      east: f([0, 2, 6, 9]),
    }),
    el([6, 7 + o, 6], [10, 9 + o, 10], {
      up: f([1, 10, 5, 14]),
      north: f([1, 0, 5, 2]),
      south: f([1, 0, 5, 2]),
      west: f([1, 0, 5, 2]),
      east: f([1, 0, 5, 2]),
    }),
  ];
  const rotation = { origin: [8, 8, 8] as Vec3, axis: 'y' as const, angle: 45 };
  if (hanging) {
    els.push(
      el(
        [6.5, 11, 8],
        [9.5, 15, 8],
        { north: f([14, 1, 11, 5]), south: f([11, 1, 14, 5]) },
        { rotation },
      ),
      el(
        [8, 10, 6.5],
        [8, 16, 9.5],
        { west: f([14, 6, 11, 12]), east: f([11, 6, 14, 12]) },
        { rotation },
      ),
    );
  } else {
    els.push(
      el(
        [6.5, 9, 8],
        [9.5, 11, 8],
        { north: f([14, 1, 11, 3]), south: f([11, 1, 14, 3]) },
        { rotation },
      ),
      el(
        [8, 9, 6.5],
        [8, 11, 9.5],
        { west: f([14, 10, 11, 12]), east: f([11, 10, 14, 12]) },
        { rotation },
      ),
    );
  }
  return els;
}

export const lanternFamily: Family = {
  id: 'lantern',
  match: (name) =>
    /^(soul_|copper_|exposed_copper_|weathered_copper_|oxidized_copper_|waxed_.*_)?lantern$/.test(
      name,
    ) &&
    name !== 'jack_o_lantern' &&
    name !== 'sea_lantern',
  build: (ctx) => {
    const t = face(stripWaxed(ctx.name), { emissive: 1 });
    return single(lanternElements(t, flag(ctx, 'hanging')), cutout);
  },
};

export const chainFamily: Family = {
  id: 'chain',
  match: (name) => /^(waxed_)?(exposed_|weathered_|oxidized_)?(iron_|copper_)?chain$/.test(name),
  build: (ctx) => {
    const base = stripWaxed(ctx.name);
    const fallback =
      base === 'chain' ? ['block/iron_chain'] : base === 'iron_chain' ? ['block/chain'] : undefined;
    const f = (uv: [number, number, number, number]) =>
      face(base, { uv, ...(fallback ? { fallback } : {}) });
    const rotation = { origin: [8, 8, 8] as Vec3, axis: 'y' as const, angle: 45 };
    const elements = [
      el(
        [6.5, 0, 8],
        [9.5, 16, 8],
        { north: f([0, 0, 3, 16]), south: f([0, 0, 3, 16]) },
        { rotation, shade: false },
      ),
      el(
        [8, 0, 6.5],
        [8, 16, 9.5],
        { west: f([3, 0, 6, 16]), east: f([3, 0, 6, 16]) },
        { rotation, shade: false },
      ),
    ];
    const o = axisOrientation(prop(ctx, 'axis', 'y'));
    return { parts: [part(elements, o.x, o.y)], ...cutout };
  },
};

export const endRodFamily: Family = {
  id: 'end_rod',
  match: (name) => name === 'end_rod' || /lightning_rod$/.test(name),
  build: (ctx) => {
    const o = orientUpFront(prop(ctx, 'facing', 'up'));
    if (ctx.name === 'end_rod') {
      const t = (uv: [number, number, number, number]) => face('end_rod', { uv, emissive: 1 });
      const elements = [
        el([7, 1, 7], [9, 16, 9], {
          up: t([2, 0, 4, 2]),
          north: t([0, 0, 2, 15]),
          south: t([0, 0, 2, 15]),
          west: t([0, 0, 2, 15]),
          east: t([0, 0, 2, 15]),
        }),
        el([6, 0, 6], [10, 1, 10], {
          down: t([2, 2, 6, 6]),
          up: t([2, 2, 6, 6]),
          north: t([2, 6, 6, 7]),
          south: t([2, 6, 6, 7]),
          west: t([2, 6, 6, 7]),
          east: t([2, 6, 6, 7]),
        }),
      ];
      return { parts: [part(elements, o.x, o.y)], ...cutout, emissive: 1 };
    }
    const base = stripWaxed(ctx.name);
    const t = (uv: [number, number, number, number]) => face(base, { uv });
    const elements = [
      el([6, 12, 6], [10, 16, 10], {
        down: t([0, 0, 4, 4]),
        up: t([0, 0, 4, 4]),
        north: t([0, 0, 4, 4]),
        south: t([0, 0, 4, 4]),
        west: t([0, 0, 4, 4]),
        east: t([0, 0, 4, 4]),
      }),
      el([7, 0, 7], [9, 12, 9], {
        down: t([0, 4, 2, 6]),
        north: t([0, 4, 2, 16]),
        south: t([0, 4, 2, 16]),
        west: t([0, 4, 2, 16]),
        east: t([0, 4, 2, 16]),
      }),
    ];
    return { parts: [part(elements, o.x, o.y)], ...cutout };
  },
};

export const ladderFamily: Family = {
  id: 'ladder',
  match: (name) => name === 'ladder',
  build: (ctx) => {
    const f = face('ladder');
    const element = el([0, 0, 15.2], [16, 16, 15.2], { north: f, south: f }, { shade: false });
    return { parts: [part([element], 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))], ...cutout };
  },
};

export const leverFamily: Family = {
  id: 'lever',
  match: (name) => name === 'lever',
  build: (ctx) => {
    const powered = flag(ctx, 'powered');
    const f = prop(ctx, 'face', 'wall');
    const base = yaw(YAW_NORTH, prop(ctx, 'facing', 'north'));
    const on = f === 'ceiling' ? !powered : powered;
    const c = (uv: [number, number, number, number]) => face('cobblestone', { uv });
    const l = (uv: [number, number, number, number]) => face('lever', { uv });
    const elements = [
      el([5, 0, 4], [11, 3, 12], {
        down: c([5, 4, 11, 12]),
        up: c([5, 4, 11, 12]),
        north: c([5, 0, 11, 3]),
        south: c([5, 0, 11, 3]),
        west: c([4, 0, 12, 3]),
        east: c([4, 0, 12, 3]),
      }),
      el(
        [7, 1, 7],
        [9, 11, 9],
        {
          up: l([7, 6, 9, 8]),
          north: l([7, 6, 9, 16]),
          south: l([7, 6, 9, 16]),
          west: l([7, 6, 9, 16]),
          east: l([7, 6, 9, 16]),
        },
        { rotation: { origin: [8, 1, 8], axis: 'x', angle: on ? 45 : -45 } },
      ),
    ];
    let x = 0;
    let y = base;
    if (f === 'ceiling') {
      x = 180;
      y = (base + 180) % 360;
    } else if (f === 'wall') {
      x = 90;
    }
    return { parts: [part(elements, x, y)], solid: false };
  },
};

const RAIL_YAW: Record<string, { model: 'flat' | 'curved' | 'ne' | 'sw'; y: number }> = {
  north_south: { model: 'flat', y: 0 },
  east_west: { model: 'flat', y: 90 },
  ascending_east: { model: 'ne', y: 90 },
  ascending_west: { model: 'sw', y: 90 },
  ascending_north: { model: 'ne', y: 0 },
  ascending_south: { model: 'sw', y: 0 },
  south_east: { model: 'curved', y: 0 },
  south_west: { model: 'curved', y: 90 },
  north_west: { model: 'curved', y: 180 },
  north_east: { model: 'curved', y: 270 },
};

export const railFamily: Family = {
  id: 'rail',
  match: (name) =>
    name === 'rail' ||
    name === 'powered_rail' ||
    name === 'detector_rail' ||
    name === 'activator_rail',
  build: (ctx) => {
    const shape = prop(ctx, 'shape', 'north_south');
    const cfg = RAIL_YAW[shape] ?? RAIL_YAW.north_south!;
    const on = flag(ctx, 'powered');
    let t = ctx.name;
    if (ctx.name === 'rail' && cfg.model === 'curved') t = 'rail_corner';
    else if (ctx.name !== 'rail' && on) t = `${ctx.name}_on`;
    const f = face(t, { uv: [0, 0, 16, 16] });
    const fd = face(t, { uv: [0, 16, 16, 0] });
    let element: ModelElement;
    if (cfg.model === 'ne' || cfg.model === 'sw') {
      element = el(
        [0, 9, 0],
        [16, 9, 16],
        { up: f, down: fd },
        {
          rotation: {
            origin: [8, 9, 8],
            axis: 'x',
            angle: cfg.model === 'ne' ? 45 : -45,
            rescale: true,
          },
        },
      );
    } else {
      element = el([0, 1, 0], [16, 1, 16], { up: f, down: fd });
    }
    return {
      parts: [part([element], 0, cfg.y)],
      ...cutout,
      emissive: ctx.name === 'powered_rail' && on ? 0.3 : 0,
    };
  },
};

function bedTexture(name: string): string {
  const color = colorOf(name) ?? 'red';
  return `entity/bed/${color}`;
}

export const bedFamily: Family = {
  id: 'bed',
  match: (name) => name.endsWith('_bed'),
  build: (ctx) => {
    const t = bedTexture(ctx.name);
    const size: TexSize = { w: 64, h: 64 };
    const head = prop(ctx, 'part', 'foot') === 'head';
    const leg = {
      up: rect(t, size, [53, 3, 56, 0]),
      down: rect(t, size, [56, 3, 59, 0]),
      north: rect(t, size, [50, 3, 53, 6]),
      south: rect(t, size, [53, 3, 56, 6]),
      west: rect(t, size, [56, 3, 59, 6]),
      east: rect(t, size, [59, 3, 62, 6]),
    };
    const elements: ModelElement[] = [];
    if (head) {
      elements.push(
        el([0, 3, 0], [16, 9, 16], {
          up: rect(t, size, [6, 6, 22, 22]),
          down: rect(t, size, [28, 6, 44, 22]),
          north: rect(t, size, [22, 6, 6, 0]),
          west: rect(t, size, [0, 6, 6, 22], { rotation: 270 }),
          east: rect(t, size, [22, 6, 28, 22], { rotation: 90 }),
        }),
        el([0, 0, 0], [3, 3, 3], leg),
        el([13, 0, 0], [16, 3, 3], leg),
      );
    } else {
      elements.push(
        el([0, 3, 0], [16, 9, 16], {
          up: rect(t, size, [6, 28, 22, 44]),
          down: rect(t, size, [28, 28, 44, 44]),
          south: rect(t, size, [22, 22, 38, 28]),
          west: rect(t, size, [0, 28, 6, 44], { rotation: 270 }),
          east: rect(t, size, [22, 28, 28, 44], { rotation: 90 }),
        }),
        el([0, 0, 13], [3, 3, 16], leg),
        el([13, 0, 13], [16, 3, 16], leg),
      );
    }
    return {
      parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
      shadeOccluder: false,
      solid: true,
    };
  },
};

export const chestFamily: Family = {
  id: 'chest',
  match: (name) => name === 'chest' || name === 'trapped_chest' || name === 'ender_chest',
  build: (ctx) => {
    const rawType = prop(ctx, 'type', 'single');
    const type = rawType === 'left' || rawType === 'right' ? rawType : 'single';
    const kind =
      ctx.name === 'ender_chest' ? 'ender' : ctx.name === 'trapped_chest' ? 'trapped' : 'normal';
    const size: TexSize = { w: 64, h: 64 };
    const elements: ModelElement[] = [];
    if (type === 'single' || kind === 'ender') {
      const t = `entity/chest/${kind}`;
      elements.push(
        entityBox([1, 0, 1], [15, 10, 15], t, size, { u: 0, v: 19, dx: 14, dy: 10, dz: 14 }),
        entityBox([1, 10, 1], [15, 14, 15], t, size, { u: 0, v: 0, dx: 14, dy: 5, dz: 14 }),
        entityBox([7, 7, 0], [9, 11, 1], t, size, { u: 0, v: 0, dx: 2, dy: 4, dz: 1 }),
      );
    } else {
      const t = `entity/chest/${kind}_${type}`;
      const left = type === 'left';
      const x0 = left ? 1 : 0;
      const x1 = left ? 16 : 15;
      elements.push(
        entityBox([x0, 0, 1], [x1, 10, 15], t, size, { u: 0, v: 19, dx: 15, dy: 10, dz: 14 }),
        entityBox([x0, 10, 1], [x1, 14, 15], t, size, { u: 0, v: 0, dx: 15, dy: 5, dz: 14 }),
        entityBox(left ? [15, 7, 0] : [0, 7, 0], left ? [16, 11, 1] : [1, 11, 1], t, size, {
          u: 0,
          v: 0,
          dx: 1,
          dy: 4,
          dz: 1,
        }),
      );
    }
    return {
      parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
      shadeOccluder: false,
      solid: true,
    };
  },
};

function signWood(name: string): string {
  for (const w of [...WOODS].sort((a, b) => b.length - a.length))
    if (name.startsWith(`${w}_`)) return w;
  return 'oak';
}

function strippedLog(wood: string): string {
  if (wood === 'crimson' || wood === 'warped') return `stripped_${wood}_stem`;
  if (wood === 'bamboo') return 'stripped_bamboo_block';
  return `stripped_${wood}_log`;
}

export const signFamily: Family = {
  id: 'sign',
  match: (name) => name.endsWith('_sign'),
  build: (ctx) => {
    const wood = signWood(ctx.name);
    const hanging = ctx.name.includes('hanging_sign');
    const wall = ctx.name.includes('_wall_');
    const size: TexSize = { w: 64, h: 32 };
    if (hanging) {
      const t = `entity/signs/hanging/${wood}`;
      const elements: ModelElement[] = [
        entityBox([1, 0, 7], [15, 10, 9], t, size, { u: 0, v: 12, dx: 14, dy: 10, dz: 2 }),
      ];
      const chain = face(t, { uv: [0, 12, 0.75, 24] });
      elements.push(
        el([2, 10, 8], [5, 16, 8], { north: chain, south: chain }, { shade: false }),
        el([11, 10, 8], [14, 16, 8], { north: chain, south: chain }, { shade: false }),
      );
      if (wall) {
        const log = strippedLog(wood);
        elements.push(b([0, 14, 6], [16, 16, 10], log));
        return {
          parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
          ...cutout,
        };
      }
      return { parts: yawParts(elements, 180 + num(ctx, 'rotation', 0) * 22.5), ...cutout };
    }
    const t = `entity/signs/${wood}`;
    const k = 2 / 3;
    if (wall) {
      const elements = [
        entityBox([0, 4.5, 16 - 2 * k], [16, 4.5 + 12 * k, 16], t, size, {
          u: 0,
          v: 0,
          dx: 24,
          dy: 12,
          dz: 2,
        }),
      ];
      return {
        parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
        ...cutout,
        layer: 'opaque',
      };
    }
    const elements = [
      entityBox([0, 14 * k, 8 - k], [16, 26 * k, 8 + k], t, size, {
        u: 0,
        v: 0,
        dx: 24,
        dy: 12,
        dz: 2,
      }),
      entityBox([8 - k, 0, 8 - k], [8 + k, 14 * k, 8 + k], t, size, {
        u: 0,
        v: 14,
        dx: 2,
        dy: 14,
        dz: 2,
      }),
    ];
    return {
      parts: yawParts(elements, 180 + num(ctx, 'rotation', 0) * 22.5),
      ...cutout,
      layer: 'opaque',
    };
  },
};

const HEAD_TEXTURES: Record<string, { t: string; size: TexSize; dx?: number }> = {
  skeleton: { t: 'entity/skeleton/skeleton', size: { w: 64, h: 32 } },
  wither_skeleton: { t: 'entity/skeleton/wither_skeleton', size: { w: 64, h: 32 } },
  zombie: { t: 'entity/zombie/zombie', size: { w: 64, h: 64 } },
  creeper: { t: 'entity/creeper/creeper', size: { w: 64, h: 32 } },
  player: { t: 'entity/player/wide/steve', size: { w: 64, h: 64 } },
  piglin: { t: 'entity/piglin/piglin', size: { w: 64, h: 64 }, dx: 10 },
  dragon: { t: 'entity/enderdragon/dragon', size: { w: 256, h: 256 } },
};

export const headFamily: Family = {
  id: 'head',
  match: (name) => /_(head|skull)$/.test(name) && !name.endsWith('piston_head'),
  build: (ctx) => {
    const wall = /_wall_(head|skull)$/.test(ctx.name);
    const kind = ctx.name.replace(/_wall_(head|skull)$/, '').replace(/_(head|skull)$/, '');
    const cfg = HEAD_TEXTURES[kind] ?? HEAD_TEXTURES.player!;
    const dx = cfg.dx ?? 8;
    const half = dx / 2;
    const uvBox =
      kind === 'dragon'
        ? { u: 112, v: 30, dx: 16, dy: 16, dz: 16 }
        : { u: 0, v: 0, dx, dy: 8, dz: 8 };
    if (wall) {
      const element = entityBox([8 - half, 4, 8], [8 + half, 12, 16], cfg.t, cfg.size, uvBox);
      return {
        parts: [part([element], 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
        shadeOccluder: false,
        solid: false,
      };
    }
    const element = entityBox([8 - half, 0, 4], [8 + half, 8, 12], cfg.t, cfg.size, uvBox);
    return {
      parts: yawParts([element], 180 + num(ctx, 'rotation', 0) * 22.5),
      shadeOccluder: false,
      solid: false,
    };
  },
};

export const bannerFamily: Family = {
  id: 'banner',
  match: (name) => name.endsWith('_banner'),
  build: (ctx) => {
    const wall = ctx.name.endsWith('_wall_banner');
    const color = colorOf(ctx.name) ?? 'white';
    const wool = `${color}_wool`;
    const k = 2 / 3;
    if (wall) {
      const elements = [
        b([1 + k, -12 + 2 * k, 15], [15 - k, 14.5, 16 - k / 2], wool),
        b([0.5, 14.5, 14], [15.5, 16, 16], 'oak_planks'),
      ];
      return {
        parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
        shadeOccluder: false,
        solid: false,
      };
    }
    const elements = [
      b([1 + k, 2.5, 8.5], [15 - k, 29, 9.2], wool),
      b([7.3, 0, 7.3], [8.7, 28, 8.7], 'oak_planks'),
      b([1, 28, 7.3], [15, 29.4, 8.7], 'oak_planks'),
    ];
    return {
      parts: yawParts(elements, 180 + num(ctx, 'rotation', 0) * 22.5),
      shadeOccluder: false,
      solid: false,
    };
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

export const bellFamily: Family = {
  id: 'bell',
  match: (name) => name === 'bell',
  build: (ctx) => {
    const attachment = prop(ctx, 'attachment', 'floor');
    const size: TexSize = { w: 32, h: 32 };
    const t = 'entity/bell/bell_body';
    const elements: ModelElement[] = [];
    const bodyTop = attachment === 'ceiling' ? 12 : 13;
    elements.push(
      entityBox([5, bodyTop - 7, 5], [11, bodyTop, 11], t, size, {
        u: 0,
        v: 0,
        dx: 6,
        dy: 7,
        dz: 6,
      }),
      entityBox([4, bodyTop - 9, 4], [12, bodyTop - 7, 12], t, size, {
        u: 0,
        v: 13,
        dx: 8,
        dy: 2,
        dz: 8,
      }),
    );
    if (attachment === 'floor') {
      elements.push(
        b([2, 0, 6], [4, 16, 10], 'stone'),
        b([12, 0, 6], [14, 16, 10], 'stone'),
        b([4, 12, 7], [12, 14, 9], 'dark_oak_planks'),
      );
    } else if (attachment === 'ceiling') {
      elements.push(b([7, 13, 7], [9, 16, 9], 'dark_oak_planks'));
    } else if (attachment === 'single_wall') {
      elements.push(b([7, 13, 3], [9, 15, 16], 'dark_oak_planks'));
    } else {
      elements.push(b([7, 13, 0], [9, 15, 16], 'dark_oak_planks'));
    }
    return {
      parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
      shadeOccluder: false,
      solid: true,
    };
  },
};

export const campfireFamily: Family = {
  id: 'campfire',
  match: (name) => name === 'campfire' || name === 'soul_campfire',
  build: (ctx) => {
    const isLit = prop(ctx, 'lit', 'true') === 'true';
    const log = 'campfire_log';
    const logLit = isLit ? `${ctx.name}_log_lit` : 'campfire_log';
    const sideLong = (t: string) => face(t, { uv: [0, 4, 16, 8] });
    const sideLongTop = (t: string) => face(t, { uv: [0, 0, 16, 4] });
    const end = face(log, { uv: [0, 8, 4, 12] });
    const logZ = (x0: number, y0: number, t: string): ModelElement =>
      el([x0, y0, 0], [x0 + 4, y0 + 4, 16], {
        down: face(t, { uv: [0, 0, 16, 4], rotation: 90 }),
        up: face(t, { uv: [0, 0, 16, 4], rotation: 90 }),
        north: end,
        south: end,
        west: sideLong(t),
        east: sideLong(t),
      });
    const logX = (z0: number, y0: number, t: string): ModelElement =>
      el([0, y0, z0], [16, y0 + 4, z0 + 4], {
        down: sideLongTop(t),
        up: sideLongTop(t),
        north: sideLong(t),
        south: sideLong(t),
        west: end,
        east: end,
      });
    const elements: ModelElement[] = [
      logZ(1, 0, log),
      logZ(11, 0, log),
      logX(11, 3, logLit),
      logX(1, 3, logLit),
      el([5, 0, 0], [11, 1, 16], {
        up: face(logLit, { uv: [0, 8, 16, 14], rotation: 90 }),
        north: face(logLit, { uv: [0, 15, 6, 16] }),
        south: face(logLit, { uv: [10, 15, 16, 16] }),
      }),
    ];
    if (isLit) {
      const fire = face(`${ctx.name}_fire`, { emissive: 1 });
      elements.push(...crossElements(fire, 1, 17));
    }
    return {
      parts: [part(elements, 0, yaw(YAW_SOUTH, prop(ctx, 'facing', 'south')))],
      layer: 'cutout',
      shadeOccluder: false,
      solid: true,
    };
  },
};

export const fireFamily: Family = {
  id: 'fire',
  match: (name) => name === 'fire' || name === 'soul_fire',
  build: (ctx) => {
    const f = face(`${ctx.name}_0`, { emissive: 1, uv: [0, 0, 16, 16] });
    const elements = [
      el([0, 0, 0.01], [16, 22.4, 0.01], { south: f, north: f }, { shade: false }),
      el([0, 0, 15.99], [16, 22.4, 15.99], { north: f, south: f }, { shade: false }),
      el([0.01, 0, 0], [0.01, 22.4, 16], { east: f, west: f }, { shade: false }),
      el([15.99, 0, 0], [15.99, 22.4, 16], { west: f, east: f }, { shade: false }),
      ...crossElements(f, 0, 22.4),
    ];
    return single(elements, { ...cutout, emissive: 1 });
  },
};

export const portalFamily: Family = {
  id: 'portal',
  match: (name) => name === 'nether_portal' || name === 'end_portal' || name === 'end_gateway',
  build: (ctx) => {
    if (ctx.name === 'nether_portal') {
      const f = face('nether_portal', { emissive: 0.8 });
      const elements = [el([0, 0, 6], [16, 16, 10], { north: f, south: f })];
      const axis = prop(ctx, 'axis', 'x');
      return {
        parts: [part(elements, 0, axis === 'z' ? 90 : 0)],
        layer: 'translucent',
        shadeOccluder: false,
        solid: false,
        emissive: 0.8,
      };
    }
    const f = face('entity/end_portal', { emissive: 0.4 });
    const y = ctx.name === 'end_portal' ? 12 : 16;
    return single([el([0, y, 0], [16, y, 16], { up: f, down: f })], {
      solid: false,
      shadeOccluder: false,
    });
  },
};

export const enchantingTableFamily: Family = {
  id: 'workstations',
  match: (name) =>
    [
      'enchanting_table',
      'stonecutter',
      'daylight_detector',
      'end_portal_frame',
      'lectern',
      'grindstone',
      'brewing_stand',
      'conduit',
      'heavy_core',
      'sculk_sensor',
      'calibrated_sculk_sensor',
      'sculk_shrieker',
      'chorus_plant',
      'chorus_flower',
      'decorated_pot',
      'tripwire_hook',
      'tripwire',
      'redstone_wire',
      'repeater',
      'comparator',
      'piston',
      'sticky_piston',
      'piston_head',
      'powder_snow',
    ].includes(name),
  build: (ctx) => buildWorkstation(ctx),
};

function buildWorkstation(ctx: Ctx): ModelSpec | null {
  const facingYaw = (table = YAW_NORTH) => yaw(table, prop(ctx, 'facing', 'north'));
  switch (ctx.name) {
    case 'enchanting_table':
      return single(
        [
          el([0, 0, 0], [16, 12, 16], {
            down: 'enchanting_table_bottom',
            up: 'enchanting_table_top',
            north: 'enchanting_table_side',
            south: 'enchanting_table_side',
            west: 'enchanting_table_side',
            east: 'enchanting_table_side',
          }),
        ],
        { solid: true },
      );
    case 'stonecutter': {
      const saw = face('stonecutter_saw', { uv: [1, 9, 15, 16] });
      const elements = [
        el([0, 0, 0], [16, 9, 16], {
          down: 'stonecutter_bottom',
          up: 'stonecutter_top',
          north: 'stonecutter_side',
          south: 'stonecutter_side',
          west: 'stonecutter_side',
          east: 'stonecutter_side',
        }),
        el([1, 9, 8], [15, 16, 8], { north: saw, south: saw }, { shade: false }),
      ];
      return { parts: [part(elements, 0, facingYaw())], layer: 'cutout', solid: true };
    }
    case 'daylight_detector': {
      const top = flag(ctx, 'inverted')
        ? 'daylight_detector_inverted_top'
        : 'daylight_detector_top';
      return single(
        [
          el([0, 0, 0], [16, 6, 16], {
            down: 'daylight_detector_side',
            up: top,
            north: 'daylight_detector_side',
            south: 'daylight_detector_side',
            west: 'daylight_detector_side',
            east: 'daylight_detector_side',
          }),
        ],
        { solid: true },
      );
    }
    case 'end_portal_frame': {
      const s = 'end_portal_frame_side';
      const elements: ModelElement[] = [
        el([0, 0, 0], [16, 13, 16], {
          down: 'end_stone',
          up: 'end_portal_frame_top',
          north: s,
          south: s,
          west: s,
          east: s,
        }),
      ];
      if (flag(ctx, 'eye')) {
        const e = 'end_portal_frame_eye';
        elements.push(
          el([4, 13, 4], [12, 16, 12], {
            up: face(e, { uv: [4, 0, 12, 8] }),
            north: face(e, { uv: [4, 0, 12, 3] }),
            south: face(e, { uv: [4, 0, 12, 3] }),
            west: face(e, { uv: [4, 0, 12, 3] }),
            east: face(e, { uv: [4, 0, 12, 3] }),
          }),
        );
      }
      return { parts: [part(elements, 0, facingYaw())], solid: true };
    }
    case 'lectern': {
      const elements = [
        el([0, 0, 0], [16, 2, 16], {
          down: 'oak_planks',
          up: 'lectern_base',
          north: 'lectern_base',
          south: 'lectern_base',
          west: 'lectern_base',
          east: 'lectern_base',
        }),
        el([4, 2, 4], [12, 15, 12], {
          north: 'lectern_front',
          south: 'lectern_front',
          west: 'lectern_sides',
          east: 'lectern_sides',
        }),
        el(
          [0, 12, 3],
          [16, 16, 16],
          {
            down: 'oak_planks',
            up: 'lectern_top',
            north: 'lectern_sides',
            south: 'lectern_sides',
            west: 'lectern_sides',
            east: 'lectern_sides',
          },
          { rotation: { origin: [8, 12, 8], axis: 'x', angle: -22.5 } },
        ),
      ];
      return { parts: [part(elements, 0, facingYaw())], shadeOccluder: false, solid: true };
    }
    case 'grindstone': {
      const elements = [
        el([4, 4, 2], [12, 16, 14], {
          down: 'grindstone_round',
          up: 'grindstone_round',
          north: 'grindstone_round',
          south: 'grindstone_round',
          west: 'grindstone_side',
          east: 'grindstone_side',
        }),
        b([2, 7, 6], [4, 13, 10], 'grindstone_pivot'),
        b([12, 7, 6], [14, 13, 10], 'grindstone_pivot'),
        b([2, 0, 7], [4, 7, 9], 'dark_oak_log'),
        b([12, 0, 7], [14, 7, 9], 'dark_oak_log'),
      ];
      const f = prop(ctx, 'face', 'wall');
      const x = f === 'ceiling' ? 180 : f === 'wall' ? 90 : 0;
      return { parts: [part(elements, x, facingYaw())], shadeOccluder: false, solid: true };
    }
    case 'brewing_stand': {
      const base = 'brewing_stand_base';
      const elements = [
        el([7, 0, 7], [9, 14, 9], {
          up: face('brewing_stand', { uv: [7, 0, 9, 2] }),
          north: face('brewing_stand', { uv: [7, 2, 9, 16] }),
          south: face('brewing_stand', { uv: [7, 2, 9, 16] }),
          west: face('brewing_stand', { uv: [7, 2, 9, 16] }),
          east: face('brewing_stand', { uv: [7, 2, 9, 16] }),
        }),
        b([9, 0, 5], [15, 2, 11], base),
        b([2, 0, 1], [8, 2, 7], base),
        b([2, 0, 9], [8, 2, 15], base),
        el(
          [8, 0, 0],
          [8, 16, 16],
          { west: face('brewing_stand', { uv: [16, 0, 0, 16] }), east: face('brewing_stand') },
          { shade: false },
        ),
      ];
      return single(elements, cutout);
    }
    case 'conduit':
      return single([b([5, 5, 5], [11, 11, 11], face('conduit', { emissive: 1 }))], {
        ...cutout,
        emissive: 1,
      });
    case 'heavy_core':
      return single([b([4, 0, 4], [12, 8, 12], 'heavy_core')], {
        solid: true,
        shadeOccluder: false,
      });
    case 'sculk_sensor':
    case 'calibrated_sculk_sensor': {
      const top = ctx.name === 'sculk_sensor' ? 'sculk_sensor_top' : 'calibrated_sculk_sensor_top';
      const side = face('sculk_sensor_side', { uv: [0, 8, 16, 16] });
      return single(
        [
          el([0, 0, 0], [16, 8, 16], {
            down: 'sculk_sensor_bottom',
            up: top,
            north: side,
            south: side,
            west: side,
            east: side,
          }),
        ],
        { solid: true },
      );
    }
    case 'sculk_shrieker': {
      const side = face('sculk_shrieker_side', { uv: [0, 8, 16, 16] });
      return single(
        [
          el([0, 0, 0], [16, 8, 16], {
            down: 'sculk_shrieker_bottom',
            up: 'sculk_shrieker_top',
            north: side,
            south: side,
            west: side,
            east: side,
          }),
        ],
        { solid: true },
      );
    }
    case 'chorus_plant':
      return single([b([4, 4, 4], [12, 12, 12], 'chorus_plant'), ...chorusArms(ctx)], {
        solid: true,
        shadeOccluder: false,
      });
    case 'chorus_flower':
      return cubeLike(num(ctx, 'age', 0) >= 5 ? 'chorus_flower_dead' : 'chorus_flower');
    case 'decorated_pot': {
      const side = face('entity/decorated_pot/decorated_pot_side', { uv: [1, 0, 15, 16] });
      const base = face('entity/decorated_pot/decorated_pot_base', { uv: [0, 0, 14, 14] });
      const elements = [
        el([1, 0, 1], [15, 16, 15], {
          down: base,
          up: base,
          north: side,
          south: side,
          west: side,
          east: side,
        }),
        b(
          [4, 16, 4],
          [12, 17, 12],
          face('entity/decorated_pot/decorated_pot_base', { uv: [0, 0, 8, 8] }),
        ),
      ];
      return { parts: [part(elements, 0, facingYaw())], solid: true, shadeOccluder: false };
    }
    case 'tripwire_hook': {
      const elements = [
        b([6.2, 3.8, 14], [9.8, 11.4, 16], 'oak_planks'),
        el([7.5, 6, 9], [8.5, 7, 14], {
          down: 'tripwire_hook',
          up: 'tripwire_hook',
          west: 'tripwire_hook',
          east: 'tripwire_hook',
        }),
        b([7, 5, 7], [9, 8, 9], 'tripwire_hook'),
      ];
      return { parts: [part(elements, 0, facingYaw())], ...cutout };
    }
    case 'tripwire':
      return flatLines(ctx, 'tripwire', 1.5, null, 0.5);
    case 'redstone_wire':
      return redstoneWire(ctx);
    case 'repeater':
    case 'comparator': {
      const powered = flag(ctx, 'powered');
      const top = `${ctx.name}${powered ? '_on' : ''}`;
      const torch = face(
        powered ? 'redstone_torch' : 'redstone_torch_off',
        powered ? { emissive: 0.7 } : {},
      );
      const elements: ModelElement[] = [
        el([0, 0, 0], [16, 2, 16], {
          down: 'smooth_stone',
          up: top,
          north: 'smooth_stone_slab_side',
          south: 'smooth_stone_slab_side',
          west: 'smooth_stone_slab_side',
          east: 'smooth_stone_slab_side',
        }),
      ];
      const torchAt = (x: number, z: number, h = 5) =>
        el([x - 1, 2, z - 1], [x + 1, 2 + h, z + 1], {
          up: { ...torch, uv: [7, 6, 9, 8] },
          north: { ...torch, uv: [7, 6, 9, 6 + h] },
          south: { ...torch, uv: [7, 6, 9, 6 + h] },
          west: { ...torch, uv: [7, 6, 9, 6 + h] },
          east: { ...torch, uv: [7, 6, 9, 6 + h] },
        });
      if (ctx.name === 'repeater') {
        const delay = Math.max(1, Math.min(4, num(ctx, 'delay', 1)));
        elements.push(torchAt(8, 3), torchAt(8, 5 + delay * 2));
      } else {
        elements.push(
          torchAt(4, 3),
          torchAt(12, 3),
          torchAt(8, 13, prop(ctx, 'mode', 'compare') === 'subtract' ? 4 : 3),
        );
      }
      return {
        parts: [part(elements, 0, (facingYaw() + 180) % 360)],
        layer: 'cutout',
        solid: true,
        shadeOccluder: false,
      };
    }
    case 'piston':
    case 'sticky_piston': {
      const o = orientUpFront(prop(ctx, 'facing', 'up'));
      const extended = flag(ctx, 'extended');
      const top = ctx.name === 'sticky_piston' ? 'piston_top_sticky' : 'piston_top';
      const element = extended
        ? el([0, 0, 0], [16, 12, 16], {
            down: 'piston_bottom',
            up: 'piston_inner',
            north: face('piston_side', { uv: [0, 4, 16, 16] }),
            south: face('piston_side', { uv: [0, 4, 16, 16] }),
            west: face('piston_side', { uv: [0, 4, 16, 16] }),
            east: face('piston_side', { uv: [0, 4, 16, 16] }),
          })
        : el([0, 0, 0], [16, 16, 16], {
            down: 'piston_bottom',
            up: top,
            north: 'piston_side',
            south: 'piston_side',
            west: 'piston_side',
            east: 'piston_side',
          });
      return { parts: [part([element], o.x, o.y)], solid: true };
    }
    case 'piston_head': {
      const o = orientUpFront(prop(ctx, 'facing', 'up'));
      const top = prop(ctx, 'type', 'normal') === 'sticky' ? 'piston_top_sticky' : 'piston_top';
      const side = (uv: [number, number, number, number]) => face('piston_side', { uv });
      const elements = [
        el([0, 12, 0], [16, 16, 16], {
          down: 'piston_top',
          up: top,
          north: side([0, 0, 16, 4]),
          south: side([0, 0, 16, 4]),
          west: side([0, 0, 16, 4]),
          east: side([0, 0, 16, 4]),
        }),
        el([6, -4, 6], [10, 12, 10], {
          north: side([0, 4, 16, 8]),
          south: side([0, 4, 16, 8]),
          west: side([0, 4, 16, 8]),
          east: side([0, 4, 16, 8]),
        }),
      ];
      return { parts: [part(elements, o.x, o.y)], solid: true };
    }
    case 'powder_snow':
      return single([b([0, 0, 0], [16, 16, 16], 'powder_snow')], {
        layer: 'translucent',
        cullGroup: 'powder_snow',
        shadeOccluder: false,
      });
    default:
      return null;
  }
}

function cubeLike(t: string): ModelSpec {
  return single([b([0, 0, 0], [16, 16, 16], t)], { layer: 'cutout', shadeOccluder: false });
}

function chorusArms(ctx: Ctx): ModelElement[] {
  const t = 'chorus_plant';
  const arms: ModelElement[] = [];
  if (flag(ctx, 'north')) arms.push(b([4, 4, 0], [12, 12, 4], t));
  if (flag(ctx, 'south')) arms.push(b([4, 4, 12], [12, 12, 16], t));
  if (flag(ctx, 'west')) arms.push(b([0, 4, 4], [4, 12, 12], t));
  if (flag(ctx, 'east')) arms.push(b([12, 4, 4], [16, 12, 12], t));
  if (flag(ctx, 'up')) arms.push(b([4, 12, 4], [12, 16, 12], t));
  if (flag(ctx, 'down')) arms.push(b([4, 0, 4], [12, 4, 12], t));
  return arms;
}

const SIDE_YAW: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };

function flatLines(ctx: Ctx, t: string, y: number, color: Vec3 | null, width: number): ModelSpec {
  const parts: Part[] = [];
  const tint: Partial<ModelFace> = color ? { tint: 'redstone', tintColor: color } : {};
  const half = width / 2;
  for (const d of ['north', 'east', 'south', 'west']) {
    if (!flag(ctx, d)) continue;
    const f = face(t, { uv: [0, 7, 16, 9], ...tint });
    parts.push(part([el([8 - half, y, 0], [8 + half, y, 8], { up: f, down: f })], 0, SIDE_YAW[d]));
  }
  if (parts.length === 0) {
    const f = face(t, { uv: [0, 7, 16, 9], ...tint });
    parts.push(part([el([8 - half, y, 0], [8 + half, y, 16], { up: f, down: f })]));
  }
  return { parts, ...cutout };
}

function redstoneWire(ctx: Ctx): ModelSpec {
  const color = redstoneColor(num(ctx, 'power', 0));
  const tint: Partial<ModelFace> = { tint: 'redstone', tintColor: color };
  const parts: Part[] = [];
  const conn: Record<string, string> = {};
  for (const d of ['north', 'east', 'south', 'west']) conn[d] = prop(ctx, d, 'none');
  const connected = Object.values(conn).filter((v) => v !== 'none').length;
  const straightNS =
    conn.north !== 'none' && conn.south !== 'none' && conn.east === 'none' && conn.west === 'none';
  const straightEW =
    conn.east !== 'none' && conn.west !== 'none' && conn.north === 'none' && conn.south === 'none';
  const lineFace = face('redstone_dust_line0', { ...tint, uv: [0, 0, 16, 8] });
  const y = 0.25;
  if (!(straightNS || straightEW)) {
    const dot = face('redstone_dust_dot', tint);
    parts.push(part([el([0, y, 0], [16, y, 16], { up: dot })]));
  }
  for (const d of ['north', 'east', 'south', 'west']) {
    const v = conn[d];
    if (v === 'none' && connected > 0) continue;
    if (v === 'none') continue;
    parts.push(part([el([0, y, 0], [16, y, 8], { up: lineFace })], 0, SIDE_YAW[d]));
    if (v === 'up') {
      const upFace = face('redstone_dust_line0', { ...tint, uv: [0, 0, 16, 16], rotation: 90 });
      parts.push(part([el([0, 0, 0.25], [16, 16, 0.25], { south: upFace })], 0, SIDE_YAW[d]));
    }
  }
  return { parts, ...cutout };
}
