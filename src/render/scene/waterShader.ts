import type { WebGLProgramParametersWithUniforms } from 'three';

const PARS = `
uniform vec3 uWaterShallow;
uniform vec3 uWaterDeep;
uniform float uWaterReflectivity;
uniform float uWaveHeight;
uniform float uWaveScale;
uniform float uWavePhase;
uniform float uWaterRoughness;
uniform float uGlitter;
uniform float uShore;
uniform float uWaterY;
uniform float uHasReflection;
uniform sampler2D uReflectionMap;
uniform mat4 uReflectionMatrix;
uniform float uHasDepth;
uniform sampler2D uDepthMap;
uniform vec4 uDepthRect;

float wHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * 0.1031 );
  q += dot( q, q.zyx + 31.32 );
  return fract( ( q.x + q.y ) * q.z );
}

vec3 wNoiseD( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  vec2 du = 30.0 * f * f * ( f * ( f - 2.0 ) + 1.0 );
  float a = wHash( i );
  float b = wHash( i + vec2( 1.0, 0.0 ) );
  float c = wHash( i + vec2( 0.0, 1.0 ) );
  float d = wHash( i + vec2( 1.0, 1.0 ) );
  float k1 = b - a;
  float k2 = c - a;
  float k4 = a - b - c + d;
  return vec3( a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2( k1 + k4 * u.y, k2 + k4 * u.x ) );
}

vec2 waterSlope( vec2 p, float pixel, int octaves ) {
  const mat2 rot = mat2( 0.8, -0.6, 0.6, 0.8 );
  vec2 g = vec2( 0.0 );
  float amp = 1.0;
  float freq = 1.0;
  for ( int i = 0; i < 7; i ++ ) {
    if ( i >= octaves ) break;
    float fade = 1.0 - smoothstep( 0.22, 0.55, pixel * freq );
    vec3 n = wNoiseD( p * freq );
    g += amp * fade * n.yz * freq * 0.5;
    p = rot * p;
    amp *= 0.52;
    freq *= 1.93;
  }
  return g;
}

float waterFoamNoise( vec2 p ) {
  return wNoiseD( p ).x * 0.65 + wNoiseD( p * 2.3 + 7.1 ).x * 0.35;
}

vec4 waterDepthSample( vec2 uv ) {
  vec2 inside = step( vec2( 0.0 ), uv ) * step( uv, vec2( 1.0 ) );
  return textureLod( uDepthMap, uv, 0.0 ) * ( inside.x * inside.y );
}
`;

const COLOR = `
vec3 wPos = vBlockWorld;
float wTime = uTime * 0.35 + uWavePhase;
float wScale = 0.22 * uWaveScale;
vec2 wP = wPos.xz * wScale;
vec2 wFlow = vec2( 0.7, 0.4 ) * wTime * 0.35;
float wPixel = length( fwidth( wP ) );
vec2 wWarp = ( vec2( wNoiseD( wP * 0.35 + wTime * 0.05 ).x, wNoiseD( wP * 0.35 + 17.0 ).x ) - 0.5 ) * 2.2;
vec2 wSlope = waterSlope( wP + wWarp + wFlow, wPixel, 6 ) * uWaveHeight * 0.13;
wSlope += vec2( 0.6, 0.35 ) * cos( dot( wP, vec2( 0.6, 0.35 ) ) * 1.6 + wTime * 0.8 ) * 0.025 * uWaveHeight * ( 1.0 - smoothstep( 0.1, 0.4, wPixel * 1.6 ) );

vec2 wDuv = vec2( ( wPos.x - uDepthRect.x ) / uDepthRect.z, ( uDepthRect.y + uDepthRect.w - wPos.z ) / uDepthRect.w );
vec4 wDm = waterDepthSample( wDuv ) * uHasDepth;
float wKnown = wDm.a;
float wSolid = wDm.g;
float wDepth = mix( 64.0, wDm.r, wKnown );
wDepth *= 1.0 - wSolid;
float wProx = wSolid * 0.5;
if ( uHasDepth > 0.5 && uShore > 0.0 ) {
  for ( int r = 1; r <= 3; r ++ ) {
    for ( int k = 0; k < 8; k ++ ) {
      float ang = float( k ) * 0.7853982 + float( r ) * 0.3;
      vec2 off = vec2( cos( ang ), -sin( ang ) ) * float( r ) * 0.9;
      vec4 t = waterDepthSample( wDuv + off / uDepthRect.zw );
      wProx = max( wProx, t.g * t.a * ( 1.0 - float( r - 1 ) / 3.2 ) );
    }
  }
}
float wTDepth = 1.0 - exp( -wDepth / 4.5 );
float wTDist = smoothstep( 0.0, uFootprint * 0.7 + 12.0, gRect );
float wT = clamp( mix( wTDist, wTDepth, wKnown ), 0.0, 1.0 );
vec3 wBase = mix( uWaterShallow, uWaterDeep, smoothstep( 0.0, 1.0, wT ) );
wBase *= 1.0 - 0.25 * smoothstep( 0.6, 1.0, wT );
diffuseColor.rgb = wBase;
`;

