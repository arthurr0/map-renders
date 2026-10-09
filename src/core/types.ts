export interface BlockState {
  name: string;
  properties: Record<string, string>;
}

export interface BlockEntity {
  pos: [number, number, number];
  id: string;
  data: Record<string, unknown>;
}

export type SchematicFormat =
  'sponge-v1' | 'sponge-v2' | 'sponge-v3' | 'litematic' | 'structure-nbt';

export interface SchematicMetadata {
  name?: string;
  author?: string;
  dataVersion?: number;
  format: SchematicFormat;
}

export interface SchematicVolume {
  width: number;
  height: number;
  length: number;
  palette: BlockState[];
  blocks: Uint32Array;
  blockEntities: BlockEntity[];
  metadata: SchematicMetadata;
}

export type RenderLayer = 'opaque' | 'cutout' | 'translucent';

export interface AtlasRegion {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  layer: RenderLayer;
  frames?: number;
}

export interface AtlasData {
  width: number;
  height: number;
  regions: Record<string, AtlasRegion>;
  colors: Record<string, [number, number, number, number]>;
  missing: string[];
}

export type TextureMode = 'textured' | 'simplified';

export interface MeshOptions {
  mode: TextureMode;
  ambientOcclusion: boolean;
  chunkSize: number;
  hideBlocks: string[];
}

export interface MeshBuffers {
  layer: RenderLayer;
  isWater: boolean;
  origin: [number, number, number];
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  emissive: Float32Array;
}

export interface MeshResult {
  meshes: MeshBuffers[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  stats: { blocks: number; faces: number; unknownBlocks: string[] };
}

export type Projection = 'perspective' | 'orthographic';

export interface CameraState {
  projection: Projection;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  zoom: number;
}

export type Background =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; top: string; bottom: string }
  | { type: 'sky'; timeOfDay: number; turbidity: number }
  | { type: 'hdri'; id: string; blur: number; rotation: number }
  | { type: 'transparent' };

export type GroundType = 'none' | 'shadow-catcher' | 'grass' | 'grid' | 'water';

export interface GradingSettings {
  enabled: boolean;
  contrast: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  gamma: number;
  shadowColor: string;
  shadowAmount: number;
  highlightColor: string;
  highlightAmount: number;
  grain: number;
  aberration: number;
}

export interface VignetteSettings {
  enabled: boolean;
  strength: number;
  softness: number;
}

export interface DofSettings {
  enabled: boolean;
  autoFocus: boolean;
  focusDistance: number;
  aperture: number;
  maxBlur: number;
  tiltShift: number;
}

export interface GlintSettings {
  enabled: boolean;
  strength: number;
  length: number;
  threshold: number;
}

export interface GodRaySettings {
  enabled: boolean;
  strength: number;
  decay: number;
  samples: number;
  length: number;
}

export interface RenderSettings {
  textureMode: TextureMode;
  background: Background;
  ground: GroundType;
  sun: { azimuth: number; elevation: number; intensity: number; color: string };
  ambient: { intensity: number; color: string };
  useBackgroundLighting: boolean;
  shadows: { enabled: boolean; softness: number; mapSize: 1024 | 2048 | 4096 };
  ssao: { enabled: boolean; intensity: number; radius: number };
  bloom: { enabled: boolean; strength: number; threshold: number; radius: number };
  fog: { enabled: boolean; density: number; color: string };
  grading: GradingSettings;
  vignette: VignetteSettings;
  dof: DofSettings;
  glints: GlintSettings;
  godRays: GodRaySettings;
  toneMapping: 'aces' | 'agx' | 'neutral' | 'none';
  exposure: number;
  ambientOcclusionVertex: boolean;
}

export interface ExportOptions {
  width: number;
  height: number;
  supersample: 1 | 2 | 4;
  transparent: boolean;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
}

export interface TurntableOptions {
  width: number;
  height: number;
  durationSec: number;
  fps: 24 | 30 | 60;
  format: 'webm' | 'gif';
}

export interface SavedShot {
  id: string;
  name: string;
  camera: CameraState;
  thumbnail?: string;
  createdAt: number;
}

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
