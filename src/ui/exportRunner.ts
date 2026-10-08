import { zipSync } from 'fflate';
import type { CameraState, ExportOptions, SavedShot, TurntableOptions } from '../core';
import {
  exportFileName,
  normalizeExportOptions,
  sanitizeFilePart,
  turntableFileName,
} from './exportMath';
import { getRenderer } from './rendererRef';
import { useAppStore } from './store';

export type ExportScope = 'current' | 'selected' | 'all';

export interface ExportTarget {
  name: string;
  camera: CameraState | null;
}

export interface ExportFile {
  name: string;
  blob: Blob;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

let activeController: AbortController | null = null;

export function resolveTargets(
  scope: ExportScope,
  shots: SavedShot[],
  selectedIds: string[],
): ExportTarget[] {
  if (scope === 'current') return [{ name: 'view', camera: null }];
  const chosen = scope === 'all' ? shots : shots.filter((shot) => selectedIds.includes(shot.id));
  return chosen.map((shot) => ({ name: shot.name, camera: shot.camera }));
}

export function uniqueFileNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf('.');
    return `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}`;
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function renderTargets(
  targets: ExportTarget[],
  rawOptions: ExportOptions,
  schematicName: string | null,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<ExportFile[]> {
  const renderer = getRenderer();
  if (!renderer) throw new Error('The viewport is not ready yet.');
  const options = normalizeExportOptions(rawOptions);
  const original = renderer.getCamera();
  const files: ExportFile[] = [];
  try {
    for (let index = 0; index < targets.length; index++) {
      if (signal.aborted) throw new ExportCancelled();
      const target = targets[index];
      if (!target) continue;
      if (target.camera) renderer.setCamera(target.camera, false);
      const blob = await renderer.renderImage(options, (fraction) =>
        onProgress((index + fraction) / targets.length),
      );
      if (signal.aborted) throw new ExportCancelled();
      files.push({
        name: exportFileName(
          schematicName,
          target.name,
          options.width,
          options.height,
          options.format,
        ),
        blob,
      });
      onProgress((index + 1) / targets.length);
    }
  } finally {
    renderer.setCamera(original, false);
  }
  return files;
}

export async function deliverFiles(
  files: ExportFile[],
  schematicName: string | null,
): Promise<string> {
  const names = uniqueFileNames(files.map((file) => file.name));
  const first = files[0];
  if (files.length === 1 && first) {
    const name = names[0] ?? first.name;
    downloadBlob(first.blob, name);
    return name;
  }
  const entries: Record<string, Uint8Array> = {};
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = names[i];
    if (!file || !name) continue;
    entries[name] = new Uint8Array(await file.blob.arrayBuffer());
  }
  const zip = zipSync(entries, { level: 0 });
  const zipName = `${sanitizeFilePart(schematicName ?? 'schematic')}-shots.zip`;
  downloadBlob(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), zipName);
  return zipName;
}

async function guarded(task: (signal: AbortSignal) => Promise<string>): Promise<void> {
  const store = useAppStore.getState();
  const controller = new AbortController();
  activeController = controller;
  store.setExportProgress(true, 0, null);
  try {
    const name = await task(controller.signal);
    useAppStore.getState().pushToast('success', `Exported ${name}`);
    useAppStore.getState().setExportProgress(false, 1, null);
  } catch (error) {
    if (error instanceof ExportCancelled) {
      useAppStore.getState().setExportProgress(false, 0, null);
      return;
    }
    const message = error instanceof Error ? error.message : 'Export failed.';
    useAppStore.getState().setExportProgress(false, 0, message);
    useAppStore.getState().pushToast('error', message);
  } finally {
    if (activeController === controller) activeController = null;
  }
}

export function cancelExport(): void {
  activeController?.abort();
}

export function isExporting(): boolean {
  return activeController !== null;
}

export async function runImageExportFor(targets: ExportTarget[]): Promise<void> {
  const state = useAppStore.getState();
  if (targets.length === 0) {
    state.pushToast('info', 'There are no shots to export.');
    return;
  }
  await guarded(async (signal) => {
    const files = await renderTargets(
      targets,
      state.exportState.options,
      state.fileName,
      signal,
      (fraction) => useAppStore.getState().setExportProgress(true, fraction),
    );
    return deliverFiles(files, state.fileName);
  });
}

export async function runImageExport(scope: ExportScope): Promise<void> {
  const state = useAppStore.getState();
  await runImageExportFor(resolveTargets(scope, state.shots, state.selectedShotIds));
}

export async function runShotExport(shot: SavedShot): Promise<void> {
  await runImageExportFor([{ name: shot.name, camera: shot.camera }]);
}

export async function runTurntableExport(options: TurntableOptions): Promise<void> {
  const renderer = getRenderer();
  const state = useAppStore.getState();
  if (!renderer) {
    state.pushToast('error', 'The viewport is not ready yet.');
    return;
  }
  await guarded(async (signal) => {
    const blob = await renderer.renderTurntable(options, (fraction) =>
      useAppStore.getState().setExportProgress(true, fraction),
    );
    if (signal.aborted) throw new ExportCancelled();
    const name = turntableFileName(state.fileName, options.width, options.height, options.format);
    downloadBlob(blob, name);
    return name;
  });
}
