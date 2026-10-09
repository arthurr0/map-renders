import type { BlockState } from '../core/types';
import { finalize, type ModelSpec } from './build';
import { PLAIN_CUBES } from './catalog';
import type { Ctx, Family } from './context';
import {
  CUBE_TABLE,
  copperGrateFamily,
  cubeAll,
  glazedTerracottaFamily,
  infestedFamily,
  leavesFamily,
  logFamily,
  mushroomBlockFamily,
  shulkerBoxFamily,
  stainedGlassFamily,
  unknownCube,
  waxedFamily,
} from './families/cubes';
import {
  anvilFamily,
  cakeFamily,
  candleFamily,
  cauldronFamily,
  composterFamily,
  farmlandFamily,
  hopperFamily,
  ladderFamily,
} from './families/containers';
import {
  bannerFamily,
  bedFamily,
  bellFamily,
  chestFamily,
  headFamily,
  signFamily,
} from './families/furniture';
import {
  campfireFamily,
  chainFamily,
  endRodFamily,
  fireFamily,
  lanternFamily,
  portalFamily,
  torchFamily,
} from './families/lights';
import { leverFamily, railFamily, redstonePartsFamily } from './families/redstone';
import { workstationFamily } from './families/workstations';
import {
  amethystFamily,
  azaleaFamily,
  bambooFamily,
  bigDripleafFamily,
  cactusFamily,
  caveVinesFamily,
  cocoaFamily,
  coralFamily,
  cropFamily,
  doublePlantFamily,
  fireflyBushFamily,
  flatCoverFamily,
  implicitlyWaterlogged,
  lichenFamily,
  lilyPadFamily,
  pitcherCropFamily,
  pointedDripstoneFamily,
  pottedFamily,
  seaPickleFamily,
  seagrassFamily,
  simpleCrossFamily,
  sporeBlossomFamily,
  stemFamily,
  sweetBerryFamily,
  tintedCrossFamily,
  turtleEggFamily,
  vineFamily,
} from './families/plants';
import {
  buttonFamily,
  carpetFamily,
  doorFamily,
  fenceFamily,
  fenceGateFamily,
  ironBarsFamily,
  paleMossCarpetFamily,
  paneFamily,
  pressurePlateFamily,
  slabFamily,
  snowLayerFamily,
  stairsFamily,
  trapdoorFamily,
  wallFamily,
} from './families/shapes';
import { stripNamespace } from './materials';
import type { BlockModel, NeighborLookup } from './types';

const HIDDEN = new Set([
  'air',
  'cave_air',
  'void_air',
  'barrier',
  'light',
  'structure_void',
  'moving_piston',
]);

export function isAlwaysHidden(id: string): boolean {
  if (!id.startsWith('minecraft:') && id.includes(':')) return false;
  return HIDDEN.has(stripNamespace(id));
}

const liquidFamily: Family = {
  id: 'liquid',
  match: (name) => name === 'water' || name === 'lava' || name === 'bubble_column',
  build: (ctx) => {
    const lava = ctx.name === 'lava';
    const level = ctx.name === 'bubble_column' ? 0 : parseInt(ctx.props.level ?? '0', 10) || 0;
    return {
      parts: [],
      layer: lava ? 'opaque' : 'translucent',
      liquid: lava ? 'lava' : 'water',
      liquidLevel: level,
      emissive: lava ? 1 : 0,
      shadeOccluder: false,
      solid: false,
      noOcclusion: true,
    };
  },
};

const cubeTableFamily: Family = {
  id: 'cube_table',
  match: (name) => Object.prototype.hasOwnProperty.call(CUBE_TABLE, name),
  build: (ctx) => CUBE_TABLE[ctx.name]!(ctx),
  dynamic: (ctx) => ctx.name === 'grass_block' && ctx.props.snowy === undefined,
};

