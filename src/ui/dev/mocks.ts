import type {
  AtlasData,
  CameraState,
  ExportOptions,
  MeshResult,
  RenderSettings,
  SchematicVolume,
  TextureMode,
  TurntableOptions,
} from '../../core';
import type { SceneRenderer } from '../../render';
import type { TexturePack } from '../../textures';

export function createMockVolume(name = 'house'): SchematicVolume {
  return {
    width: 3,
    height: 2,
    length: 3,
    palette: [
      { name: 'minecraft:air', properties: {} },
      { name: 'minecraft:stone', properties: {} },
      { name: 'minecraft:glass', properties: {} },
    ],
    blocks: new Uint32Array([1, 1, 1, 1, 2, 1, 1, 1, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0]),
    blockEntities: [],
    metadata: { name, format: 'sponge-v2' },
  };
}

export function createMockAtlas(): { data: AtlasData; image: OffscreenCanvas } {
  return {
    data: { width: 16, height: 16, regions: {}, colors: {}, missing: [] },
    image: {} as OffscreenCanvas,
  };
}

export function createMockMesh(): MeshResult {
  return {
    meshes: [],
    bounds: { min: [0, 0, 0], max: [3, 2, 3] },
    stats: { blocks: 8, faces: 40, unknownBlocks: [] },
  };
}

export function createMockPack(id = 'mock'): TexturePack {
  return {
    id,
    name: id,
    attribution: 'Mock pack',
    getTexture: async () => null,
    getMcmeta: async () => null,
  };
}

export const MOCK_CAMERA: CameraState = {
  projection: 'perspective',
  position: [10, 10, 10],
  target: [0, 0, 0],
  fov: 50,
  zoom: 1,
};

export class MockRenderer {
  calls: string[] = [];
  camera: CameraState = MOCK_CAMERA;
  settings: RenderSettings | null = null;
  models: { mode: TextureMode }[] = [];
  images: ExportOptions[] = [];
  listeners = new Set<(camera: CameraState) => void>();

  setModel(_result: MeshResult, _image: unknown, mode: TextureMode): void {
    this.calls.push('setModel');
    this.models.push({ mode });
  }
  clearModel(): void {
    this.calls.push('clearModel');
  }
  setSettings(settings: RenderSettings): void {
    this.calls.push('setSettings');
    this.settings = settings;
  }
  getCamera(): CameraState {
    return this.camera;
  }
  setCamera(state: CameraState, animate?: boolean): void {
    this.calls.push(`setCamera:${animate ? 'animated' : 'instant'}`);
    this.camera = state;
  }
  fitCamera(preset: string): void {
    this.calls.push(`fitCamera:${preset}`);
  }
  resize(): void {
    this.calls.push('resize');
  }
  async renderImage(
    options: ExportOptions,
    onProgress?: (p: number) => void,
    _signal?: AbortSignal,
  ): Promise<Blob> {
    this.images.push(options);
    onProgress?.(1);
    return new Blob(['image'], { type: `image/${options.format}` });
  }
  async renderTurntable(
    _options: TurntableOptions,
    _onProgress?: (p: number) => void,
    _signal?: AbortSignal,
  ): Promise<Blob> {
    return new Blob(['video']);
  }
  async captureThumbnail(): Promise<string> {
    return 'data:image/png;base64,AAAA';
  }
  onCameraChange(callback: (camera: CameraState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  dispose(): void {
    this.calls.push('dispose');
  }
}

export function createMockRenderer(): MockRenderer & SceneRenderer {
  return new MockRenderer() as unknown as MockRenderer & SceneRenderer;
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function createMockFile(name: string, content = 'data'): File {
  const file = new File([content], name);
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(content).buffer,
  });
  return file;
}
