import { box as b, el, face, part, single, type ModelSpec, type Part } from '../build';
import { flag, num, orientUpFront, prop, yaw, YAW_NORTH, type Ctx, type Family } from '../context';
import { redstoneColor } from '../tints';
import type { ModelElement, ModelFace, Vec3 } from '../types';
import { cutout, SIDE_YAW } from './common';

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

export const redstonePartsFamily: Family = {
  id: 'redstone_parts',
  match: (name) => REDSTONE_PARTS.includes(name),
  build: (ctx) => buildRedstonePart(ctx),
};

const REDSTONE_PARTS = [
  'daylight_detector',
  'tripwire_hook',
  'tripwire',
  'redstone_wire',
  'repeater',
  'comparator',
  'piston',
  'sticky_piston',
  'piston_head',
];

function buildRedstonePart(ctx: Ctx): ModelSpec | null {
  const facingYaw = (table = YAW_NORTH) => yaw(table, prop(ctx, 'facing', 'north'));
  switch (ctx.name) {
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
    default:
      return null;
  }
}
