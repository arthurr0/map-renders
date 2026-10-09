import type { AtlasData, BlockState, MeshOptions, SchematicVolume } from '../core/types';
import { srgbToLinear, type NeighborLookup } from '../blocks';
import { createTextureLookup, type TextureLookup } from './bake';
import { GeometryBuilder } from './builder';
import { AIR, analyzePalette, normalizeName, type PaletteInfo } from './palette';

export const AO_SHADE = 0.2;

export const AO_LEVELS: number[] = [0, 1, 2, 3, 4].map((k) =>
  srgbToLinear((k * AO_SHADE + (4 - k)) / 4),
);

export const DX = [0, 0, 0, 0, -1, 1];
export const DY = [-1, 1, 0, 0, 0, 0];
export const DZ = [0, 0, -1, 1, 0, 0];
export const OPP = [1, 0, 3, 2, 5, 4];
export const T1 = [0, 0, 0, 0, 2, 2];
export const T2 = [2, 2, 1, 1, 1, 1];
export const AXIS_N = [1, 1, 2, 2, 0, 0];

export class MeshContext {
  readonly W: number;
  readonly H: number;
  readonly L: number;
  readonly WL: number;
  readonly blocks: Uint32Array;
  readonly paletteLen: number;
  readonly palette: BlockState[];
  readonly info: PaletteInfo;
  readonly lookup: TextureLookup;
  readonly atlas: AtlasData;
  readonly simplified: boolean;
  readonly useAO: boolean;
  readonly cs: number;
  readonly layers = [new GeometryBuilder(), new GeometryBuilder(), new GeometryBuilder()];
  readonly water = new GeometryBuilder();
  readonly mask: Int32Array[];
  readonly grid = new Uint8Array(9);
  readonly aoCount = new Uint8Array(4);
  readonly aoVal = new Float32Array(4);
  readonly vtxCol = new Float32Array(12);
  readonly vtxAO = new Float32Array(4);
  readonly pos = new Float32Array(12);
  readonly uv = new Float32Array(8);
  readonly zeroUV = new Float32Array(8);
  private nx = 0;
  private ny = 0;
  private nz = 0;
  readonly neighbors: NeighborLookup;
  readonly pal: (x: number, y: number, z: number) => number;

  constructor(volume: SchematicVolume, atlas: AtlasData, options: MeshOptions) {
    this.W = volume.width;
    this.H = volume.height;
    this.L = volume.length;
    this.WL = this.W * this.L;
    this.blocks = volume.blocks;
    this.palette = volume.palette;
    this.paletteLen = volume.palette.length;
    this.atlas = atlas;
    this.lookup = createTextureLookup(atlas, options.mode);
    this.info = analyzePalette(volume, this.lookup, new Set(options.hideBlocks.map(normalizeName)));
    this.simplified = options.mode === 'simplified';
    this.useAO = options.ambientOcclusion;
    this.cs = options.chunkSize > 0 ? Math.floor(options.chunkSize) : 32;
    const cells = this.cs * this.cs * this.cs;
    this.mask = this.simplified ? Array.from({ length: 6 }, () => new Int32Array(cells)) : [];
    const { W, H, L, WL, blocks, paletteLen } = this;
    const oob = this.info.oob;
    this.pal = (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L) return oob;
      const v = blocks[x + z * W + y * WL]!;
      return v < paletteLen ? v : oob;
    };
    this.neighbors = (dx, dy, dz) => {
      const q = this.pal(this.nx + dx, this.ny + dy, this.nz + dz);
      return q === this.info.oob ? AIR : this.palette[q]!;
    };
  }

  at(x: number, y: number, z: number): NeighborLookup {
    this.nx = x;
    this.ny = y;
    this.nz = z;
    return this.neighbors;
  }
}
