import type { ElementRotation, FaceDir, ModelElement, ModelFace, Vec3 } from './types';

export const FACE_DIRS: FaceDir[] = ['down', 'up', 'north', 'south', 'west', 'east'];

export const DIR_VEC: Record<FaceDir, Vec3> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

export const OPPOSITE: Record<FaceDir, FaceDir> = {
  down: 'up',
  up: 'down',
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
};

export type UV = [number, number, number, number];

export function vecToDir(v: Vec3): FaceDir {
  const [x, y, z] = v;
  if (Math.abs(y) > 0.5) return y > 0 ? 'up' : 'down';
  if (Math.abs(z) > 0.5) return z > 0 ? 'south' : 'north';
  return x > 0 ? 'east' : 'west';
}

export function autoUV(from: Vec3, to: Vec3, dir: FaceDir): UV {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  switch (dir) {
    case 'down':
      return [x0, 16 - z1, x1, 16 - z0];
    case 'up':
      return [x0, z0, x1, z1];
    case 'north':
      return [16 - x1, 16 - y1, 16 - x0, 16 - y0];
    case 'south':
      return [x0, 16 - y1, x1, 16 - y0];
    case 'west':
      return [z0, 16 - y1, z1, 16 - y0];
    case 'east':
      return [16 - z1, 16 - y1, 16 - z0, 16 - y0];
  }
}

export function faceCorners(from: Vec3, to: Vec3, dir: FaceDir): Vec3[] {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  const out: Vec3[] = [];
  const ab: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];
  for (const [a, b] of ab) {
    switch (dir) {
      case 'up':
        out.push([a ? x1 : x0, y1, b ? z1 : z0]);
        break;
      case 'down':
        out.push([a ? x1 : x0, y0, b ? z0 : z1]);
        break;
      case 'north':
        out.push([a ? x0 : x1, b ? y0 : y1, z0]);
        break;
      case 'south':
        out.push([a ? x1 : x0, b ? y0 : y1, z1]);
        break;
      case 'west':
        out.push([x0, b ? y0 : y1, a ? z1 : z0]);
        break;
      case 'east':
        out.push([x1, b ? y0 : y1, a ? z0 : z1]);
        break;
    }
  }
  return out;
}

export function cornerUVs(uv: UV, rotation: number): [number, number][] {
  const steps = (((rotation / 90) % 4) + 4) % 4;
  const out: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const k = (i + steps) % 4;
    out.push([k === 0 || k === 1 ? uv[0] : uv[2], k === 0 || k === 3 ? uv[1] : uv[3]]);
  }
  return out;
}

function rotX90(p: Vec3): Vec3 {
  return [p[0], p[2], -p[1]];
}

function rotY90(p: Vec3): Vec3 {
  return [-p[2], p[1], p[0]];
}

export function rotateVec(p: Vec3, x: number, y: number): Vec3 {
  let r: Vec3 = [p[0], p[1], p[2]];
  const xs = ((((x / 90) | 0) % 4) + 4) % 4;
  const ys = ((((y / 90) | 0) % 4) + 4) % 4;
  for (let i = 0; i < xs; i++) r = rotX90(r);
  for (let i = 0; i < ys; i++) r = rotY90(r);
  return [r[0] + 0, r[1] + 0, r[2] + 0];
}

export function rotatePoint(p: Vec3, x: number, y: number): Vec3 {
  const r = rotateVec([p[0] - 8, p[1] - 8, p[2] - 8], x, y);
  return [round(r[0] + 8), round(r[1] + 8), round(r[2] + 8)];
}

function round(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

export function rotateDir(dir: FaceDir, x: number, y: number): FaceDir {
  return vecToDir(rotateVec(DIR_VEC[dir], x, y));
}

const EPS = 1e-4;

function samePoint(a: Vec3, b: Vec3): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS && Math.abs(a[2] - b[2]) < EPS;
}

function fitUV(vertexUVs: [number, number][]): { uv: UV; rotation: 0 | 90 | 180 | 270 } {
  for (let steps = 0; steps < 4; steps++) {
    const slots: (number | null)[] = [null, null, null, null];
    let ok = true;
    for (let i = 0; i < 4 && ok; i++) {
      const k = (i + steps) % 4;
      const uSlot = k === 0 || k === 1 ? 0 : 2;
      const vSlot = k === 0 || k === 3 ? 1 : 3;
      const [u, v] = vertexUVs[i]!;
      for (const [slot, val] of [
        [uSlot, u],
        [vSlot, v],
      ] as const) {
        const prev = slots[slot];
        if (prev === null || prev === undefined) slots[slot] = val;
        else if (Math.abs(prev - val) > EPS) ok = false;
      }
    }
    if (ok) {
      return {
        uv: [slots[0] ?? 0, slots[1] ?? 0, slots[2] ?? 16, slots[3] ?? 16],
        rotation: (steps * 90) as 0 | 90 | 180 | 270,
      };
    }
  }
  return { uv: [0, 0, 16, 16], rotation: 0 };
}

