import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  NeutralToneMapping,
  NoToneMapping,
  SRGBColorSpace,
  type Scene,
  type Vector3,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import type { RenderSettings } from '../../core/types';
import { fogRange } from '../math/fog';
import { fitShadowCamera } from '../math/shadowFit';
import { sunDirection, sunLookForElevation } from '../math/sun';
import type { Bounds, Vec3 } from '../math/vec';
import type { BackgroundLayer } from './background';

const TONE_MAPPING: Record<RenderSettings['toneMapping'], ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  none: NoToneMapping,
};

const MOON_TINT = new Color(0.55, 0.68, 1.0);
const GROUND_BOUNCE = new Color(0x6b5a45);

function srgb(v: Vec3): Color {
  return new Color().setRGB(v[0], v[1], v[2], SRGBColorSpace);
}

export interface LightingInput {
  settings: RenderSettings;
  background: BackgroundLayer;
  bounds: Bounds | null;
  groundY: number | undefined;
  shadowReach: number;
}

export class SceneLighting {
  readonly sun = new DirectionalLight(0xffffff, 2.5);
  readonly hemi = new HemisphereLight(0xcfe3ff, 0x6b5a45, 0.6);
  private shadowKey = '';
  private fogDensity = 0;
  private fogBounds: Bounds | null = null;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
  ) {
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    scene.add(this.sun, this.sun.target, this.hemi);
  }

  invalidateShadow(): void {
    this.shadowKey = '';
  }

  apply(input: LightingInput): void {
    const { settings: s, background } = input;
    this.renderer.toneMapping = TONE_MAPPING[s.toneMapping] ?? NeutralToneMapping;
    this.renderer.toneMappingExposure = s.exposure;

    const override = background.sunOverride;
    const azimuth = override ? override.azimuth : s.sun.azimuth;
    const elevation = override ? override.elevation : s.sun.elevation;
    let dir = sunDirection(azimuth, elevation);
    const sunColor = new Color(s.sun.color);
    let sunIntensity = s.sun.intensity;
    const ambientColor = new Color(s.ambient.color);
    let ambientIntensity = s.ambient.intensity;

    if (background.kind === 'sky' && override) {
      const look = sunLookForElevation(elevation);
      ambientColor.lerp(srgb(look.ambientColor), 0.7);
      ambientIntensity *= look.ambientIntensity;
      if (look.moon > look.intensity) {
        dir = sunDirection(azimuth + 180, Math.min(60, Math.max(25, -elevation)));
        sunColor.multiply(MOON_TINT);
        sunIntensity *= 0.22 * look.moon;
      } else {
        dir = sunDirection(azimuth, look.lightElevation);
        sunColor.multiply(srgb(look.color));
        sunIntensity *= look.intensity;
      }
    }
    this.sun.color.copy(sunColor);
    this.sun.intensity = sunIntensity;

    const envActive =
      s.useBackgroundLighting &&
      (background.kind === 'sky' || background.kind === 'hdri') &&
      !!background.environment;
    this.hemi.color.copy(ambientColor);
    this.hemi.groundColor.copy(ambientColor).multiplyScalar(0.32).lerp(GROUND_BOUNCE, 0.35);
    if (envActive) {
      this.scene.environment = background.environment;
      this.scene.environmentIntensity = ambientIntensity * background.environmentScale;
      this.scene.environmentRotation.set(
        0,
        background.kind === 'hdri' ? background.rotation : 0,
        0,
      );
      this.hemi.intensity = ambientIntensity * 0.35;
    } else {
      this.scene.environment = null;
      this.hemi.intensity = ambientIntensity * 1.5;
    }

    this.applyShadow(input, dir, sunIntensity);

    this.fogBounds = input.bounds;
    this.fogDensity = s.fog.enabled ? Math.max(0, s.fog.density) : 0;
    if (this.fogDensity > 0) {
      const fogColor = new Color(s.fog.color);
      if (this.scene.fog instanceof Fog) this.scene.fog.color.copy(fogColor);
      else this.scene.fog = new Fog(fogColor, 1, 1000);
    } else {
      this.scene.fog = null;
    }
  }

  updateFog(cameraPosition: Vector3): void {
    const fog = this.scene.fog;
    if (!(fog instanceof Fog)) return;
    const range = fogRange(
      this.fogBounds,
      [cameraPosition.x, cameraPosition.y, cameraPosition.z],
      this.fogDensity,
    );
    fog.near = range.near;
    fog.far = range.far;
  }

  private applyShadow(input: LightingInput, dir: Vec3, sunIntensity: number): void {
    const s = input.settings;
    this.sun.castShadow = s.shadows.enabled && sunIntensity > 0;
    const size = s.shadows.mapSize;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.shadowKey = '';
    }
    this.sun.shadow.radius = 1 + Math.max(0, s.shadows.softness) * 2;
    const bounds = input.bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
    const key = [
      dir.map((v) => v.toFixed(5)).join(','),
      size,
      s.shadows.softness,
      bounds.min.join(','),
      bounds.max.join(','),
      input.groundY ?? 'none',
      input.shadowReach.toFixed(2),
    ].join('|');
    if (key === this.shadowKey) return;
    this.shadowKey = key;
    const fit = fitShadowCamera(bounds, dir, size, {
      groundY: input.groundY,
      softness: s.shadows.softness,
      maxShadowLength: input.shadowReach,
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

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
    this.hemi.dispose();
    this.scene.remove(this.sun, this.sun.target, this.hemi);
  }
}
