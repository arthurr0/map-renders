import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  NearestFilter,
  NearestMipmapLinearFilter,
  NeutralToneMapping,
  NoToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
  type ToneMapping,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_RENDER_SETTINGS } from '../core/defaults';
import type {
  CameraState,
  ExportOptions,
  MeshBuffers,
  MeshResult,
  RenderSettings,
  TextureMode,
  TurntableOptions,
} from '../core/types';
import {
  blobToDataUrl,
  createGifSink,
  createMediaRecorderSink,
  createWebCodecsSink,
  flattenOnto,
  imageDataToBlob,
  nextTask,
  throwIfAborted,
  type FrameSink,
} from './export/encode';
import { ExportSession, type ExportCamera } from './export/session';
import { fitPreset, type CameraPreset } from './math/cameraFit';
import { interpolateCamera } from './math/cameraTween';
import { fitShadowCamera } from './math/shadowFit';
import { sunDirection, sunLookForElevation } from './math/sun';
import { exportFov, exportFrame, exportHeightFraction, type Rect } from './math/tiles';
import { DEG, boxCenter, boxSize, length, type Bounds, type Vec3 } from './math/vec';
import { DEFAULT_RENDER_OPTIONS, type RenderOptions } from './options';
import { PostPipeline } from './post/pipeline';
import { BackgroundLayer } from './scene/background';
import { Ground } from './scene/ground';
import {
  createBlockMaterials,
  createSharedUniforms,
  type BlockMaterials,
  type SharedUniforms,
} from './scene/materials';

const TONE_MAPPING: Record<RenderSettings['toneMapping'], ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  none: NoToneMapping,
};

interface CameraAnimation {
  from: CameraState;
  to: CameraState;
  start: number;
  duration: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function cloneState(s: CameraState): CameraState {
  return {
    projection: s.projection,
    position: [...s.position],
    target: [...s.target],
    fov: s.fov,
    zoom: s.zoom,
  };
}

export class SceneRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly modelGroup = new Group();
  private readonly sun = new DirectionalLight(0xffffff, 2.5);
  private readonly hemi = new HemisphereLight(0xcfe3ff, 0x6b5a45, 0.6);
  private readonly perspCamera = new PerspectiveCamera(45, 1, 0.1, 2000);
  private readonly orthoCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  private camera: PerspectiveCamera | OrthographicCamera = this.perspCamera;
  private readonly controls: OrbitControls;
  private readonly background: BackgroundLayer;
  private readonly ground: Ground;
  private readonly shared: SharedUniforms = createSharedUniforms();
  private readonly pipeline: PostPipeline;