function rotateElementRotation(rot: ElementRotation, x: number, y: number): ElementRotation {
  const axisVec: Vec3 = rot.axis === 'x' ? [1, 0, 0] : rot.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
  const r = rotateVec(axisVec, x, y);
  let axis: 'x' | 'y' | 'z' = 'x';
  let sign: number;
  if (Math.abs(r[1]) > 0.5) {
    axis = 'y';
    sign = Math.sign(r[1]);
  } else if (Math.abs(r[2]) > 0.5) {
    axis = 'z';
    sign = Math.sign(r[2]);
  } else {
    sign = Math.sign(r[0]);
  }
  const out: ElementRotation = {
    origin: rotatePoint(rot.origin, x, y),
    axis,
    angle: rot.angle * sign,
  };
  if (rot.rescale) out.rescale = true;
  return out;
}

export function rotateElement(
  el: ModelElement,
  x: number,
  y: number,
  uvlock: boolean,
): ModelElement {
  if (x % 360 === 0 && y % 360 === 0) return el;
  const a = rotatePoint(el.from, x, y);
  const b = rotatePoint(el.to, x, y);
  const from: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const to: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const faces: Partial<Record<FaceDir, ModelFace>> = {};
  for (const dir of FACE_DIRS) {
    const face = el.faces[dir];
    if (!face) continue;
    const newDir = rotateDir(dir, x, y);
    const next: ModelFace = { ...face };
    if (face.cullface) next.cullface = rotateDir(face.cullface, x, y);
    if (uvlock) {
      next.uv = autoUV(from, to, newDir);
      delete next.rotation;
    } else {
      const corners = faceCorners(el.from, el.to, dir).map((p) => rotatePoint(p, x, y));
      const uvs = cornerUVs(face.uv ?? autoUV(el.from, el.to, dir), face.rotation ?? 0);
      const target = faceCorners(from, to, newDir);
      const assigned: [number, number][] = [];
      const used = [false, false, false, false];
      for (const t of target) {
        let idx = -1;
        for (let i = 0; i < 4; i++) {
          if (!used[i] && samePoint(corners[i]!, t)) {
            idx = i;
            break;
          }
        }
        if (idx < 0) idx = assigned.length;
        used[idx] = true;
        assigned.push(uvs[idx]!);
      }
      const fit = fitUV(assigned);
      next.uv = fit.uv;
      if (fit.rotation) next.rotation = fit.rotation;
      else delete next.rotation;
    }
    faces[newDir] = next;
  }
  const out: ModelElement = { from, to, faces };
  if (el.rotation) out.rotation = rotateElementRotation(el.rotation, x, y);
  if (el.shade === false) out.shade = false;
  return out;
}

export function faceArea(from: Vec3, to: Vec3, dir: FaceDir): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  if (dir === 'up' || dir === 'down') return dx * dz;
  if (dir === 'north' || dir === 'south') return dx * dy;
  return dz * dy;
}

export function onBoundary(from: Vec3, to: Vec3, dir: FaceDir): boolean {
  switch (dir) {
    case 'down':
      return from[1] <= 0;
    case 'up':
      return to[1] >= 16;
    case 'north':
      return from[2] <= 0;
    case 'south':
      return to[2] >= 16;
    case 'west':
      return from[0] <= 0;
    case 'east':
      return to[0] >= 16;
  }
}

export function faceCoverageRect(from: Vec3, to: Vec3, dir: FaceDir): UV {
  if (dir === 'up' || dir === 'down') return [from[0], from[2], to[0], to[2]];
  if (dir === 'north' || dir === 'south') return [from[0], from[1], to[0], to[1]];
  return [from[2], from[1], to[2], to[1]];
}

export function coversFullSide(elements: ModelElement[], dir: FaceDir): boolean {
  const grid = new Uint8Array(256);
  for (const el of elements) {
    if (el.rotation && el.rotation.angle !== 0) continue;
    if (!el.faces[dir]) continue;
    if (!onBoundary(el.from, el.to, dir)) continue;
    const [a0, b0, a1, b1] = faceCoverageRect(el.from, el.to, dir);
    for (let a = 0; a < 16; a++) {
      const ca = a + 0.5;
      if (ca < a0 || ca > a1) continue;
      for (let b = 0; b < 16; b++) {
        const cb = b + 0.5;
        if (cb < b0 || cb > b1) continue;
        grid[a * 16 + b] = 1;
      }
    }
  }
  for (let i = 0; i < 256; i++) if (!grid[i]) return false;
  return true;
}
