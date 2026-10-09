import {
  Color,
  CustomBlending,
  HalfFloatType,
  Mesh,
  NoBlending,
  OneFactor,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
  AddEquation,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { BackgroundLayer } from '../scene/background';

const FULLSCREEN_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

export function createCopyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D( tDiffuse, vUv ); }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

export interface TileView {
  fullWidth: number;
  fullHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function tileUvTransform(view: TileView | null): Vector4 {
  if (!view) return new Vector4(0, 0, 1, 1);
  const sx = view.width / view.fullWidth;
  const sy = view.height / view.fullHeight;
  const ox = view.x / view.fullWidth;
  const oy = 1 - (view.y + view.height) / view.fullHeight;
  return new Vector4(ox, oy, sx, sy);
}

export class SceneRenderPass extends Pass {
  samples = 0;
  fov = 45;
  private msaaTarget: WebGLRenderTarget | null = null;
  private readonly copy = createCopyMaterial();
  private readonly quad = new FullScreenQuad(this.copy);
  private readonly clearColor = new Color(0, 0, 0);

  constructor(
    public scene: Scene,
    public camera: Camera,
    private readonly background: BackgroundLayer,
  ) {
    super();
    this.needsSwap = false;
  }

  setSamples(samples: number, width: number, height: number): void {
    if (samples === this.samples && (samples === 0 || this.msaaTarget)) return;
    this.samples = samples;
    this.msaaTarget?.dispose();
    this.msaaTarget = null;
    if (samples > 0) {
      this.msaaTarget = new WebGLRenderTarget(width, height, { type: HalfFloatType, samples });
    }
  }

  override setSize(width: number, height: number): void {
    this.msaaTarget?.setSize(width, height);
  }