  private settings: RenderSettings = DEFAULT_RENDER_SETTINGS;
  private options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS };
  private materials: BlockMaterials | null = null;
  private atlasTexture: Texture | null = null;
  private atlasSource: ImageBitmap | OffscreenCanvas | null = null;
  private mode: TextureMode = 'textured';
  private bounds: Bounds | null = null;
  private clipBox: Box3 | null = null;
  private hasWater = false;
  private cameraInitialized = false;

  private fov = 45;
  private orthoBase = 20;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  private raf = 0;
  private dirty = true;
  private interacting = false;
  private animation: CameraAnimation | null = null;
  private cameraDirty = false;
  private exporting = 0;
  private disposed = false;
  private lastFrame = 0;
  private readonly listeners = new Set<(s: CameraState) => void>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.scene.add(this.modelGroup);
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.background = new BackgroundLayer(this.renderer, () => this.applySettings());
    this.ground = new Ground(this.shared);
    this.ground.setAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.ground.group);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.maxPolarAngle = Math.PI - 0.01;
    this.controls.addEventListener('change', this.onControlsChange);
    this.controls.addEventListener('start', this.onControlsStart);
    this.controls.addEventListener('end', this.onControlsEnd);

    const w = canvas.clientWidth || canvas.width || 300;
    const h = canvas.clientHeight || canvas.height || 150;
    this.pixelRatio = this.computePixelRatio();
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.pipeline = new PostPipeline(
      this.renderer,
      this.scene,
      this.camera,
      this.background,
      w * this.pixelRatio,
      h * this.pixelRatio,
    );

    this.applyCameraState({
      projection: 'perspective',
      position: [24, 18, 30],
      target: [0, 4, 0],
      fov: 45,
      zoom: 1,
    });
    this.applySettings();
  }

  setModel(
    result: MeshResult,
    atlasImage: ImageBitmap | OffscreenCanvas | null,
    mode: TextureMode,
  ): void {
    this.disposeModelMeshes();
    const image = mode === 'textured' ? atlasImage : null;
    if (image !== this.atlasSource || mode !== this.mode || !this.materials) {
      this.materials?.dispose();
      this.atlasTexture?.dispose();
      this.atlasTexture = image ? this.createAtlasTexture(image) : null;
      this.atlasSource = image;
      this.mode = mode;
      this.materials = createBlockMaterials(this.atlasTexture, this.shared);
      this.applyMaterialSettings();
    }
    const mats = this.materials;
    this.hasWater = false;
    for (const buffers of result.meshes) {
      if (buffers.indices.length === 0 || buffers.positions.length === 0) continue;
      const geometry = this.buildGeometry(buffers);
      let material = mats.opaque;
      if (buffers.isWater) material = mats.water;
      else if (buffers.layer === 'cutout') material = mats.cutout;
      else if (buffers.layer === 'translucent') material = mats.translucent;
      const mesh = new Mesh(geometry, material);
      mesh.position.set(buffers.origin[0], buffers.origin[1], buffers.origin[2]);
      mesh.receiveShadow = true;
      mesh.castShadow = !buffers.isWater && buffers.layer !== 'translucent';
      if (buffers.layer === 'cutout' && !buffers.isWater) {
        mesh.customDepthMaterial = mats.cutoutDepth;
        mesh.userData.aoMaterial = mats.cutoutNormal;
      }
      if (buffers.isWater) {
        this.hasWater = true;
        mesh.renderOrder = 2;
      } else if (buffers.layer === 'translucent') {
        mesh.renderOrder = 3;
      }
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      this.modelGroup.add(mesh);
    }

    const b = result.bounds;
    const valid = b.max.every((v, i) => v > (b.min[i] ?? 0));
    this.bounds = valid
      ? { min: [...b.min] as Vec3, max: [...b.max] as Vec3 }
      : { min: [0, 0, 0], max: [1, 1, 1] };
    this.clipBox = new Box3(
      new Vector3(this.bounds.min[0] - 4, this.bounds.min[1] - 2, this.bounds.min[2] - 4),
      new Vector3(this.bounds.max[0] + 4, this.bounds.max[1] + 4, this.bounds.max[2] + 4),
    );
    if (!this.cameraInitialized) {
      this.cameraInitialized = true;
      this.fitCamera('three-quarter', false);
    }
    this.applySettings();
  }

  clearModel(): void {
    this.disposeModelMeshes();
    this.bounds = null;
    this.clipBox = null;
    this.hasWater = false;
    this.applySettings();
  }

  setSettings(settings: RenderSettings): void {
    this.settings = settings;
    this.applySettings();
  }

  getSettings(): RenderSettings {
    return this.settings;
  }

  setRenderOptions(options: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...options };
    const pr = this.computePixelRatio();
    if (pr !== this.pixelRatio) this.resize(this.width, this.height);
    this.applySettings();
  }

  getRenderOptions(): RenderOptions {
    return { ...this.options };
  }

  getModelBounds(): Bounds | null {
    return this.bounds ? { min: [...this.bounds.min], max: [...this.bounds.max] } : null;
  }

  getCamera(): CameraState {
    const p = this.camera.position;
    const t = this.controls.target;
    return {
      projection: this.camera === this.orthoCamera ? 'orthographic' : 'perspective',
      position: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
      fov: this.fov,
      zoom: this.camera.zoom,
    };
  }

  setCamera(state: CameraState, animate = false): void {
    if (!animate || this.options.cameraTransitionMs <= 0) {
      this.animation = null;
      this.controls.enabled = true;
      this.applyCameraState(state);
      this.cameraDirty = true;
      this.requestRender();
      return;
    }
    const current = this.getCamera();
    if (current.projection !== state.projection) {
      this.applyCameraState({ ...current, projection: state.projection });
    }
    this.animation = {
      from: this.getCamera(),
      to: cloneState(state),
      start: performance.now(),
      duration: this.options.cameraTransitionMs,
    };
    this.controls.enabled = false;
    this.requestRender();
  }

  fitCamera(preset: CameraPreset, animate = true): void {
    const bounds = this.bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
    const current = this.getCamera();
    const state = fitPreset(preset, bounds, current.projection, this.fov, this.width / this.height);
    this.setCamera(state, animate);
  }

  onCameraChange(cb: (s: CameraState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getExportFrame(aspect: number): Rect {
    return exportFrame(this.width, this.height, aspect);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.pixelRatio = this.computePixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.pipeline.setSize(this.width * this.pixelRatio, this.height * this.pixelRatio);
    this.updateProjection();
    this.requestRender();
  }

  requestRender(): void {
    this.dirty = true;
    this.schedule();
  }

  async renderImage(
    options: ExportOptions,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob> {
    throwIfAborted(signal);
    await this.background.whenReady();
    throwIfAborted(signal);
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    const wantsAlpha = options.transparent || this.settings.background.type === 'transparent';
    const alphaFormat = options.format !== 'jpeg';
    const camera = this.makeExportCamera(width / height);
    const image = await this.withExport(wantsAlpha, async () => {
      const session = this.createSession(camera, width, height, options.supersample);
      try {
        return await session.renderFrame(
          camera,
          wantsAlpha,
          (done, total) => onProgress?.((done / total) * 0.9),
          signal,
        );
      } finally {
        session.dispose();
      }
    });
    throwIfAborted(signal);
    if (wantsAlpha && !alphaFormat) flattenOnto(image, 255, 255, 255);
    const blob = await imageDataToBlob(image, options.format, options.quality);
    onProgress?.(1);
    return blob;
  }

  async renderTurntable(
    options: TurntableOptions,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob> {
    throwIfAborted(signal);
    await this.background.whenReady();
    let width = Math.max(2, Math.round(options.width));
    let height = Math.max(2, Math.round(options.height));
    if (options.format === 'webm') {
      width -= width % 2;
      height -= height % 2;
    }
    const fps = options.fps;
    const frames = Math.max(1, Math.round(options.durationSec * fps));
    const transparent = this.settings.background.type === 'transparent';
    const base = this.makeExportCamera(width / height);
    const target = this.controls.target.clone();
    const offset = base.position.clone().sub(target);
    const baseQuat = base.quaternion.clone();
    const axis = new Vector3(0, 1, 0);
    const q = new Quaternion();

    const activeSink: FrameSink =
      options.format === 'gif'
        ? createGifSink(fps, transparent)
        : ((await createWebCodecsSink(width, height, fps)) ??
          createMediaRecorderSink(width, height, fps));
    const supersample = width * height <= 1280 * 720 ? 2 : 1;
    try {
      await this.withExport(transparent, async () => {
        const session = this.createSession(base, width, height, supersample);
        try {
          for (let i = 0; i < frames; i++) {
            throwIfAborted(signal);
            const angle = (i / frames) * Math.PI * 2;
            q.setFromAxisAngle(axis, angle);
            base.position.copy(offset).applyQuaternion(q).add(target);
            base.quaternion.copy(q).multiply(baseQuat);
            base.updateMatrixWorld();
            this.shared.uTime.value = i / fps;
            const image = await session.renderFrame(base, transparent, undefined, signal);
            await activeSink.add(image, i);
            onProgress?.(((i + 1) / frames) * 0.95);
            await nextTask();
          }
        } finally {
          session.dispose();
        }
      });
      throwIfAborted(signal);
      const blob = await activeSink.finish();
      onProgress?.(1);
      return blob;
    } catch (e) {
      activeSink.cancel();
      throw e;
    }
  }

  async captureThumbnail(size: number): Promise<string> {
    await this.background.whenReady();
    const width = Math.max(16, Math.round(size));
    const aspect = this.width / this.height;
    const height = Math.max(16, Math.round(width / aspect));
    const transparent = this.settings.background.type === 'transparent';
    const camera = this.makeExportCamera(aspect);
    const image = await this.withExport(transparent, async () => {
      const session = this.createSession(camera, width, height, 2);
      try {
        return await session.renderFrame(camera, transparent);
      } finally {
        session.dispose();
      }
    });
    const blob = await imageDataToBlob(image, transparent ? 'png' : 'jpeg', 0.85);
    return blobToDataUrl(blob);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.listeners.clear();
    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.removeEventListener('end', this.onControlsEnd);
    this.controls.dispose();
    this.disposeModelMeshes();
    this.materials?.dispose();
    this.materials = null;
    this.atlasTexture?.dispose();
    this.atlasTexture = null;
    this.atlasSource = null;
    this.ground.dispose();
    this.background.dispose();
    this.pipeline.dispose();
    this.sun.dispose();
    this.hemi.dispose();
    this.scene.environment = null;
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }

  private computePixelRatio(): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(dpr, this.options.maxPixelRatio);
  }

  private createAtlasTexture(image: ImageBitmap | OffscreenCanvas): Texture {
    const tex =
      typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas
        ? new CanvasTexture(image)
        : new Texture(image);
    tex.flipY = false;
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    this.shared.uAtlasSize.value.set(image.width, image.height);
    return tex;
  }

  private buildGeometry(b: MeshBuffers): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(b.positions, 3));
    g.setAttribute('normal', new BufferAttribute(b.normals, 3));
    g.setAttribute('uv', new BufferAttribute(b.uvs, 2));
    g.setAttribute('color', new BufferAttribute(b.colors, 3));
    const vertexCount = b.positions.length / 3;
    const emissive =
      b.emissive && b.emissive.length === vertexCount ? b.emissive : new Float32Array(vertexCount);
    g.setAttribute('aEmissive', new BufferAttribute(emissive, 1));
    g.setIndex(new BufferAttribute(b.indices, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  private disposeModelMeshes(): void {
    for (const child of [...this.modelGroup.children]) {
      if (child instanceof Mesh) child.geometry.dispose();
      this.modelGroup.remove(child);
    }
  }

  private applyMaterialSettings(): void {
    this.shared.uEmissiveStrength.value = this.options.emissiveStrength;
    const mats = this.materials;
    if (!mats) return;
    const reflection = this.background.reflection;
    mats.water.envMap = reflection;
    mats.water.envMapRotation.set(
      0,
      this.background.kind === 'hdri' ? this.background.rotation : 0,
      0,
    );
    mats.water.needsUpdate = true;
  }

  private applySettings(): void {
    if (this.disposed) return;
    const s = this.settings;
    this.renderer.toneMapping = TONE_MAPPING[s.toneMapping] ?? NeutralToneMapping;
    this.renderer.toneMappingExposure = s.exposure;

    this.background.apply(s, {
      transparent: s.background.type === 'transparent',
      sunFollowsBackground: this.options.sunFollowsBackground,
      skyClouds: this.options.skyClouds,
    });

    const override = this.background.sunOverride;
    const azimuth = override ? override.azimuth : s.sun.azimuth;
    const elevation = override ? override.elevation : s.sun.elevation;
    let dir = sunDirection(azimuth, elevation);
    const sunColor = new Color(s.sun.color);
    let sunIntensity = s.sun.intensity;
    const ambientColor = new Color(s.ambient.color);
    let ambientIntensity = s.ambient.intensity;
    if (this.background.kind === 'sky' && override) {
      const look = sunLookForElevation(elevation);
      sunColor.multiply(
        new Color().setRGB(look.color[0], look.color[1], look.color[2], SRGBColorSpace),
      );
      sunIntensity *= look.intensity;
      ambientColor.lerp(
        new Color().setRGB(
          look.ambientColor[0],
          look.ambientColor[1],
          look.ambientColor[2],
          SRGBColorSpace,
        ),
        0.6,
      );
      ambientIntensity *= look.ambientIntensity;
      if (elevation < -2) {
        const moon = Math.min(1, (-elevation - 2) / 8);
        dir = sunDirection(azimuth + 180, Math.min(60, Math.max(25, -elevation)));
        sunColor.copy(new Color(s.sun.color)).multiply(new Color(0.55, 0.68, 1.0));
        sunIntensity = s.sun.intensity * 0.22 * moon;
      }
    }
    this.sun.color.copy(sunColor);
    this.sun.intensity = sunIntensity;

    const envActive =
      s.useBackgroundLighting &&
      (this.background.kind === 'sky' || this.background.kind === 'hdri') &&
      !!this.background.environment;
    if (envActive) {
      this.scene.environment = this.background.environment;
      this.scene.environmentIntensity = ambientIntensity * this.background.environmentScale;
      this.scene.environmentRotation.set(
        0,
        this.background.kind === 'hdri' ? this.background.rotation : 0,
        0,
      );
      this.hemi.intensity = 0;
    } else {
      this.scene.environment = null;
      this.hemi.color.copy(ambientColor);
      this.hemi.groundColor.copy(ambientColor).multiplyScalar(0.32).lerp(new Color(0x6b5a45), 0.35);
      this.hemi.intensity = ambientIntensity * 1.5;
    }

    this.sun.castShadow = s.shadows.enabled && sunIntensity > 0;
    const size = s.shadows.mapSize;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.radius = 1 + Math.max(0, s.shadows.softness) * 2;
    this.fitSunShadow(dir);

    this.ground.update(s.ground, this.bounds);
    this.ground.setEnvMap(this.background.reflection);

    if (s.fog.enabled) {
      const fogColor = new Color(s.fog.color);
      if (this.scene.fog instanceof FogExp2) {
        this.scene.fog.color.copy(fogColor);
        this.scene.fog.density = s.fog.density;
      } else {
        this.scene.fog = new FogExp2(fogColor, s.fog.density);
      }
    } else {
      this.scene.fog = null;
    }

    this.applyMaterialSettings();
    this.configurePreviewPipeline();
    this.updateClipping();
    this.requestRender();
  }

  private configurePreviewPipeline(): void {
    const s = this.settings;
    const aa = this.options.antialias;
    const samples = aa === 'msaa' ? Math.min(4, this.renderer.capabilities.maxSamples) : 0;
    this.pipeline.setCamera(this.camera, this.fov);
    this.pipeline.configure({
      ssao: s.ssao,
      bloom: s.bloom,
      antialias: aa,
      msaaSamples: samples,
      denoiseScale: 1,
      bloomResolutionScale: 1,
      clipBox: this.clipBox,
    });
  }

  private fitSunShadow(dir: Vec3): void {
    const bounds = this.bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
    const fit = fitShadowCamera(bounds, dir, this.sun.shadow.mapSize.x, {
      groundY: this.settings.ground !== 'none' ? bounds.min[1] : undefined,
      softness: this.settings.shadows.softness,
    });
    this.sun.position.set(fit.position[0], fit.position[1], fit.position[2]);
    this.sun.target.position.set(fit.target[0], fit.target[1], fit.target[2]);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    const cam = this.sun.shadow.camera;
    cam.up.set(fit.up[0], fit.up[1], fit.up[2]);
    cam.left = fit.left;
    cam.right = fit.right;
    cam.top = fit.top;
    cam.bottom = fit.bottom;
    cam.near = fit.near;
    cam.far = fit.far;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = fit.bias;
    this.sun.shadow.normalBias = fit.normalBias;
    this.sun.shadow.needsUpdate = true;
  }

  private sceneRadius(): number {
    if (!this.bounds) return 30;
    return Math.max(4, length(boxSize(this.bounds)) / 2);
  }

  private updateClipping(): void {
    const center: Vec3 = this.bounds ? boxCenter(this.bounds) : [0, 4, 0];
    const p = this.camera.position;
    const distToCenter = Math.hypot(p.x - center[0], p.y - center[1], p.z - center[2]);
    const r = this.sceneRadius();
    const groundR = this.settings.ground !== 'none' ? this.ground.radius : r;
    const far = distToCenter + Math.max(r, groundR) * 1.2 + 20;
    let near = Math.max(0.05, (distToCenter - r) * 0.5);
    near = Math.max(near, far / 20000);
    near = Math.min(near, 10);
    const cams: Array<PerspectiveCamera | OrthographicCamera> = [
      this.perspCamera,
      this.orthoCamera,
    ];
    for (const cam of cams) {
      cam.near = cam === this.orthoCamera ? 0.1 : near;
      cam.far = far;
    }
    this.updateProjection();
  }

  private updateProjection(): void {
    const aspect = this.width / this.height;
    this.perspCamera.aspect = aspect;
    this.perspCamera.fov = this.fov;
    this.perspCamera.updateProjectionMatrix();
    const h = this.orthoBase / 2;
    this.orthoCamera.left = -h * aspect;
    this.orthoCamera.right = h * aspect;
    this.orthoCamera.top = h;
    this.orthoCamera.bottom = -h;
    this.orthoCamera.updateProjectionMatrix();
  }

  private applyCameraState(input: CameraState): void {
    const state = cloneState(input);
    const pos = new Vector3(...state.position);
    const target = new Vector3(...state.target);
    let distance = pos.distanceTo(target);
    if (distance < 1e-4) {
      pos.set(target.x + 10, target.y + 10, target.z + 10);
      distance = pos.distanceTo(target);
    }
    this.fov = Math.min(120, Math.max(5, state.fov || 45));
    const ortho = state.projection === 'orthographic';
    let zoom = state.zoom > 0 ? state.zoom : 1;
    if (ortho) {
      const safe = this.sceneRadius() * 2 + 10;
      if (distance < safe) {
        const k = safe / distance;
        pos.sub(target).multiplyScalar(k).add(target);
        zoom *= k;
        distance = safe;
      }
      this.orthoBase = 2 * distance * Math.tan((this.fov * DEG) / 2);
    }
    const cam = ortho ? this.orthoCamera : this.perspCamera;
    if (cam !== this.camera) {
      this.camera = cam;
      this.controls.object = cam;
      this.pipeline?.setCamera(cam, this.fov);
    }
    cam.up.set(0, 1, 0);
    cam.position.copy(pos);
    cam.zoom = zoom;
    this.controls.target.copy(target);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    this.updateClipping();
    this.pipeline?.setCamera(cam, this.fov);
  }

  private makeExportCamera(aspect: number): ExportCamera {
    const viewAspect = this.width / this.height;
    const f = exportHeightFraction(viewAspect, aspect);
    const src = this.camera;
    if (src instanceof PerspectiveCamera) {
      const cam = new PerspectiveCamera(
        exportFov(this.fov, viewAspect, aspect),
        aspect,
        src.near,
        src.far,
      );
      cam.zoom = src.zoom;
      cam.position.copy(src.position);
      cam.quaternion.copy(src.quaternion);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      return cam;
    }
    const h = (this.orthoBase / 2) * f;
    const cam = new OrthographicCamera(-h * aspect, h * aspect, h, -h, src.near, src.far);
    cam.zoom = src.zoom;
    cam.position.copy(src.position);
    cam.quaternion.copy(src.quaternion);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return cam;
  }

  private createSession(
    camera: ExportCamera,
    width: number,
    height: number,
    supersample: number,
  ): ExportSession {
    const viewAspect = this.width / this.height;
    const frameHeight =
      this.height * this.pixelRatio * exportHeightFraction(viewAspect, width / height);
    return new ExportSession(
      {
        renderer: this.renderer,
        scene: this.scene,
        background: this.background,
        settings: this.settings,
        bounds: this.bounds,
        clipBox: this.clipBox,
        previewFrameHeight: frameHeight,
        fov: this.fov,
      },
      camera,
      { width, height, supersample },
    );
  }

  private async withExport<T>(transparent: boolean, fn: () => Promise<T>): Promise<T> {
    this.exporting++;
    const restore = transparent ? this.background.hideVisible() : null;
    const time = this.shared.uTime.value;
    try {
      return await fn();
    } finally {
      restore?.();
      this.shared.uTime.value = time;
      this.exporting--;
      this.renderer.setRenderTarget(null);
      this.requestRender();
    }
  }

  private readonly onControlsChange = (): void => {
    this.cameraDirty = true;
    this.requestRender();
  };

  private readonly onControlsStart = (): void => {
    this.interacting = true;
    this.schedule();
  };

  private readonly onControlsEnd = (): void => {
    this.interacting = false;
    this.schedule();
  };

  private schedule(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (time: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.lastFrame ? Math.min(0.1, (time - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = time;
    let active = false;

    if (this.animation) {
      active = true;
      this.stepAnimation(time);
    }
    if (this.controls.update(dt)) {
      active = true;
      this.dirty = true;
      this.cameraDirty = true;
    }
    if (this.options.animateWater && (this.hasWater || this.ground.isWater())) {
      this.shared.uTime.value = time / 1000;
      this.dirty = true;
      active = true;
    }
    if (this.cameraDirty) {
      this.cameraDirty = false;
      this.updateClipping();
      const state = this.getCamera();
      for (const cb of this.listeners) cb(state);
    }
    if (this.dirty && this.exporting === 0) {
      this.dirty = false;
      this.renderPreview();
    }
    if (active || this.interacting || this.dirty) {
      this.schedule();
    } else {
      this.lastFrame = 0;
    }
  };

  private stepAnimation(time: number): void {
    const a = this.animation;
    if (!a) return;
    const t = Math.min(1, (time - a.start) / a.duration);
    const k = easeInOutCubic(Math.max(0, t));
    if (t >= 1) {
      this.animation = null;
      this.controls.enabled = true;
      this.applyCameraState(a.to);
    } else {
      this.applyCameraState(interpolateCamera(a.from, a.to, k));
    }
    this.dirty = true;
    this.cameraDirty = true;
  }

  private renderPreview(): void {
    this.camera.updateMatrixWorld();
    this.pipeline.render(true);
  }
}
