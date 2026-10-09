import {
  Color,
  DoubleSide,
  FrontSide,
  Material,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  ShaderMaterial,
  Vector2,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

export interface SharedUniforms {
  uAtlasSize: IUniform<Vector2>;
  uMaxLod: IUniform<number>;
  uEmissiveStrength: IUniform<number>;
  uTime: IUniform<number>;
  uWaveStrength: IUniform<number>;
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uAtlasSize: { value: new Vector2(1, 1) },
    uMaxLod: { value: 2 },
    uEmissiveStrength: { value: 2.2 },
    uTime: { value: 0 },
    uWaveStrength: { value: 1 },
  };
}

export interface BlockShaderOptions {
  cutout?: boolean;
  water?: boolean;
  fade?: { center: Vector2; inner: number; outer: number };
  grid?: boolean;
}

const MAP_FRAGMENT = `
#ifdef USE_MAP
  vec2 mapDx = dFdx( vMapUv );
  vec2 mapDy = dFdy( vMapUv );
  vec2 texDx = mapDx * uAtlasSize;
  vec2 texDy = mapDy * uAtlasSize;
  float mapLod = 0.5 * log2( max( max( dot( texDx, texDx ), dot( texDy, texDy ) ), 1e-8 ) );
  float lodScale = exp2( min( 0.0, uMaxLod - mapLod ) );
  vec4 sampledDiffuseColor = textureGrad( map, vMapUv, mapDx * lodScale, mapDy * lodScale );
  #ifdef BLOCK_CUTOUT
    sampledDiffuseColor.a = textureLod( map, vMapUv, 0.0 ).a;
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const GRID_FRAGMENT = `
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
    float line = max( lineMinor * 0.55 * fadeMinor, lineMajor * 0.9 );
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
    g *= 0.06 * uWaveStrength * upness;
    vec3 tilt = ( viewMatrix * vec4( -g.x, 0.0, -g.y, 0.0 ) ).xyz;
    normal = normalize( normal + tilt );
  }
#endif
`;

const FRAGMENT_ALPHA = `
#ifdef BLOCK_WATER
  {
    vec3 viewDir = normalize( vViewPosition );
    float fres = pow( 1.0 - clamp( dot( normal, viewDir ), 0.0, 1.0 ), 4.0 );
    diffuseColor.a = mix( diffuseColor.a, 1.0, fres * 0.85 );
  }
#endif
#ifdef BLOCK_FADE
  {
    float r = length( vBlockWorld.xz - uFadeCenter );
    diffuseColor.a *= 1.0 - smoothstep( uFadeInner, uFadeOuter, r );
  }
#endif
`;

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
  if (options.fade) defines.push('#define BLOCK_FADE');
  if (options.grid) defines.push('#define BLOCK_GRID');
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

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `${head}\n#include <common>\nvarying float vEmissive;\nvarying vec3 vBlockWorld;\nuniform vec2 uAtlasSize;\nuniform float uMaxLod;\nuniform float uEmissiveStrength;\nuniform float uTime;\nuniform float uWaveStrength;\nuniform vec2 uFadeCenter;\nuniform float uFadeInner;\nuniform float uFadeOuter;\nuniform vec3 uGridLineColor;`,
    )
    .replace('#include <map_fragment>', MAP_FRAGMENT)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${GRID_FRAGMENT}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${WATER_NORMAL}`)
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmissive * uEmissiveStrength;',
    )
    .replace('#include <opaque_fragment>', `${FRAGMENT_ALPHA}\n#include <opaque_fragment>`);
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
  all(): Material[];
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
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    depthWrite: true,
    side: DoubleSide,
    envMapIntensity: 1,
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
    all: () => list,
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

export function createWaterSurfaceMaterial(
  shared: SharedUniforms,
  fade: { center: Vector2; inner: number; outer: number },
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: new Color('#2b5f8c'),
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const extra = fadeUniforms(fade);
  material.onBeforeCompile = (shader) =>
    patchBlockShader(shader, shared, { water: true, fade }, extra);
  material.customProgramCacheKey = () => 'ground-water';
  material.userData.fadeUniforms = extra;
  return material;
}

export function fadeUniforms(fade: {
  center: Vector2;
  inner: number;
  outer: number;
}): Record<string, IUniform> {
  return {
    uFadeCenter: { value: fade.center.clone() },
    uFadeInner: { value: fade.inner },
    uFadeOuter: { value: fade.outer },
    uGridLineColor: { value: new Color('#6b7280') },
  };
}
