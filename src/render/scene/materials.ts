import {
  DoubleSide,
  FrontSide,
  Material,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  ShaderChunk,
  ShaderMaterial,
  Vector2,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

export interface SharedUniforms {
  uAtlasSize: IUniform<Vector2>;
  uEmissiveStrength: IUniform<number>;
  uTime: IUniform<number>;
  uWaveStrength: IUniform<number>;
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uAtlasSize: { value: new Vector2(1, 1) },
    uEmissiveStrength: { value: 2.2 },
    uTime: { value: 0 },
    uWaveStrength: { value: 1 },
  };
}

export interface BlockShaderOptions {
  cutout?: boolean;
  water?: boolean;
  ground?: boolean;
  grid?: boolean;
  worldUv?: boolean;
}

const MAP_FRAGMENT = `
#ifdef USE_MAP
  #ifdef BLOCK_WORLD_UV
    vec4 sampledDiffuseColor = texture2D( map, vBlockWorld.xz * 0.25 );
  #else
    vec2 mapDx = dFdx( vMapUv );
    vec2 mapDy = dFdy( vMapUv );
    vec2 texDx = mapDx * uAtlasSize;
    vec2 texDy = mapDy * uAtlasSize;
    float mapLod = 0.5 * log2( max( max( dot( texDx, texDx ), dot( texDy, texDy ) ), 1e-8 ) );
    float lodScale = exp2( min( 0.0, BLOCK_MAX_LOD - mapLod ) );
    vec4 sampledDiffuseColor = textureGrad( map, vMapUv, mapDx * lodScale, mapDy * lodScale );
    #ifdef BLOCK_CUTOUT
      sampledDiffuseColor.a = textureLod( map, vMapUv, 0.0 ).a;
    #endif
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
`;

export const GROUND_TERMS = `
  vec3 gFwd = -vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
  float gCenterDepth = dot( uGroundCenter - cameraPosition, gFwd );
  float gDepth = dot( vBlockWorld - cameraPosition, gFwd );
  float gNear = max( gCenterDepth, 0.0 ) + uFootprint * 1.1 + 4.0;
  float gFar = gNear * 3.2 + 60.0;
  float gFade = 1.0 - smoothstep( gNear, gFar, gDepth );
  gFade = gFade * sqrt( gFade );
  vec2 gq = abs( vBlockWorld.xz - uGroundCenter.xz ) - uHalfSize;
  float gRect = length( max( gq, 0.0 ) ) + min( max( gq.x, gq.y ), 0.0 );
  float gContact = ( 1.0 - smoothstep( 0.0, 3.5, max( gRect, 0.0 ) ) ) * uContact;
  float gRadial = length( vBlockWorld.xz - uGroundCenter.xz );
  gShadowFade = 1.0 - smoothstep( uShadowFadeInner, uShadowFadeOuter, gRadial );
`;

const COLOR_EXTRA = `
#ifdef BLOCK_GROUND
${GROUND_TERMS}
  diffuseColor.rgb *= 1.0 - 0.4 * gContact;
#endif
#ifdef BLOCK_WATER
  diffuseColor.rgb *= vec3( 0.5, 0.74, 0.7 );
#endif
#ifdef BLOCK_GRID
  {
    vec2 gp = vBlockWorld.xz;
    vec2 fw = max( fwidth( gp ), vec2( 1e-4 ) );
    vec2 minor = abs( fract( gp - 0.5 ) - 0.5 ) / fw;
    float lineMinor = 1.0 - clamp( min( minor.x, minor.y ) - 0.25, 0.0, 1.0 );
    vec2 gp16 = gp / 16.0;
    vec2 fw16 = max( fwidth( gp16 ), vec2( 1e-5 ) );
    vec2 major = abs( fract( gp16 - 0.5 ) - 0.5 ) / fw16;
    float lineMajor = 1.0 - clamp( min( major.x, major.y ) - 0.5, 0.0, 1.0 );
    float fadeMinor = 1.0 - smoothstep( 0.15, 0.6, max( fw.x, fw.y ) );
    float fadeMajor = 1.0 - smoothstep( 0.04, 0.12, max( fw16.x, fw16.y ) );
    float line = max( lineMinor * 0.5 * fadeMinor, lineMajor * 0.8 * fadeMajor );
    diffuseColor.rgb = mix( diffuseColor.rgb, uGridLineColor, line );
  }
#endif
`;

