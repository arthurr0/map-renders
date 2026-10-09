import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraState } from '../../core/types';
import { fitPreset, type CameraPreset } from '../math/cameraFit';
import { interpolateCamera } from '../math/cameraTween';
import { exportFov, exportHeightFraction } from '../math/tiles';
import { DEG, boxCenter, boxSize, length, type Bounds, type Vec3 } from '../math/vec';

export type RigCamera = PerspectiveCamera | OrthographicCamera;

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

export interface RigCallbacks {
  onChange: () => void;
  onInteraction: (active: boolean) => void;
  onProjectionChange: (camera: RigCamera) => void;
}

export class CameraRig {
  readonly perspCamera = new PerspectiveCamera(45, 1, 0.1, 2000);
  readonly orthoCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  readonly controls: OrbitControls;
  private active: RigCamera = this.perspCamera;
  private fovDeg = 45;
  private orthoBase = 20;
  private viewWidth = 1;
  private viewHeight = 1;
  private bounds: Bounds | null = null;
  private farExtent = 100;
  private animation: CameraAnimation | null = null;
  private interactingNow = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly callbacks: RigCallbacks,
  ) {
    this.controls = new OrbitControls(this.active, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.maxPolarAngle = Math.PI - 0.01;
    this.controls.addEventListener('change', this.handleChange);
    this.controls.addEventListener('start', this.handleStart);
    this.controls.addEventListener('end', this.handleEnd);
  }

  get camera(): RigCamera {
    return this.active;
  }

  get fov(): number {
    return this.fovDeg;
  }

  get interacting(): boolean {
    return this.interactingNow;
  }

  get animating(): boolean {
    return this.animation !== null;
  }

  get aspect(): number {
    return this.viewWidth / this.viewHeight;
  }

  setViewport(width: number, height: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.updateProjection();
  }

  setScene(bounds: Bounds | null, farExtent: number): void {
    this.bounds = bounds;
    this.farExtent = farExtent;
    this.updateClipping();
  }

  getState(): CameraState {
    const p = this.active.position;
    const t = this.controls.target;
    return {
      projection: this.active === this.orthoCamera ? 'orthographic' : 'perspective',
      position: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
      fov: this.fovDeg,
      zoom: this.active.zoom,
    };
  }

  setState(state: CameraState, animate: boolean, durationMs: number): void {
    if (!animate || durationMs <= 0) {
      this.animation = null;
      this.controls.enabled = true;
      this.apply(state);
      return;
    }
    const current = this.getState();
    if (current.projection !== state.projection) {
      this.apply({ ...current, projection: state.projection });
    }
    this.animation = {
      from: this.getState(),
      to: cloneState(state),
      start: performance.now(),
      duration: durationMs,
    };
    this.controls.enabled = false;
  }

  presetState(preset: CameraPreset): CameraState {
    const bounds = this.bounds ?? { min: [-8, 0, -8], max: [8, 8, 8] };
    return fitPreset(preset, bounds, this.getState().projection, this.fovDeg, this.aspect);
  }

  step(time: number, dt: number): boolean {
    let changed = false;
    const a = this.animation;
    if (a) {
      const t = Math.min(1, Math.max(0, (time - a.start) / a.duration));
      if (t >= 1) {
        this.animation = null;
        this.controls.enabled = true;
        this.apply(a.to);
      } else {
        this.apply(interpolateCamera(a.from, a.to, easeInOutCubic(t)));
      }
      changed = true;
    }
    if (this.controls.update(dt)) changed = true;
    if (changed) this.updateClipping();
    return changed;
  }

  makeExportCamera(aspect: number): RigCamera {
    const viewAspect = this.aspect;
    const f = exportHeightFraction(viewAspect, aspect);
    const src = this.active;
    let cam: RigCamera;
    if (src instanceof PerspectiveCamera) {
      cam = new PerspectiveCamera(
        exportFov(this.fovDeg, viewAspect, aspect),
        aspect,
        src.near,
        src.far,
      );
    } else {
      const h = (this.orthoBase / 2) * f;
      cam = new OrthographicCamera(-h * aspect, h * aspect, h, -h, src.near, src.far);
    }
    cam.zoom = src.zoom;
    cam.position.copy(src.position);
    cam.quaternion.copy(src.quaternion);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return cam;
  }

  dispose(): void {
    this.controls.removeEventListener('change', this.handleChange);
    this.controls.removeEventListener('start', this.handleStart);
    this.controls.removeEventListener('end', this.handleEnd);
    this.controls.dispose();
  }

  private sceneRadius(): number {
    if (!this.bounds) return 30;
    return Math.max(4, length(boxSize(this.bounds)) / 2);
  }

  private apply(input: CameraState): void {
    const state = cloneState(input);
    const pos = new Vector3(...state.position);
    const target = new Vector3(...state.target);
    let distance = pos.distanceTo(target);
    if (distance < 1e-4) {
      pos.set(target.x + 10, target.y + 10, target.z + 10);
      distance = pos.distanceTo(target);
    }
    this.fovDeg = Math.min(120, Math.max(5, state.fov || 45));
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
      this.orthoBase = 2 * distance * Math.tan((this.fovDeg * DEG) / 2);
    }
    const cam = ortho ? this.orthoCamera : this.perspCamera;
    if (cam !== this.active) {
      this.active = cam;
      this.controls.object = cam;
      this.callbacks.onProjectionChange(cam);
    }
    cam.up.set(0, 1, 0);
    cam.position.copy(pos);
    cam.zoom = zoom;
    this.controls.target.copy(target);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    this.updateClipping();
  }

  private updateClipping(): void {
    const center: Vec3 = this.bounds ? boxCenter(this.bounds) : [0, 4, 0];
    const p = this.active.position;
    const distToCenter = Math.hypot(p.x - center[0], p.y - center[1], p.z - center[2]);
    const r = this.sceneRadius();
    const far = distToCenter + Math.max(r, this.farExtent) * 1.2 + 20;
    let near = Math.max(0.05, (distToCenter - r) * 0.5);
    near = Math.max(near, far / 20000);
    near = Math.min(near, 10);
    this.perspCamera.near = near;
    this.perspCamera.far = far;
    this.orthoCamera.near = 0.1;
    this.orthoCamera.far = far;
    this.updateProjection();
  }

  private updateProjection(): void {
    const aspect = this.aspect;
    this.perspCamera.aspect = aspect;
    this.perspCamera.fov = this.fovDeg;
    this.perspCamera.updateProjectionMatrix();
    const h = this.orthoBase / 2;
    this.orthoCamera.left = -h * aspect;
    this.orthoCamera.right = h * aspect;
    this.orthoCamera.top = h;
    this.orthoCamera.bottom = -h;
    this.orthoCamera.updateProjectionMatrix();
  }

  private readonly handleChange = (): void => {
    this.callbacks.onChange();
  };

  private readonly handleStart = (): void => {
    this.interactingNow = true;
    this.callbacks.onInteraction(true);
  };

  private readonly handleEnd = (): void => {
    this.interactingNow = false;
    this.callbacks.onInteraction(false);
  };
}
