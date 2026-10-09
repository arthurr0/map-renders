import { DEG, clamp, lerp, smoothstep, type Vec3 } from './vec';

export const SUNRISE_HOUR = 6.5;
export const NOON_HOUR = 12;
export const SUNSET_HOUR = 18;
export const MAX_SUN_ELEVATION = 64;
export const HORIZON_ELEVATION = 4;

export interface SunAngles {
  azimuth: number;
  elevation: number;
}

export function sunDirection(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  const c = Math.cos(el);
  return [Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c];
}

export function directionToSunAngles(dir: Vec3): SunAngles {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const y = clamp(dir[1] / len, -1, 1);
  const elevation = Math.asin(y) / DEG;
  let azimuth = Math.atan2(dir[0], -dir[2]) / DEG;
  if (azimuth < 0) azimuth += 360;
  return { azimuth, elevation };
}

export function normalizeHours(hours: number): number {
  const h = hours % 24;
  return h < 0 ? h + 24 : h;
}

export function timeOfDayToSun(hours: number, noonAzimuth = 180): SunAngles {
  const h = normalizeHours(hours);
  const morningSpan = NOON_HOUR - SUNRISE_HOUR;
  const afternoonSpan = SUNSET_HOUR - NOON_HOUR;
  let phase: number;
  if (h <= NOON_HOUR) {
    phase = (h - NOON_HOUR) / morningSpan;
  } else {
    phase = (h - NOON_HOUR) / afternoonSpan;
  }
  const nightHours = 24 - (SUNSET_HOUR - SUNRISE_HOUR);
  if (h < SUNRISE_HOUR) {
    phase = -1 - (SUNRISE_HOUR - h) / (nightHours / 2);
  } else if (h > SUNSET_HOUR) {
    phase = 1 + (h - SUNSET_HOUR) / (nightHours / 2);
  }
  const span = MAX_SUN_ELEVATION - HORIZON_ELEVATION;
  const elevation = span * Math.cos((phase * Math.PI) / 2) + HORIZON_ELEVATION;
  let azimuth = (noonAzimuth + phase * 90) % 360;
  if (azimuth < 0) azimuth += 360;
  return { azimuth, elevation };
}

type Stops = Array<[number, Vec3]>;

function sampleStops(stops: Stops, x: number): Vec3 {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (x <= first[0]) return [...first[1]];
  if (x >= last[0]) return [...last[1]];
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]!;
    if (x <= b[0]) {
      const a = stops[i - 1]!;
      const t = (x - a[0]) / (b[0] - a[0]);
      return [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t)];
    }
  }
  return [...last[1]];
}

function sampleScalar(stops: Array<[number, number]>, x: number): number {
  const v = sampleStops(
    stops.map(([k, s]) => [k, [s, s, s]] as [number, Vec3]),
    x,
  );
  return v[0];
}

const SUN_COLOR: Stops = [
  [-6, [1.0, 0.4, 0.18]],
  [0, [1.0, 0.46, 0.2]],
  [4, [1.0, 0.56, 0.3]],
  [8, [1.0, 0.66, 0.42]],
  [15, [1.0, 0.8, 0.6]],
  [25, [1.0, 0.9, 0.78]],
  [40, [1.0, 0.97, 0.92]],
  [90, [1.0, 1.0, 1.0]],
];

const AMBIENT_COLOR: Stops = [
  [-20, [0.26, 0.33, 0.62]],
  [-10, [0.36, 0.42, 0.72]],
  [-4, [0.72, 0.56, 0.68]],
  [3, [1.0, 0.74, 0.58]],
  [10, [0.9, 0.84, 0.86]],
  [25, [0.8, 0.88, 1.0]],
  [90, [0.8, 0.88, 1.0]],
];

const AMBIENT_INTENSITY: Array<[number, number]> = [
  [-20, 0.45],
  [-10, 0.55],
  [-4, 0.75],
  [3, 0.8],
  [15, 1],
  [90, 1],
];

export interface SunLook {
  color: Vec3;
  intensity: number;
  lightElevation: number;
  moon: number;
  ambientColor: Vec3;
  ambientIntensity: number;
}

export function sunLookForElevation(elevationDeg: number): SunLook {
  const color = sampleStops(SUN_COLOR, elevationDeg);
  const intensity =
    elevationDeg >= 2
      ? lerp(0.82, 1, smoothstep(6, 40, elevationDeg))
      : 0.82 * smoothstep(-8, 2, elevationDeg);
  const moon = smoothstep(-6, -14, elevationDeg);
  return {
    color,
    intensity,
    lightElevation: Math.max(2, elevationDeg),
    moon,
    ambientColor: sampleStops(AMBIENT_COLOR, elevationDeg),
    ambientIntensity: sampleScalar(AMBIENT_INTENSITY, elevationDeg),
  };
}
