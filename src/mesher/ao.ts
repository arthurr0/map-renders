import {
  AO_LEVELS as IAO,
  DX as IDX,
  DY as IDY,
  DZ as IDZ,
  T1 as IT1,
  T2 as IT2,
  type MeshContext,
} from './context';

const AO_LEVELS = IAO;
const DX = IDX;
const DY = IDY;
const DZ = IDZ;
const T1 = IT1;
const T2 = IT2;

export function computeAO(
  ctx: MeshContext,
  x: number,
  y: number,
  z: number,
  d: number,
  inside: boolean,
): void {
  const { grid, aoCount, aoVal } = ctx;
  const shade = ctx.info.shade;
  let bx = x;
  let by = y;
  let bz = z;
  if (!inside) {
    bx += DX[d]!;
    by += DY[d]!;
    bz += DZ[d]!;
  }
  const t1 = T1[d]!;
  const t2 = T2[d]!;
  for (let b = -1; b <= 1; b++) {
    for (let a = -1; a <= 1; a++) {
      let sx = bx;
      let sy = by;
      let sz = bz;
      if (t1 === 0) sx += a;
      else if (t1 === 1) sy += a;
      else sz += a;
      if (t2 === 0) sx += b;
      else if (t2 === 1) sy += b;
      else sz += b;
      grid[a + 1 + (b + 1) * 3] = shade[ctx.pal(sx, sy, sz)]!;
    }
  }
  const center = grid[4]!;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const a = i === 0 ? 0 : 2;
      const bb = j === 0 ? 0 : 2;
      const s1 = grid[a + 3]!;
      const s2 = grid[1 + bb * 3]!;
      const c = s1 && s2 ? 1 : grid[a + bb * 3]!;
      const k = s1 + s2 + c + center;
      aoCount[i + 2 * j] = k;
      aoVal[i + 2 * j] = AO_LEVELS[k]!;
    }
  }
}

export function interpolateAO(
  ctx: MeshContext,
  pos: Float32Array,
  offset: number,
  d: number,
): void {
  const { aoVal, vtxAO } = ctx;
  const t1 = T1[d]!;
  const t2 = T2[d]!;
  for (let i = 0; i < 4; i++) {
    let u = pos[offset + i * 3 + t1]!;
    let v = pos[offset + i * 3 + t2]!;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const top = aoVal[0]! + (aoVal[1]! - aoVal[0]!) * u;
    const bot = aoVal[2]! + (aoVal[3]! - aoVal[2]!) * u;
    vtxAO[i] = top + (bot - top) * v;
  }
}
