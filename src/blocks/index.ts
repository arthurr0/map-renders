import type { BlockState, Direction, RenderLayer } from '../core/types';

export interface ModelFace {
  texture: string;
  uv?: [number, number, number, number];
  rotation?: 0 | 90 | 180 | 270;
  cullface?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
  tint?: 'grass' | 'foliage' | 'water' | 'redstone' | 'none';
}

export interface ModelElement {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: {
    origin: [number, number, number];
    axis: 'x' | 'y' | 'z';
    angle: number;
    rescale?: boolean;
  };
  faces: Partial<Record<'north' | 'south' | 'east' | 'west' | 'up' | 'down', ModelFace>>;
  shade?: boolean;
}

export interface BlockModel {
  elements: ModelElement[];
  layer: RenderLayer;
  fullCube: boolean;
  occludes: Partial<Record<Direction, boolean>>;
  liquid?: 'water' | 'lava';
  emissive?: number;
}

export type NeighborLookup = (dx: number, dy: number, dz: number) => BlockState;

export function resolveBlockModel(
  _state: BlockState,
  _neighbors: NeighborLookup,
): BlockModel | null {
  throw new Error('not implemented');
}

export function requiredTextures(_palette: BlockState[]): string[] {
  throw new Error('not implemented');
}
