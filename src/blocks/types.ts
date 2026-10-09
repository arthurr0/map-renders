import type { BlockState, Direction, RenderLayer } from '../core/types';

export type FaceDir = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export type TintKind = 'grass' | 'foliage' | 'water' | 'redstone' | 'none';

export type Vec3 = [number, number, number];

export interface ModelFace {
  texture: string;
  fallback?: string[];
  uv?: [number, number, number, number];
  rotation?: 0 | 90 | 180 | 270;
  cullface?: FaceDir;
  tint?: TintKind;
  tintColor?: Vec3;
  layer?: RenderLayer;
  emissive?: number;
}

export interface ElementRotation {
  origin: Vec3;
  axis: 'x' | 'y' | 'z';
  angle: number;
  rescale?: boolean;
}

export interface ModelElement {
  from: Vec3;
  to: Vec3;
  rotation?: ElementRotation;
  faces: Partial<Record<FaceDir, ModelFace>>;
  shade?: boolean;
}

export interface BlockModel {
  elements: ModelElement[];
  layer: RenderLayer;
  fullCube: boolean;
  occludes: Partial<Record<Direction, boolean>>;
  coverage?: Partial<Record<Direction, number>>;
  liquid?: 'water' | 'lava';
  liquidLevel?: number;
  emissive?: number;
  cullGroup?: string;
  shadeOccluder?: boolean;
  solid?: boolean;
  unknown?: boolean;
}

export type NeighborLookup = (dx: number, dy: number, dz: number) => BlockState;
