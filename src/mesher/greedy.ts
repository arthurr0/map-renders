import { FACE_DIRS, faceCorners, type Vec3 } from '../blocks';
import { AO_LEVELS, AXIS_N, DX, DY, DZ, T1, T2, type MeshContext } from './context';

export class GreedyMerger {
  private readonly color: Float32Array;
  private readonly emissive: Float32Array;
  private readonly layer: Uint8Array;

  constructor(private readonly ctx: MeshContext) {
    const { info } = ctx;
    const n = Math.max(1, info.styleCount);
    this.color = new Float32Array(n * 3);
    this.emissive = new Float32Array(n);
    this.layer = new Uint8Array(n);
    for (let p = 0; p < ctx.paletteLen; p++) {
      const b = info.baked[p];
      if (!b) continue;
      const base = info.styleBase[p]!;
      for (let k = 0; k < b.count; k++) {
        this.color[(base + k) * 3] = b.color[k * 3]!;
        this.color[(base + k) * 3 + 1] = b.color[k * 3 + 1]!;
        this.color[(base + k) * 3 + 2] = b.color[k * 3 + 2]!;
        this.emissive[base + k] = b.emissive[k]!;
        this.layer[base + k] = b.layer[k]!;
      }
    }
  }

  flush(sx: number, sy: number, sz: number): void {
    const ctx = this.ctx;
    const cs = ctx.cs;
    const size = [sx, sy, sz];
    const coord = [0, 0, 0];
    const from: Vec3 = [0, 0, 0];
    const to: Vec3 = [0, 0, 0];
    const idx = () => coord[0]! + cs * (coord[1]! + cs * coord[2]!);
    for (let d = 0; d < 6; d++) {
      const m = ctx.mask[d]!;
      const n = AXIS_N[d]!;
      const t1 = T1[d]!;
      const t2 = T2[d]!;
      for (let s = 0; s < size[n]!; s++) {
        coord[n] = s;
        for (let b = 0; b < size[t2]!; b++) {
          for (let a = 0; a < size[t1]!; a++) {
            coord[t1] = a;
            coord[t2] = b;
            const key = m[idx()]!;
            if (key === 0) continue;
            let w = 1;
            while (a + w < size[t1]!) {
              coord[t1] = a + w;
              if (m[idx()] !== key) break;
              w++;
            }
            let h = 1;
            outer: while (b + h < size[t2]!) {
              coord[t2] = b + h;
              for (let k = 0; k < w; k++) {
                coord[t1] = a + k;
                if (m[idx()] !== key) break outer;
              }
              h++;
            }
            for (let hh = 0; hh < h; hh++) {
              coord[t2] = b + hh;
              for (let k = 0; k < w; k++) {
                coord[t1] = a + k;
                m[idx()] = 0;
              }
            }
            from[n] = s;
            to[n] = s + 1;
            from[t1] = a;
            to[t1] = a + w;
            from[t2] = b;
            to[t2] = b + h;
            this.emitQuad(d, from, to, key);
            coord[t1] = a;
            coord[t2] = b;
          }
        }
      }
    }
  }

  private emitQuad(d: number, from: Vec3, to: Vec3, key: number): void {
    const ctx = this.ctx;
    const corners = faceCorners(from, to, FACE_DIRS[d]!);
    for (let i = 0; i < 4; i++) {
      ctx.pos[i * 3] = corners[i]![0];
      ctx.pos[i * 3 + 1] = corners[i]![1];
      ctx.pos[i * 3 + 2] = corners[i]![2];
    }
    const style = Math.floor((key - 1) / 8);
    const ao = ctx.useAO ? AO_LEVELS[(key - 1) % 8]! : 1;
    for (let i = 0; i < 4; i++) {
      ctx.vtxCol[i * 3] = this.color[style * 3]! * ao;
      ctx.vtxCol[i * 3 + 1] = this.color[style * 3 + 1]! * ao;
      ctx.vtxCol[i * 3 + 2] = this.color[style * 3 + 2]! * ao;
    }
    ctx.layers[this.layer[style]!]!.quad(
      ctx.pos,
      0,
      0,
      0,
      0,
      DX[d]!,
      DY[d]!,
      DZ[d]!,
      ctx.zeroUV,
      0,
      ctx.vtxCol,
      this.emissive[style]!,
      false,
    );
  }
}
