import {
  BackSide,
  Color,
  DataUtils,
  EquirectangularReflectionMapping,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type DataTexture,
  type Texture,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Background, RenderSettings } from '../../core/types';
import { findBrightestDirection, rotateY } from '../math/hdriSun';
import { directionToSunAngles, sunDirection, timeOfDayToSun, type SunAngles } from '../math/sun';
import { DEG, type Vec3 } from '../math/vec';

export interface HdriEntry {
  id: string;
  name: string;
  file: string;
}

function baseUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

let hdriIndexPromise: Promise<HdriEntry[]> | null = null;

export function loadHdriIndex(): Promise<HdriEntry[]> {
  if (!hdriIndexPromise) {
    hdriIndexPromise = fetch(`${baseUrl()}hdri/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load HDRI index (${r.status})`);
        return r.json() as Promise<HdriEntry[]>;
      })
      .catch((e: unknown) => {
        hdriIndexPromise = null;
        throw e;
      });
  }
  return hdriIndexPromise;
}

interface HdriAsset {
  texture: DataTexture;
  pmrem: WebGLRenderTarget;
  sun: Vec3;
}

export interface PostBackground {
  top: Color;
  bottom: Color;
}

export interface BackgroundOptions {
  transparent: boolean;
  sunFollowsBackground: boolean;
  skyClouds: number;
}

const SKY_INTENSITY = 0.55;
const SKY_ENV_SCALE = 0.25;

function createSky(): Sky {
  const sky = new Sky();
  const material = sky.material as ShaderMaterial;
  material.uniforms.skyIntensity = { value: SKY_INTENSITY };
  material.uniforms.nightAmount = { value: 0 };
  material.fragmentShader = `uniform float skyIntensity;\nuniform float nightAmount;\n${material.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    `vec3 nightSky = mix( vec3( 0.012, 0.02, 0.05 ), vec3( 0.002, 0.004, 0.014 ), smoothstep( 0.0, 0.6, direction.y ) );
      gl_FragColor = vec4( texColor * skyIntensity + nightSky * nightAmount, 1.0 );`,
  )}`;
  material.needsUpdate = true;
  sky.scale.setScalar(10);
  sky.frustumCulled = false;
  return sky;
}

