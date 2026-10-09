import {
  OrthographicCamera,
  PerspectiveCamera,
  UnsignedByteType,
  WebGLRenderTarget,
  type Box3,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { RenderSettings } from '../../core/types';
import { fxMarginPixels } from '../math/effects';
import { aoMarginPixels, computeTileLayout, type TileLayout } from '../math/tiles';
import { boxCorners, DEG, type Bounds, type Vec3 } from '../math/vec';
import { fxConfigFrom } from '../post/effects';
import { DownsampleCopy } from '../post/passes';
import { PostPipeline } from '../post/pipeline';
import type { BackgroundLayer } from '../scene/background';
import { nextTask, throwIfAborted } from './encode';

export interface ExportHost {
  renderer: WebGLRenderer;
  scene: Scene;
  background: BackgroundLayer;
  settings: RenderSettings;
  bounds: Bounds | null;
  clipBox: Box3 | null;
  previewFrameHeight: number;
  fov: number;
  focusPoint?: Vec3 | null;
}

export interface ExportSessionOptions {
  width: number;
  height: number;
  supersample: number;
  maxTileSize?: number;
}

export type ExportCamera = PerspectiveCamera | OrthographicCamera;

const BLOOM_PREPASS_MAX = 2048;

export class ExportSession {
  private readonly pipeline: PostPipeline;
  private readonly prepass: PostPipeline | null = null;
  private readonly downsample = new DownsampleCopy();
  private readonly outTargets = new Map<string, WebGLRenderTarget>();
  readonly width: number;
  readonly height: number;
  readonly supersample: number;
  private readonly maxTile: number;
  private readonly resolutionFactor: number;
  private readonly prepassSize: [number, number];

  constructor(
    private readonly host: ExportHost,
    camera: ExportCamera,
    options: ExportSessionOptions,
  ) {
    this.width = Math.max(1, Math.round(options.width));
    this.height = Math.max(1, Math.round(options.height));
    this.supersample = Math.max(1, Math.round(options.supersample));
    const r = host.renderer;
    const gl = r.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const hardMax = Math.min(
      r.capabilities.maxTextureSize,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      viewport[0] ?? 4096,
      viewport[1] ?? 4096,
    );
    const msaa = this.supersample === 1 ? Math.min(4, r.capabilities.maxSamples) : 0;
    const budget = msaa > 0 ? 2048 : 4096;
    this.maxTile = Math.min(hardMax, options.maxTileSize ?? budget);

    const fullHeight = this.height * this.supersample;
    this.resolutionFactor = fullHeight / Math.max(1, host.previewFrameHeight);

    this.pipeline = new PostPipeline(r, host.scene, camera, host.background, 16, 16);
    this.pipeline.setCamera(camera, host.fov);
    const s = host.settings;
    this.pipeline.configure({
      ssao: s.ssao,
      bloom: s.bloom,
      antialias: 'none',
      msaaSamples: msaa,
      denoiseScale: Math.min(4, Math.max(1, this.resolutionFactor)),
      bloomResolutionScale: 1,
      clipBox: host.clipBox,
      fx: fxConfigFrom(s, host.focusPoint ?? null),
    });

    const aspect = this.width / this.height;
    let ph = Math.min(BLOOM_PREPASS_MAX, Math.max(64, Math.round(host.previewFrameHeight)));
    let pw = Math.round(ph * aspect);
    if (pw > BLOOM_PREPASS_MAX) {
      pw = BLOOM_PREPASS_MAX;
      ph = Math.max(16, Math.round(pw / aspect));
    }
    this.prepassSize = [pw, ph];
    if (s.bloom.enabled || s.godRays.enabled) {
      this.prepass = new PostPipeline(r, host.scene, camera, host.background, pw, ph);
      this.prepass.setCamera(camera, host.fov);
      this.prepass.configure({
        ssao: { ...s.ssao, enabled: false },
        bloom: s.bloom,
        antialias: 'none',
        msaaSamples: 0,
        denoiseScale: 1,
        bloomResolutionScale: 1,
        clipBox: null,
        fx: fxConfigFrom(s, null, true),
      });
    }
  }

  layoutFor(camera: ExportCamera): TileLayout {
    const fullHeight = this.height * this.supersample;
    let margin = 8;
    const s = this.host.settings;
    if (s.ssao.enabled) {
      const pxPerUnit = this.pixelsPerUnit(camera, fullHeight);
      margin = aoMarginPixels(
        s.ssao.radius * 1.6,
        pxPerUnit,
        6 * Math.min(4, this.resolutionFactor),
      );
    }
    margin += fxMarginPixels(s, this.width * this.supersample, fullHeight);
    return computeTileLayout({
      width: this.width,
      height: this.height,
      supersample: this.supersample,
      maxTileSize: this.maxTile,
      margin,
    });
  }

  private pixelsPerUnit(camera: ExportCamera, fullHeight: number): number {
    if (camera instanceof OrthographicCamera) {
      return (fullHeight * camera.zoom) / Math.max(1e-6, camera.top - camera.bottom);
    }
    let nearest = Infinity;
    const b = this.host.bounds;
    if (b) {
      const p = camera.position;
      const dx = Math.max(b.min[0] - p.x, 0, p.x - b.max[0]);
      const dy = Math.max(b.min[1] - p.y, 0, p.y - b.max[1]);
      const dz = Math.max(b.min[2] - p.z, 0, p.z - b.max[2]);
      nearest = Math.hypot(dx, dy, dz);
      if (nearest === 0) {
        nearest = Infinity;
        for (const c of boxCorners(b)) {
          nearest = Math.min(nearest, Math.hypot(c[0] - p.x, c[1] - p.y, c[2] - p.z));
        }
        nearest = Math.min(nearest, 2);
      }
    }
    const d = Math.max(1, Math.min(nearest, 1e6));
    return fullHeight / (2 * d * Math.tan((camera.fov * DEG) / 2));
  }

  private outTarget(w: number, h: number): WebGLRenderTarget {
    const key = `${w}x${h}`;
    let t = this.outTargets.get(key);
    if (!t) {
      t = new WebGLRenderTarget(w, h, { type: UnsignedByteType, depthBuffer: false });
      this.outTargets.set(key, t);
    }
    return t;
  }

  async renderFrame(
    camera: ExportCamera,
    transparent: boolean,
    onTile?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<ImageData> {
    const r = this.host.renderer;
    const layout = this.layoutFor(camera);
    const ss = this.supersample;
    camera.updateMatrixWorld();

    if (this.prepass) {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      this.prepass.setCamera(camera, this.host.fov);
      this.prepass.setSize(this.prepassSize[0], this.prepassSize[1]);
      this.prepass.render(false);
      const bloom = this.prepass.bloomPass;
      this.pipeline.setExternalBloom(bloom ? bloom.bloomTexture : null);
      this.pipeline.fx.setExternalRays(this.prepass.fx.raysTexture);
    }

    const image = new ImageData(this.width, this.height);
    const out = image.data;
    let done = 0;
    for (const tile of layout.tiles) {
      throwIfAborted(signal);
      const rr = tile.render;
      if (layout.tiles.length > 1) {
        camera.setViewOffset(layout.fullWidth, layout.fullHeight, rr.x, rr.y, rr.width, rr.height);
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
      this.pipeline.setCamera(camera, this.host.fov);
      this.pipeline.setSize(rr.width, rr.height);
      this.pipeline.setTileView({
        fullWidth: layout.fullWidth,
        fullHeight: layout.fullHeight,
        x: rr.x,
        y: rr.y,
        width: rr.width,
        height: rr.height,
      });
      const tex = this.pipeline.render(false);
      const ow = tile.output.width;
      const oh = tile.output.height;
      const target = this.outTarget(ow, oh);
      const offY = rr.height - tile.cropY - tile.core.height;
      this.downsample.render(r, tex, target, tile.cropX, offY, ss);
      const pixels = new Uint8Array(ow * oh * 4);
      r.readRenderTargetPixels(target, 0, 0, ow, oh, pixels);
      for (let y = 0; y < oh; y++) {
        const src = (oh - 1 - y) * ow * 4;
        const dst = ((tile.output.y + y) * this.width + tile.output.x) * 4;
        out.set(pixels.subarray(src, src + ow * 4), dst);
      }
      done++;
      onTile?.(done, layout.tiles.length);
      if (layout.tiles.length > 1) await nextTask();
    }
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    r.setRenderTarget(null);

    if (transparent) {
      for (let i = 0; i < out.length; i += 4) {
        const a = out[i + 3]!;
        if (a === 0) {
          out[i] = 0;
          out[i + 1] = 0;
          out[i + 2] = 0;
        } else if (a < 255) {
          const k = 255 / a;
          out[i] = Math.min(255, Math.round(out[i]! * k));
          out[i + 1] = Math.min(255, Math.round(out[i + 1]! * k));
          out[i + 2] = Math.min(255, Math.round(out[i + 2]! * k));
        }
      }
    } else {
      for (let i = 3; i < out.length; i += 4) out[i] = 255;
    }
    return image;
  }

  dispose(): void {
    this.pipeline.dispose();
    this.prepass?.dispose();
    this.downsample.dispose();
    for (const t of this.outTargets.values()) t.dispose();
    this.outTargets.clear();
  }
}
