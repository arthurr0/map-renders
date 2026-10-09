import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  ShadowMaterial,
  Vector2,
  type Material,
} from 'three';
import type { GroundType } from '../../core/types';
import {
  createWaterSurfaceMaterial,
  fadeUniforms,
  patchBlockShader,
  type SharedUniforms,
} from './materials';
import type { Bounds } from '../math/vec';

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
      const blockShade = ((blockX * 7 + blockY * 13) % 5) * 0.012;
      const v = 0.86 + rand() * 0.16 - blockShade;
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

export class Ground {
  readonly group = new Group();
  private type: GroundType = 'none';
  private mesh: Mesh | null = null;
  private material: Material | null = null;
  private grassTexture: CanvasTexture | null = null;
  private bounds: Bounds | null = null;
  private anisotropy = 1;

  constructor(private readonly shared: SharedUniforms) {
    this.group.name = 'ground';
  }

  setAnisotropy(value: number): void {
    this.anisotropy = value;
  }

  get radius(): number {
    if (!this.bounds) return 100;
    const sx = this.bounds.max[0] - this.bounds.min[0];
    const sz = this.bounds.max[2] - this.bounds.min[2];
    return Math.max(160, Math.hypot(sx, sz) * 5);
  }

  get current(): GroundType {
    return this.type;
  }

  get visibleMesh(): Mesh | null {
    return this.mesh;
  }

  update(type: GroundType, bounds: Bounds | null): void {
    const sameBounds =
      this.bounds === bounds ||
      (!!this.bounds &&
        !!bounds &&
        this.bounds.min.every((v, i) => v === bounds.min[i]) &&
        this.bounds.max.every((v, i) => v === bounds.max[i]));
    if (type === this.type && sameBounds) return;
    this.type = type;
    this.bounds = bounds;
    this.clear();
    if (type === 'none') return;

    const b: Bounds = bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const sx = b.max[0] - b.min[0];
    const sz = b.max[2] - b.min[2];
    const footprint = Math.hypot(sx, sz) / 2;
    const radius = this.radius;
    const center = new Vector2(cx, cz);
    const geometry = new CircleGeometry(radius, 96);
    geometry.rotateX(-Math.PI / 2);

    let material: Material;
    switch (type) {
      case 'shadow-catcher': {
        material = new ShadowMaterial({ opacity: 0.38, transparent: true, depthWrite: false });
        break;
      }
      case 'grass': {
        this.grassTexture = createGrassTexture();
        this.grassTexture.anisotropy = this.anisotropy;
        this.grassTexture.repeat.set(radius / 2, radius / 2);
        this.grassTexture.offset.set((cx - radius) / 4, -(cz + radius) / 4);
        const m = new MeshStandardMaterial({
          color: new Color('#79c05a').multiplyScalar(0.92),
          map: this.grassTexture,
          roughness: 1,
          metalness: 0,
          transparent: true,
        });
        const extra = fadeUniforms({ center, inner: footprint * 1.6 + 8, outer: radius * 0.92 });
        m.onBeforeCompile = (shader) =>
          patchBlockShader(shader, this.shared, { fade: { center, inner: 0, outer: 0 } }, extra);
        m.customProgramCacheKey = () => 'ground-grass';
        material = m;
        break;
      }
      case 'grid': {
        const m = new MeshStandardMaterial({
          color: new Color('#e5e7eb'),
          roughness: 0.95,
          metalness: 0,
          transparent: true,
        });
        const extra = fadeUniforms({ center, inner: footprint * 1.4 + 6, outer: radius * 0.7 });
        m.onBeforeCompile = (shader) =>
          patchBlockShader(
            shader,
            this.shared,
            { fade: { center, inner: 0, outer: 0 }, grid: true },
            extra,
          );
        m.customProgramCacheKey = () => 'ground-grid';
        material = m;
        break;
      }
      case 'water': {
        material = createWaterSurfaceMaterial(this.shared, {
          center,
          inner: footprint * 2 + 16,
          outer: radius * 0.95,
        });
        break;
      }
    }

    const mesh = new Mesh(geometry, material);
    mesh.position.set(cx, b.min[1] - (type === 'water' ? 0.12 : 0.002), cz);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = type === 'water' ? 1 : -1;
    mesh.userData.isGround = true;
    if (type === 'shadow-catcher') mesh.userData.excludeFromAO = true;
    this.mesh = mesh;
    this.material = material;
    this.group.add(mesh);
  }

  isWater(): boolean {
    return this.type === 'water';
  }

  setEnvMap(texture: import('three').Texture | null): void {
    if (this.type === 'water' && this.material instanceof MeshStandardMaterial) {
      this.material.envMap = texture;
      this.material.needsUpdate = true;
    }
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