const WATER_NORMAL = `
#ifdef BLOCK_WATER
  {
    vec3 viewUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float upness = smoothstep( 0.6, 0.95, dot( normal, viewUp ) );
    vec2 p = vBlockWorld.xz;
    float t = uTime;
    float fw = length( fwidth( p ) );
    vec2 g = vec2( 0.0 );
    g += vec2( 0.9, 0.4 ) * cos( dot( p, vec2( 0.9, 0.4 ) ) * 1.7 + t * 1.3 ) * 0.5 * ( 1.0 - smoothstep( 0.15, 0.5, fw * 1.7 ) );
    g += vec2( -0.3, 1.0 ) * cos( dot( p, vec2( -0.3, 1.0 ) ) * 2.9 + t * 1.9 ) * 0.28 * ( 1.0 - smoothstep( 0.15, 0.5, fw * 2.9 ) );
    g += vec2( 0.7, -0.8 ) * cos( dot( p, vec2( 0.7, -0.8 ) ) * 5.3 + t * 2.7 ) * 0.14 * ( 1.0 - smoothstep( 0.15, 0.5, fw * 5.3 ) );
    g += vec2( -0.95, -0.2 ) * cos( dot( p, vec2( -0.95, -0.2 ) ) * 9.1 + t * 3.4 ) * 0.07 * ( 1.0 - smoothstep( 0.15, 0.5, fw * 9.1 ) );
    g *= 0.05 * uWaveStrength * upness;
    vec3 tilt = ( viewMatrix * vec4( -g.x, 0.0, -g.y, 0.0 ) ).xyz;
    normal = normalize( normal + tilt );
  }
#endif
`;

const FRAGMENT_ALPHA = `
#ifdef BLOCK_WATER
  {
    vec3 viewDir = normalize( vViewPosition );
    float fres = pow( 1.0 - clamp( dot( normal, viewDir ), 0.0, 1.0 ), 5.0 );
    diffuseColor.a = mix( diffuseColor.a, 1.0, fres * 0.45 );
    outgoingLight = min( outgoingLight, vec3( 4.0 ) );
  }
#endif
#ifdef BLOCK_GROUND
  diffuseColor.a *= gFade;
#endif
`;

const FRAGMENT_HEAD = `
varying float vEmissive;
varying vec3 vBlockWorld;
uniform vec2 uAtlasSize;
uniform float uEmissiveStrength;
uniform float uTime;
uniform float uWaveStrength;
uniform vec3 uGroundCenter;
uniform vec2 uHalfSize;
uniform float uFootprint;
uniform float uShadowFadeInner;
uniform float uShadowFadeOuter;
uniform float uContact;
uniform vec3 uGridLineColor;
const float BLOCK_MAX_LOD = 2.0;
float gShadowFade = 1.0;
`;

const SHADOWED_LIGHTS = ShaderChunk.lights_fragment_begin
  .split('getShadow(')
  .join('( 1.0 - gShadowFade ) + gShadowFade * getShadow(');

