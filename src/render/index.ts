import type {
  CameraState,
  ExportOptions,
  MeshResult,
  RenderSettings,
  TextureMode,
  TurntableOptions,
} from '../core/types';

export type CameraPreset = 'iso' | 'front' | 'side' | 'top' | 'three-quarter';

export class SceneRenderer {
  constructor(_canvas: HTMLCanvasElement) {
    throw new Error('not implemented');
  }

  setModel(
    _result: MeshResult,
    _atlasImage: ImageBitmap | OffscreenCanvas | null,
    _mode: TextureMode,
  ): void {
    throw new Error('not implemented');
  }

  clearModel(): void {
    throw new Error('not implemented');
  }

  setSettings(_settings: RenderSettings): void {
    throw new Error('not implemented');
  }

  getCamera(): CameraState {
    throw new Error('not implemented');
  }

  setCamera(_state: CameraState, _animate?: boolean): void {
    throw new Error('not implemented');
  }

  fitCamera(_preset: CameraPreset): void {
    throw new Error('not implemented');
  }

  resize(_width: number, _height: number): void {
    throw new Error('not implemented');
  }

  renderImage(
    _options: ExportOptions,
    _onProgress?: (p: number) => void,
    _signal?: AbortSignal,
  ): Promise<Blob> {
    throw new Error('not implemented');
  }

  renderTurntable(
    _options: TurntableOptions,
    _onProgress?: (p: number) => void,
    _signal?: AbortSignal,
  ): Promise<Blob> {
    throw new Error('not implemented');
  }

  captureThumbnail(_size: number): Promise<string> {
    throw new Error('not implemented');
  }

  onCameraChange(_cb: (s: CameraState) => void): () => void {
    throw new Error('not implemented');
  }

  dispose(): void {
    throw new Error('not implemented');
  }
}
