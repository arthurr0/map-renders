import { Color, SRGBColorSpace, Vector3, type IUniform } from 'three';
import type { SkySettings } from '../../core/types';
import {
  STAR_CELLS,
  moonCosRadius,
  nightVisibility,
  starProbability,
  twilightAmount,
} from '../math/night';
import { sunDirection } from '../math/sun';

export function createNightUniforms(): Record<string, IUniform> {
  return {
    uStarProb: { value: 0 },
    uStarBright: { value: 1 },
    uStarVisible: { value: 0 },
    uMoonOn: { value: 0 },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uMoonCos: { value: 0.998 },
    uMoonColor: { value: new Color() },
    uMoonGlow: { value: 1 },
    uHGlowOn: { value: 0 },
    uHGlowColor: { value: new Color() },
    uHGlowHeight: { value: 0.35 },
    uTwilight: { value: 0 },
  };
}

export interface NightContext {
  sunElevation: number;
  forceNight: boolean;
}

export function applyNightUniforms(
  u: Record<string, IUniform>,
  sky: SkySettings,
  context: NightContext,
): void {
  const visibility = context.forceNight ? 1 : nightVisibility(context.sunElevation);
  u.uStarProb!.value = sky.stars.enabled ? starProbability(sky.stars.density) : 0;
  u.uStarBright!.value = sky.stars.brightness;
  u.uStarVisible!.value = visibility;

  const moonDir = sunDirection(sky.moon.azimuth, sky.moon.elevation);
  (u.uMoonDir!.value as Vector3).set(moonDir[0], moonDir[1], moonDir[2]);
  u.uMoonOn!.value = sky.moon.enabled ? 1 : 0;
  u.uMoonCos!.value = moonCosRadius(sky.moon.size);
  (u.uMoonColor!.value as Color).set(sky.moon.color);
  u.uMoonGlow!.value = sky.moon.glow;

  const glow = sky.horizonGlow;
  u.uHGlowOn!.value = glow.enabled ? glow.intensity : 0;
  (u.uHGlowColor!.value as Color).setStyle(glow.color, SRGBColorSpace);
  u.uHGlowHeight!.value = glow.height;
  u.uTwilight!.value = glow.enabled ? twilightAmount(context.sunElevation) * glow.intensity : 0;
}

export function nightKey(sky: SkySettings): string {
  const s = sky.stars;
  const m = sky.moon;
  const g = sky.horizonGlow;
  return [
    s.enabled ? `${s.density}:${s.brightness}` : 'x',
    m.enabled ? `${m.azimuth}:${m.elevation}:${m.size}:${m.glow}:${m.color}` : 'x',
    g.enabled ? `${g.intensity}:${g.height}:${g.color}` : 'x',
  ].join('|');
}

