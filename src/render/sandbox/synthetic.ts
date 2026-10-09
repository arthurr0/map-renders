import type { MeshBuffers, MeshResult, RenderLayer } from '../../core/types';

interface BlockDef {
  id: number;
  layer: RenderLayer;
  water?: boolean;
  emissive?: number;
  top: string;
  side: string;
  bottom: string;
  tintTop?: [number, number, number];
  tintSide?: [number, number, number];
  color: [number, number, number];
  height?: number;
}

const TILE = 16;
const PAD = 4;
const CELL = TILE + PAD * 2;
const ATLAS = 256;

type Painter = (x: number, y: number, rand: () => number) => [number, number, number, number];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PAINTERS: Record<string, Painter> = {
  grass_top: (_x, _y, r) => {
    const v = 150 + r() * 70;
    return [v, v, v, 255];
  },
  grass_side: (_x, y, r) => {
    if (y < 4 + Math.floor(r() * 2)) {
      const v = 120 + r() * 60;
      return [v * 0.55, v * 0.85, v * 0.4, 255];
    }
    const v = 0.75 + r() * 0.25;
    return [134 * v, 96 * v, 67 * v, 255];
  },
  dirt: (_x, _y, r) => {
    const v = 0.75 + r() * 0.25;
    return [134 * v, 96 * v, 67 * v, 255];
  },
  planks: (x, y, r) => {
    const board = Math.floor(y / 4);
    const seam = y % 4 === 3 || (x + board * 5) % 16 === 0;
    const v = (seam ? 0.7 : 0.9) + r() * 0.1;
    return [178 * v, 132 * v, 82 * v, 255];
  },
  dark_planks: (x, y, r) => {
    const seam = y % 4 === 3 || (x + Math.floor(y / 4) * 7) % 16 === 0;
    const v = (seam ? 0.65 : 0.9) + r() * 0.1;
    return [92 * v, 60 * v, 38 * v, 255];
  },
  stone_bricks: (x, y, r) => {
    const row = Math.floor(y / 8);
    const mortar = y % 8 === 7 || (x + row * 8) % 16 === 15;
    const v = (mortar ? 0.6 : 0.85) + r() * 0.15;
    return [128 * v, 128 * v, 128 * v, 255];
  },
  log_side: (x, _y, r) => {
    const v = (x % 4 === 0 ? 0.7 : 0.9) + r() * 0.1;
    return [104 * v, 82 * v, 50 * v, 255];
  },
  log_top: (x, y, r) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const ring = Math.floor(d) % 3 === 0 ? 0.8 : 1;
    const v = ring * (0.85 + r() * 0.1);
    return d > 6.5 ? [104 * v, 82 * v, 50 * v, 255] : [176 * v, 142 * v, 92 * v, 255];
  },
  leaves: (_x, _y, r) => {
    if (r() < 0.28) return [70, 90, 50, 0];
    const v = 120 + r() * 100;
    return [v, v, v, 255];
  },
  glass: (x, y, r) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return [210, 225, 230, 255];
    if ((x === 3 && y > 2 && y < 7) || (x === 4 && y > 3 && y < 6)) return [255, 255, 255, 140];
    return [180 + r() * 10, 210, 220, 40];
  },
  glowstone: (_x, _y, r) => {
    const v = r();
    return v > 0.6 ? [255, 236, 170, 255] : v > 0.3 ? [214, 160, 80, 255] : [140, 96, 50, 255];
  },
  water: (_x, _y, r) => {
    const v = 170 + r() * 50;
    return [v, v, v, 210];
  },
  roof: (x, y, r) => {
    const seam = y % 4 === 3 || (x + Math.floor(y / 4) * 7) % 16 === 0;
    const v = (seam ? 0.65 : 0.9) + r() * 0.1;
    return [150 * v, 62 * v, 50 * v, 255];
  },
};

export interface SyntheticAtlas {
  canvas: OffscreenCanvas;
  regions: Record<string, { u0: number; v0: number; u1: number; v1: number }>;
}

