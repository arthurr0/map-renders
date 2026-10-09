import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Mesh,
  NearestFilter,
  NearestMipmapLinearFilter,
  PCFShadowMap,
  Quaternion,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
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
import { CameraRig, type RigCamera } from './camera/CameraRig';
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
import { ExportSession } from './export/session';
import type { CameraPreset } from './math/cameraFit';
import { exportFrame, exportHeightFraction, type Rect } from './math/tiles';
import type { Bounds, Vec3 } from './math/vec';
import { DEFAULT_RENDER_OPTIONS, type RenderOptions } from './options';
import { PostPipeline } from './post/pipeline';
import { BackgroundLayer } from './scene/background';
import { Ground, groundExtents } from './scene/ground';
import { SceneLighting } from './scene/lighting';
import {
  createBlockMaterials,
  createSharedUniforms,
  type BlockMaterials,
  type SharedUniforms,
} from './scene/materials';

const TRANSPARENT_VIDEO_TOP: Vec3 = [111, 168, 220];
const TRANSPARENT_VIDEO_BOTTOM: Vec3 = [219, 234, 254];

function validBounds(result: MeshResult): boolean {
  const b = result.bounds;
  const finite = [...b.min, ...b.max].every((v) => Number.isFinite(v));
  return finite && b.max.every((v, i) => v > (b.min[i] ?? 0)) && result.meshes.length > 0;
}

