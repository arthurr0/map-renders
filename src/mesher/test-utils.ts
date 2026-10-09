import { gunzipSync } from 'fflate';
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

type Tag = unknown;

class NbtReader {
  private pos = 0;
  private view: DataView;
  private decoder = new TextDecoder();

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  readRoot(): Record<string, Tag> {
    const type = this.view.getUint8(this.pos++);
    if (type !== 10) throw new Error('bad nbt');
    this.readString();
    return this.readPayload(10) as Record<string, Tag>;
  }

  private readString(): string {
    const len = this.view.getUint16(this.pos);
    this.pos += 2;
    const s = this.decoder.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }

  private readPayload(type: number): Tag {
    const v = this.view;
    switch (type) {
      case 1:
        return v.getInt8(this.pos++);
      case 2: {
        const r = v.getInt16(this.pos);
        this.pos += 2;
        return r;
      }
      case 3: {
        const r = v.getInt32(this.pos);
        this.pos += 4;
        return r;
      }
      case 4: {
        const r = v.getBigInt64(this.pos);
        this.pos += 8;
        return r;
      }
      case 5: {
        const r = v.getFloat32(this.pos);
        this.pos += 4;
        return r;
      }
      case 6: {
        const r = v.getFloat64(this.pos);
        this.pos += 8;
        return r;
      }
      case 7: {
        const len = v.getInt32(this.pos);
        this.pos += 4;
        const r = this.bytes.slice(this.pos, this.pos + len);
        this.pos += len;
        return r;
      }
      case 8:
        return this.readString();
      case 9: {
        const t = v.getUint8(this.pos++);
        const len = v.getInt32(this.pos);
        this.pos += 4;
        const out: Tag[] = [];
        for (let i = 0; i < len; i++) out.push(this.readPayload(t));
        return out;
      }
      case 10: {
        const out: Record<string, Tag> = {};
        for (;;) {
          const t = v.getUint8(this.pos++);
          if (t === 0) break;
          const name = this.readString();
          out[name] = this.readPayload(t);
        }
        return out;
      }
      case 11: {
        const len = v.getInt32(this.pos);
        this.pos += 4;
        const out = new Int32Array(len);
        for (let i = 0; i < len; i++) out[i] = v.getInt32(this.pos + i * 4);
        this.pos += len * 4;
        return out;
      }
      case 12: {
        const len = v.getInt32(this.pos);
        this.pos += 4 + len * 8;
        return null;
      }
      default:
        throw new Error(`nbt tag ${type}`);
    }
  }
}

export function readSpongeV3(file: Uint8Array): SchematicVolume {
  const root = new NbtReader(gunzipSync(file)).readRoot();
  const schem = (root.Schematic ?? root) as Record<string, Tag>;
  const width = schem.Width as number;
  const height = schem.Height as number;
  const length = schem.Length as number;
  const blocksTag = schem.Blocks as Record<string, Tag>;
  const paletteTag = blocksTag.Palette as Record<string, number>;
  const data = blocksTag.Data as Uint8Array;
  const palette: BlockState[] = [];
  const remap: number[] = [];
  palette.push({ name: 'minecraft:air', properties: {} });
  for (const [key, id] of Object.entries(paletteTag)) {
    const state = parseStateKey(key);
    if (state.name === 'minecraft:air') remap[id] = 0;
    else {
      remap[id] = palette.length;
      palette.push(state);
    }
  }
  const blocks = new Uint32Array(width * height * length);
  let i = 0;
  let pos = 0;
  while (pos < data.length && i < blocks.length) {
    let value = 0;
    let shift = 0;
    for (;;) {
      const b = data[pos++]!;
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    blocks[i++] = remap[value] ?? 0;
  }
  return {
    width,
    height,
    length,
    palette,
    blocks,
    blockEntities: [],
    metadata: { format: 'sponge-v3' },
  };
}
