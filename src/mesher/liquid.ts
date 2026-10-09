import {
  FACE_DIRS,
  FULL_COVERAGE,
  faceCorners,
  srgbToLinear,
  TINT_RGB,
  type Vec3,
} from '../blocks';
import type { AtlasRegion } from '../core/types';
import { DX as IDX, DZ as IDZ, OPP as IOPP, type MeshContext } from './context';

const DX = IDX;
const DZ = IDZ;
const OPP = IOPP;

const INSET = 0.001;
const REVERSE = [0, 3, 2, 1];
const UNIT_CORNERS = FACE_DIRS.map((d) => faceCorners([0, 0, 0], [1, 1, 1], d));

interface FluidStyle {
  still: AtlasRegion | null;
  flow: AtlasRegion | null;
  stillColor: Vec3;
  flowColor: Vec3;
  emissive: number;
}

export class LiquidMesher {
  private readonly styles: FluidStyle[];
  private readonly heights = new Float32Array(4);
  private readonly rev = new Float32Array(12);
  private readonly revUV = new Float32Array(8);
  private sumH = 0;
  private sumW = 0;

  constructor(private readonly ctx: MeshContext) {
    const water: Vec3 = [
      srgbToLinear(TINT_RGB.water[0]),
      srgbToLinear(TINT_RGB.water[1]),
      srgbToLinear(TINT_RGB.water[2]),
    ];
    this.styles = [
      this.style('block/water_still', 'block/water_flow', water, 0),
      this.style('block/lava_still', 'block/lava_flow', [1, 1, 1], 1),
    ];
  }

  private style(still: string, flow: string, tint: Vec3, emissive: number): FluidStyle {
    const { atlas, simplified } = this.ctx;
    const color = (t: string): Vec3 => {
      const c = atlas.colors[t];
      if (!simplified || !c) return tint;
      return [
        tint[0] * srgbToLinear(c[0]),
        tint[1] * srgbToLinear(c[1]),
        tint[2] * srgbToLinear(c[2]),
      ];
    };
    return {
      still: simplified ? null : (atlas.regions[still] ?? null),
      flow: simplified ? null : (atlas.regions[flow] ?? null),
      stillColor: color(still),
      flowColor: color(flow),
      emissive,
    };
  }

  private height(x: number, y: number, z: number, kind: number): number {
    const { info } = this.ctx;
    const q = this.ctx.pal(x, y, z);
    if (info.fluid[q] === kind) {
      return info.fluid[this.ctx.pal(x, y + 1, z)] === kind ? 1 : info.fluidH[q]!;
    }
    return info.solid[q] ? -1 : 0;
  }

  private add(h: number): void {
    if (h >= 0.8) {
      this.sumH += h * 10;
      this.sumW += 10;
    } else if (h >= 0) {
      this.sumH += h;
      this.sumW += 1;
    }
  }

  private corner(
    self: number,
    a: number,
    b: number,
    x: number,
    y: number,
    z: number,
    kind: number,
  ): number {
    if (a >= 1 || b >= 1) return 1;
    this.sumH = 0;
    this.sumW = 0;
    if (a > 0 || b > 0) {
      const d = this.height(x, y, z, kind);
      if (d >= 1) return 1;
      this.add(d);
    }
    this.add(self);
    this.add(b);
    this.add(a);
    return this.sumW > 0 ? this.sumH / this.sumW : self;
  }

  private setUV(region: AtlasRegion | null, u16: number, v16: number, i: number): void {
    const uv = this.ctx.uv;
    if (!region) {
      uv[i * 2] = 0;
      uv[i * 2 + 1] = 0;
      return;
    }
    uv[i * 2] = region.u0 + (u16 / 16) * (region.u1 - region.u0);
    uv[i * 2 + 1] = region.v0 + (v16 / 16) * (region.v1 - region.v0);
  }

