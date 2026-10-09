import {
  HalfFloatType,
  LinearFilter,
  NoBlending,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { GlintSettings } from '../../core/types';
import { glintDivisor, percentOfHeight } from '../math/effects';
import { createAdditiveMaterial, FX_VERTEX } from './fullscreen';
import type { TileView } from './passes';

const STREAK_SAMPLES = 40;

function createTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
}

export class GlintPass extends Pass {
  private readonly bright = createTarget();
  private readonly star = createTarget();
  private readonly brightMaterial = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      texel: { value: new Vector2(1, 1) },
      divisor: { value: 2 },
      threshold: { value: 3 },
    },
    vertexShader: FX_VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 texel;
      uniform float divisor;
      uniform float threshold;
      varying vec2 vUv;
      void main() {
        vec3 sum = vec3( 0.0 );
        for ( int j = 0; j < 4; j++ ) {
          for ( int i = 0; i < 4; i++ ) {
            vec2 o = ( vec2( float( i ), float( j ) ) + 0.5 ) / 4.0 - 0.5;
            vec3 c = min( texture2D( tDiffuse, vUv + o * divisor * texel ).rgb, vec3( 64.0 ) );
            float v = max( c.r, max( c.g, c.b ) );
            float k = max( v - threshold, 0.0 ) / max( v, 1e-4 );
            sum += c * k;
          }
        }
        gl_FragColor = vec4( sum / 16.0, 1.0 );
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  private readonly starMaterial = new ShaderMaterial({
    uniforms: {
      tBright: { value: null },
      texel: { value: new Vector2(1, 1) },
      stepPx: { value: 1 },
    },
    vertexShader: FX_VERTEX,
    fragmentShader: `
      uniform sampler2D tBright;
      uniform vec2 texel;
      uniform float stepPx;
      varying vec2 vUv;
      const int N = ${STREAK_SAMPLES};
      void main() {
        vec3 sum = vec3( 0.0 );
        for ( int d = 0; d < 4; d++ ) {
          float a = float( d ) * 0.7853981634;
          vec2 dir = vec2( cos( a ), sin( a ) ) * stepPx * texel;
          for ( int k = 1; k <= N; k++ ) {
            float f = float( k ) / float( N );
            float w = ( 1.0 - f ) * ( 1.0 - f );
            vec2 o = dir * float( k );
            sum += ( texture2D( tBright, vUv + o ).rgb + texture2D( tBright, vUv - o ).rgb ) * w;
          }
        }
        gl_FragColor = vec4( sum * 0.5, 1.0 );
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  private readonly applyMaterial = createAdditiveMaterial(
    `
      uniform sampler2D tStar;
      uniform float strength;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4( texture2D( tStar, vUv ).rgb * strength, 0.0 ); }
    `,
    { tStar: { value: null }, strength: { value: 0.6 } },
  );
  private readonly brightQuad = new FullScreenQuad(this.brightMaterial);
  private readonly starQuad = new FullScreenQuad(this.starMaterial);
  private readonly applyQuad = new FullScreenQuad(this.applyMaterial);
  private width = 1;
  private height = 1;
  private view: TileView | null = null;
  private lengthPercent = 3;

  constructor() {
    super();
    this.needsSwap = false;
  }

  setParams(glints: GlintSettings): void {
    this.brightMaterial.uniforms.threshold!.value = glints.threshold;
    this.applyMaterial.uniforms.strength!.value = glints.strength * 0.5;
    this.lengthPercent = glints.length;
  }

  setTileView(view: TileView | null): void {
    this.view = view;
  }

  override setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
  }

  override render(
    renderer: WebGLRenderer,
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
  ): void {
    const lengthPx = percentOfHeight(this.lengthPercent, this.view?.fullHeight ?? this.height);
    const divisor = glintDivisor(lengthPx);
    const tw = Math.max(2, Math.ceil(this.width / divisor));
    const th = Math.max(2, Math.ceil(this.height / divisor));
    if (this.bright.width !== tw || this.bright.height !== th) {
      this.bright.setSize(tw, th);
      this.star.setSize(tw, th);
    }
    const bu = this.brightMaterial.uniforms;
    bu.tDiffuse!.value = readBuffer.texture;
    (bu.texel!.value as Vector2).set(1 / this.width, 1 / this.height);
    bu.divisor!.value = divisor;
    renderer.setRenderTarget(this.bright);
    this.brightQuad.render(renderer);

    const su = this.starMaterial.uniforms;
    su.tBright!.value = this.bright.texture;
    (su.texel!.value as Vector2).set(1 / tw, 1 / th);
    su.stepPx!.value = Math.max(0.5, lengthPx / divisor / STREAK_SAMPLES);
    renderer.setRenderTarget(this.star);
    this.starQuad.render(renderer);

    this.applyMaterial.uniforms.tStar!.value = this.star.texture;
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.applyQuad.render(renderer);
    renderer.autoClear = oldAutoClear;
  }

  override dispose(): void {
    this.bright.dispose();
    this.star.dispose();
    this.brightMaterial.dispose();
    this.starMaterial.dispose();
    this.applyMaterial.dispose();
    this.brightQuad.dispose();
    this.starQuad.dispose();
    this.applyQuad.dispose();
  }
}
