import { el, face, part, single, type FaceInput } from '../build';
import {
  axisOrientation,
  flag,
  orientUpFront,
  prop,
  yaw,
  YAW_EAST,
  YAW_SOUTH,
  type Family,
} from '../context';
import { stripWaxed } from '../materials';
import type { ModelElement, Vec3 } from '../types';
import { crossElements } from './plants';
import { cutout } from './common';

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
