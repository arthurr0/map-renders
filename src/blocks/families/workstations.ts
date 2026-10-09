import { box as b, el, face, part, single, type ModelSpec } from '../build';
import { flag, num, prop, yaw, YAW_NORTH, type Ctx, type Family } from '../context';
import type { ModelElement } from '../types';
import { cutout } from './common';

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

export const workstationFamily: Family = {
  id: 'workstations',
  match: (name) => WORKSTATIONS.includes(name),
  build: (ctx) => buildWorkstation(ctx),
};

const WORKSTATIONS = [
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
  'powder_snow',
];

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