  private fillColor(c: Vec3): void {
    const col = this.ctx.vtxCol;
    for (let i = 0; i < 4; i++) {
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
  }

  emit(
    p: number,
    x: number,
    y: number,
    z: number,
    kind: number,
    lx: number,
    ly: number,
    lz: number,
  ): void {
    const ctx = this.ctx;
    const { info, pos } = ctx;
    const builder = kind === 1 ? ctx.water : ctx.layers[0]!;
    const st = this.styles[kind - 1]!;
    const h = this.heights;
    const self = this.height(x, y, z, kind);
    const aboveSame = info.fluid[ctx.pal(x, y + 1, z)] === kind;
    if (self >= 1) {
      h.fill(1);
    } else {
      const n = this.height(x, y, z - 1, kind);
      const s = this.height(x, y, z + 1, kind);
      const e = this.height(x + 1, y, z, kind);
      const w = this.height(x - 1, y, z, kind);
      h[0] = this.corner(self, n, w, x - 1, y, z - 1, kind);
      h[1] = this.corner(self, n, e, x + 1, y, z - 1, kind);
      h[2] = this.corner(self, s, w, x - 1, y, z + 1, kind);
      h[3] = this.corner(self, s, e, x + 1, y, z + 1, kind);
    }
    if (!aboveSame) {
      const c = UNIT_CORNERS[1]!;
      for (let i = 0; i < 4; i++) {
        const cx = c[i]![0];
        const cz = c[i]![2];
        pos[i * 3] = cx;
        pos[i * 3 + 1] = h[cx + 2 * cz]! - INSET;
        pos[i * 3 + 2] = cz;
        this.setUV(st.still, cx * 16, cz * 16, i);
      }
      this.fillColor(st.stillColor);
      const ax = pos[6]! - pos[0]!;
      const ay = pos[7]! - pos[1]!;
      const az = pos[8]! - pos[2]!;
      const bx = pos[9]! - pos[3]!;
      const by = pos[10]! - pos[4]!;
      const bz = pos[11]! - pos[5]!;
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      builder.quad(pos, 0, lx, ly, lz, nx, ny, nz, ctx.uv, 0, ctx.vtxCol, st.emissive, false);
      if (kind === 1) {
        for (let i = 0; i < 4; i++) {
          const o = REVERSE[i]!;
          this.rev[i * 3] = pos[o * 3]!;
          this.rev[i * 3 + 1] = pos[o * 3 + 1]!;
          this.rev[i * 3 + 2] = pos[o * 3 + 2]!;
          this.revUV[i * 2] = ctx.uv[o * 2]!;
          this.revUV[i * 2 + 1] = ctx.uv[o * 2 + 1]!;
        }
        builder.quad(
          this.rev,
          0,
          lx,
          ly,
          lz,
          -nx,
          -ny,
          -nz,
          this.revUV,
          0,
          ctx.vtxCol,
          st.emissive,
          false,
        );
      }
    }
    const below = ctx.pal(x, y - 1, z);
    if (
      info.fluid[below] !== kind &&
      info.cover[below * 6 + 1] !== FULL_COVERAGE &&
      info.cover[p * 6] !== FULL_COVERAGE
    ) {
      const c = UNIT_CORNERS[0]!;
      for (let i = 0; i < 4; i++) {
        pos[i * 3] = c[i]![0];
        pos[i * 3 + 1] = INSET;
        pos[i * 3 + 2] = c[i]![2];
        this.setUV(st.still, c[i]![0] * 16, (1 - c[i]![2]) * 16, i);
      }
      this.fillColor(st.stillColor);
      builder.quad(pos, 0, lx, ly, lz, 0, -1, 0, ctx.uv, 0, ctx.vtxCol, st.emissive, false);
    }
    this.fillColor(st.flowColor);
    for (let d = 2; d < 6; d++) {
      if (info.cover[p * 6 + d] === FULL_COVERAGE) continue;
      const q = ctx.pal(x + DX[d]!, y, z + DZ[d]!);
      if (info.fluid[q] === kind) continue;
      if (info.cover[q * 6 + OPP[d]!] === FULL_COVERAGE) continue;
      const c = UNIT_CORNERS[d]!;
      const dx = DX[d]!;
      const dz = DZ[d]!;
      for (let i = 0; i < 4; i++) {
        const cx = c[i]![0];
        const cz = c[i]![2];
        const yy = c[i]![1] > 0 ? h[cx + 2 * cz]! : 0;
        pos[i * 3] = dx !== 0 ? cx - dx * INSET : cx;
        pos[i * 3 + 1] = yy;
        pos[i * 3 + 2] = dz !== 0 ? cz - dz * INSET : cz;
        this.setUV(st.flow, i < 2 ? 0 : 8, (1 - yy) * 8, i);
      }
      builder.quad(pos, 0, lx, ly, lz, dx, 0, dz, ctx.uv, 0, ctx.vtxCol, st.emissive, false);
    }
  }
}