export const SKY_NIGHT_PARS = `
uniform float uStarProb;
uniform float uStarBright;
uniform float uStarVisible;
uniform float uMoonOn;
uniform vec3 uMoonDir;
uniform float uMoonCos;
uniform vec3 uMoonColor;
uniform float uMoonGlow;
uniform float uHGlowOn;
uniform vec3 uHGlowColor;
uniform float uHGlowHeight;
uniform float uTwilight;

float nHash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}

vec3 nHash31( float h ) {
  return fract( vec3( h * 37.719, h * 91.233, h * 13.577 ) + vec3( 0.31, 0.57, 0.83 ) );
}

vec3 starField( vec3 d ) {
  vec3 p = d * ${STAR_CELLS.toFixed(1)};
  vec3 cell = floor( p );
  vec3 f = fract( p ) - 0.5;
  float px = max( length( fwidth( p ) ), 1e-4 );
  float h = nHash13( cell );
  if ( h > uStarProb ) return vec3( 0.0 );
  float k = h / max( uStarProb, 1e-6 );
  vec3 offset = ( nHash31( k * 53.0 + 0.5 ) - 0.5 ) * 0.6;
  float dist = length( f - offset );
  float size = mix( 0.045, 0.11, pow( nHash13( cell + 7.0 ), 3.0 ) );
  float radius = max( size, px * 0.8 );
  float core = 1.0 - smoothstep( radius * 0.3, radius, dist );
  float energy = ( size / radius ) * ( size / radius );
  float mag = mix( 0.25, 1.0, pow( nHash13( cell + 3.0 ), 2.0 ) );
  vec3 tint = mix( vec3( 1.0, 0.82, 0.66 ), vec3( 0.7, 0.8, 1.0 ), nHash13( cell + 11.0 ) );
  return tint * core * energy * mag;
}

vec3 moonLayer( vec3 d, float skyLuma ) {
  float cm = dot( d, uMoonDir );
  float theta = acos( clamp( cm, -1.0, 1.0 ) );
  float radius = acos( uMoonCos );
  float t = max( theta / radius, 0.0 );
  float aa = max( fwidth( cm ) * 1.5, 1e-7 );
  float disc = smoothstep( uMoonCos - aa, uMoonCos + aa, cm );
  vec3 tangent = normalize( cross( uMoonDir, vec3( 0.0, 1.0, 0.0 ) ) + vec3( 1e-5, 0.0, 0.0 ) );
  vec3 bitangent = cross( tangent, uMoonDir );
  vec2 uvm = vec2( dot( d, tangent ), dot( d, bitangent ) ) / max( sin( radius ), 1e-5 );
  float z = sqrt( max( 1.0 - dot( uvm, uvm ), 0.0 ) );
  vec3 n = normalize( vec3( uvm, z ) );
  float light = max( dot( n, normalize( vec3( -0.45, 0.3, 0.85 ) ) ), 0.0 );
  light = mix( 0.1, 1.0, smoothstep( 0.0, 0.55, light ) );
  float maria = smoothstep( -0.1, 0.4, noise( uvm * 2.2 + 3.0 ) + 0.5 * noise( uvm * 5.0 ) );
  float craters = 0.88 + 0.12 * noise( uvm * 18.0 );
  float surface = mix( 0.55, 1.0, maria ) * craters;
  float limb = mix( 0.75, 1.0, z );
  vec3 body = uMoonColor * surface * limb * light * 5.0 * disc;
  float halo = uMoonGlow * ( 0.55 * exp( -t * 0.85 ) + 0.16 * exp( -t * 0.22 ) + 0.05 * exp( -t * 0.05 ) );
  halo *= step( 0.0, cm );
  vec3 haloColor = mix( uMoonColor, vec3( 0.6, 0.72, 1.0 ), 0.35 ) * halo * 0.55;
  float dayFade = 1.0 - 0.9 * smoothstep( 0.05, 0.4, skyLuma );
  return ( body + haloColor ) * dayFade;
}

vec3 horizonLayer( vec3 d, vec3 sunDir ) {
  float h = max( d.y, 0.0 );
  vec2 flatD = d.xz / max( length( d.xz ), 1e-5 );
  vec2 flatS = sunDir.xz / max( length( sunDir.xz ), 1e-5 );
  float toward = dot( flatD, flatS ) * 0.5 + 0.5;
  vec3 result = vec3( 0.0 );
  if ( uHGlowOn > 0.0 ) {
    float band = exp( -pow( h / max( uHGlowHeight * 0.45, 1e-3 ), 0.85 ) );
    result += uHGlowColor * band * ( 0.45 + 0.55 * toward * toward ) * uHGlowOn * 0.55;
  }
  if ( uTwilight > 0.0 ) {
    float low = exp( -pow( h / 0.14, 1.1 ) );
    float belt = smoothstep( 0.02, 0.16, h ) * exp( -pow( ( h - 0.26 ) / 0.2, 2.0 ) );
    vec3 warm = vec3( 1.0, 0.42, 0.26 ) * low * ( 0.25 + 0.75 * toward * toward );
    vec3 violet = vec3( 0.5, 0.3, 0.62 ) * belt * ( 0.35 + 0.65 * ( 1.0 - toward ) );
    result += ( warm + violet ) * uTwilight * 0.3;
  }
  return result;
}
`;

export const SKY_NIGHT_BODY = `
vec3 nightExtra = vec3( 0.0 );
{
  vec3 base = texColor * skyIntensity;
  float skyLuma = dot( base, vec3( 0.3333 ) );
  if ( uStarProb > 0.0 ) {
    float vis = smoothstep( 0.0, 0.7, uStarVisible ) * smoothstep( 0.0, 0.3, rawDirection.y ) * ( 1.0 - clamp( skyLuma * 14.0, 0.0, 1.0 ) );
    nightExtra += starField( rawDirection ) * uStarBright * 9.0 * vis;
  }
  if ( uMoonOn > 0.5 ) nightExtra += moonLayer( rawDirection, skyLuma );
  nightExtra += horizonLayer( rawDirection, vSunDirection );
}
`;
