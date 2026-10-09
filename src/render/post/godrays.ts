import {
  Color,
  DirectionalLight,
  HalfFloatType,
  LinearFilter,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { GodRaySettings } from '../../core/types';
import { sunFacingFade } from '../math/effects';
import { createAdditiveMaterial, FX_VERTEX } from './fullscreen';

const SUN_DISTANCE = 1000;
const MAX_SAMPLES = 128;

export class GodRaysPass extends Pass {
  external: { texture: Texture; transform: Vector4 } | null = null;
  private readonly target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  private readonly raysMaterial = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      sunUv: { value: new Vector2(0.5, 0.5) },
      aspect: { value: 1 },
      decay: { value: 0.95 },
      reach: { value: 0.8 },
      samples: { value: 64 },
      sunColor: { value: new Color(1, 1, 1) },
    },
    vertexShader: FX_VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 sunUv;
      uniform float aspect;
      uniform float decay;
      uniform float reach;
      uniform int samples;
      uniform vec3 sunColor;
      varying vec2 vUv;
      float glow( vec2 uv ) {
        vec2 d = ( uv - sunUv ) * vec2( aspect, 1.0 );
        float r = length( d ) * 4.0;
        return 1.0 / ( 1.0 + r * r ) + 0.5 * exp( -r * 0.5 );
      }
      void main() {
        vec2 toSun = sunUv - vUv;
        float len = length( toSun );
        vec2 stepv = toSun / max( len, 1e-5 ) * min( len, 1.0 ) * reach / float( samples );
        vec2 p = vUv;
        float acc = 0.0;
        for ( int i = 0; i < ${MAX_SAMPLES}; i++ ) {
          if ( i >= samples ) break;
          p += stepv;
          if ( p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 ) continue;
          float occ = 1.0 - clamp( texture2D( tDiffuse, p ).a, 0.0, 1.0 );
          float illum = pow( decay, 32.0 * float( i ) / float( samples ) );
          acc += occ * glow( p ) * illum;
        }
        acc /= float( samples );
        gl_FragColor = vec4( sunColor * acc, 1.0 );
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  private readonly applyMaterial = createAdditiveMaterial(
    `
      uniform sampler2D tRays;
      uniform vec4 uvTransform;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        vec2 uv = uvTransform.xy + vUv * uvTransform.zw;
        gl_FragColor = vec4( texture2D( tRays, uv ).rgb * strength, 0.0 );
      }
    `,
    {
      tRays: { value: null },
      uvTransform: { value: new Vector4(0, 0, 1, 1) },
      strength: { value: 0.6 },
    },
  );
  private readonly raysQuad = new FullScreenQuad(this.raysMaterial);
  private readonly applyQuad = new FullScreenQuad(this.applyMaterial);
  private readonly sunDir = new Vector3();
  private readonly scratch = new Vector3();
  private width = 1;
  private height = 1;
  private active = false;

  constructor(
    private readonly scene: Scene,
    public camera: Camera,
  ) {
    super();
    this.needsSwap = false;
  }

  get raysTexture(): Texture | null {
    return this.active ? this.target.texture : null;
  }

  setParams(rays: GodRaySettings): void {
    const u = this.raysMaterial.uniforms;
    u.decay!.value = rays.decay;
    u.reach!.value = rays.length;
    u.samples!.value = Math.min(MAX_SAMPLES, Math.max(8, Math.round(rays.samples)));
    this.applyMaterial.uniforms.strength!.value = rays.strength * 0.1;
  }

  override setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.target.setSize(
      Math.max(2, Math.ceil(this.width / 2)),
      Math.max(2, Math.ceil(this.height / 2)),
    );
  }

  private findSun(): DirectionalLight | null {
    let sun: DirectionalLight | null = null;
    this.scene.traverse((obj) => {
      if (!sun && obj instanceof DirectionalLight) sun = obj;
    });
    return sun;
  }

  private computeSun(): { uv: Vector2; color: Color } | null {
    const sun = this.findSun();
    if (!sun || sun.intensity <= 0) return null;
    this.sunDir.setFromMatrixPosition(sun.matrixWorld);
    this.scratch.setFromMatrixPosition(sun.target.matrixWorld);
    this.sunDir.sub(this.scratch).normalize();
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.scratch);
    const fade = sunFacingFade(this.scratch.dot(this.sunDir));
    if (fade <= 0) return null;
    this.scratch
      .setFromMatrixPosition(this.camera.matrixWorld)
      .addScaledVector(this.sunDir, SUN_DISTANCE);
    this.scratch.project(this.camera);
    const color = sun.color.clone();
    const peak = Math.max(color.r, color.g, color.b, 1e-4);
    color.multiplyScalar(fade / peak);
    return { uv: new Vector2(this.scratch.x * 0.5 + 0.5, this.scratch.y * 0.5 + 0.5), color };
  }

  override render(
    renderer: WebGLRenderer,
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
  ): void {
    if (this.external) {
      this.applyMaterial.uniforms.tRays!.value = this.external.texture;
      (this.applyMaterial.uniforms.uvTransform!.value as Vector4).copy(this.external.transform);
    } else {
      const sun = this.computeSun();
      this.active = sun !== null;
      if (!sun) return;
      const u = this.raysMaterial.uniforms;
      u.tDiffuse!.value = readBuffer.texture;
      (u.sunUv!.value as Vector2).copy(sun.uv);
      u.aspect!.value = this.width / this.height;
      (u.sunColor!.value as Color).copy(sun.color);
      renderer.setRenderTarget(this.target);
      this.raysQuad.render(renderer);
      this.applyMaterial.uniforms.tRays!.value = this.target.texture;
      (this.applyMaterial.uniforms.uvTransform!.value as Vector4).set(0, 0, 1, 1);
    }
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.applyQuad.render(renderer);
    renderer.autoClear = oldAutoClear;
  }

  override dispose(): void {
    this.target.dispose();
    this.raysMaterial.dispose();
    this.applyMaterial.dispose();
    this.raysQuad.dispose();
    this.applyQuad.dispose();
  }
}
