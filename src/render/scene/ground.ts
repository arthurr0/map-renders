import {
  CanvasTexture,
  Color,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ShadowMaterial,
  Vector2,
  Vector3,
  type IUniform,
  type Material,
  type Texture,
} from 'three';
import type { GroundType } from '../../core/types';
import { GROUND_TERMS, patchBlockShader, type SharedUniforms } from './materials';
import type { Bounds } from '../math/vec';

const GROUND_EXTENT = 12000;
const GROUND_SEGMENTS = 96;

function createGrassTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const img = ctx.createImageData(size, size);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const blockX = Math.floor(x / 16);
      const blockY = Math.floor(y / 16);
      const blockShade = ((blockX * 7 + blockY * 13) % 5) * 0.015;
      const v = 0.84 + rand() * 0.16 - blockShade;
      const g = Math.min(255, Math.round(v * 255));
      const i = (x + y * size) * 4;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  return tex;
}

export interface GroundExtents {
  shadowFadeInner: number;
  shadowFadeOuter: number;
}

export function groundExtents(bounds: Bounds | null): GroundExtents {
  const b = bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
  const footprint = Math.hypot(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2;
  return {
    shadowFadeInner: footprint * 0.9 + 4,
    shadowFadeOuter: footprint * 1.8 + 16,
  };
}

const SHADOW_CATCHER_LINE = 'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );';

export class Ground {
  readonly group = new Group();
  private type: GroundType = 'none';
  private boundsKey = '';
  private mesh: Mesh | null = null;
  private material: Material | null = null;
  private grassTexture: CanvasTexture | null = null;
  private envMap: Texture | null = null;
  private readonly uniforms: Record<string, IUniform> = {
    uGroundCenter: { value: new Vector3() },
    uHalfSize: { value: new Vector2(8, 8) },
    uFootprint: { value: 8 },
    uShadowFadeInner: { value: 20 },
    uShadowFadeOuter: { value: 40 },
    uContact: { value: 1 },
    uGridLineColor: { value: new Color('#6b7280') },
  };

  constructor(
    private readonly shared: SharedUniforms,
    private readonly anisotropy: number,
  ) {
    this.group.name = 'ground';
  }

  get extent(): number {
    return this.type === 'none' ? 0 : GROUND_EXTENT;
  }

  isWater(): boolean {
    return this.type === 'water';
  }

  update(type: GroundType, bounds: Bounds | null): void {
    const b: Bounds = bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
    const key = `${b.min.join(',')}|${b.max.join(',')}`;
    if (key !== this.boundsKey) {
      this.boundsKey = key;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      const hx = (b.max[0] - b.min[0]) / 2;
      const hz = (b.max[2] - b.min[2]) / 2;
      const ext = groundExtents(b);
      (this.uniforms.uGroundCenter!.value as Vector3).set(cx, b.min[1], cz);
      (this.uniforms.uHalfSize!.value as Vector2).set(hx, hz);
      this.uniforms.uFootprint!.value = Math.hypot(hx, hz);
      this.uniforms.uShadowFadeInner!.value = ext.shadowFadeInner;
      this.uniforms.uShadowFadeOuter!.value = ext.shadowFadeOuter;
      if (this.mesh) this.place(this.mesh, b);
    }
    if (type === this.type) return;
    this.type = type;
    this.clear();
    if (type === 'none') return;

    const geometry = new PlaneGeometry(
      GROUND_EXTENT * 2,
      GROUND_EXTENT * 2,
      GROUND_SEGMENTS,
      GROUND_SEGMENTS,
    );
    geometry.rotateX(-Math.PI / 2);
    this.uniforms.uContact!.value = type === 'water' ? 0 : 1;

    let material: Material;
    switch (type) {
      case 'shadow-catcher': {
        const m = new ShadowMaterial({ opacity: 0.4, transparent: true, depthWrite: false });
        m.onBeforeCompile = (shader) => {
          patchBlockShader(shader, this.shared, {}, this.uniforms);
          shader.fragmentShader = shader.fragmentShader.replace(
            SHADOW_CATCHER_LINE,
            `${GROUND_TERMS}
            float shadowAmount = ( 1.0 - getShadowMask() ) * gShadowFade;
            gl_FragColor = vec4( color, opacity * max( shadowAmount, gContact * 0.55 ) * gFade );`,
          );
        };
        m.customProgramCacheKey = () => 'ground-catcher';
        material = m;
        break;
      }
      case 'grass': {
        this.grassTexture = createGrassTexture();
        this.grassTexture.anisotropy = this.anisotropy;
        const m = new MeshStandardMaterial({
          color: new Color('#6f9a52'),
          map: this.grassTexture,
          roughness: 1,
          metalness: 0,
          transparent: true,
        });
        m.onBeforeCompile = (shader) =>
          patchBlockShader(shader, this.shared, { ground: true, worldUv: true }, this.uniforms);
        m.customProgramCacheKey = () => 'ground-grass';
        material = m;
        break;
      }
      case 'grid': {
        const m = new MeshStandardMaterial({
          color: new Color('#c3c8d0'),
          roughness: 0.95,
          metalness: 0,
          transparent: true,
        });
        m.onBeforeCompile = (shader) =>
          patchBlockShader(shader, this.shared, { ground: true, grid: true }, this.uniforms);
        m.customProgramCacheKey = () => 'ground-grid';
        material = m;
        break;
      }
      case 'water': {
        const m = new MeshStandardMaterial({
          color: new Color('#3c8fa8'),
          roughness: 0.1,
          metalness: 0,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          envMap: this.envMap,
          envMapIntensity: 0.5,
        });
        m.onBeforeCompile = (shader) =>
          patchBlockShader(shader, this.shared, { ground: true, water: true }, this.uniforms);
        m.customProgramCacheKey = () => 'ground-water';
        material = m;
        break;
      }
    }

    const mesh = new Mesh(geometry, material);
    this.place(mesh, b);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = type === 'water' ? 1 : -1;
    mesh.frustumCulled = false;
    if (type === 'shadow-catcher') mesh.userData.excludeFromAO = true;
    this.mesh = mesh;
    this.material = material;
    this.group.add(mesh);
  }

  setEnvMap(texture: Texture | null, rotationY: number): void {
    if (this.envMap === texture) return;
    this.envMap = texture;
    if (this.material instanceof MeshStandardMaterial && this.type === 'water') {
      this.material.envMap = texture;
      this.material.envMapRotation.set(0, rotationY, 0);
      this.material.needsUpdate = true;
    }
  }

  private place(mesh: Mesh, b: Bounds): void {
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    mesh.position.set(cx, b.min[1] - (this.type === 'water' ? 0.12 : 0.002), cz);
  }

  private clear(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.material?.dispose();
    this.grassTexture?.dispose();
    this.mesh = null;
    this.material = null;
    this.grassTexture = null;
  }

  dispose(): void {
    this.clear();
  }
}