  override render(
    renderer: WebGLRenderer,
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
  ): void {
    const target = this.msaaTarget ?? readBuffer;
    const oldAutoClear = renderer.autoClear;
    const oldClear = new Color();
    renderer.getClearColor(oldClear);
    const oldAlpha = renderer.getClearAlpha();
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(this.clearColor, 0);
    renderer.clear(true, true, true);
    if (this.background.renderHDR(renderer, this.camera, this.fov)) {
      const gl = renderer.getContext();
      gl.colorMask(false, false, false, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.colorMask(true, true, true, true);
      renderer.state.buffers.color.reset();
    }
    renderer.render(this.scene, this.camera);
    if (this.msaaTarget) {
      this.copy.uniforms.tDiffuse!.value = this.msaaTarget.texture;
      renderer.setRenderTarget(readBuffer);
      this.quad.render(renderer);
    }
    renderer.setClearColor(oldClear, oldAlpha);
    renderer.autoClear = oldAutoClear;
  }

  override dispose(): void {
    this.msaaTarget?.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}

export class CutoutGTAOPass extends GTAOPass {
  private swapped: Array<[Mesh, Material | Material[]]> = [];
  private hidden: Object3D[] = [];

  setCamera(camera: Camera): void {
    this.camera = camera;
    const persp = (camera as { isPerspectiveCamera?: boolean }).isPerspectiveCamera ? 1 : 0;
    if (this.gtaoMaterial.defines.PERSPECTIVE_CAMERA !== persp) {
      this.gtaoMaterial.defines.PERSPECTIVE_CAMERA = persp;
      this.gtaoMaterial.needsUpdate = true;
    }
  }

  _renderOverride(
    renderer: WebGLRenderer,
    overrideMaterial: Material,
    renderTarget: WebGLRenderTarget | null,
    clearColor: number,
    clearAlpha: number,
  ): void {
    const oldClear = new Color();
    renderer.getClearColor(oldClear);
    const oldAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.setRenderTarget(renderTarget);
    renderer.autoClear = false;
    renderer.setClearColor(clearColor);
    renderer.setClearAlpha(clearAlpha);
    renderer.clear();

    this.scene.traverse((obj) => {
      if (!obj.visible) return;
      if (obj.userData.excludeFromAO) {
        obj.visible = false;
        this.hidden.push(obj);
        return;
      }
      if (obj instanceof Mesh) {
        this.swapped.push([obj, obj.material]);
        obj.material = (obj.userData.aoMaterial as Material | undefined) ?? overrideMaterial;
      }
    });
    renderer.render(this.scene, this.camera);
    for (const [mesh, mat] of this.swapped) mesh.material = mat;
    for (const obj of this.hidden) obj.visible = true;
    this.swapped.length = 0;
    this.hidden.length = 0;

    renderer.autoClear = oldAutoClear;
    renderer.setClearColor(oldClear, oldAlpha);
  }
}

export class BloomEffect extends UnrealBloomPass {
  resolutionScale = 1;
  external: { texture: Texture; transform: Vector4 } | null = null;
  private readonly applyMaterial = new ShaderMaterial({
    uniforms: { tBloom: { value: null }, uvTransform: { value: new Vector4(0, 0, 1, 1) } },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: `
      uniform sampler2D tBloom;
      uniform vec4 uvTransform;
      varying vec2 vUv;
      void main() {
        vec2 uv = uvTransform.xy + vUv * uvTransform.zw;
        gl_FragColor = vec4( texture2D( tBloom, uv ).rgb, 0.0 );
      }
    `,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
  private readonly applyQuad = new FullScreenQuad(this.applyMaterial);
  private baseWidth = 1;
  private baseHeight = 1;

  constructor() {
    super(new Vector2(256, 256), 0.3, 0.4, 0.9);
    this.materialHighPassFilter.fragmentShader = `
      uniform sampler2D tDiffuse;
      uniform float luminosityThreshold;
      uniform float smoothWidth;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D( tDiffuse, vUv );
        vec3 c = min( texel.rgb, vec3( 64.0 ) );
        float v = max( c.r, max( c.g, c.b ) );
        float threshold = mix( max( luminosityThreshold, 0.25 ) * 8.0, luminosityThreshold, clamp( texel.a, 0.0, 1.0 ) );
        float knee = max( threshold * 0.5, 1e-3 );
        float soft = clamp( v - threshold + knee, 0.0, 2.0 * knee );
        soft = soft * soft / ( 4.0 * knee );
        float contrib = max( soft, v - threshold ) / max( v, 1e-4 );
        gl_FragColor = vec4( c * contrib, 1.0 );
      }
    `;
    this.materialHighPassFilter.needsUpdate = true;
    this.blendMaterial.blending = CustomBlending;
    this.blendMaterial.blendEquation = AddEquation;
    this.blendMaterial.blendSrc = OneFactor;
    this.blendMaterial.blendDst = OneFactor;
    this.blendMaterial.blendSrcAlpha = ZeroFactor;
    this.blendMaterial.blendDstAlpha = OneFactor;
  }

  get bloomTexture(): Texture {
    return this.renderTargetsHorizontal[0]!.texture;
  }

  override setSize(width: number, height: number): void {
    this.baseWidth = width;
    this.baseHeight = height;
    const s = Math.max(1e-3, this.resolutionScale);
    super.setSize(Math.max(2, Math.round(width / s)), Math.max(2, Math.round(height / s)));
  }

  setResolutionScale(scale: number): void {
    if (scale === this.resolutionScale) return;
    this.resolutionScale = scale;
    this.setSize(this.baseWidth, this.baseHeight);
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    if (!this.external) {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    this.applyMaterial.uniforms.tBloom!.value = this.external.texture;
    this.applyMaterial.uniforms.uvTransform!.value.copy(this.external.transform);
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.applyQuad.render(renderer);
    renderer.autoClear = oldAutoClear;
  }

  override dispose(): void {
    super.dispose();
    this.applyMaterial.dispose();
    this.applyQuad.dispose();
  }
}

export class BackgroundCompositePass extends Pass {
  readonly material = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      top: { value: new Color() },
      bottom: { value: new Color() },
      uvTransform: { value: new Vector4(0, 0, 1, 1) },
      opaqueOnly: { value: 0 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec4 uvTransform;
      uniform float opaqueOnly;
      varying vec2 vUv;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      void main() {
        vec4 c = texture2D( tDiffuse, vUv );
        if ( opaqueOnly > 0.5 ) {
          gl_FragColor = vec4( c.rgb, 1.0 );
          return;
        }
        float t = clamp( uvTransform.y + vUv.y * uvTransform.w, 0.0, 1.0 );
        vec3 bg = mix( bottom, top, smoothstep( 0.0, 1.0, t ) );
        bg += ( hash( gl_FragCoord.xy ) - 0.5 ) / 255.0;
        gl_FragColor = vec4( c.rgb + bg * ( 1.0 - c.a ), 1.0 );
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  private readonly quad = new FullScreenQuad(this.material);

  setOpaqueOnly(value: boolean): void {
    this.material.uniforms.opaqueOnly!.value = value ? 1 : 0;
  }

  setColors(top: Color, bottom: Color): void {
    const t = this.material.uniforms.top!.value as Color;
    const b = this.material.uniforms.bottom!.value as Color;
    t.copy(top).convertLinearToSRGB();
    b.copy(bottom).convertLinearToSRGB();
  }

  setTileView(view: TileView | null): void {
    (this.material.uniforms.uvTransform!.value as Vector4).copy(tileUvTransform(view));
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

export class DownsampleCopy {
  private readonly material = new ShaderMaterial({
    uniforms: {
      tSource: { value: null },
      offset: { value: new Vector2() },
      factor: { value: 1 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: `
      uniform sampler2D tSource;
      uniform vec2 offset;
      uniform int factor;
      void main() {
        ivec2 base = ivec2( floor( gl_FragCoord.xy ) ) * factor + ivec2( offset );
        vec4 sum = vec4( 0.0 );
        for ( int j = 0; j < 4; j++ ) {
          if ( j >= factor ) break;
          for ( int i = 0; i < 4; i++ ) {
            if ( i >= factor ) break;
            sum += texelFetch( tSource, base + ivec2( i, j ), 0 );
          }
        }
        gl_FragColor = sum / float( factor * factor );
      }
    `,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  private readonly quad = new FullScreenQuad(this.material);

  render(
    renderer: WebGLRenderer,
    source: Texture,
    target: WebGLRenderTarget,
    offsetX: number,
    offsetY: number,
    factor: number,
  ): void {
    this.material.uniforms.tSource!.value = source;
    (this.material.uniforms.offset!.value as Vector2).set(offsetX, offsetY);
    this.material.uniforms.factor!.value = factor;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
