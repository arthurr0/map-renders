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

function hex(value: string): Vec3 {
  const n = parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hexStops(stops: Array<[number, string]>): Stops {
  return stops.map(([k, v]) => [k, hex(v)] as [number, Vec3]);
}

const SKY_ZENITH = hexStops([
  [-12, '#04060f'],
  [-6, '#0d1430'],
  [-2, '#1f2c5c'],
  [2, '#33508f'],
  [8, '#4470b5'],
  [18, '#4d82cf'],
  [35, '#3f7fd4'],
  [90, '#3a7ad2'],
]);

const SKY_HORIZON = hexStops([
  [-12, '#0c0e1c'],
  [-6, '#3a2c3c'],
  [-2, '#b0604a'],
  [2, '#f09058'],
  [6, '#f7b678'],
  [12, '#f2d3a8'],
  [20, '#dfe3e2'],
  [35, '#c5dbef'],
  [90, '#bcd5ee'],
]);

const SKY_HORIZON_AWAY = hexStops([
  [-12, '#090b18'],
  [-6, '#272a44'],
  [-2, '#5c5676'],
  [2, '#a28fa8'],
  [6, '#c0aab8'],
  [12, '#c3c6d6'],
  [20, '#bfd0e6'],
  [35, '#bad3ec'],
  [90, '#bcd5ee'],
]);

const SKY_GLOW = hexStops([
  [-12, '#000000'],
  [-6, '#3a1408'],
  [-2, '#c04a1c'],
  [2, '#ff8a40'],
  [8, '#ffb46a'],
  [20, '#ffe2b4'],
  [40, '#fff1da'],
  [90, '#fff6e8'],
]);

export interface SkyPalette {
  zenith: Vec3;
  horizon: Vec3;
  horizonAway: Vec3;
  glow: Vec3;
  haze: number;
}

export function skyPalette(elevationDeg: number, turbidity: number): SkyPalette {
  const haze = clamp((turbidity - 1) / 19, 0, 1);
  const zenith = sampleStops(SKY_ZENITH, elevationDeg);
  const horizon = sampleStops(SKY_HORIZON, elevationDeg);
  const horizonAway = sampleStops(SKY_HORIZON_AWAY, elevationDeg);
  const mixHaze = haze * 0.35;
  return {
    zenith: [
      lerp(zenith[0], horizonAway[0], mixHaze),
      lerp(zenith[1], horizonAway[1], mixHaze),
      lerp(zenith[2], horizonAway[2], mixHaze),
    ],
    horizon,
    horizonAway,
    glow: sampleStops(SKY_GLOW, elevationDeg),
    haze,
  };
}
