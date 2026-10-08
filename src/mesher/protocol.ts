import type { AtlasData, MeshOptions, MeshResult, SchematicVolume } from '../core/types';

export interface MeshRequest {
  id: number;
  volume: SchematicVolume;
  atlas: AtlasData;
  options: MeshOptions;
}

export type MeshResponse =
  { id: number; ok: true; result: MeshResult } | { id: number; ok: false; error: string };