export function patchBlockShader(
  shader: WebGLProgramParametersWithUniforms,
  shared: SharedUniforms,
  options: BlockShaderOptions,
  extraUniforms: Record<string, IUniform> = {},
): void {
  Object.assign(shader.uniforms, shared, extraUniforms);
  const defines: string[] = [];
  if (options.cutout) defines.push('#define BLOCK_CUTOUT');
  if (options.water) defines.push('#define BLOCK_WATER');
  if (options.ground) defines.push('#define BLOCK_GROUND');
  if (options.grid) defines.push('#define BLOCK_GRID');
  if (options.worldUv) defines.push('#define BLOCK_WORLD_UV');
  const head = defines.join('\n');

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `${head}\n#include <common>\nattribute float aEmissive;\nvarying float vEmissive;\nvarying vec3 vBlockWorld;`,
    )
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvEmissive = aEmissive;\nvBlockWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
    );

  let fragment = shader.fragmentShader
    .replace('#include <common>', `${head}\n#include <common>\n${FRAGMENT_HEAD}`)
    .replace('#include <map_fragment>', MAP_FRAGMENT)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR_EXTRA}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${WATER_NORMAL}`)
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmissive * uEmissiveStrength;',
    )
    .replace('#include <opaque_fragment>', `${FRAGMENT_ALPHA}\n#include <opaque_fragment>`);
  if (options.ground) {
    fragment = fragment.replace('#include <lights_fragment_begin>', SHADOWED_LIGHTS);
  }
  shader.fragmentShader = fragment;
}

function attachPatch(
  material: MeshStandardMaterial,
  shared: SharedUniforms,
  options: BlockShaderOptions,
  key: string,
  extraUniforms: Record<string, IUniform> = {},
): void {
  material.onBeforeCompile = (shader) => patchBlockShader(shader, shared, options, extraUniforms);
  material.customProgramCacheKey = () => `block-${key}`;
}

export interface BlockMaterials {
  opaque: MeshStandardMaterial;
  cutout: MeshStandardMaterial;
  translucent: MeshStandardMaterial;
  water: MeshStandardMaterial;
  cutoutDepth: MeshDepthMaterial;
  cutoutNormal: ShaderMaterial;
  dispose(): void;
}

export function createBlockMaterials(
  atlas: Texture | null,
  shared: SharedUniforms,
): BlockMaterials {
  const opaque = new MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    side: FrontSide,
  });
  attachPatch(opaque, shared, {}, `opaque-${atlas ? 'tex' : 'flat'}`);

  const cutout = new MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: DoubleSide,
    alphaTest: atlas ? 0.5 : 0,
    shadowSide: DoubleSide,
  });
  attachPatch(cutout, shared, { cutout: !!atlas }, `cutout-${atlas ? 'tex' : 'flat'}`);

  const translucent = new MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    opacity: atlas ? 1 : 0.55,
    side: DoubleSide,
  });
  attachPatch(translucent, shared, {}, `translucent-${atlas ? 'tex' : 'flat'}`);

  const water = new MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.8,
    depthWrite: true,
    side: DoubleSide,
    envMapIntensity: 0.55,
  });
  attachPatch(water, shared, { water: true }, `water-${atlas ? 'tex' : 'flat'}`);

  const cutoutDepth = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    map: atlas,
    alphaTest: atlas ? 0.5 : 0,
    side: DoubleSide,
  });

  const cutoutNormal = createAlphaTestNormalMaterial(atlas);

  const list: Material[] = [opaque, cutout, translucent, water, cutoutDepth, cutoutNormal];
  return {
    opaque,
    cutout,
    translucent,
    water,
    cutoutDepth,
    cutoutNormal,
    dispose: () => {
      for (const m of list) m.dispose();
    },
  };
}

export function createAlphaTestNormalMaterial(map: Texture | null): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { map: { value: map } },
    defines: map ? { USE_ALPHA_MAP_TEST: '' } : {},
    side: DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        vUv = uv;
        vNormalView = normalize( normalMatrix * normal );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        #ifdef USE_ALPHA_MAP_TEST
          if ( texture2D( map, vUv ).a < 0.5 ) discard;
        #endif
        vec3 n = normalize( vNormalView );
        if ( !gl_FrontFacing ) n = -n;
        gl_FragColor = vec4( n * 0.5 + 0.5, 1.0 );
      }
    `,
  });
}
