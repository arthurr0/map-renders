import { box as b, el, face, part } from '../build';
import { num, prop, yaw, YAW_NORTH, type Family } from '../context';
import { colorOf, stripWaxed, WOODS } from '../materials';
import type { ModelElement } from '../types';
import { blockEntityBox, entityBox, rect, yawParts, type TexSize } from './entity';
import { cutout } from './common';

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
        blockEntityBox([1, 0, 1], [15, 10, 15], t, size, { u: 0, v: 19, dx: 14, dy: 10, dz: 14 }),
        blockEntityBox([1, 10, 1], [15, 14, 15], t, size, { u: 0, v: 0, dx: 14, dy: 5, dz: 14 }),
        blockEntityBox([7, 7, 0], [9, 11, 1], t, size, { u: 0, v: 0, dx: 2, dy: 4, dz: 1 }),
      );
    } else {
      const t = `entity/chest/${kind}_${type}`;
      const left = type === 'left';
      const x0 = left ? 1 : 0;
      const x1 = left ? 16 : 15;
      elements.push(
        blockEntityBox([x0, 0, 1], [x1, 10, 15], t, size, { u: 0, v: 19, dx: 15, dy: 10, dz: 14 }),
        blockEntityBox([x0, 10, 1], [x1, 14, 15], t, size, { u: 0, v: 0, dx: 15, dy: 5, dz: 14 }),
        blockEntityBox(left ? [15, 7, 0] : [0, 7, 0], left ? [16, 11, 1] : [1, 11, 1], t, size, {
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
      blockEntityBox([5, bodyTop - 7, 5], [11, bodyTop, 11], t, size, {
        u: 0,
        v: 0,
        dx: 6,
        dy: 7,
        dz: 6,
      }),
      blockEntityBox([4, bodyTop - 9, 4], [12, bodyTop - 7, 12], t, size, {
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

export const shelfFamily: Family = {
  id: 'shelf',
  match: (name) => name.endsWith('_shelf') && name !== 'bookshelf',
  build: (ctx) => {
    const t = ctx.name;
    const f = (uv: [number, number, number, number]) => face(t, { uv });
    const elements = [
      el([0, 0, 8], [16, 16, 16], {
        down: f([0, 11, 16, 16]),
        up: f([0, 8, 16, 11]),
        north: f([0, 0, 8, 8]),
        south: f([8, 0, 16, 8]),
        west: f([0, 11, 4, 16]),
        east: f([0, 11, 4, 16]),
      }),
    ];
    return {
      parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
      shadeOccluder: false,
      solid: true,
    };
  },
};

export const copperGolemStatueFamily: Family = {
  id: 'copper_golem_statue',
  match: (name) => name.endsWith('copper_golem_statue'),
  build: (ctx) => {
    const stage = stripWaxed(ctx.name).replace('copper_golem_statue', '');
    const t = stage ? `${stage}copper` : 'copper_block';
    const elements = [
      b([4, 0, 5], [12, 6, 11], t),
      b([3, 6, 4], [13, 12, 12], t),
      b([7, 12, 7], [9, 15, 9], t),
      b([6, 15, 6], [10, 16, 10], t),
    ];
    return {
      parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
      shadeOccluder: false,
      solid: true,
    };
  },
};

export const driedGhastFamily: Family = {
  id: 'dried_ghast',
  match: (name) => name === 'dried_ghast',
  build: (ctx) => {
    const h = Math.max(0, Math.min(3, num(ctx, 'hydration', 0)));
    const t = (side: string) =>
      face(`dried_ghast_hydration_${h}_${side}`, { fallback: ['block/calcite'] });
    const elements = [
      el([3, 0, 3], [13, 10, 13], {
        down: t('bottom'),
        up: t('top'),
        north: t('north'),
        south: t('south'),
        west: t('west'),
        east: t('east'),
      }),
    ];
    return {
      parts: [part(elements, 0, yaw(YAW_NORTH, prop(ctx, 'facing', 'north')))],
      layer: 'cutout',
      shadeOccluder: false,
      solid: true,
    };
  },
};
