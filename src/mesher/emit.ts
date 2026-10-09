import { computeAO as importedComputeAO, interpolateAO as importedInterpolateAO } from './ao';
import type { BakedModel } from './bake';
import { DX as IDX, DY as IDY, DZ as IDZ, OPP as IOPP, type MeshContext } from './context';

const DX = IDX;
const DY = IDY;
const DZ = IDZ;
const OPP = IOPP;
const computeAO = importedComputeAO;
const interpolateAO = importedInterpolateAO;

export function emitBaked(
  ctx: MeshContext,
  bm: BakedModel,
  p: number,
  x: number,
  y: number,
  z: number,
  lx: number,
  ly: number,
  lz: number,
  allowGreedy: boolean,
): void {
  const { info, vtxAO, vtxCol, aoCount } = ctx;
  const cover = info.cover;
  const group = info.group;
  const g = group[p]!;
  let aoKey = -1;
  for (let k = 0; k < bm.count; k++) {
    const cd = bm.cull[k]!;
    if (cd >= 0) {
      const q = ctx.pal(x + DX[cd]!, y + DY[cd]!, z + DZ[cd]!);
      const m = bm.cullMask[k]!;
      if ((cover[q * 6 + OPP[cd]!]! & m) === m) continue;
      if (g !== 0 && group[q] === g) continue;
    }
    const ad = bm.aoDir[k]!;
    let uniform = true;
    let level = 0;
    if (ctx.useAO && ad >= 0) {
      const inside = bm.aoInside[k] === 1;
      const key = ad * 2 + (inside ? 1 : 0);
      if (key !== aoKey) {
        computeAO(ctx, x, y, z, ad, inside);
        aoKey = key;
      }
      interpolateAO(ctx, bm.pos, k * 12, ad);
      uniform = aoCount[0] === aoCount[1] && aoCount[1] === aoCount[2] && aoCount[2] === aoCount[3];
      level = aoCount[0]!;
    } else {
      vtxAO.fill(1);
    }
    if (allowGreedy && ad >= 0 && bm.fullFace[k] === 1 && uniform) {
      ctx.mask[ad]![lx + ctx.cs * (ly + ctx.cs * lz)] = (info.styleBase[p]! + k) * 8 + level + 1;
      continue;
    }
    const c0 = bm.color[k * 3]!;
    const c1 = bm.color[k * 3 + 1]!;
    const c2 = bm.color[k * 3 + 2]!;
    for (let i = 0; i < 4; i++) {
      vtxCol[i * 3] = c0 * vtxAO[i]!;
      vtxCol[i * 3 + 1] = c1 * vtxAO[i]!;
      vtxCol[i * 3 + 2] = c2 * vtxAO[i]!;
    }
    const flip = vtxAO[1]! + vtxAO[3]! > vtxAO[0]! + vtxAO[2]! + 1e-6;
    ctx.layers[bm.layer[k]!]!.quad(
      bm.pos,
      k * 12,
      lx,
      ly,
      lz,
      bm.normal[k * 3]!,
      bm.normal[k * 3 + 1]!,
      bm.normal[k * 3 + 2]!,
      ctx.simplified ? ctx.zeroUV : bm.uv,
      ctx.simplified ? 0 : k * 8,
      vtxCol,
      bm.emissive[k]!,
      flip,
    );
  }
}
