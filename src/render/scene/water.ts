import {
  Color,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type IUniform,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { WaterSettings } from '../../core/types';
import {
  WATER_FAR_DEPTH,
  WATER_FOAM_BAND,
  depthMapLayout,
  reflectionTargetSize,
  waterSurfaceY,
} from '../math/water';
import type { Bounds } from '../math/vec';

const DEPTH_VERTEX = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DEPTH_FRAGMENT = `
  uniform float uWaterY;
  uniform float uClipY;
  varying vec3 vWorld;
  void main() {
    if ( vWorld.y > uClipY ) discard;
    float solid = gl_FrontFacing ? 0.0 : 1.0;
    gl_FragColor = vec4( max( uWaterY - vWorld.y, 0.0 ), solid, 0.0, 1.0 );
  }
`;

function createDepthMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uWaterY: { value: 0 }, uClipY: { value: 0 } },
    vertexShader: DEPTH_VERTEX,
    fragmentShader: DEPTH_FRAGMENT,
    side: DoubleSide,
    transparent: false,
  });
}

export class WaterSurface {
  readonly uniforms: Record<string, IUniform> = {
    uWaterShallow: { value: new Color('#38bdc8') },
    uWaterDeep: { value: new Color('#0a3a6b') },
    uWaterReflectivity: { value: 0.6 },
    uWaveHeight: { value: 0.5 },
    uWaveScale: { value: 1 },
    uWavePhase: { value: 0 },
    uWaterRoughness: { value: 0.08 },
    uGlitter: { value: 1 },
    uShore: { value: 0.6 },
    uWaterY: { value: 0 },
    uHasReflection: { value: 0 },
    uReflectionMap: { value: null },
    uReflectionMatrix: { value: new Matrix4() },
    uHasDepth: { value: 0 },
    uDepthMap: { value: null },
    uDepthRect: { value: new Vector4(0, 0, 1, 1) },
  };

  private settings: WaterSettings | null = null;
  private bounds: Bounds | null = null;
  private reflectionTarget: WebGLRenderTarget | null = null;
  private depthTarget: WebGLRenderTarget | null = null;
  private depthMaterial: ShaderMaterial | null = null;
  private depthDirty = true;
  private depthKey = '';
  private virtualCamera: PerspectiveCamera | OrthographicCamera | null = null;
  private busy = false;
  private readonly textureMatrix = new Matrix4();
  private readonly clipPlane = new Plane(new Vector3(0, 1, 0), 0);

  get surfaceY(): number {
    return this.uniforms.uWaterY!.value as number;
  }

  configure(settings: WaterSettings, bounds: Bounds | null): void {
    this.settings = settings;
    this.bounds = bounds;
    const u = this.uniforms;
    (u.uWaterShallow!.value as Color).set(settings.colorShallow);
    (u.uWaterDeep!.value as Color).set(settings.colorDeep);
    u.uWaterReflectivity!.value = settings.reflectivity;
    u.uWaveHeight!.value = settings.waveHeight;
    u.uWaveScale!.value = settings.waveScale;
    u.uWavePhase!.value = settings.wavePhase;
    u.uWaterRoughness!.value = settings.roughness;
    u.uGlitter!.value = settings.sunGlitter;
    u.uShore!.value = settings.shoreGlow;
    const baseY = bounds ? bounds.min[1] : 0;
    u.uWaterY!.value = waterSurfaceY(baseY, settings.level);
  }

  invalidateDepth(): void {
    this.depthDirty = true;
  }

  beforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    mesh: Mesh,
    used: Material,
    own: Material,
  ): void {
    if (this.busy || scene.overrideMaterial || used !== own || !this.settings) return;
    this.busy = true;
    try {
      this.updateDepthMap(renderer, scene, mesh);
      this.updateReflection(renderer, scene, camera, mesh);
    } finally {
      this.busy = false;
    }
  }

  private updateDepthMap(renderer: WebGLRenderer, scene: Scene, self: Object3D): void {
    const bounds = this.bounds;
    const u = this.uniforms;
    if (!bounds || !this.settings || this.settings.shoreGlow <= 0) {
      u.uHasDepth!.value = 0;
      return;
    }
    const waterY = this.surfaceY;
    const layout = depthMapLayout(bounds, Math.min(2048, renderer.capabilities.maxTextureSize));
    const key = `${waterY}|${bounds.min.join(',')}|${bounds.max.join(',')}|${layout.width}x${layout.height}`;
    if (!this.depthDirty && key === this.depthKey && this.depthTarget) {
      u.uHasDepth!.value = 1;
      return;
    }
    if (
      !this.depthTarget ||
      this.depthTarget.width !== layout.width ||
      this.depthTarget.height !== layout.height
    ) {
      this.depthTarget?.dispose();
      this.depthTarget = new WebGLRenderTarget(layout.width, layout.height, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: true,
        generateMipmaps: false,
      });
    }
    this.depthMaterial ??= createDepthMaterial();
    this.depthMaterial.uniforms.uWaterY!.value = waterY;
    this.depthMaterial.uniforms.uClipY!.value = waterY + WATER_FOAM_BAND;

    const camera = new OrthographicCamera(
      -layout.sizeX / 2,
      layout.sizeX / 2,
      layout.sizeZ / 2,
      -layout.sizeZ / 2,
      0.1,
      Math.max(bounds.max[1], waterY) - Math.min(bounds.min[1], waterY) + 40,
    );
    const cx = layout.x + layout.sizeX / 2;
    const cz = layout.z + layout.sizeZ / 2;
    camera.up.set(0, 0, -1);
    camera.position.set(cx, Math.max(bounds.max[1], waterY) + 20, cz);
    camera.lookAt(cx, 0, cz);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const hidden: Object3D[] = [];
    scene.traverse((obj) => {
      if (!obj.visible || obj === self) return;
      const m = (obj as Mesh).material as Material | Material[] | undefined;
      if (obj instanceof Mesh && m && !Array.isArray(m) && m.transparent) {
        obj.visible = false;
        hidden.push(obj);
      }
    });
    self.visible = false;
    this.withTarget(renderer, this.depthTarget, WATER_FAR_DEPTH, 0, () => {
      const previous = scene.overrideMaterial;
      scene.overrideMaterial = this.depthMaterial;
      renderer.render(scene, camera);
      scene.overrideMaterial = previous;
    });
    self.visible = true;
    for (const obj of hidden) obj.visible = true;

    u.uDepthMap!.value = this.depthTarget.texture;
    (u.uDepthRect!.value as Vector4).set(layout.x, layout.z, layout.sizeX, layout.sizeZ);
    u.uHasDepth!.value = 1;
    this.depthDirty = false;
    this.depthKey = key;
  }

  private updateReflection(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    self: Object3D,
  ): void {
    const u = this.uniforms;
    const settings = this.settings;
    const waterY = this.surfaceY;
    camera.updateMatrixWorld();
    const camPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (!settings || settings.reflectivity <= 0 || camPos.y <= waterY + 0.05) {
      u.uHasReflection!.value = 0;
      return;
    }
    const isOrtho = (camera as OrthographicCamera).isOrthographicCamera === true;
    if (!this.virtualCamera || this.virtualCamera instanceof OrthographicCamera !== isOrtho) {
      this.virtualCamera = isOrtho ? new OrthographicCamera() : new PerspectiveCamera();
    }
    const virtual = this.virtualCamera;
    const rotation = new Matrix4().extractRotation(camera.matrixWorld);
    const forward = new Vector3(0, 0, -1).applyMatrix4(rotation);
    const up = new Vector3(0, 1, 0).applyMatrix4(rotation);
    virtual.position.set(camPos.x, 2 * waterY - camPos.y, camPos.z);
    virtual.up.set(up.x, -up.y, up.z);
    virtual.lookAt(
      virtual.position.x + forward.x,
      virtual.position.y - forward.y,
      virtual.position.z + forward.z,
    );
    virtual.updateMatrixWorld();
    virtual.matrixWorldInverse.copy(virtual.matrixWorld).invert();
    virtual.projectionMatrix.copy((camera as PerspectiveCamera).projectionMatrix);
    virtual.projectionMatrixInverse.copy((camera as PerspectiveCamera).projectionMatrixInverse);

    const target = renderer.getRenderTarget();
    const size = new Vector2();
    if (target) size.set(target.width, target.height);
    else renderer.getDrawingBufferSize(size);
    const [w, h] = reflectionTargetSize(
      size.x,
      size.y,
      0.5,
      Math.min(2048, renderer.capabilities.maxTextureSize),
    );
    if (
      !this.reflectionTarget ||
      this.reflectionTarget.width !== w ||
      this.reflectionTarget.height !== h
    ) {
      this.reflectionTarget?.dispose();
      this.reflectionTarget = new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
        generateMipmaps: true,
        depthBuffer: true,
      });
    }

    this.clipPlane.constant = -(waterY - 0.02);
    const previousClipping = renderer.clippingPlanes;
    const previousShadow = renderer.shadowMap.autoUpdate;
    renderer.clippingPlanes = [this.clipPlane];
    renderer.shadowMap.autoUpdate = false;
    const wasVisible = self.visible;
    self.visible = false;
    this.withTarget(renderer, this.reflectionTarget, 0, 0, () => {
      renderer.render(scene, virtual);
    });
    self.visible = wasVisible;
    renderer.clippingPlanes = previousClipping;
    renderer.shadowMap.autoUpdate = previousShadow;

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
    (u.uReflectionMatrix!.value as Matrix4).copy(this.textureMatrix);
    u.uReflectionMap!.value = this.reflectionTarget.texture;
    u.uHasReflection!.value = 1;
  }

  private withTarget(
    renderer: WebGLRenderer,
    target: WebGLRenderTarget,
    clearR: number,
    clearA: number,
    draw: () => void,
  ): void {
    const previousTarget = renderer.getRenderTarget();
    const previousAuto = renderer.autoClear;
    const previousColor = new Color();
    renderer.getClearColor(previousColor);
    const previousAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(new Color(clearR, 0, 0), clearA);
    renderer.autoClear = false;
    renderer.clear(true, true, true);
    draw();
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.autoClear = previousAuto;
  }

  dispose(): void {
    this.reflectionTarget?.dispose();
    this.depthTarget?.dispose();
    this.depthMaterial?.dispose();
    this.reflectionTarget = null;
    this.depthTarget = null;
    this.depthMaterial = null;
  }
}