export class SceneRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly modelGroup = new Group();
  private readonly rig: CameraRig;
  private readonly background: BackgroundLayer;
  private readonly ground: Ground;
  private readonly lighting: SceneLighting;
  private readonly shared: SharedUniforms = createSharedUniforms();
  private readonly pipeline: PostPipeline;

  private currentSettings: RenderSettings = DEFAULT_RENDER_SETTINGS;
  private options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS };
  private materials: BlockMaterials | null = null;
  private atlasTexture: Texture | null = null;
  private atlasSource: ImageBitmap | OffscreenCanvas | null = null;
  private mode: TextureMode = 'textured';
  private bounds: Bounds | null = null;
  private clipBox: Box3 | null = null;
  private hasWater = false;
  private cameraInitialized = false;
  private waterEnv: Texture | null = null;
  private waterEnvRotation = 0;

  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  private raf = 0;
  private dirty = true;
  private cameraDirty = false;
  private exporting = 0;
  private exportQueue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private lastFrame = 0;
  private readonly cameraListeners = new Set<(s: CameraState) => void>();

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
    this.lighting = new SceneLighting(this.renderer, this.scene);
    this.background = new BackgroundLayer(this.renderer, () => this.applySettings());
    this.ground = new Ground(this.shared, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.ground.group);

    this.rig = new CameraRig(canvas, {
      onChange: () => {
        this.cameraDirty = true;
        this.requestRender();
      },
      onInteraction: () => this.schedule(),
      onProjectionChange: (cam) => this.pipeline?.setCamera(cam, this.rig.fov),
    });

    const w = canvas.clientWidth || canvas.width || 300;
    const h = canvas.clientHeight || canvas.height || 150;
    this.pixelRatio = this.computePixelRatio();
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.rig.setViewport(w, h);
    this.pipeline = new PostPipeline(
      this.renderer,
      this.scene,
      this.rig.camera,
      this.background,
      w * this.pixelRatio,
      h * this.pixelRatio,
    );

    this.rig.setState(
      { projection: 'perspective', position: [24, 18, 30], target: [0, 4, 0], fov: 45, zoom: 1 },
      false,
      0,
    );
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
      this.waterEnv = null;
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

    const valid = validBounds(result);
    const b = result.bounds;
    this.bounds = valid
      ? { min: [...b.min] as Vec3, max: [...b.max] as Vec3 }
      : { min: [0, 0, 0], max: [1, 1, 1] };
    this.clipBox = new Box3(
      new Vector3(this.bounds.min[0] - 4, this.bounds.min[1] - 2, this.bounds.min[2] - 4),
      new Vector3(this.bounds.max[0] + 4, this.bounds.max[1] + 4, this.bounds.max[2] + 4),
    );
    this.lighting.invalidateShadow();
    this.applySettings();
    if (valid && !this.cameraInitialized) {
      this.cameraInitialized = true;
      this.fitCamera('three-quarter', false);
    }
  }

  clearModel(): void {
    this.disposeModelMeshes();
    this.bounds = null;
    this.clipBox = null;
    this.hasWater = false;
    this.lighting.invalidateShadow();
    this.applySettings();
  }

  setSettings(settings: RenderSettings): void {
    this.currentSettings = settings;
    this.applySettings();
  }

  getSettings(): RenderSettings {
    return this.currentSettings;
  }

  setRenderOptions(options: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...options };
    if (this.computePixelRatio() !== this.pixelRatio) this.resize(this.width, this.height);
    this.applySettings();
  }

  getRenderOptions(): RenderOptions {
    return { ...this.options };
  }

  getModelBounds(): Bounds | null {
    return this.bounds ? { min: [...this.bounds.min], max: [...this.bounds.max] } : null;
  }

  getCamera(): CameraState {
    return this.rig.getState();
  }

  setCamera(state: CameraState, animate = false): void {
    this.rig.setState(state, animate, this.options.cameraTransitionMs);
    this.cameraDirty = true;
    this.requestRender();
  }

  fitCamera(preset: CameraPreset, animate = true): void {
    this.setCamera(this.rig.presetState(preset), animate);
  }

  onCameraChange(cb: (s: CameraState) => void): () => void {
    this.cameraListeners.add(cb);
    return () => {
      this.cameraListeners.delete(cb);
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
    this.rig.setViewport(this.width, this.height);
    this.requestRender();
  }

  requestRender(): void {
    this.dirty = true;
    this.schedule();
  }

  renderImage(
    options: ExportOptions,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    const camera = this.rig.makeExportCamera(width / height);
    const settings = this.currentSettings;
    return this.enqueueExport(signal, async () => {
      this.lighting.updateFog(camera.position);
      const wantsAlpha = options.transparent || settings.background.type === 'transparent';
      const image = await this.withHiddenBackground(wantsAlpha, async () => {
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
      if (wantsAlpha && options.format === 'jpeg') flattenOnto(image, [255, 255, 255]);
      const blob = await imageDataToBlob(image, options.format, options.quality);
      onProgress?.(1);
      return blob;
    });
  }

  renderTurntable(
    options: TurntableOptions,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob> {
    let width = Math.max(2, Math.round(options.width));
    let height = Math.max(2, Math.round(options.height));
    if (options.format === 'webm') {
      width -= width % 2;
      height -= height % 2;
    }
    const base = this.rig.makeExportCamera(width / height);
    const target = this.rig.controls.target.clone();
    const transparent = this.currentSettings.background.type === 'transparent';
    return this.enqueueExport(signal, async () => {
      const fps = options.fps;
      const frames = Math.max(1, Math.round(options.durationSec * fps));
      const offset = base.position.clone().sub(target);
      const baseQuat = base.quaternion.clone();
      const axis = new Vector3(0, 1, 0);
      const q = new Quaternion();
      const sink: FrameSink =
        options.format === 'gif'
          ? createGifSink(fps, transparent)
          : ((await createWebCodecsSink(width, height, fps)) ??
            createMediaRecorderSink(width, height, fps));
      const supersample = width * height <= 1280 * 720 ? 2 : 1;
      try {
        await this.withHiddenBackground(transparent, async () => {
          const session = this.createSession(base, width, height, supersample);
          try {
            for (let i = 0; i < frames; i++) {
              throwIfAborted(signal);
              q.setFromAxisAngle(axis, (i / frames) * Math.PI * 2);
              base.position.copy(offset).applyQuaternion(q).add(target);
              base.quaternion.copy(q).multiply(baseQuat);
              base.updateMatrixWorld();
              this.lighting.updateFog(base.position);
              this.shared.uTime.value = i / fps;
              const image = await session.renderFrame(base, transparent, undefined, signal);
              if (transparent && options.format === 'webm') {
                flattenOnto(image, TRANSPARENT_VIDEO_TOP, TRANSPARENT_VIDEO_BOTTOM);
              }
              await sink.add(image, i);
              onProgress?.(((i + 1) / frames) * 0.95);
              await nextTask();
            }
          } finally {
            session.dispose();
          }
        });
        throwIfAborted(signal);
        const blob = await sink.finish();
        onProgress?.(1);
        return blob;
      } catch (e) {
        sink.cancel();
        throw e;
      }
    });
  }

  captureThumbnail(size: number): Promise<string> {
    const width = Math.max(16, Math.round(size));
    const aspect = this.width / this.height;
    const height = Math.max(16, Math.round(width / aspect));
    const camera = this.rig.makeExportCamera(aspect);
    const transparent = this.currentSettings.background.type === 'transparent';
    return this.enqueueExport(undefined, async () => {
      this.lighting.updateFog(camera.position);
      const image = await this.withHiddenBackground(transparent, async () => {
        const session = this.createSession(camera, width, height, 2);
        try {
          return await session.renderFrame(camera, transparent);
        } finally {
          session.dispose();
        }
      });
      const blob = await imageDataToBlob(image, transparent ? 'png' : 'jpeg', 0.85);
      return blobToDataUrl(blob);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cameraListeners.clear();
    this.rig.dispose();
    const dfg = this.findSharedLut();
    this.disposeModelMeshes();
    this.materials?.dispose();
    this.materials = null;
    this.atlasTexture?.dispose();
    this.atlasTexture = null;
    this.atlasSource = null;
    this.ground.dispose();
    this.background.dispose();
    this.pipeline.dispose();
    this.lighting.dispose();
    this.scene.environment = null;
    dfg?.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private findSharedLut(): Texture | null {
    if (!this.materials) return null;
    const props = this.renderer.properties.get(this.materials.opaque) as {
      uniforms?: Record<string, { value: unknown }>;
    };
    const value = props.uniforms?.dfgLUT?.value;
    return value instanceof Texture ? value : null;
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

  private applySettings(): void {
    if (this.disposed) return;
    const s = this.currentSettings;
    this.shared.uEmissiveStrength.value = this.options.emissiveStrength;
    this.background.apply(s, {
      transparent: s.background.type === 'transparent',
      sunFollowsBackground: this.options.sunFollowsBackground,
      skyClouds: this.options.skyClouds,
    });
    const bg = s.background;
    this.ground.setGridBackdrop(
      bg.type === 'solid' ? bg.color : bg.type === 'gradient' ? bg.bottom : null,
    );
    this.ground.update(s.ground, this.bounds);
    const extents = groundExtents(this.bounds);
    this.lighting.apply({
      settings: s,
      background: this.background,
      bounds: this.bounds,
      groundY: s.ground !== 'none' && this.bounds ? this.bounds.min[1] : undefined,
      shadowReach: extents.shadowFadeOuter + 12,
    });
    const rotation = this.background.kind === 'hdri' ? this.background.rotation : 0;
    this.ground.setEnvMap(this.background.reflection, rotation);
    this.updateWaterEnv(this.background.reflection, rotation);
    this.pipeline.setCamera(this.rig.camera, this.rig.fov);
    const aa = this.options.antialias;
    this.pipeline.configure({
      ssao: s.ssao,
      bloom: s.bloom,
      antialias: aa,
      msaaSamples: aa === 'msaa' ? Math.min(4, this.renderer.capabilities.maxSamples) : 0,
      denoiseScale: 1,
      bloomResolutionScale: 1,
      clipBox: this.clipBox,
      clouds: { settings: s.clouds, bounds: this.bounds, ground: s.ground },
    });
    this.rig.setScene(this.bounds, this.ground.extent);
    this.requestRender();
  }

  private updateWaterEnv(texture: Texture | null, rotation: number): void {
    const water = this.materials?.water;
    if (!water) return;
    if (texture === this.waterEnv && rotation === this.waterEnvRotation) return;
    this.waterEnv = texture;
    this.waterEnvRotation = rotation;
    water.envMap = texture;
    water.envMapRotation.set(0, rotation, 0);
    water.needsUpdate = true;
  }

  private createSession(
    camera: RigCamera,
    width: number,
    height: number,
    supersample: number,
  ): ExportSession {
    const frameHeight =
      this.height * this.pixelRatio * exportHeightFraction(this.rig.aspect, width / height);
    return new ExportSession(
      {
        renderer: this.renderer,
        scene: this.scene,
        background: this.background,
        settings: this.currentSettings,
        bounds: this.bounds,
        clipBox: this.clipBox,
        previewFrameHeight: frameHeight,
        fov: this.rig.fov,
      },
      camera,
      { width, height, supersample },
    );
  }

  private enqueueExport<T>(signal: AbortSignal | undefined, job: () => Promise<T>): Promise<T> {
    const run = this.exportQueue.then(async () => {
      throwIfAborted(signal);
      if (this.disposed) throw new Error('Renderer was disposed');
      await this.background.whenReady();
      throwIfAborted(signal);
      this.exporting++;
      const time = this.shared.uTime.value;
      try {
        return await job();
      } finally {
        this.shared.uTime.value = time;
        this.exporting--;
        this.renderer.setRenderTarget(null);
        this.requestRender();
      }
    });
    this.exportQueue = run.catch(() => undefined);
    return run;
  }

  private async withHiddenBackground<T>(hide: boolean, fn: () => Promise<T>): Promise<T> {
    const restore = hide ? this.background.hideVisible() : null;
    try {
      return await fn();
    } finally {
      restore?.();
    }
  }

  private schedule(): void {
    if (this.raf || this.disposed) return;
    if (this.exporting > 0) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (time: number): void => {
    this.raf = 0;
    if (this.disposed || this.exporting > 0) return;
    const dt = this.lastFrame ? Math.min(0.1, (time - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = time;
    let active = this.rig.animating;
    if (this.rig.step(time, dt)) {
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
      const state = this.rig.getState();
      for (const cb of this.cameraListeners) cb(state);
    }
    if (this.dirty) {
      this.dirty = false;
      this.rig.camera.updateMatrixWorld();
      this.lighting.updateFog(this.rig.camera.position);
      this.pipeline.render(true);
    }
    if (active || this.rig.interacting || this.dirty) {
      this.schedule();
    } else {
      this.lastFrame = 0;
    }
  };
}
