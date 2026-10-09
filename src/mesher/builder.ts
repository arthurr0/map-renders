import type { MeshBuffers, RenderLayer } from '../core/types';

function grow<T extends Float32Array | Uint32Array>(arr: T, needed: number): T {
  if (needed <= arr.length) return arr;
  let size = arr.length;
  while (size < needed) size *= 2;
  const next = new (arr.constructor as new (n: number) => T)(size);
  next.set(arr);
  return next;
}

export class GeometryBuilder {
  positions = new Float32Array(4096 * 3);
  normals = new Float32Array(4096 * 3);
  uvs = new Float32Array(4096 * 2);
  colors = new Float32Array(4096 * 3);
  emissive = new Float32Array(4096);
  indices = new Uint32Array(4096 * 1.5);
  vertexCount = 0;
  indexCount = 0;
  quadCount = 0;

  reset(): void {
    this.vertexCount = 0;
    this.indexCount = 0;
    this.quadCount = 0;
  }

  private reserve(): void {
    const v = this.vertexCount + 4;
    if (v * 3 > this.positions.length) {
      this.positions = grow(this.positions, v * 3);
      this.normals = grow(this.normals, v * 3);
      this.colors = grow(this.colors, v * 3);
    }
    if (v * 2 > this.uvs.length) this.uvs = grow(this.uvs, v * 2);
    if (v > this.emissive.length) this.emissive = grow(this.emissive, v);
    if (this.indexCount + 6 > this.indices.length)
      this.indices = grow(this.indices, this.indexCount + 6);
  }

  quad(
    pos: ArrayLike<number>,
    posOffset: number,
    ox: number,
    oy: number,
    oz: number,
    nx: number,
    ny: number,
    nz: number,
    uv: ArrayLike<number>,
    uvOffset: number,
    col: ArrayLike<number>,
    em: number,
    flip: boolean,
  ): void {
    this.reserve();
    const base = this.vertexCount;
    const p3 = base * 3;
    const p2 = base * 2;
    const P = this.positions;
    const N = this.normals;
    const C = this.colors;
    const U = this.uvs;
    const E = this.emissive;
    for (let i = 0; i < 4; i++) {
      const o = p3 + i * 3;
      P[o] = pos[posOffset + i * 3]! + ox;
      P[o + 1] = pos[posOffset + i * 3 + 1]! + oy;
      P[o + 2] = pos[posOffset + i * 3 + 2]! + oz;
      N[o] = nx;
      N[o + 1] = ny;
      N[o + 2] = nz;
      C[o] = col[i * 3]!;
      C[o + 1] = col[i * 3 + 1]!;
      C[o + 2] = col[i * 3 + 2]!;
      U[p2 + i * 2] = uv[uvOffset + i * 2]!;
      U[p2 + i * 2 + 1] = uv[uvOffset + i * 2 + 1]!;
      E[base + i] = em;
    }
    const I = this.indices;
    const ic = this.indexCount;
    if (flip) {
      I[ic] = base + 1;
      I[ic + 1] = base + 2;
      I[ic + 2] = base + 3;
      I[ic + 3] = base + 1;
      I[ic + 4] = base + 3;
      I[ic + 5] = base;
    } else {
      I[ic] = base;
      I[ic + 1] = base + 1;
      I[ic + 2] = base + 2;
      I[ic + 3] = base;
      I[ic + 4] = base + 2;
      I[ic + 5] = base + 3;
    }
    this.vertexCount += 4;
    this.indexCount += 6;
    this.quadCount++;
  }

  toBuffers(layer: RenderLayer, isWater: boolean, origin: [number, number, number]): MeshBuffers {
    const v = this.vertexCount;
    return {
      layer,
      isWater,
      origin,
      positions: this.positions.slice(0, v * 3),
      normals: this.normals.slice(0, v * 3),
      uvs: this.uvs.slice(0, v * 2),
      colors: this.colors.slice(0, v * 3),
      indices: this.indices.slice(0, this.indexCount),
      emissive: this.emissive.slice(0, v),
    };
  }
}
