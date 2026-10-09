import type { AtlasData, MeshOptions, MeshResult, RenderSettings, SchematicVolume } from '../core';
import { requiredTextures } from '../blocks';
import { meshInWorker } from '../mesher/client';
import type { SceneRenderer } from '../render';
import { buildAtlas, loadBundledPack, loadZipPack, type TexturePack } from '../textures';
import { parseInWorker } from './parseClient';
import { getRenderer, onRendererChange } from './rendererRef';
import { useAppStore } from './store';

export const PIPELINE_STEPS = [
  'Reading file',
  'Parsing schematic',
  'Loading textures',
  'Building atlas',
  'Building mesh',
  'Preparing scene',
] as const;

interface LoadedModel {
  volume: SchematicVolume;
  atlasData: AtlasData;
  atlasImage: ImageBitmap | OffscreenCanvas;
  result: MeshResult;
  mode: MeshOptions['mode'];
}

let loadRun = 0;
let rebuildRun = 0;
let packRun = 0;
let syncDelay = 250;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAtlas = false;
let bundledPack: Promise<TexturePack> | null = null;
let model: LoadedModel | null = null;

export function resetPipelineForTests(): void {
  loadRun = 0;
  rebuildRun = 0;
  packRun = 0;
  cancelScheduledRebuild();
  bundledPack = null;
  model = null;
}

function cancelScheduledRebuild(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = null;
  pendingAtlas = false;
}

function scheduleRebuild(rebuildAtlas: boolean, delay: number): void {
  pendingAtlas = pendingAtlas || rebuildAtlas;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    const atlas = pendingAtlas;
    pendingAtlas = false;
    void rebuildModel({ rebuildAtlas: atlas });
  }, delay);
}