function createGradientDome(top: Color, bottom: Color): Mesh<SphereGeometry, ShaderMaterial> {
  return new Mesh(
    new SphereGeometry(10, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: { top: { value: top.clone() }, bottom: { value: bottom.clone() } },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize( position );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          float t = smoothstep( -0.25, 0.6, vDir.y );
          gl_FragColor = vec4( mix( bottom * 0.6, top, t ), 1.0 );
        }
      `,
    }),
  );
}

export class BackgroundLayer {
  readonly hdrScene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 100);
  private readonly sky = createSky();
  private readonly skyEnvScene = new Scene();
  private readonly envSkyMaterial: ShaderMaterial;
  private readonly pmrem: PMREMGenerator;
  private hdriCache = new Map<string, Promise<HdriAsset>>();
  private hdriAssets = new Map<string, HdriAsset>();
  private skyEnv: WebGLRenderTarget | null = null;
  private skyKey = '';
  private reflectionTarget: WebGLRenderTarget | null = null;
  private reflectionKey = '';
  private requestedHdri: string | null = null;
  private disposed = false;

  kind: 'none' | 'sky' | 'hdri' = 'none';
  post: PostBackground | null = null;
  environment: Texture | null = null;
  reflection: Texture | null = null;
  rotation = 0;
  sunOverride: SunAngles | null = null;
  hdrIntensity = 1;
  environmentScale = 1;

  constructor(
    renderer: WebGLRenderer,
    private readonly onChange: () => void,
  ) {
    this.pmrem = new PMREMGenerator(renderer);
    this.hdrScene.add(this.sky);
    this.sky.visible = false;
    const skyMaterial = this.sky.material as ShaderMaterial;
    this.envSkyMaterial = skyMaterial.clone();
    this.envSkyMaterial.uniforms = { ...skyMaterial.uniforms, showSunDisc: { value: 0 } };
    const envSky = new Mesh(this.sky.geometry, this.envSkyMaterial);
    envSky.scale.setScalar(10);
    this.skyEnvScene.add(envSky);
  }

  apply(settings: RenderSettings, options: BackgroundOptions): void {
    const bg: Background = options.transparent ? { type: 'transparent' } : settings.background;
    this.sunOverride = null;
    this.rotation = 0;
    this.post = null;
    this.sky.visible = false;
    this.hdrScene.background = null;
    this.requestedHdri = null;

    switch (bg.type) {
      case 'solid': {
        const c = new Color(bg.color);
        this.kind = 'none';
        this.post = { top: c, bottom: c.clone() };
        this.environment = null;
        this.updateReflection(`grad:${bg.color}:${bg.color}`, c, c);
        break;
      }
      case 'gradient': {
        this.kind = 'none';
        this.post = { top: new Color(bg.top), bottom: new Color(bg.bottom) };
        this.environment = null;
        this.updateReflection(`grad:${bg.top}:${bg.bottom}`, this.post.top, this.post.bottom);
        break;
      }
      case 'transparent': {
        this.kind = 'none';
        this.environment = null;
        const top = new Color('#9cc3f0');
        const bottom = new Color('#e6eef8');
        this.updateReflection('grad:transparent', top, bottom);
        break;
      }
      case 'sky': {
        this.kind = 'sky';
        const sun = timeOfDayToSun(bg.timeOfDay, settings.sun.azimuth);
        if (options.sunFollowsBackground) this.sunOverride = sun;
        const dir = sunDirection(sun.azimuth, sun.elevation);
        const u = (this.sky.material as ShaderMaterial).uniforms;
        u.sunPosition!.value = new Vector3(dir[0], dir[1], dir[2]);
        u.turbidity!.value = bg.turbidity;
        u.rayleigh!.value = sun.elevation < 12 ? 2.4 : 1.6;
        u.mieCoefficient!.value = 0.005;
        u.mieDirectionalG!.value = 0.78;
        u.cloudCoverage!.value = options.skyClouds;
        u.cloudDensity!.value = 0.45;
        u.showSunDisc!.value = 1;
        u.nightAmount!.value = 1 - Math.min(1, Math.max(0, (sun.elevation + 8) / 10));
        this.sky.visible = true;
        const key = `${dir.map((v) => v.toFixed(4)).join(',')}:${bg.turbidity}:${options.skyClouds}`;
        if (key !== this.skyKey || !this.skyEnv) {
          this.skyKey = key;
          const old = this.skyEnv;
          this.skyEnv = this.pmrem.fromScene(this.skyEnvScene, 0, 0.1, 100);
          old?.dispose();
        }
        this.environment = this.skyEnv.texture;
        this.environmentScale = SKY_ENV_SCALE;
        this.reflection = this.skyEnv.texture;
        break;
      }
      case 'hdri': {
        this.kind = 'hdri';
        this.rotation = bg.rotation * DEG;
        this.requestedHdri = bg.id;
        const asset = this.hdriAssets.get(bg.id);
        if (asset) {
          this.useHdri(asset, bg, options);
        } else {
          this.environment = null;
          void this.loadHdri(bg.id).then(
            () => {
              if (!this.disposed && this.requestedHdri === bg.id) this.onChange();
            },
            (e: unknown) => console.error(e),
          );
        }
        break;
      }
    }
  }

  private useHdri(
    asset: HdriAsset,
    bg: Extract<Background, { type: 'hdri' }>,
    options: BackgroundOptions,
  ): void {
    this.hdrScene.background = asset.texture;
    this.hdrScene.backgroundBlurriness = Math.min(1, Math.max(0, bg.blur));
    this.hdrScene.backgroundRotation.set(0, this.rotation, 0);
    this.hdrScene.backgroundIntensity = this.hdrIntensity;
    this.environment = asset.pmrem.texture;
    this.environmentScale = 1;
    this.reflection = asset.pmrem.texture;
    if (options.sunFollowsBackground) {
      this.sunOverride = directionToSunAngles(rotateY(asset.sun, this.rotation));
      this.sunOverride.elevation = Math.max(4, this.sunOverride.elevation);
    }
  }

  hideVisible(): () => void {
    const kind = this.kind;
    const post = this.post;
    this.kind = 'none';
    this.post = null;
    return () => {
      this.kind = kind;
      this.post = post;
    };
  }

  isLoading(): boolean {
    return this.kind === 'hdri' && !this.hdrScene.background;
  }

  private loadHdri(id: string): Promise<HdriAsset> {
    let p = this.hdriCache.get(id);
    if (!p) {
      p = loadHdriIndex().then(async (list) => {
        const entry = list.find((e) => e.id === id);
        if (!entry) throw new Error(`Unknown HDRI: ${id}`);
        const loader = new HDRLoader();
        loader.setDataType(HalfFloatType);
        const texture = await loader.loadAsync(`${baseUrl()}hdri/${entry.file}`);
        texture.mapping = EquirectangularReflectionMapping;
        const sun = detectHdriSun(texture);
        const pmrem = this.pmrem.fromEquirectangular(texture);
        const asset: HdriAsset = { texture, pmrem, sun };
        if (this.disposed) {
          texture.dispose();
          pmrem.dispose();
        } else {
          this.hdriAssets.set(id, asset);
        }
        return asset;
      });
      p.catch(() => this.hdriCache.delete(id));
      this.hdriCache.set(id, p);
    }
    return p;
  }

  async whenReady(): Promise<void> {
    if (this.kind === 'hdri' && this.requestedHdri && !this.hdriAssets.has(this.requestedHdri)) {
      await this.loadHdri(this.requestedHdri);
    }
  }

  private updateReflection(key: string, top: Color, bottom: Color): void {
    if (key === this.reflectionKey && this.reflectionTarget) {
      this.reflection = this.reflectionTarget.texture;
      return;
    }
    this.reflectionKey = key;
    const scene = new Scene();
    const dome = createGradientDome(top, bottom);
    scene.add(dome);
    const old = this.reflectionTarget;
    this.reflectionTarget = this.pmrem.fromScene(scene, 0.02, 0.1, 100);
    old?.dispose();
    dome.geometry.dispose();
    dome.material.dispose();
    this.reflection = this.reflectionTarget.texture;
  }

  syncCamera(camera: Camera, fov: number): void {
    const cam = this.camera;
    camera.updateMatrixWorld();
    camera.matrixWorld.decompose(new Vector3(), cam.quaternion, new Vector3());
    cam.position.set(0, 0, 0);
    if (camera instanceof PerspectiveCamera) {
      cam.fov = camera.fov;
      cam.aspect = camera.aspect;
      cam.zoom = 1;
      const v = camera.view;
      if (v && v.enabled) {
        cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
      } else {
        cam.clearViewOffset();
      }
    } else if (camera instanceof OrthographicCamera) {
      cam.fov = fov;
      cam.aspect = (camera.right - camera.left) / Math.max(1e-6, camera.top - camera.bottom);
      cam.zoom = 1;
      const v = camera.view;
      if (v && v.enabled) {
        cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
      } else {
        cam.clearViewOffset();
      }
    }
    cam.near = 0.1;
    cam.far = 100;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  renderHDR(renderer: WebGLRenderer, camera: Camera, fov: number): boolean {
    if (this.kind === 'none') return false;
    if (this.kind === 'hdri' && !this.hdrScene.background) return false;
    this.syncCamera(camera, fov);
    renderer.render(this.hdrScene, this.camera);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.sky.geometry.dispose();
    (this.sky.material as ShaderMaterial).dispose();
    this.envSkyMaterial.dispose();
    this.skyEnv?.dispose();
    this.reflectionTarget?.dispose();
    for (const a of this.hdriAssets.values()) {
      a.texture.dispose();
      a.pmrem.dispose();
    }
    this.hdriAssets.clear();
    this.hdriCache.clear();
    this.pmrem.dispose();
  }
}

function detectHdriSun(texture: DataTexture): Vec3 {
  const { data, width, height } = texture.image as {
    data: Uint16Array | Float32Array;
    width: number;
    height: number;
  };
  const lum = new Float32Array(width * height);
  const half = data instanceof Uint16Array;
  const rows = Math.ceil(height / 2);
  for (let i = 0; i < width * rows; i++) {
    const r = half ? DataUtils.fromHalfFloat(data[i * 4]!) : data[i * 4]!;
    const g = half ? DataUtils.fromHalfFloat(data[i * 4 + 1]!) : data[i * 4 + 1]!;
    const b = half ? DataUtils.fromHalfFloat(data[i * 4 + 2]!) : data[i * 4 + 2]!;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return findBrightestDirection(lum, width, height).direction;
}
