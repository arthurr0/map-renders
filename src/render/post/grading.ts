import {
  Color,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { GradingSettings, VignetteSettings } from '../../core/types';
import { aberrationOffset, gradeParams } from '../math/effects';
import type { Vec3 } from '../math/vec';
import { FX_VERTEX } from './fullscreen';
import { tileUvTransform, type TileView } from './passes';

function displayColor(hex: string): Vec3 {
  const c = new Color(hex).convertLinearToSRGB();
  return [c.r, c.g, c.b];
}

export class GradingPass extends Pass {
  readonly material = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uvTransform: { value: new Vector4(0, 0, 1, 1) },
      fullSize: { value: new Vector2(1, 1) },
      gain: { value: new Vector3(1, 1, 1) },
      contrast: { value: 1 },
      saturation: { value: 1 },
      vibrance: { value: 0 },
      gammaInv: { value: 1 },
      shadowTint: { value: new Vector3(1, 1, 1) },
      shadowAmount: { value: 0 },
      highlightTint: { value: new Vector3(1, 1, 1) },
      highlightAmount: { value: 0 },
      grain: { value: 0 },
      aberration: { value: 0 },
      vignetteStrength: { value: 0 },
      vignetteSoftness: { value: 0.6 },
    },
    vertexShader: FX_VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec4 uvTransform;
      uniform vec2 fullSize;
      uniform vec3 gain;
      uniform float contrast;
      uniform float saturation;
      uniform float vibrance;
      uniform float gammaInv;
      uniform vec3 shadowTint;
      uniform float shadowAmount;
      uniform vec3 highlightTint;
      uniform float highlightAmount;
      uniform float grain;
      uniform float aberration;
      uniform float vignetteStrength;
      uniform float vignetteSoftness;
      varying vec2 vUv;
      const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
      float hash( vec2 p ) {
        vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
        p3 += dot( p3, p3.yzx + 33.33 );
        return fract( ( p3.x + p3.y ) * p3.z );
      }
      void main() {
        vec2 full = uvTransform.xy + vUv * uvTransform.zw;
        vec2 centered = full - 0.5;
        vec4 src = texture2D( tDiffuse, vUv );
        if ( aberration > 0.0 ) {
          vec2 shift = centered * aberration / uvTransform.zw;
          src.r = texture2D( tDiffuse, vUv + shift ).r;
          src.b = texture2D( tDiffuse, vUv - shift ).b;
        }
        float a = src.a;
        vec3 c = a > 1e-4 ? src.rgb / a : src.rgb;
        c *= gain;
        c = pow( max( c, vec3( 0.0 ) ), vec3( gammaInv ) );
        c = max( ( c - 0.5 ) * contrast + 0.5, vec3( 0.0 ) );
        float l0 = min( 1.0, dot( c, LUMA ) );
        float shadowW = ( 1.0 - smoothstep( 0.0, 0.55, l0 ) ) * shadowAmount;
        float highlightW = smoothstep( 0.45, 1.0, l0 ) * highlightAmount;
        c *= mix( vec3( 1.0 ), shadowTint, shadowW );
        c *= mix( vec3( 1.0 ), highlightTint, highlightW );
        float l = dot( c, LUMA );
        float chroma = max( c.r, max( c.g, c.b ) ) - min( c.r, min( c.g, c.b ) );
        float sat = saturation * ( 1.0 + vibrance * ( 1.0 - min( 1.0, chroma ) ) );
        c = vec3( l ) + ( c - vec3( l ) ) * sat;
        c = clamp( c, 0.0, 1.0 );
        if ( grain > 0.0 ) {
          float n = hash( floor( full * fullSize ) ) - 0.5;
          c += n * grain * 0.12 * ( 1.0 - 0.5 * dot( c, LUMA ) );
        }
        if ( vignetteStrength > 0.0 ) {
          vec2 p = centered * vec2( fullSize.x / fullSize.y, 1.0 );
          float r = length( p ) / length( vec2( 0.5 * fullSize.x / fullSize.y, 0.5 ) );
          float edge0 = clamp( 1.0 - vignetteSoftness * 0.9, 0.1, 0.99 );
          c *= 1.0 - vignetteStrength * smoothstep( edge0, 1.1, r );
        }
        c = clamp( c, 0.0, 1.0 );
        gl_FragColor = vec4( c * a, a );
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  private readonly quad = new FullScreenQuad(this.material);
  private width = 1;
  private height = 1;
  private view: TileView | null = null;

  setParams(grading: GradingSettings, vignette: VignetteSettings): void {
    const u = this.material.uniforms;
    const active = grading.enabled;
    const neutral = {
      ...grading,
      contrast: 1,
      saturation: 1,
      vibrance: 0,
      temperature: 0,
      tint: 0,
      gamma: 1,
    };
    const params = gradeParams(
      active ? grading : neutral,
      displayColor(grading.shadowColor),
      displayColor(grading.highlightColor),
    );
    (u.gain!.value as Vector3).set(...params.gain);
    u.contrast!.value = params.contrast;
    u.saturation!.value = params.saturation;
    u.vibrance!.value = params.vibrance;
    u.gammaInv!.value = 1 / Math.max(params.gamma, 1e-3);
    (u.shadowTint!.value as Vector3).set(...params.shadowTint);
    u.shadowAmount!.value = active ? params.shadowAmount : 0;
    (u.highlightTint!.value as Vector3).set(...params.highlightTint);
    u.highlightAmount!.value = active ? params.highlightAmount : 0;
    u.grain!.value = active ? grading.grain : 0;
    u.aberration!.value = active ? aberrationOffset(grading) : 0;
    u.vignetteStrength!.value = vignette.enabled ? vignette.strength : 0;
    u.vignetteSoftness!.value = vignette.softness;
  }

  setTileView(view: TileView | null): void {
    this.view = view;
    this.syncView();
  }

  override setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.syncView();
  }

  private syncView(): void {
    const u = this.material.uniforms;
    (u.uvTransform!.value as Vector4).copy(tileUvTransform(this.view));
    (u.fullSize!.value as Vector2).set(
      this.view?.fullWidth ?? this.width,
      this.view?.fullHeight ?? this.height,
    );
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
  ): void {
    this.material.uniforms.tDiffuse!.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
