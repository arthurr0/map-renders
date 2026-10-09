import type { ModelSpec } from './build';
import type { NeighborLookup } from './types';

export interface Ctx {
  id: string;
  name: string;
  props: Record<string, string>;
  neighbors: NeighborLookup;
}

export type Builder = (ctx: Ctx) => ModelSpec | null;

export interface Family {
  id: string;
  match: (name: string) => boolean;
  build: Builder;
  dynamic?: (ctx: Omit<Ctx, 'neighbors'>) => boolean;
}

export function prop(ctx: Ctx, key: string, fallback: string): string {
  const v = ctx.props[key];
  return v === undefined ? fallback : v;
}

export function num(ctx: Ctx, key: string, fallback: number): number {
  const v = ctx.props[key];
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function flag(ctx: Ctx, key: string): boolean {
  return ctx.props[key] === 'true';
}

export const YAW_NORTH: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };
export const YAW_SOUTH: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };
export const YAW_EAST: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 };

export function yaw(table: Record<string, number>, facing: string): number {
  return table[facing] ?? 0;
}

export interface Orientation {
  x: number;
  y: number;
}

export function orientNorthFront(facing: string): Orientation {
  if (facing === 'up') return { x: 270, y: 0 };
  if (facing === 'down') return { x: 90, y: 0 };
  return { x: 0, y: yaw(YAW_NORTH, facing) };
}

export function orientUpFront(facing: string): Orientation {
  switch (facing) {
    case 'down':
      return { x: 180, y: 0 };
    case 'north':
      return { x: 90, y: 0 };
    case 'south':
      return { x: 90, y: 180 };
    case 'east':
      return { x: 90, y: 90 };
    case 'west':
      return { x: 90, y: 270 };
    default:
      return { x: 0, y: 0 };
  }
}

export function axisOrientation(axis: string): Orientation {
  if (axis === 'x') return { x: 90, y: 90 };
  if (axis === 'z') return { x: 90, y: 0 };
  return { x: 0, y: 0 };
}
