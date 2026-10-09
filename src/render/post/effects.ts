import { Vector3, type Camera, type Scene, type Texture, type Vector4 } from 'three';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type {
  DofSettings,
  GlintSettings,
  GodRaySettings,
  GradingSettings,
  RenderSettings,
  VignetteSettings,
} from '../../core/types';
import { focusDepth } from '../math/effects';
import type { Vec3 } from '../math/vec';
import { DepthPass, DofPass } from './dof';
import { GlintPass } from './glints';
import { GodRaysPass } from './godrays';
import { GradingPass } from './grading';
import { tileUvTransform, type TileView } from './passes';

export interface FxSettings {
  grading: GradingSettings;
  vignette: VignetteSettings;
  dof: DofSettings;
  glints: GlintSettings;
  godRays: GodRaySettings;
}

export interface FxConfig {
  settings: FxSettings;
  focusPoint: Vec3 | null;
}

export type TaggedPass = readonly [string, Pass];

export interface FxPlan {
  beforeBloom: TaggedPass[];
  afterBloom: TaggedPass[];
  final: TaggedPass[];
}

const EMPTY_PLAN: FxPlan = { beforeBloom: [], afterBloom: [], final: [] };

export function fxConfigFrom(
  settings: RenderSettings,
  focusPoint: Vec3 | null,
  prepass = false,
): FxConfig {
  const fx: FxSettings = {
    grading: settings.grading,
    vignette: settings.vignette,
    dof: settings.dof,
    glints: settings.glints,
    godRays: settings.godRays,
  };
  if (prepass) {
    fx.grading = { ...fx.grading, enabled: false };
    fx.vignette = { ...fx.vignette, enabled: false };
    fx.dof = { ...fx.dof, enabled: false };
    fx.glints = { ...fx.glints, enabled: false };
  }
  return { settings: fx, focusPoint };
}

export class EffectsStack {
  private depth: DepthPass | null = null;
  private dof: DofPass | null = null;
  private glints: GlintPass | null = null;
  private godRays: GodRaysPass | null = null;
  private grading: GradingPass | null = null;
  private config: FxConfig | null = null;
  private width = 1;
  private height = 1;
  private tileView: TileView | null = null;
  private externalRays: Texture | null = null;
  private readonly forward = new Vector3();

  constructor(
    private readonly scene: Scene,
    private camera: Camera,
  ) {}

  setCamera(camera: Camera): void {
    this.camera = camera;
    if (this.depth) this.depth.camera = camera;
    if (this.godRays) this.godRays.camera = camera;
  }

  configure(config: FxConfig | null): FxPlan {
    this.config = config;
    if (!config) return EMPTY_PLAN;
    const { grading, vignette, dof, glints, godRays } = config.settings;
    const plan: FxPlan = { beforeBloom: [], afterBloom: [], final: [] };

    if (godRays.enabled) {
      this.godRays ??= this.init(new GodRaysPass(this.scene, this.camera));
      this.godRays.setParams(godRays);
      this.updateExternalRays();
      plan.beforeBloom.push(['godrays', this.godRays]);
    }
    if (dof.enabled) {
      this.depth ??= this.init(new DepthPass(this.scene, this.camera));
      this.dof ??= this.init(new DofPass(this.depth));
      this.dof.setParams(dof);
      this.dof.setTileView(this.tileView);
      plan.beforeBloom.push(['depth', this.depth], ['dof', this.dof]);
    }
    if (glints.enabled) {
      this.glints ??= this.init(new GlintPass());
      this.glints.setParams(glints);
      this.glints.setTileView(this.tileView);
      plan.afterBloom.push(['glints', this.glints]);
    }
    if (grading.enabled || vignette.enabled) {
      this.grading ??= this.init(new GradingPass());
      this.grading.setParams(grading, vignette);
      this.grading.setTileView(this.tileView);
      plan.final.push(['grading', this.grading]);
    }
    return plan;
  }

  private init<T extends Pass>(pass: T): T {
    pass.setSize(this.width, this.height);
    return pass;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const pass of this.passes()) pass.setSize(width, height);
  }

  setTileView(view: TileView | null): void {
    this.tileView = view;
    this.dof?.setTileView(view);
    this.glints?.setTileView(view);
    this.grading?.setTileView(view);
    this.updateExternalRays();
  }

  setExternalRays(texture: Texture | null): void {
    this.externalRays = texture;
    this.updateExternalRays();
  }

  get raysTexture(): Texture | null {
    return this.godRays?.raysTexture ?? null;
  }

  update(): void {
    if (!this.dof || !this.config?.settings.dof.enabled) return;
    const dof = this.config.settings.dof;
    const camera = this.camera as Camera & {
      near: number;
      far: number;
      isOrthographicCamera?: boolean;
    };
    camera.updateMatrixWorld();
    let focus = dof.focusDistance;
    if (dof.autoFocus) {
      const p = camera.position;
      camera.getWorldDirection(this.forward);
      const point = this.config.focusPoint ?? [0, 0, 0];
      focus = focusDepth([p.x, p.y, p.z], [this.forward.x, this.forward.y, this.forward.z], point);
    }
    this.dof.setFrame({
      near: camera.near,
      far: camera.far,
      orthographic: !!camera.isOrthographicCamera,
      focus,
    });
  }

  private updateExternalRays(): void {
    if (!this.godRays) return;
    if (!this.externalRays) {
      this.godRays.external = null;
      return;
    }
    const transform: Vector4 = tileUvTransform(this.tileView);
    this.godRays.external = { texture: this.externalRays, transform };
  }

  private passes(): Pass[] {
    const all: Array<Pass | null> = [this.depth, this.dof, this.glints, this.godRays, this.grading];
    return all.filter((p): p is Pass => p !== null);
  }

  dispose(): void {
    for (const pass of this.passes()) pass.dispose();
  }
}