export function buildSyntheticAtlas(): SyntheticAtlas {
  const canvas = new OffscreenCanvas(ATLAS, ATLAS);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const regions: SyntheticAtlas['regions'] = {};
  const names = Object.keys(PAINTERS);
  names.forEach((name, i) => {
    const cx = (i % Math.floor(ATLAS / CELL)) * CELL;
    const cy = Math.floor(i / Math.floor(ATLAS / CELL)) * CELL;
    const tile = new Uint8ClampedArray(TILE * TILE * 4);
    const r = rng(i * 7919 + 17);
    const paint = PAINTERS[name]!;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const c = paint(x, y, r);
        const o = (x + y * TILE) * 4;
        tile[o] = c[0];
        tile[o + 1] = c[1];
        tile[o + 2] = c[2];
        tile[o + 3] = c[3];
      }
    }
    const img = ctx.createImageData(CELL, CELL);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const sx = Math.min(TILE - 1, Math.max(0, x - PAD));
        const sy = Math.min(TILE - 1, Math.max(0, y - PAD));
        const s = (sx + sy * TILE) * 4;
        const d = (x + y * CELL) * 4;
        img.data[d] = tile[s]!;
        img.data[d + 1] = tile[s + 1]!;
        img.data[d + 2] = tile[s + 2]!;
        img.data[d + 3] = tile[s + 3]!;
      }
    }
    ctx.putImageData(img, cx, cy);
    regions[name] = {
      u0: (cx + PAD) / ATLAS,
      v0: (cy + PAD) / ATLAS,
      u1: (cx + PAD + TILE) / ATLAS,
      v1: (cy + PAD + TILE) / ATLAS,
    };
  });
  return { canvas, regions };
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function lin(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

const GRASS = lin('#79c05a');
const FOLIAGE = lin('#59ae30');
const WATER = lin('#3f76e4');
const WHITE: [number, number, number] = [1, 1, 1];

const BLOCKS: BlockDef[] = [
  { id: 0, layer: 'opaque', top: '', side: '', bottom: '', color: [0, 0, 0] },
  {
    id: 1,
    layer: 'opaque',
    top: 'grass_top',
    side: 'grass_side',
    bottom: 'dirt',
    tintTop: GRASS,
    color: lin('#6a9c3d'),
  },
  {
    id: 2,
    layer: 'opaque',
    top: 'planks',
    side: 'planks',
    bottom: 'planks',
    color: lin('#b2844f'),
  },
  {
    id: 3,
    layer: 'opaque',
    top: 'stone_bricks',
    side: 'stone_bricks',
    bottom: 'stone_bricks',
    color: lin('#7c7c7c'),
  },
  {
    id: 4,
    layer: 'opaque',
    top: 'log_top',
    side: 'log_side',
    bottom: 'log_top',
    color: lin('#6b5232'),
  },
  {
    id: 5,
    layer: 'cutout',
    top: 'leaves',
    side: 'leaves',
    bottom: 'leaves',
    tintTop: FOLIAGE,
    tintSide: FOLIAGE,
    color: lin('#3f7f2a'),
  },
  {
    id: 6,
    layer: 'translucent',
    top: 'glass',
    side: 'glass',
    bottom: 'glass',
    color: lin('#c4dde6'),
  },
  {
    id: 7,
    layer: 'opaque',
    emissive: 1,
    top: 'glowstone',
    side: 'glowstone',
    bottom: 'glowstone',
    color: lin('#f2c56b'),
  },
  {
    id: 8,
    layer: 'translucent',
    water: true,
    top: 'water',
    side: 'water',
    bottom: 'water',
    tintTop: WATER,
    tintSide: WATER,
    color: lin('#3f76e4'),
    height: 14 / 16,
  },
  { id: 9, layer: 'opaque', top: 'roof', side: 'roof', bottom: 'roof', color: lin('#94402f') },
  {
    id: 10,
    layer: 'opaque',
    top: 'dark_planks',
    side: 'dark_planks',
    bottom: 'dark_planks',
    color: lin('#5a3b24'),
  },
  { id: 11, layer: 'opaque', top: 'dirt', side: 'dirt', bottom: 'dirt', color: lin('#86603f') },
];

const W = 32;
const H = 20;
const L = 32;

function buildVolume(): Uint8Array {
  const v = new Uint8Array(W * H * L);
  const set = (x: number, y: number, z: number, id: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L) return;
    v[x + z * W + y * W * L] = id;
  };
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < L; z++) {
      set(x, 0, z, 11);
      set(x, 1, z, 1);
    }
  }
  for (let x = 20; x < 29; x++) {
    for (let z = 4; z < 12; z++) {
      const dx = (x - 24.5) / 4.6;
      const dz = (z - 7.5) / 4.2;
      if (dx * dx + dz * dz < 1) {
        set(x, 1, z, 8);
        set(x, 0, z, 11);
      }
    }
  }
  const x0 = 6;
  const z0 = 10;
  const hw = 11;
  const hl = 9;
  for (let y = 2; y < 8; y++) {
    for (let x = x0; x < x0 + hw; x++) {
      for (let z = z0; z < z0 + hl; z++) {
        const edge = x === x0 || x === x0 + hw - 1 || z === z0 || z === z0 + hl - 1;
        if (!edge) continue;
        const corner = (x === x0 || x === x0 + hw - 1) && (z === z0 || z === z0 + hl - 1);
        let id = y === 2 ? 3 : corner ? 4 : 2;
        const window =
          (y === 4 || y === 5) &&
          !corner &&
          ((z === z0 + hl - 1 && (x === x0 + 2 || x === x0 + 3 || x === x0 + 7 || x === x0 + 8)) ||
            (x === x0 + hw - 1 && (z === z0 + 3 || z === z0 + 5)));
        if (window) id = 6;
        const door = z === z0 + hl - 1 && x === x0 + 5 && (y === 3 || y === 4);
        if (door) id = 0;
        set(x, y, z, id);
      }
    }
  }
  for (let x = x0; x < x0 + hw; x++) {
    for (let z = z0; z < z0 + hl; z++)
      set(x, 2, z, x === x0 || z === z0 || x === x0 + hw - 1 || z === z0 + hl - 1 ? 3 : 10);
  }
  for (let step = 0; step < 6; step++) {
    const y = 8 + step;
    for (let x = x0 - 1; x <= x0 + hw; x++) {
      set(x, y, z0 - 1 + step, 9);
      set(x, y, z0 + hl - step, 9);
      if (step > 0) {
        for (let z = z0 - 1 + step + 1; z < z0 + hl - step; z++) {
          if (x === x0 || x === x0 + hw - 1) set(x, y, z, 2);
        }
      }
    }
  }
  set(x0 + 5, 5, z0 + hl, 7);
  set(x0 + 4, 3, z0 + hl + 2, 7);
  set(x0 + 6, 3, z0 + hl + 2, 7);
  set(x0 + 4, 2, z0 + hl + 2, 10);
  set(x0 + 6, 2, z0 + hl + 2, 10);
  const tx = 24;
  const tz = 22;
  for (let y = 2; y < 9; y++) set(tx, y, tz, 4);
  for (let x = tx - 3; x <= tx + 3; x++) {
    for (let y = 6; y <= 11; y++) {
      for (let z = tz - 3; z <= tz + 3; z++) {
        const d = Math.hypot(x - tx, (y - 8.5) * 1.2, z - tz);
        if (d < 3.4 && !(x === tx && z === tz && y < 9)) set(x, y, z, 5);
      }
    }
  }
  return v;
}

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  emissive: number[];
  indices: number[];
}

