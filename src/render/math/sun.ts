import { DEG, clamp, lerp, smoothstep, type Vec3 } from './vec';

export const SUNRISE_HOUR = 6.5;
export const NOON_HOUR = 12;
export const SUNSET_HOUR = 18;
export const MAX_SUN_ELEVATION = 62;

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
  const elevation = MAX_SUN_ELEVATION * Math.cos((phase * Math.PI) / 2);
  let azimuth = (noonAzimuth + phase * 90) % 360;
  if (azimuth < 0) azimuth += 360;
  return { azimuth, elevation };
}

const TINT_STOPS: Array<[number, Vec3]> = [
  [-6, [0.45, 0.5, 0.75]],
  [0, [1.0, 0.36, 0.12]],
  [4, [1.0, 0.52, 0.26]],
  [10, [1.0, 0.72, 0.48]],
  [20, [1.0, 0.87, 0.72]],
  [35, [1.0, 0.96, 0.9]],
  [90, [1.0, 1.0, 1.0]],
];

function sampleStops(stops: Array<[number, Vec3]>, x: number): Vec3 {
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

export interface SunLook {
  color: Vec3;
  intensity: number;
  ambientColor: Vec3;
  ambientIntensity: number;
}

const AMBIENT_STOPS: Array<[number, Vec3]> = [
  [-12, [0.12, 0.16, 0.32]],
  [-3, [0.35, 0.33, 0.55]],
  [3, [0.78, 0.62, 0.62]],
  [12, [0.78, 0.84, 0.98]],
  [30, [0.8, 0.88, 1.0]],
  [90, [0.82, 0.9, 1.0]],
];

export function sunLookForElevation(elevationDeg: number): SunLook {
  const color = sampleStops(TINT_STOPS, elevationDeg);
  const intensity =
    smoothstep(-3, 8, elevationDeg) * lerp(0.75, 1, smoothstep(8, 40, elevationDeg));
  const ambientColor = sampleStops(AMBIENT_STOPS, elevationDeg);
  const ambientIntensity = lerp(0.18, 1, smoothstep(-12, 15, elevationDeg));
  return { color, intensity, ambientColor, ambientIntensity };
}
