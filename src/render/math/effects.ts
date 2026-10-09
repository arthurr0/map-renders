import type {
  DofSettings,
  GlintSettings,
  GradingSettings,
  VignetteSettings,
} from '../../core/types';
import type { Vec3 } from './vec';

const LUMA: Vec3 = [0.2126, 0.7152, 0.0722];

export function luma(rgb: Vec3): number {
  return rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function whiteBalanceGain(temperature: number, tint: number): Vec3 {
  const r = 1 + 0.3 * temperature + 0.1 * tint;
  const g = 1 - 0.2 * tint;
  const b = 1 - 0.3 * temperature + 0.1 * tint;
  const k = luma([r, g, b]);
  return [r / k, g / k, b / k];
}

export function lumaNormalized(rgb: Vec3): Vec3 {
  const l = luma(rgb);
  if (l < 1e-5) return [1, 1, 1];
  return [rgb[0] / l, rgb[1] / l, rgb[2] / l];
}

export function vignetteFactor(radius: number, strength: number, softness: number): number {
  const edge0 = Math.min(0.99, Math.max(0.1, 1 - softness * 0.9));
  return 1 - strength * smoothstep(edge0, 1.1, radius);
}

export interface GradeParams {
  gain: Vec3;
  contrast: number;
  saturation: number;
  vibrance: number;
  gamma: number;
  shadowTint: Vec3;
  shadowAmount: number;
  highlightTint: Vec3;
  highlightAmount: number;
}

export function gradeParams(g: GradingSettings, shadow: Vec3, highlight: Vec3): GradeParams {
  return {
    gain: whiteBalanceGain(g.temperature, g.tint),
    contrast: g.contrast,
    saturation: g.saturation,
    vibrance: g.vibrance,
    gamma: g.gamma,
    shadowTint: lumaNormalized(shadow),
    shadowAmount: g.shadowAmount,
    highlightTint: lumaNormalized(highlight),
    highlightAmount: g.highlightAmount,
  };
}

export function gradePixel(rgb: Vec3, p: GradeParams): Vec3 {
  let c: Vec3 = [rgb[0] * p.gain[0], rgb[1] * p.gain[1], rgb[2] * p.gain[2]];
  const inv = 1 / Math.max(p.gamma, 1e-3);
  c = [
    Math.pow(Math.max(c[0], 0), inv),
    Math.pow(Math.max(c[1], 0), inv),
    Math.pow(Math.max(c[2], 0), inv),
  ];
  c = [
    (c[0] - 0.5) * p.contrast + 0.5,
    (c[1] - 0.5) * p.contrast + 0.5,
    (c[2] - 0.5) * p.contrast + 0.5,
  ];
  c = [Math.max(c[0], 0), Math.max(c[1], 0), Math.max(c[2], 0)];
  const l0 = Math.min(1, luma(c));
  const shadowW = (1 - smoothstep(0, 0.55, l0)) * p.shadowAmount;
  const highlightW = smoothstep(0.45, 1, l0) * p.highlightAmount;
  for (let i = 0; i < 3; i++) {
    const s = 1 + (p.shadowTint[i]! - 1) * shadowW;
    const h = 1 + (p.highlightTint[i]! - 1) * highlightW;
    c[i] = c[i]! * s * h;
  }
  const l = luma(c);
  const mx = Math.max(c[0], c[1], c[2]);
  const mn = Math.min(c[0], c[1], c[2]);
  const sat = p.saturation * (1 + p.vibrance * (1 - Math.min(1, mx - mn)));
  c = [l + (c[0] - l) * sat, l + (c[1] - l) * sat, l + (c[2] - l) * sat];
  return [
    Math.min(1, Math.max(0, c[0])),
    Math.min(1, Math.max(0, c[1])),
    Math.min(1, Math.max(0, c[2])),
  ];
}

export function focusDepth(cameraPosition: Vec3, forward: Vec3, point: Vec3): number {
  const dx = point[0] - cameraPosition[0];
  const dy = point[1] - cameraPosition[1];
  const dz = point[2] - cameraPosition[2];
  return Math.max(0.01, dx * forward[0] + dy * forward[1] + dz * forward[2]);
}

export function cocFraction(
  depth: number,
  focus: number,
  aperture: number,
  orthographic: boolean,
): number {
  const denom = Math.max(orthographic ? focus : depth, 1e-3);
  return Math.min(1, (aperture * Math.abs(depth - focus)) / denom);
}

export function linearDepth(d: number, near: number, far: number, orthographic: boolean): number {
  if (orthographic) return near + d * (far - near);
  const z = 2 * d - 1;
  return (2 * near * far) / (far + near - z * (far - near));
}

export function sunFacingFade(facing: number): number {
  return smoothstep(-0.05, 0.25, facing);
}

export function glintDivisor(lengthPx: number): number {
  return Math.max(2, Math.ceil(lengthPx / 96));
}

export interface FxMarginInput {
  dof: DofSettings;
  glints: GlintSettings;
  grading: GradingSettings;
  vignette: VignetteSettings;
}

export function percentOfHeight(percent: number, fullHeight: number): number {
  return (percent / 100) * fullHeight;
}

export function aberrationOffset(grading: GradingSettings): number {
  return grading.aberration * 0.01;
}

export function fxMarginPixels(fx: FxMarginInput, fullWidth: number, fullHeight: number): number {
  let margin = 0;
  if (fx.dof.enabled) margin = Math.max(margin, percentOfHeight(fx.dof.maxBlur, fullHeight));
  if (fx.glints.enabled) margin = Math.max(margin, percentOfHeight(fx.glints.length, fullHeight));
  if (fx.grading.enabled && fx.grading.aberration > 0) {
    margin = Math.max(margin, aberrationOffset(fx.grading) * 0.5 * fullWidth);
  }
  return margin > 0 ? Math.ceil(margin) + 2 : 0;
}