const NORMAL = `
{
  vec3 wTilt = ( viewMatrix * vec4( -wSlope.x, 0.0, -wSlope.y, 0.0 ) ).xyz;
  vec3 wViewUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  normal = normalize( normal + wTilt * smoothstep( 0.2, 0.9, dot( normal, wViewUp ) ) );
}
`;

const OUTPUT = `
{
  vec3 wV = normalize( vViewPosition );
  float wNdv = clamp( dot( normal, wV ), 0.0, 1.0 );
  float wF = clamp( uWaterReflectivity * ( 0.03 + 0.97 * pow( 1.0 - wNdv, 5.0 ) ) * 1.2, 0.0, 1.0 );
  vec3 wR = reflect( -wV, normal );
  vec3 wRw = transformDirectionByInverseViewMatrix( wR, viewMatrix );
  wRw.y = max( wRw.y, 0.03 );
  wRw = normalize( wRw );
  vec3 wSky = vec3( 0.0 );
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    wSky = textureCubeUV( envMap, envMapRotation * wRw, uWaterRoughness ).rgb;
  #endif
  vec4 wRc = uReflectionMatrix * vec4( vBlockWorld, 1.0 );
  vec2 wRuv = wRc.xy / max( abs( wRc.w ), 1e-4 ) + wSlope * 0.35;
  vec2 wIn = step( vec2( -0.12 ), wRuv ) * step( wRuv, vec2( 1.12 ) );
  wRuv = clamp( wRuv, vec2( 0.0 ), vec2( 1.0 ) );
  float wValid = wIn.x * wIn.y * uHasReflection * step( 0.0, wRc.w );
  vec4 wPl = textureLod( uReflectionMap, wRuv, uWaterRoughness * 5.5 ) * wValid;
  vec3 wRefl = wPl.rgb + wSky * ( 1.0 - wPl.a );

  vec3 wBody = totalDiffuse + totalEmissiveRadiance;
  float wLit = clamp( dot( totalDiffuse, vec3( 0.3333 ) ) / max( dot( diffuseColor.rgb, vec3( 0.3333 ) ), 1e-3 ), 0.25, 3.0 );

  float wFoamN = waterFoamNoise( wPos.xz * 1.4 + wTime * 0.2 );
  float wShallowFoam = ( 1.0 - smoothstep( 0.0, 0.9, wDepth ) ) * wKnown * ( 1.0 - wSolid );
  float wFoam = clamp( smoothstep( 0.1, 0.85, wProx ) * ( 0.45 + 0.9 * wFoamN ) + wShallowFoam * 0.6 * wFoamN, 0.0, 1.0 ) * min( uShore, 1.5 );
  float wGlow = uShore * pow( 1.0 - wT, 2.5 ) * 0.12;

  vec3 wColor = mix( wBody, wRefl, wF );
  wColor += wBase * wGlow * wLit * 2.0;
  wColor = mix( wColor, vec3( 0.88, 0.97, 1.0 ) * wLit * 0.9, clamp( wFoam, 0.0, 1.0 ) * 0.6 );
  wColor += min( reflectedLight.directSpecular, vec3( 3.0 ) ) * 0.5;

  #if NUM_DIR_LIGHTS > 0
  {
    vec3 wL = normalize( directionalLights[ 0 ].direction );
    vec2 wFineSlope = waterSlope( wP * 5.0 + wWarp * 3.0 + wFlow * 2.0, wPixel * 5.0, 3 ) * 0.55 * ( 0.4 + uWaveHeight );
    vec3 wTilt2 = ( viewMatrix * vec4( -wFineSlope.x, 0.0, -wFineSlope.y, 0.0 ) ).xyz;
    vec3 wN2 = normalize( normal + wTilt2 * 0.5 );
    vec3 wH = normalize( wL + wV );
    float wNdh = max( dot( wN2, wH ), 0.0 );
    float wSharp = mix( 3500.0, 450.0, clamp( uWaterRoughness * 2.0, 0.0, 1.0 ) );
    float wGl = pow( wNdh, wSharp ) * ( wSharp + 2.0 ) * 0.035;
    float wCullBelow = smoothstep( 0.0, 0.08, dot( normal, wL ) );
    wColor += directionalLights[ 0 ].color * wGl * uGlitter * wCullBelow * ( 1.0 - clamp( wFoam, 0.0, 1.0 ) );
  }
  #endif

  outgoingLight = min( wColor, vec3( 64.0 ) );
}
`;

export function patchWaterShader(shader: WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <logdepthbuf_pars_fragment>',
      `${PARS}\n#include <logdepthbuf_pars_fragment>`,
    )
    .replace('#include <alphamap_fragment>', `${COLOR}\n#include <alphamap_fragment>`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL}`)
    .replace('#include <opaque_fragment>', `${OUTPUT}\n#include <opaque_fragment>`);
}
