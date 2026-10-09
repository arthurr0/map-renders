export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f);
  h = Math.imul(h ^ seed ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function wrap(v: number, period: number): number {
  const m = v % period;
  return m < 0 ? m + period : m;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const GRAD_X = Int8Array.from([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]);
const GRAD_Y = Int8Array.from([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1]);
const GRAD_Z = Int8Array.from([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1]);

export interface PerlinLattice {
  period: number;
  gradients: Uint8Array;
}

export function perlinLattice(requested: number, seed: number): PerlinLattice {
  const period = 2 ** Math.max(0, Math.round(Math.log2(Math.max(1, requested))));
  const gradients = new Uint8Array(period * period * period);
  let i = 0;
  for (let z = 0; z < period; z++) {
    for (let y = 0; y < period; y++) {
      for (let x = 0; x < period; x++) {
        gradients[i++] = Math.floor(hash3(x, y, z, seed) * 12) % 12;
      }
    }
  }
  return { period, gradients };
}

function corner(
  lattice: PerlinLattice,
  ix: number,
  iy: number,
  iz: number,
  x: number,
  y: number,
  z: number,
): number {
  const p = lattice.period;
  const m = p - 1;
  const g = lattice.gradients[((iz & m) * p + (iy & m)) * p + (ix & m)]!;
  return GRAD_X[g]! * x + GRAD_Y[g]! * y + GRAD_Z[g]! * z;
}

export function tilingPerlin(lattice: PerlinLattice, x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);
  const n000 = corner(lattice, ix, iy, iz, fx, fy, fz);
  const n100 = corner(lattice, ix + 1, iy, iz, fx - 1, fy, fz);
  const n010 = corner(lattice, ix, iy + 1, iz, fx, fy - 1, fz);
  const n110 = corner(lattice, ix + 1, iy + 1, iz, fx - 1, fy - 1, fz);
  const n001 = corner(lattice, ix, iy, iz + 1, fx, fy, fz - 1);
  const n101 = corner(lattice, ix + 1, iy, iz + 1, fx - 1, fy, fz - 1);
  const n011 = corner(lattice, ix, iy + 1, iz + 1, fx, fy - 1, fz - 1);
  const n111 = corner(lattice, ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1);
  const x00 = n000 + (n100 - n000) * u;
  const x10 = n010 + (n110 - n010) * u;
  const x01 = n001 + (n101 - n001) * u;
  const x11 = n011 + (n111 - n011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

export interface WorleyCells {
  cells: number;
  padded: Float32Array;
}

export function worleyCells(cells: number, seed: number): WorleyCells {
  const side = cells + 2;
  const padded = new Float32Array(side * side * side * 3);
  let i = 0;
  for (let z = -1; z <= cells; z++) {
    const wz = wrap(z, cells);
    for (let y = -1; y <= cells; y++) {
      const wy = wrap(y, cells);
      for (let x = -1; x <= cells; x++) {
        const wx = wrap(x, cells);
        padded[i++] = x + hash3(wx, wy, wz, seed);
        padded[i++] = y + hash3(wx, wy, wz, seed + 1);
        padded[i++] = z + hash3(wx, wy, wz, seed + 2);
      }
    }
  }
  return { cells, padded };
}

export function tilingWorley(grid: WorleyCells, x: number, y: number, z: number): number {
  const side = grid.cells + 2;
  const pts = grid.padded;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const cz = Math.floor(z);
  let best = Infinity;
  for (let dz = 0; dz < 3; dz++) {
    for (let dy = 0; dy < 3; dy++) {
      let k = (((cz + dz) * side + cy + dy) * side + cx) * 3;
      for (let dx = 0; dx < 3; dx++) {
        const px = pts[k]! - x;
        const py = pts[k + 1]! - y;
        const pz = pts[k + 2]! - z;
        const d = px * px + py * py + pz * pz;
        if (d < best) best = d;
        k += 3;
      }
    }
  }
  return 1 - Math.min(1, Math.sqrt(best));
}

function wrapUnit(t: number, cells: number): number {
  const v = t * cells;
  return v >= cells ? v - cells : v;
}

function worleyFbm(grids: WorleyCells[], tx: number, ty: number, tz: number): number {
  const a = grids[0]!;
  const b = grids[1]!;
  const c = grids[2]!;
  return (
    tilingWorley(a, wrapUnit(tx, a.cells), wrapUnit(ty, a.cells), wrapUnit(tz, a.cells)) * 0.625 +
    tilingWorley(b, wrapUnit(tx, b.cells), wrapUnit(ty, b.cells), wrapUnit(tz, b.cells)) * 0.25 +
    tilingWorley(c, wrapUnit(tx, c.cells), wrapUnit(ty, c.cells), wrapUnit(tz, c.cells)) * 0.125
  );
}

function normalize(values: Float32Array): Float32Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo > 1e-6 ? hi - lo : 1;
  for (let i = 0; i < values.length; i++) values[i] = (values[i]! - lo) / span;
  return values;
}

export interface CloudNoiseVolume {
  size: number;
  data: Float32Array;
}

export function generateShapeNoise(size: number, seed = 7): CloudNoiseVolume {
  const n = Math.max(4, Math.floor(size));
  const values = new Float32Array(n * n * n);
  const freqs = [4, 8, 16];
  const lattices = freqs.map((f, i) => perlinLattice(f, seed + i * 13));
  const grids = freqs.map((f, i) => worleyCells(f, seed * 31 + i * 3));
  let o = 0;
  for (let z = 0; z < n; z++) {
    const tz = z / n;
    for (let y = 0; y < n; y++) {
      const ty = y / n;
      for (let x = 0; x < n; x++) {
        const tx = x / n;
        let perlin = 0;
        let amp = 1;
        let norm = 0;
        for (let i = 0; i < 3; i++) {
          const f = freqs[i]!;
          perlin += tilingPerlin(lattices[i]!, tx * f, ty * f, tz * f) * amp;
          norm += amp;
          amp *= 0.5;
        }
        perlin = Math.min(1, Math.max(0, (perlin / norm) * 0.9 + 0.5));
        const worley = worleyFbm(grids, tx, ty, tz);
        values[o++] = (perlin - (worley - 1)) / (2 - worley);
      }
    }
  }
  return { size: n, data: normalize(values) };
}

export function generateDetailNoise(size: number, seed = 11): CloudNoiseVolume {
  const n = Math.max(4, Math.floor(size));
  const values = new Float32Array(n * n * n);
  const grids = [4, 8, 16].map((f, i) => worleyCells(f, seed * 57 + i * 5 + 101));
  let o = 0;
  for (let z = 0; z < n; z++) {
    const tz = z / n;
    for (let y = 0; y < n; y++) {
      const ty = y / n;
      for (let x = 0; x < n; x++) values[o++] = worleyFbm(grids, x / n, ty, tz);
    }
  }
  return { size: n, data: normalize(values) };
}