function newBuilder(): Builder {
  return { positions: [], normals: [], uvs: [], colors: [], emissive: [], indices: [] };
}

const FACES: Array<{
  n: [number, number, number];
  corners: Array<[number, number, number]>;
  key: 'top' | 'side' | 'bottom';
}> = [
  {
    n: [0, 1, 0],
    key: 'top',
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    key: 'bottom',
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    key: 'side',
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    key: 'side',
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    n: [1, 0, 0],
    key: 'side',
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    key: 'side',
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
];

export function buildSyntheticModel(atlas: SyntheticAtlas | null): MeshResult {
  const vol = buildVolume();
  const get = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L ? 0 : vol[x + z * W + y * W * L]!;
  const def = (id: number) => BLOCKS[id]!;
  const opaqueAt = (x: number, y: number, z: number) => {
    const id = get(x, y, z);
    return id !== 0 && def(id).layer === 'opaque';
  };
  const builders = new Map<string, Builder>();
  const keyFor = (d: BlockDef) => (d.water ? 'water' : d.layer);
  let faces = 0;
  let blocks = 0;

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        const id = get(x, y, z);
        if (id === 0) continue;
        blocks++;
        const d = def(id);
        for (const f of FACES) {
          const nx = x + f.n[0];
          const ny = y + f.n[1];
          const nz = z + f.n[2];
          const nid = get(nx, ny, nz);
          if (nid !== 0) {
            const nd = def(nid);
            if (nd.layer === 'opaque') continue;
            if (nid === id && d.layer !== 'cutout') continue;
          }
          if (d.water && f.n[1] < 0 && nid !== 0) continue;
          const k = keyFor(d);
          let b = builders.get(k);
          if (!b) {
            b = newBuilder();
            builders.set(k, b);
          }
          faces++;
          const base = b.positions.length / 3;
          const texName = f.key === 'top' ? d.top : f.key === 'bottom' ? d.bottom : d.side;
          const region = atlas?.regions[texName];
          const tint = atlas
            ? f.key === 'top'
              ? (d.tintTop ?? WHITE)
              : (d.tintSide ?? WHITE)
            : d.color;
          const h = d.height ?? 1;
          f.corners.forEach((c, ci) => {
            const cy = c[1] === 1 ? h : 0;
            b.positions.push(x + c[0], y + cy, z + c[2]);
            b.normals.push(f.n[0], f.n[1], f.n[2]);
            const uvc: Array<[number, number]> = [
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ];
            const [uu, vv] = uvc[ci]!;
            if (region) {
              b.uvs.push(
                region.u0 + (region.u1 - region.u0) * uu,
                region.v0 + (region.v1 - region.v0) * (f.key === 'side' ? 1 - (1 - vv) * h : vv),
              );
            } else {
              b.uvs.push(uu, vv);
            }
            let ao = 1;
            if (d.layer !== 'translucent') {
              const ox = x + f.n[0];
              const oy = y + f.n[1];
              const oz = z + f.n[2];
              const axes = [0, 1, 2].filter((a) => f.n[a] === 0);
              const a0 = axes[0]!;
              const a1 = axes[1]!;
              const s0 = c[a0] === 1 ? 1 : -1;
              const s1 = c[a1] === 1 ? 1 : -1;
              const p = [ox, oy, oz];
              const q0 = [...p];
              q0[a0]! += s0;
              const q1 = [...p];
              q1[a1]! += s1;
              const qc = [...p];
              qc[a0]! += s0;
              qc[a1]! += s1;
              const side1 = opaqueAt(q0[0]!, q0[1]!, q0[2]!) ? 1 : 0;
              const side2 = opaqueAt(q1[0]!, q1[1]!, q1[2]!) ? 1 : 0;
              const corner = opaqueAt(qc[0]!, qc[1]!, qc[2]!) ? 1 : 0;
              const level = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
              ao = [0.45, 0.62, 0.8, 1][level]!;
            }
            b.colors.push(tint[0] * ao, tint[1] * ao, tint[2] * ao);
            b.emissive.push(d.emissive ?? 0);
          });
          b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  const meshes: MeshBuffers[] = [];
  for (const [k, b] of builders) {
    meshes.push({
      layer: k === 'water' ? 'translucent' : (k as RenderLayer),
      isWater: k === 'water',
      origin: [0, 0, 0],
      positions: new Float32Array(b.positions),
      normals: new Float32Array(b.normals),
      uvs: new Float32Array(b.uvs),
      colors: new Float32Array(b.colors),
      indices: new Uint32Array(b.indices),
      emissive: new Float32Array(b.emissive),
    });
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = m.positions[i + a]!;
        if (v < min[a]!) min[a] = v;
        if (v > max[a]!) max[a] = v;
      }
    }
  }
  return {
    meshes,
    bounds: { min, max },
    stats: { blocks, faces, unknownBlocks: [] },
  };
}