export const FAMILIES: Family[] = [
  liquidFamily,
  pottedFamily,
  cubeTableFamily,
  mushroomBlockFamily,
  snowLayerFamily,
  farmlandFamily,
  torchFamily,
  lanternFamily,
  chainFamily,
  endRodFamily,
  ladderFamily,
  leverFamily,
  railFamily,
  bedFamily,
  chestFamily,
  cauldronFamily,
  anvilFamily,
  candleFamily,
  cakeFamily,
  hopperFamily,
  composterFamily,
  bellFamily,
  campfireFamily,
  fireFamily,
  portalFamily,
  workstationFamily,
  redstonePartsFamily,
  simpleCrossFamily,
  tintedCrossFamily,
  doublePlantFamily,
  cropFamily,
  pitcherCropFamily,
  sweetBerryFamily,
  stemFamily,
  seagrassFamily,
  lilyPadFamily,
  vineFamily,
  lichenFamily,
  cactusFamily,
  bambooFamily,
  pointedDripstoneFamily,
  amethystFamily,
  caveVinesFamily,
  sporeBlossomFamily,
  flatCoverFamily,
  fireflyBushFamily,
  azaleaFamily,
  bigDripleafFamily,
  cocoaFamily,
  seaPickleFamily,
  turtleEggFamily,
  leavesFamily,
  stainedGlassFamily,
  glazedTerracottaFamily,
  paneFamily,
  ironBarsFamily,
  slabFamily,
  stairsFamily,
  fenceGateFamily,
  fenceFamily,
  wallFamily,
  doorFamily,
  trapdoorFamily,
  buttonFamily,
  pressurePlateFamily,
  paleMossCarpetFamily,
  carpetFamily,
  signFamily,
  headFamily,
  bannerFamily,
  coralFamily,
  logFamily,
  infestedFamily,
  shulkerBoxFamily,
  copperGrateFamily,
  waxedFamily,
];

const familyCache = new Map<string, Family | null>();

export function familyFor(id: string): Family | null {
  const cached = familyCache.get(id);
  if (cached !== undefined) return cached;
  const vanilla = !id.includes(':') || id.startsWith('minecraft:');
  const name = stripNamespace(id);
  let found: Family | null = null;
  if (vanilla) {
    for (const f of FAMILIES) {
      if (f.match(name)) {
        found = f;
        break;
      }
    }
  }
  familyCache.set(id, found);
  return found;
}

export function isKnownBlock(id: string): boolean {
  const vanilla = !id.includes(':') || id.startsWith('minecraft:');
  if (!vanilla) return false;
  return isAlwaysHidden(id) || familyFor(id) !== null || PLAIN_CUBES.has(stripNamespace(id));
}

export function modelDependsOnNeighbors(state: BlockState): boolean {
  const f = familyFor(state.name);
  if (!f || !f.dynamic) return false;
  return f.dynamic({ id: state.name, name: stripNamespace(state.name), props: state.properties });
}

const AIR: BlockState = { name: 'minecraft:air', properties: {} };
const airLookup: NeighborLookup = () => AIR;

function buildSpec(state: BlockState, neighbors: NeighborLookup): ModelSpec {
  const name = stripNamespace(state.name);
  const ctx: Ctx = { id: state.name, name, props: state.properties, neighbors };
  const family = familyFor(state.name);
  if (family) {
    const spec = family.build(ctx);
    if (spec) return spec;
  }
  const vanilla = !state.name.includes(':') || state.name.startsWith('minecraft:');
  if (vanilla && PLAIN_CUBES.has(name)) return cubeAll(name);
  return unknownCube(ctx);
}

export function resolveModel(
  state: BlockState,
  neighbors: NeighborLookup = airLookup,
): BlockModel | null {
  if (isAlwaysHidden(state.name)) return null;
  const spec = buildSpec(state, neighbors);
  const name = stripNamespace(state.name);
  const wl = state.properties.waterlogged;
  if (wl === 'true' || (wl === undefined && implicitlyWaterlogged(name))) {
    if (!spec.liquid) {
      spec.liquid = 'water';
      spec.liquidLevel = 0;
    }
  }
  return finalize(spec);
}