function setStep(index: number): void {
  useAppStore.getState().setStep({
    index,
    total: PIPELINE_STEPS.length,
    label: PIPELINE_STEPS[index] ?? '',
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong while loading the file.';
}

export function layerPacks(top: TexturePack, base: TexturePack): TexturePack {
  return {
    id: `${top.id}+${base.id}`,
    name: top.name,
    async getTexture(textureId) {
      return (await top.getTexture(textureId)) ?? (await base.getTexture(textureId));
    },
    async getMcmeta(textureId) {
      const texture = await top.getTexture(textureId);
      return texture ? top.getMcmeta(textureId) : base.getMcmeta(textureId);
    },
  };
}

export function getBundledPack(): Promise<TexturePack> {
  if (!bundledPack) {
    bundledPack = loadBundledPack().catch((error: unknown) => {
      bundledPack = null;
      throw error;
    });
  }
  return bundledPack;
}

async function ensurePack(): Promise<TexturePack> {
  const existing = useAppStore.getState().pack;
  if (existing) return existing;
  const pack = await getBundledPack();
  useAppStore.getState().setPack(pack, 'bundled', null);
  return pack;
}

export async function applyBundledPack(): Promise<void> {
  const run = ++packRun;
  useAppStore.getState().setPackLoading(true);
  try {
    const pack = await getBundledPack();
    if (run !== packRun) return;
    useAppStore.getState().setPack(pack, 'bundled', null);
  } catch (error) {
    if (run !== packRun) return;
    useAppStore.getState().pushToast('error', errorMessage(error));
  } finally {
    if (run === packRun) useAppStore.getState().setPackLoading(false);
  }
}

export async function applyZipPack(file: File): Promise<void> {
  const run = ++packRun;
  useAppStore.getState().setPackLoading(true);
  try {
    const base = await getBundledPack();
    const zip = await loadZipPack(await file.arrayBuffer(), file.name);
    if (run !== packRun) return;
    useAppStore.getState().setPack(layerPacks(zip, base), 'zip', file.name);
    useAppStore.getState().pushToast('success', `Loaded resource pack ${file.name}`);
  } catch (error) {
    if (run !== packRun) return;
    useAppStore
      .getState()
      .pushToast('error', `Could not read the resource pack: ${errorMessage(error)}`);
  } finally {
    if (run === packRun) useAppStore.getState().setPackLoading(false);
  }
}

function pushModel(renderer: SceneRenderer, loaded: LoadedModel, settings: RenderSettings): void {
  renderer.setModel(loaded.result, loaded.atlasImage, loaded.mode);
  renderer.setSettings(settings);
}

export async function loadSchematicFile(file: File): Promise<void> {
  const run = ++loadRun;
  rebuildRun++;
  cancelScheduledRebuild();
  const store = useAppStore.getState();
  const stale = () => run !== loadRun;
  let used: SyncSnapshot | null = null;
  store.setLoading(true);
  store.setError(null);
  try {
    setStep(0);
    const data = await file.arrayBuffer();
    if (stale()) return;

    setStep(1);
    const volume = await parseInWorker(data, file.name);
    if (stale()) return;

    setStep(2);
    const pack = await ensurePack();
    if (stale()) return;
    const textureIds = requiredTextures(volume.palette);

    setStep(3);
    const atlas = await buildAtlas(pack, textureIds);
    if (stale()) return;

    setStep(4);
    const meshOptions = { ...useAppStore.getState().meshOptions, hideBlocks: [] };
    const result = await meshInWorker(volume, atlas.data, meshOptions);
    if (stale()) return;

    setStep(5);
    const loaded: LoadedModel = {
      volume,
      atlasData: atlas.data,
      atlasImage: atlas.image,
      result,
      mode: meshOptions.mode,
    };
    model = loaded;
    const current = useAppStore.getState();
    current.setHideBlocks([]);
    current.setVolume(volume, file.name);
    used = { settings: current.settings, meshOptions, pack };
    const renderer = getRenderer();
    if (renderer) {
      pushModel(renderer, loaded, useAppStore.getState().settings);
      renderer.fitCamera('three-quarter');
    }
    const finalStore = useAppStore.getState();
    finalStore.pushToast('success', `Loaded ${file.name}`);
    if (result.stats.unknownBlocks.length > 0) {
      finalStore.pushToast(
        'info',
        `${result.stats.unknownBlocks.length} block types are not supported and were skipped.`,
      );
    }
  } catch (error) {
    if (stale()) return;
    const message = errorMessage(error);
    useAppStore.getState().setError(message);
    useAppStore.getState().pushToast('error', message);
  } finally {
    if (!stale()) {
      useAppStore.getState().setLoading(false);
      useAppStore.getState().setStep(null);
      if (used) {
        const now = useAppStore.getState();
        const decision = decideUpdate(used, {
          settings: now.settings,
          meshOptions: now.meshOptions,
          pack: now.pack,
        });
        if (decision.remesh) scheduleRebuild(decision.rebuildAtlas, 0);
      }
    }
  }
}

export async function rebuildModel(options: { rebuildAtlas?: boolean } = {}): Promise<void> {
  const current = model;
  if (!current || useAppStore.getState().loading) return;
  const run = ++rebuildRun;
  const loadAtStart = loadRun;
  const stale = () => run !== rebuildRun || loadAtStart !== loadRun;
  try {
    useAppStore.getState().setStep({ index: 0, total: 2, label: 'Updating model' });
    let { atlasData, atlasImage } = current;
    if (options.rebuildAtlas) {
      const pack = await ensurePack();
      if (stale()) return;
      const atlas = await buildAtlas(pack, requiredTextures(current.volume.palette));
      if (stale()) return;
      atlasData = atlas.data;
      atlasImage = atlas.image;
    }
    const meshOptions = useAppStore.getState().meshOptions;
    const result = await meshInWorker(current.volume, atlasData, meshOptions);
    if (stale()) return;
    const next: LoadedModel = {
      volume: current.volume,
      atlasData,
      atlasImage,
      result,
      mode: meshOptions.mode,
    };
    model = next;
    const renderer = getRenderer();
    if (renderer) pushModel(renderer, next, useAppStore.getState().settings);
  } catch (error) {
    if (stale()) return;
    useAppStore.getState().pushToast('error', errorMessage(error));
  } finally {
    if (!stale()) useAppStore.getState().setStep(null);
  }
}

export interface SyncSnapshot {
  settings: RenderSettings;
  meshOptions: MeshOptions;
  pack: TexturePack | null;
}

export interface UpdateDecision {
  applySettings: boolean;
  remesh: boolean;
  rebuildAtlas: boolean;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function decideUpdate(prev: SyncSnapshot, next: SyncSnapshot): UpdateDecision {
  const rebuildAtlas = prev.pack !== next.pack;
  const remesh =
    rebuildAtlas ||
    prev.meshOptions.mode !== next.meshOptions.mode ||
    prev.meshOptions.ambientOcclusion !== next.meshOptions.ambientOcclusion ||
    prev.meshOptions.chunkSize !== next.meshOptions.chunkSize ||
    !sameList(prev.meshOptions.hideBlocks, next.meshOptions.hideBlocks);
  return { applySettings: prev.settings !== next.settings, remesh, rebuildAtlas };
}

export function startPipelineSync(debounceMs = 250): () => void {
  syncDelay = debounceMs;

  const unsubscribeStore = useAppStore.subscribe((state, prev) => {
    const decision = decideUpdate(prev, state);
    if (decision.applySettings) getRenderer()?.setSettings(state.settings);
    if (!decision.remesh || !model || state.loading) return;
    scheduleRebuild(decision.rebuildAtlas, syncDelay);
  });

  const unsubscribeRenderer = onRendererChange((renderer) => {
    if (!renderer) return;
    renderer.setSettings(useAppStore.getState().settings);
    if (model) {
      pushModel(renderer, model, useAppStore.getState().settings);
      renderer.fitCamera('three-quarter');
    }
  });

  return () => {
    unsubscribeStore();
    unsubscribeRenderer();
    cancelScheduledRebuild();
  };
}
