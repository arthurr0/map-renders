import type { TintKind, Vec3 } from './types';

export function hexToRgb(hex: string): Vec3 {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const TINT_HEX = {
  grass: '#79c05a',
  foliage: '#59ae30',
  water: '#3f76e4',
  spruce: '#619961',
  birch: '#80a755',
  mangrove: '#92c648',
  lilyPad: '#208030',
} as const;

export const TINT_RGB = {
  grass: hexToRgb(TINT_HEX.grass),
  foliage: hexToRgb(TINT_HEX.foliage),
  water: hexToRgb(TINT_HEX.water),
  spruce: hexToRgb(TINT_HEX.spruce),
  birch: hexToRgb(TINT_HEX.birch),
  mangrove: hexToRgb(TINT_HEX.mangrove),
  lilyPad: hexToRgb(TINT_HEX.lilyPad),
};

const WHITE: Vec3 = [1, 1, 1];

export function redstoneColor(power: number): Vec3 {
  const f = Math.max(0, Math.min(15, power)) / 15;
  const r = f * 0.6 + (f > 0 ? 0.4 : 0.3);
  const g = Math.max(0, Math.min(1, f * f * 0.7 - 0.5));
  const b = Math.max(0, Math.min(1, f * f * 0.6 - 0.7));
  return [r, g, b];
}

export function stemColor(age: number): Vec3 {
  const a = Math.max(0, Math.min(7, age));
  return [(a * 32) / 255, (255 - a * 8) / 255, (a * 4) / 255];
}

export function tintColor(kind: TintKind | undefined, power = 0): Vec3 {
  switch (kind) {
    case 'grass':
      return TINT_RGB.grass;
    case 'foliage':
      return TINT_RGB.foliage;
    case 'water':
      return TINT_RGB.water;
    case 'redstone':
      return redstoneColor(power);
    default:
      return WHITE;
  }
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
