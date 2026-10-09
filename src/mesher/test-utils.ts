import type { AtlasData, BlockState, SchematicVolume } from '../core/types';
import { parseStateKey, stateKey } from '../core/volume';
import { requiredTextures } from '../blocks';

export class VolumeBuilder {
  private palette: BlockState[] = [{ name: 'minecraft:air', properties: {} }];
  private index = new Map<string, number>([['minecraft:air', 0]]);
  readonly blocks: Uint32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly length: number,
  ) {
    this.blocks = new Uint32Array(width * height * length);
  }

  set(x: number, y: number, z: number, key: string): this {
    const state = parseStateKey(key.includes(':') ? key : `minecraft:${key}`);
    const k = stateKey(state);
    let p = this.index.get(k);
    if (p === undefined) {
      p = this.palette.length;
      this.palette.push(state);
      this.index.set(k, p);
    }
    this.blocks[x + z * this.width + y * this.width * this.length] = p;
    return this;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, key: string): this {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, key);
    return this;
  }

  build(): SchematicVolume {
    return {
      width: this.width,
      height: this.height,
      length: this.length,
      palette: this.palette,
      blocks: this.blocks,
      blockEntities: [],
      metadata: { format: 'sponge-v3' },
    };
  }
}

export function fakeAtlas(ids: string[], missing: string[] = []): AtlasData {
  const all = [...new Set([...ids, ...missing])];
  const cols = Math.ceil(Math.sqrt(all.length)) || 1;
  const size = 1 / cols;
  const regions: AtlasData['regions'] = {};
  const colors: AtlasData['colors'] = {};
  all.forEach((id, i) => {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    regions[id] = {
      u0: cx * size,
      v0: cy * size,
      u1: (cx + 1) * size,
      v1: (cy + 1) * size,
      layer: 'opaque',
    };
    colors[id] = [0.5, 0.5, 0.5, 1];
  });
  return { width: cols * 16, height: cols * 16, regions, colors, missing };
}

export function atlasFor(volume: SchematicVolume, missing: string[] = []): AtlasData {
  return fakeAtlas(requiredTextures(volume.palette), missing);
}
