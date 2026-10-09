import {
  ACESFilmicToneMapping,
  AddEquation,
  AgXToneMapping,
  CineonToneMapping,
  Color,
  ColorManagement,
  CustomBlending,
  Data3DTexture,
  DataUtils,
  DepthTexture,
  DirectionalLight,
  FloatType,
  HalfFloatType,
  HemisphereLight,
  LinearFilter,
  LinearToneMapping,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NeutralToneMapping,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedFormat,
  ReinhardToneMapping,
  RepeatWrapping,
  ShaderMaterial,
  SRGBTransfer,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { CloudSettings, GroundType } from '../../core/types';
import { generateDetailNoise, generateShapeNoise, type CloudNoiseVolume } from '../math/cloudNoise';
import { cloudLayout, cloudSteps } from '../math/clouds';
import type { Bounds } from '../math/vec';
import type { TileView } from './passes';

export interface CloudConfig {
  settings: CloudSettings;
  bounds: Bounds | null;
  ground: GroundType;
  exportSupersample?: number;
}

const TONE_DEFINES = new Map<ToneMapping, string>([
  [LinearToneMapping, 'LINEAR_TONE_MAPPING'],
  [ReinhardToneMapping, 'REINHARD_TONE_MAPPING'],
  [CineonToneMapping, 'CINEON_TONE_MAPPING'],
  [ACESFilmicToneMapping, 'ACES_FILMIC_TONE_MAPPING'],
  [AgXToneMapping, 'AGX_TONE_MAPPING'],
  [NeutralToneMapping, 'NEUTRAL_TONE_MAPPING'],
]);

const SHAPE_SIZE = 64;
const DETAIL_SIZE = 32;
const MAX_STEPS = 160;
const MAX_LIGHT_STEPS = 8;
const LIGHT_ABSORPTION = 0.6;
const DENSITY_SHARPNESS = 3;
const SUN_GAIN = 1.9;
const AMBIENT_TOP = 5;
const AMBIENT_BOTTOM = 2;

let shapeNoise: CloudNoiseVolume | null = null;
let detailNoise: CloudNoiseVolume | null = null;

function noiseTexture(volume: CloudNoiseVolume): Data3DTexture {
  const half = new Uint16Array(volume.data.length);
  for (let i = 0; i < half.length; i++) half[i] = DataUtils.toHalfFloat(volume.data[i]!);
  const tex = new Data3DTexture(half, volume.size, volume.size, volume.size);
  tex.format = RedFormat;
  tex.type = HalfFloatType;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.wrapR = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const VERTEX = `
  void main() {
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

const MARCH_FRAGMENT = `
  precision highp sampler3D;
  uniform sampler2D tDepth;
  uniform sampler3D tShape;
  uniform sampler3D tDetail;
  uniform mat4 projInv;
  uniform mat4 viewInv;
  uniform vec2 fullSize;
  uniform float factor;
  uniform vec2 pixelOffset;
  uniform vec3 center;
  uniform float unit;
  uniform float bottom;
  uniform float top;
  uniform float mapBottom;
  uniform vec2 clearHalf;
  uniform float clearMargin;
  uniform float farRadius;
  uniform float tileSize;
  uniform vec2 wind;
  uniform float extinction;
  uniform float coverage;
  uniform int steps;
  uniform int lightSteps;
  uniform vec3 sunDir;
  uniform vec3 sunLight;
  uniform vec3 ambientTop;
  uniform vec3 ambientBottom;

  float ign( vec2 p ) {
    return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
  }

  vec3 unproject( vec2 ndc, float z ) {
    vec4 v = projInv * vec4( ndc, z, 1.0 );
    return ( viewInv * vec4( v.xyz / v.w, 1.0 ) ).xyz;
  }

  float hg( float c, float g ) {
    float g2 = g * g;
    return ( 1.0 - g2 ) / pow( max( 1e-6, 1.0 + g2 - 2.0 * g * c ), 1.5 );
  }

  float phase( float c, float k ) {
    return hg( c, 0.6 * k ) * 0.7 + hg( c, -0.25 * k ) * 0.3;
  }

  float heightProfile( float h ) {
    float b = clamp( h / 0.08, 0.0, 1.0 );
    return b * b * ( 3.0 - 2.0 * b ) * pow( 1.0 - h, 0.7 );
  }

  float cloudDensity( vec3 p, bool detailed ) {
    float h = ( p.y - bottom ) / max( top - bottom, 1e-4 );
    if ( h <= 0.0 || h >= 1.0 ) return 0.0;
    vec2 rel = p.xz - center.xz;
    float r = length( rel );
    if ( r >= farRadius ) return 0.0;
    vec3 q = vec3( p.x + wind.x, p.y, p.z + wind.y ) / tileSize;
    float base = texture( tShape, q ).r;
    float broad = texture( tShape, q * 0.23 + vec3( 0.41, 0.13, 0.77 ) ).r;
    float shape = base * mix( 0.62, 1.28, smoothstep( 0.2, 0.8, broad ) ) * heightProfile( h );
    vec2 qd = abs( rel ) - clearHalf;
    float sd = length( max( qd, 0.0 ) ) + min( max( qd.x, qd.y ), 0.0 );
    float vert = smoothstep( mapBottom - clearMargin, mapBottom + clearMargin, p.y );
    shape *= mix( 1.0, smoothstep( -clearMargin * 0.5, clearMargin * 1.5, sd ), vert );
    shape *= 1.0 - smoothstep( farRadius * 0.55, farRadius, r );
    float d = ( shape - ( 1.0 - coverage ) ) / max( coverage, 1e-3 );
    if ( d <= 0.0 ) return 0.0;
    if ( detailed ) {
      float detail = texture( tDetail, q * 4.7 ).r * 0.72 + texture( tDetail, q * 13.3 + vec3( 0.31, 0.57, 0.11 ) ).r * 0.28;
      float erode = mix( detail, 1.0 - detail, clamp( h * 1.6, 0.0, 1.0 ) ) * 0.3;
      d = ( d - erode ) / ( 1.0 - erode );
    }
    return clamp( d * ${DENSITY_SHARPNESS.toFixed(3)}, 0.0, 1.0 );
  }

  float lightDepth( vec3 p ) {
    float stepLen = ( top - bottom ) * 0.06 + unit * 0.006;
    float od = 0.0;
    float t = 0.0;
    for ( int i = 0; i < ${MAX_LIGHT_STEPS}; i++ ) {
      if ( i >= lightSteps ) break;
      float s = stepLen * ( 1.0 + float( i ) * 0.8 );
      t += s * 0.5;
      od += cloudDensity( p + sunDir * t, i < 2 ) * s;
      t += s * 0.5;
    }
    return od * extinction * ${LIGHT_ABSORPTION.toFixed(3)};
  }

  void main() {
    vec2 marchPx = floor( gl_FragCoord.xy );
    vec2 fullPx = min( marchPx * factor, fullSize - 1.0 );
    vec2 ndc = ( fullPx + 0.5 ) / fullSize * 2.0 - 1.0;
    float depth = texelFetch( tDepth, ivec2( fullPx ), 0 ).r;
    vec3 origin = unproject( ndc, -1.0 );
    vec3 dir = normalize( unproject( ndc, 0.5 ) - origin );
    float tMax = 1e30;
    if ( depth < 1.0 ) tMax = dot( unproject( ndc, depth * 2.0 - 1.0 ) - origin, dir );

    float t0 = 0.0;
    float t1 = tMax;
    if ( abs( dir.y ) < 1e-6 ) {
      if ( origin.y < bottom || origin.y > top ) t1 = -1.0;
    } else {
      float a = ( bottom - origin.y ) / dir.y;
      float b = ( top - origin.y ) / dir.y;
      t0 = max( t0, min( a, b ) );
      t1 = min( t1, max( a, b ) );
    }
    vec2 oc = origin.xz - center.xz;
    float qa = dot( dir.xz, dir.xz );
    float qc = dot( oc, oc ) - farRadius * farRadius;
    if ( qa < 1e-10 ) {
      if ( qc > 0.0 ) t1 = -1.0;
    } else {
      float qb = dot( oc, dir.xz );
      float disc = qb * qb - qa * qc;
      if ( disc < 0.0 ) {
        t1 = -1.0;
      } else {
        float sq = sqrt( disc );
        t0 = max( t0, ( -qb - sq ) / qa );
        t1 = min( t1, ( -qb + sq ) / qa );
      }
    }
    if ( t1 <= t0 ) {
      gl_FragColor = vec4( 0.0 );
      return;
    }

    float stepLen = max( ( t1 - t0 ) / float( steps ), unit * 0.003 );
    float cosT = dot( dir, sunDir );
    float p0 = phase( cosT, 1.0 );
    float p1 = phase( cosT, 0.5 );
    float p2 = phase( cosT, 0.25 );
    vec3 color = vec3( 0.0 );
    float transmittance = 1.0;
    float t = t0 + stepLen * ign( marchPx + floor( pixelOffset / factor ) );
    for ( int i = 0; i < ${MAX_STEPS}; i++ ) {
      if ( i >= steps || t > t1 ) break;
      vec3 p = origin + dir * t;
      float d = cloudDensity( p, true );
      if ( d > 0.001 ) {
        float sigma = d * extinction;
        float od = lightDepth( p );
        float h = clamp( ( p.y - bottom ) / max( top - bottom, 1e-4 ), 0.0, 1.0 );
        float direct = exp( -od ) * p0 + 0.5 * exp( -od * 0.35 ) * p1 + 0.25 * exp( -od * 0.12 ) * p2;
        float powder = 1.0 - 0.65 * exp( -od * 2.0 - sigma * unit * 0.02 );
        vec3 ambient = mix( ambientBottom, ambientTop, pow( h, 0.7 ) );
        vec3 source = sunLight * direct * powder + ambient;
        float tr = exp( -sigma * stepLen );
        color += transmittance * source * ( 1.0 - tr );
        transmittance *= tr;
        if ( transmittance < 0.008 ) break;
      }
      t += stepLen;
    }
    float alpha = 1.0 - transmittance;
    if ( transmittance < 0.008 ) {
      color /= max( alpha, 1e-4 );
      alpha = 1.0;
    }
    gl_FragColor = vec4( color, alpha );
  }
`;

const COMPOSITE_FRAGMENT = `
  #include <tonemapping_pars_fragment>
  uniform sampler2D tCloud;
  uniform sampler2D tDepth;
  uniform mat4 projInv;
  uniform vec2 fullSize;
  uniform vec2 cloudSize;
  uniform float factor;

  float viewDepth( ivec2 p ) {
    float d = texelFetch( tDepth, p, 0 ).r;
    vec2 ndc = ( vec2( p ) + 0.5 ) / fullSize * 2.0 - 1.0;
    vec4 v = projInv * vec4( ndc, d * 2.0 - 1.0, 1.0 );
    return abs( v.z / v.w );
  }

  vec4 toDisplay( vec4 c ) {
    if ( c.a <= 1e-5 ) return vec4( 0.0 );
    vec3 color = c.rgb / c.a;
    #if defined( LINEAR_TONE_MAPPING )
      color = LinearToneMapping( color );
    #elif defined( REINHARD_TONE_MAPPING )
      color = ReinhardToneMapping( color );
    #elif defined( CINEON_TONE_MAPPING )
      color = CineonToneMapping( color );
    #elif defined( ACES_FILMIC_TONE_MAPPING )
      color = ACESFilmicToneMapping( color );
    #elif defined( AGX_TONE_MAPPING )
      color = AgXToneMapping( color );
    #elif defined( NEUTRAL_TONE_MAPPING )
      color = NeutralToneMapping( color );
    #endif
    #ifdef SRGB_TRANSFER
      color = sRGBTransferOETF( vec4( color, 1.0 ) ).rgb;
    #endif
    return vec4( color * c.a, c.a );
  }

  void main() {
    ivec2 fp = ivec2( gl_FragCoord.xy );
    float z = viewDepth( fp );
    vec2 hp = vec2( fp ) / factor;
    ivec2 center = ivec2( floor( hp + 0.5 ) );
    ivec2 maxCloud = ivec2( cloudSize ) - 1;
    ivec2 maxFull = ivec2( fullSize ) - 1;
    int k = int( factor );
    vec4 sum = vec4( 0.0 );
    float wsum = 0.0;
    vec4 best = vec4( 0.0 );
    float bestDiff = 1e30;
    for ( int j = -1; j <= 1; j++ ) {
      for ( int i = -1; i <= 1; i++ ) {
        ivec2 c = clamp( center + ivec2( i, j ), ivec2( 0 ), maxCloud );
        vec4 sampleColor = texelFetch( tCloud, c, 0 );
        float diff = abs( viewDepth( min( c * k, maxFull ) ) - z ) / max( z, 1e-3 );
        vec2 d = abs( vec2( c ) - hp );
        float w = max( 0.0, 1.5 - d.x ) * max( 0.0, 1.5 - d.y ) * exp( -diff * 60.0 );
        sum += sampleColor * w;
        wsum += w;
        if ( diff < bestDiff ) {
          bestDiff = diff;
          best = sampleColor;
        }
      }
    }
    gl_FragColor = toDisplay( wsum > 1e-4 ? sum / wsum : best );
  }
`;

function linearLuminance(c: Color): number {
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
}

export class CloudPass extends Pass {
  private camera: Camera;
  private readonly depthTarget: WebGLRenderTarget;
  private readonly cloudTarget: WebGLRenderTarget;
  private readonly shape: Data3DTexture;
  private readonly detail: Data3DTexture;
  private readonly march: ShaderMaterial;
  private readonly composite: ShaderMaterial;
  private readonly marchQuad: FullScreenQuad;
  private readonly compositeQuad: FullScreenQuad;
  private readonly occluder = new MeshBasicMaterial({ colorWrite: false });
  private readonly swapped: Array<[Mesh, Material | Material[]]> = [];
  private readonly hidden: Object3D[] = [];
  private readonly cloudColor = new Color(1, 1, 1);
  private readonly shadowColor = new Color(1, 1, 1);
  private sunInfluence = 1;
  private sun: DirectionalLight | null = null;
  private hemi: HemisphereLight | null = null;
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpColor = new Color();
  private factor = 2;
  private outputKey = '';
  private readonly copy = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      void main() { gl_FragColor = texelFetch( tDiffuse, ivec2( gl_FragCoord.xy ), 0 ); }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  private readonly copyQuad = new FullScreenQuad(this.copy);
  private width = 1;
  private height = 1;

  constructor(
    private readonly scene: Scene,
    camera: Camera,
    width: number,
    height: number,
  ) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    shapeNoise ??= generateShapeNoise(SHAPE_SIZE);
    detailNoise ??= generateDetailNoise(DETAIL_SIZE);
    this.shape = noiseTexture(shapeNoise);
    this.detail = noiseTexture(detailNoise);
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.depthTarget = new WebGLRenderTarget(this.width, this.height, {
      type: UnsignedByteType,
      depthTexture: new DepthTexture(this.width, this.height, FloatType),
    });
    this.cloudTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    this.march = new ShaderMaterial({
      uniforms: {
        tDepth: { value: this.depthTarget.depthTexture },
        tShape: { value: this.shape },
        tDetail: { value: this.detail },
        projInv: { value: this.camera.projectionMatrixInverse },
        viewInv: { value: this.camera.matrixWorld },
        fullSize: { value: new Vector2(1, 1) },
        factor: { value: 2 },
        pixelOffset: { value: new Vector2() },
        center: { value: new Vector3() },
        unit: { value: 1 },
        bottom: { value: 0 },
        top: { value: 1 },
        mapBottom: { value: 0 },
        clearHalf: { value: new Vector2(1, 1) },
        clearMargin: { value: 1 },
        farRadius: { value: 1 },
        tileSize: { value: 1 },
        wind: { value: new Vector2() },
        extinction: { value: 1 },
        coverage: { value: 0.5 },
        steps: { value: 64 },
        lightSteps: { value: 5 },
        sunDir: { value: new Vector3(0, 1, 0) },
        sunLight: { value: new Vector3(1, 1, 1) },
        ambientTop: { value: new Vector3(0.5, 0.5, 0.6) },
        ambientBottom: { value: new Vector3(0.2, 0.2, 0.3) },
      },
      vertexShader: VERTEX,
      fragmentShader: MARCH_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.composite = new ShaderMaterial({
      uniforms: {
        tCloud: { value: this.cloudTarget.texture },
        tDepth: { value: this.depthTarget.depthTexture },
        projInv: { value: this.camera.projectionMatrixInverse },
        fullSize: { value: new Vector2(1, 1) },
        cloudSize: { value: new Vector2(1, 1) },
        factor: { value: 2 },
        toneMappingExposure: { value: 1 },
      },
      vertexShader: VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendEquationAlpha: AddEquation,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    this.marchQuad = new FullScreenQuad(this.march);
    this.compositeQuad = new FullScreenQuad(this.composite);
    this.setSize(this.width, this.height);
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  configure(config: CloudConfig): void {
    const s = config.settings;
    const layout = cloudLayout(config.bounds, s, config.ground);
    const steps = cloudSteps(s.quality, config.exportSupersample);
    const u = this.march.uniforms;
    (u.center!.value as Vector3).set(layout.center[0], layout.center[1], layout.center[2]);
    u.unit!.value = layout.unit;
    u.bottom!.value = layout.bottom;
    u.top!.value = layout.top;
    u.mapBottom!.value = layout.mapBottom;
    (u.clearHalf!.value as Vector2).set(layout.clearHalf[0], layout.clearHalf[1]);
    u.clearMargin!.value = layout.clearMargin;
    u.farRadius!.value = layout.farRadius;
    u.tileSize!.value = layout.tileSize;
    (u.wind!.value as Vector2).set(layout.wind[0], layout.wind[1]);
    u.extinction!.value = layout.extinction;
    u.coverage!.value = Math.min(1, Math.max(0, s.coverage));
    u.steps!.value = Math.min(MAX_STEPS, steps.steps);
    u.lightSteps!.value = Math.min(MAX_LIGHT_STEPS, steps.lightSteps);
    this.cloudColor.set(s.color);
    this.shadowColor.set(s.shadowColor);
    this.sunInfluence = Math.max(0, s.sunInfluence);
    const factor = steps.resolution >= 1 ? 1 : 2;
    if (factor !== this.factor) {
      this.factor = factor;
      this.setSize(this.width, this.height);
    }
  }

  setTileView(view: TileView | null): void {
    const offset = this.march.uniforms.pixelOffset!.value as Vector2;
    if (!view) offset.set(0, 0);
    else offset.set(view.x, view.fullHeight - view.y - view.height);
  }

  override setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.depthTarget.setSize(this.width, this.height);
    const cw = Math.max(1, Math.ceil(this.width / this.factor));
    const ch = Math.max(1, Math.ceil(this.height / this.factor));
    this.cloudTarget.setSize(cw, ch);
    (this.march.uniforms.fullSize!.value as Vector2).set(this.width, this.height);
    this.march.uniforms.factor!.value = this.factor;
    (this.composite.uniforms.fullSize!.value as Vector2).set(this.width, this.height);
    (this.composite.uniforms.cloudSize!.value as Vector2).set(cw, ch);
    this.composite.uniforms.factor!.value = this.factor;
  }

  override render(
    renderer: WebGLRenderer,
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
  ): void {
    const oldClear = new Color();
    renderer.getClearColor(oldClear);
    const oldAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    this.renderDepth(renderer);
    this.updateLighting();
    this.march.uniforms.projInv!.value = this.camera.projectionMatrixInverse;
    this.march.uniforms.viewInv!.value = this.camera.matrixWorld;
    this.composite.uniforms.projInv!.value = this.camera.projectionMatrixInverse;

    renderer.setRenderTarget(this.cloudTarget);
    this.marchQuad.render(renderer);
    this.updateOutputDefines(renderer);
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.copy.uniforms.tDiffuse!.value = readBuffer.texture;
      this.copyQuad.render(renderer);
    } else {
      renderer.setRenderTarget(readBuffer);
    }
    this.compositeQuad.render(renderer);

    renderer.autoClear = oldAutoClear;
    renderer.setClearColor(oldClear, oldAlpha);
  }

  private renderDepth(renderer: WebGLRenderer): void {
    this.sun = null;
    this.hemi = null;
    this.scene.traverse((obj) => {
      if (!obj.visible) return;
      if (obj instanceof DirectionalLight) {
        this.sun ??= obj;
        return;
      }
      if (obj instanceof HemisphereLight) {
        this.hemi ??= obj;
        return;
      }
      if (obj instanceof Mesh) {
        const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (obj.userData.excludeFromAO || !material || material.transparent) {
          obj.visible = false;
          this.hidden.push(obj);
          return;
        }
        this.swapped.push([obj, obj.material]);
        obj.material = (obj.userData.aoMaterial as Material | undefined) ?? this.occluder;
        return;
      }
      if (obj.type !== 'Scene' && obj.type !== 'Group' && obj.type !== 'Object3D') {
        obj.visible = false;
        this.hidden.push(obj);
      }
    });
    renderer.setRenderTarget(this.depthTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    for (const [mesh, material] of this.swapped) mesh.material = material;
    for (const obj of this.hidden) obj.visible = true;
    this.swapped.length = 0;
    this.hidden.length = 0;
  }

  private updateOutputDefines(renderer: WebGLRenderer): void {
    this.composite.uniforms.toneMappingExposure!.value = renderer.toneMappingExposure;
    const srgb = ColorManagement.getTransfer(renderer.outputColorSpace) === SRGBTransfer;
    const key = `${renderer.toneMapping}|${srgb ? 1 : 0}`;
    if (key === this.outputKey) return;
    this.outputKey = key;
    const defines: Record<string, string> = {};
    if (srgb) defines.SRGB_TRANSFER = '';
    const tone = TONE_DEFINES.get(renderer.toneMapping);
    if (tone) defines[tone] = '';
    this.composite.defines = defines;
    this.composite.needsUpdate = true;
  }

  private updateLighting(): void {
    const u = this.march.uniforms;
    const sunDir = u.sunDir!.value as Vector3;
    const sunLight = u.sunLight!.value as Vector3;
    const sun = this.sun;
    if (sun) {
      sun.getWorldPosition(this.tmpA);
      sun.target.getWorldPosition(this.tmpB);
      sunDir.subVectors(this.tmpA, this.tmpB);
      if (sunDir.lengthSq() < 1e-10) sunDir.set(0, 1, 0);
      sunDir.normalize();
      const k = (sun.intensity * this.sunInfluence * SUN_GAIN) / Math.PI;
      this.tmpColor.copy(sun.color).multiply(this.cloudColor);
      sunLight.set(this.tmpColor.r * k, this.tmpColor.g * k, this.tmpColor.b * k);
    } else {
      sunDir.set(0, 1, 0);
      sunLight.set(0, 0, 0);
    }
    let ambient = 0.4;
    const hemi = this.hemi;
    if (hemi) ambient = linearLuminance(hemi.color) * hemi.intensity;
    if (this.scene.environment) ambient += this.scene.environmentIntensity * 0.6;
    const level = Math.max(0.05, ambient) / Math.PI;
    const top = u.ambientTop!.value as Vector3;
    const bottom = u.ambientBottom!.value as Vector3;
    const c = this.shadowColor;
    top.set(c.r * level * AMBIENT_TOP, c.g * level * AMBIENT_TOP, c.b * level * AMBIENT_TOP);
    bottom.set(
      c.r * level * AMBIENT_BOTTOM,
      c.g * level * AMBIENT_BOTTOM,
      c.b * level * AMBIENT_BOTTOM,
    );
  }

  override dispose(): void {
    this.depthTarget.depthTexture?.dispose();
    this.depthTarget.dispose();
    this.cloudTarget.dispose();
    this.shape.dispose();
    this.detail.dispose();
    this.march.dispose();
    this.composite.dispose();
    this.marchQuad.dispose();
    this.compositeQuad.dispose();
    this.occluder.dispose();
    this.copy.dispose();
    this.copyQuad.dispose();
  }
}
