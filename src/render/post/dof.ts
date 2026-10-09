import {
  DepthTexture,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { DofSettings } from '../../core/types';
import { percentOfHeight } from '../math/effects';
import { FX_VERTEX } from './fullscreen';
import { tileUvTransform, type TileView } from './passes';

export class DepthPass extends Pass {
  private target: WebGLRenderTarget;
  private readonly override = new MeshBasicMaterial({ colorWrite: false });
  private swapped: Array<[Mesh, Material | Material[]]> = [];
  private hidden: Object3D[] = [];

  constructor(
    private readonly scene: Scene,
    public camera: Camera,
  ) {
    super();
    this.needsSwap = false;
    this.target = DepthPass.createTarget(1, 1);
  }

  private static createTarget(width: number, height: number): WebGLRenderTarget {
    const target = new WebGLRenderTarget(width, height, { depthBuffer: true });
    target.depthTexture = new DepthTexture(width, height, UnsignedIntType);
    return target;
  }

  get depthTexture(): Texture {
    return this.target.depthTexture!;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.target.width && h === this.target.height) return;
    this.target.dispose();
    this.target = DepthPass.createTarget(w, h);
  }

  override render(renderer: WebGLRenderer): void {
    const oldAutoClear = renderer.autoClear;
    renderer.setRenderTarget(this.target);
    renderer.autoClear = false;
    renderer.clear(true, true, false);
    this.scene.traverse((obj) => {
      if (!obj.visible) return;
      if (obj.userData.excludeFromAO) {
        obj.visible = false;
        this.hidden.push(obj);
        return;
      }
      if (obj instanceof Mesh) {
        this.swapped.push([obj, obj.material]);
        obj.material = (obj.userData.aoMaterial as Material | undefined) ?? this.override;
      }
    });
    renderer.render(this.scene, this.camera);
    for (const [mesh, mat] of this.swapped) mesh.material = mat;
    for (const obj of this.hidden) obj.visible = true;
    this.swapped.length = 0;
    this.hidden.length = 0;
    renderer.autoClear = oldAutoClear;
  }

  override dispose(): void {
    this.target.dispose();
    this.override.dispose();
  }
}

export interface DofFrame {
  near: number;
  far: number;
  orthographic: boolean;
  focus: number;
}

export class DofPass extends Pass {
  readonly material = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uvTransform: { value: new Vector4(0, 0, 1, 1) },
      fullSize: { value: new Vector2(1, 1) },
      texel: { value: new Vector2(1, 1) },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 1000 },
      orthographic: { value: 0 },
      focus: { value: 10 },
      aperture: { value: 1 },
      maxBlurPx: { value: 8 },
      tilt: { value: 0 },
      samples: { value: 48 },
    },
    vertexShader: FX_VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec4 uvTransform;
      uniform vec2 fullSize;
      uniform vec2 texel;
      uniform float cameraNear;
      uniform float cameraFar;
      uniform float orthographic;
      uniform float focus;
      uniform float aperture;
      uniform float maxBlurPx;
      uniform float tilt;
      uniform int samples;
      varying vec2 vUv;
      const float GOLDEN = 2.399963229728653;
      float linearDepth( float d ) {
        if ( orthographic > 0.5 ) return cameraNear + d * ( cameraFar - cameraNear );
        float z = 2.0 * d - 1.0;
        return 2.0 * cameraNear * cameraFar / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) );
      }
      float cocAt( vec2 uv ) {
        float z = linearDepth( texture2D( tDepth, uv ).x );
        float denom = max( orthographic > 0.5 ? focus : z, 1e-3 );
        float f = min( 1.0, aperture * abs( z - focus ) / denom );
        vec2 full = uvTransform.xy + uv * uvTransform.zw;
        float band = smoothstep( 0.12, 0.95, abs( full.y - 0.5 ) * 2.0 ) * tilt;
        return max( f, band ) * maxBlurPx;
      }
      float ign( vec2 p ) {
        return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
      }
      void main() {
        vec4 center = texture2D( tDiffuse, vUv );
        float cocC = cocAt( vUv );
        if ( cocC < 0.5 ) {
          gl_FragColor = center;
          return;
        }
        vec2 full = uvTransform.xy + vUv * uvTransform.zw;
        float rot = ign( floor( full * fullSize ) ) * 6.2831853;
        vec4 sum = center;
        float wsum = 1.0;
        for ( int i = 1; i < 128; i++ ) {
          if ( i >= samples ) break;
          float t = ( float( i ) + 0.5 ) / float( samples );
          float r = sqrt( t );
          float ang = float( i ) * GOLDEN + rot;
          vec2 offPx = vec2( cos( ang ), sin( ang ) ) * r * cocC;
          vec2 uv = vUv + offPx * texel;
          float cocS = cocAt( uv );
          float dist = r * cocC;
          float reach = min( cocS, cocC );
          float w = clamp( reach - dist + 1.0, 0.0, 1.0 );
          vec4 s = texture2D( tDiffuse, uv );
          float lum = max( s.r, max( s.g, s.b ) );
          w *= 1.0 + clamp( lum - 1.0, 0.0, 6.0 ) * 0.5;
          sum += s * w;
          wsum += w;
        }
        gl_FragColor = sum / wsum;
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
  private maxBlurPercent = 0;

  constructor(private readonly depth: DepthPass) {
    super();
  }

  setParams(dof: DofSettings): void {
    const u = this.material.uniforms;
    u.aperture!.value = dof.aperture;
    u.tilt!.value = dof.tiltShift;
    u.samples!.value = 56;
    this.maxBlurPercent = dof.maxBlur;
    this.syncView();
  }

  setFrame(frame: DofFrame): void {
    const u = this.material.uniforms;
    u.cameraNear!.value = frame.near;
    u.cameraFar!.value = frame.far;
    u.orthographic!.value = frame.orthographic ? 1 : 0;
    u.focus!.value = frame.focus;
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
    (u.texel!.value as Vector2).set(1 / this.width, 1 / this.height);
    u.maxBlurPx!.value = percentOfHeight(this.maxBlurPercent, this.view?.fullHeight ?? this.height);
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
  ): void {
    this.material.uniforms.tDiffuse!.value = readBuffer.texture;
    this.material.uniforms.tDepth!.value = this.depth.depthTexture;
    renderer.setRenderTarget(writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
