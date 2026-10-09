import {
  HalfFloatType,
  WebGLRenderTarget,
  type Box3,
  type Camera,
  type Scene,
  type Texture,
  type Vector4,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { RenderSettings } from '../../core/types';
import type { BackgroundLayer } from '../scene/background';
import { EffectsStack, type FxConfig } from './effects';
import { CloudPass, type CloudConfig } from './clouds';
import {
  BackgroundCompositePass,
  BloomEffect,
  CutoutGTAOPass,
  SceneRenderPass,
  tileUvTransform,
  type TileView,
} from './passes';

export type AntialiasMode = 'msaa' | 'smaa' | 'fxaa' | 'none';

export interface PipelineConfig {
  ssao: RenderSettings['ssao'];
  bloom: RenderSettings['bloom'];
  antialias: AntialiasMode;
  msaaSamples: number;
  denoiseScale: number;
  bloomResolutionScale: number;
  clipBox: Box3 | null;
  fx?: FxConfig;
  clouds?: CloudConfig;
}

export class PostPipeline {
  readonly composer: EffectComposer;
  readonly scenePass: SceneRenderPass;
  private gtao: CutoutGTAOPass | null = null;
  private bloom: BloomEffect | null = null;
  private clouds: CloudPass | null = null;
  private readonly output = new OutputPass();
  private readonly bgPass = new BackgroundCompositePass();
  readonly fx: EffectsStack;
  private smaa: SMAAPass | null = null;
  private fxaa: FXAAPass | null = null;
  private width: number;
  private height: number;
  private passKey = '';
  private tileView: TileView | null = null;
  private externalBloom: { texture: Texture } | null = null;

  constructor(
    renderer: WebGLRenderer,
    private readonly scene: Scene,
    private camera: Camera,
    private readonly background: BackgroundLayer,
    width: number,
    height: number,
  ) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    const rt = new WebGLRenderTarget(this.width, this.height, { type: HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(1);
    this.composer.setSize(this.width, this.height);
    this.scenePass = new SceneRenderPass(scene, camera, background);
    this.fx = new EffectsStack(scene, camera);
    this.fx.setSize(this.width, this.height);
  }

  setCamera(camera: Camera, fov: number): void {
    this.camera = camera;
    this.scenePass.camera = camera;
    this.scenePass.fov = fov;
    this.gtao?.setCamera(camera);
    this.fx.setCamera(camera);
    this.clouds?.setCamera(camera);
  }

  configure(config: PipelineConfig): void {
    this.scenePass.setSamples(config.msaaSamples, this.width, this.height);

    if (config.ssao.enabled) {
      if (!this.gtao) {
        this.gtao = new CutoutGTAOPass(this.scene, this.camera, this.width, this.height);
        this.gtao.setCamera(this.camera);
      }
      this.gtao.blendIntensity = Math.max(0, config.ssao.intensity);
      this.gtao.updateGtaoMaterial({
        radius: Math.max(0.05, config.ssao.radius * 1.6),
        distanceExponent: 1.2,
        thickness: 1.2,
        distanceFallOff: 1,
        scale: 1.35,
        samples: 16,
      });
      this.gtao.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 6 * Math.max(1, config.denoiseScale),
        rings: 2,
        samples: 16,
      });
      if (config.clipBox) this.gtao.setSceneClipBox(config.clipBox);
    }

    if (config.bloom.enabled) {
      if (!this.bloom) this.bloom = new BloomEffect();
      this.bloom.strength = config.bloom.strength;
      this.bloom.radius = config.bloom.radius;
      this.bloom.threshold = config.bloom.threshold;
      this.bloom.setResolutionScale(config.bloomResolutionScale);
    }

    const cloudsOn = !!config.clouds?.settings.enabled;
    if (config.clouds && cloudsOn) {
      this.clouds ??= new CloudPass(this.scene, this.camera, this.width, this.height);
      this.clouds.configure(config.clouds);
    }

    const post = this.background.post;
    const hdrBackground = this.background.kind !== 'none';
    if (post) this.bgPass.setColors(post.top, post.bottom);
    this.bgPass.setOpaqueOnly(!post && hdrBackground);

    if (config.antialias === 'smaa' && !this.smaa) this.smaa = new SMAAPass();
    if (config.antialias === 'fxaa' && !this.fxaa) this.fxaa = new FXAAPass();

    const fx = this.fx.configure(config.fx ?? null);
    const passes: Pass[] = [this.scenePass];
    const tags = ['scene'];
    const addFx = (list: typeof fx.beforeBloom) => {
      for (const [tag, pass] of list) {
        passes.push(pass);
        tags.push(tag);
      }
    };
    if (config.ssao.enabled && this.gtao) {
      passes.push(this.gtao);
      tags.push('ao');
    }
    addFx(fx.beforeBloom);
    if (config.bloom.enabled && this.bloom) {
      passes.push(this.bloom);
      tags.push('bloom');
    }
    addFx(fx.afterBloom);
    passes.push(this.output);
    tags.push('output');
    if (cloudsOn && this.clouds) {
      passes.push(this.clouds);
      tags.push('clouds');
    }
    if (post || hdrBackground) {
      passes.push(this.bgPass);
      tags.push('bg');
    }
    addFx(fx.final);
    if (config.antialias === 'smaa' && this.smaa) {
      passes.push(this.smaa);
      tags.push('smaa');
    }
    if (config.antialias === 'fxaa' && this.fxaa) {
      passes.push(this.fxaa);
      tags.push('fxaa');
    }

    const key = tags.join('|');
    if (key !== this.passKey) {
      this.passKey = key;
      this.composer.passes.length = 0;
      for (const p of passes) this.composer.addPass(p);
    }
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.composer.setSize(w, h);
    this.fx.setSize(w, h);
    if (this.gtao && !this.composer.passes.includes(this.gtao)) this.gtao.setSize(w, h);
    if (this.bloom && !this.composer.passes.includes(this.bloom)) this.bloom.setSize(w, h);
    if (this.clouds && !this.composer.passes.includes(this.clouds)) this.clouds.setSize(w, h);
  }

  setTileView(view: TileView | null): void {
    this.tileView = view;
    this.bgPass.setTileView(view);
    this.fx.setTileView(view);
    this.clouds?.setTileView(view);
    this.updateExternalBloom();
  }

  setExternalBloom(texture: Texture | null): void {
    this.externalBloom = texture ? { texture } : null;
    this.updateExternalBloom();
  }

  private updateExternalBloom(): void {
    if (!this.bloom) return;
    if (!this.externalBloom) {
      this.bloom.external = null;
      return;
    }
    const transform: Vector4 = tileUvTransform(this.tileView);
    this.bloom.external = { texture: this.externalBloom.texture, transform };
  }

  get bloomPass(): BloomEffect | null {
    return this.bloom;
  }

  render(toScreen: boolean): Texture {
    this.composer.renderToScreen = toScreen;
    this.fx.update();
    this.composer.render(0);
    return this.composer.readBuffer.texture;
  }

  dispose(): void {
    this.scenePass.dispose();
    this.gtao?.dispose();
    this.bloom?.dispose();
    this.fx.dispose();
    this.clouds?.dispose();
    this.output.dispose();
    this.bgPass.dispose();
    this.smaa?.dispose();
    this.fxaa?.dispose();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer.dispose();
  }
}
