import { create } from 'zustand';
import {
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_RENDER_SETTINGS,
  type CameraState,
  type ExportOptions,
  type MeshOptions,
  type RenderSettings,
  type SavedShot,
  type SchematicVolume,
  type TurntableOptions,
} from '../core';
import type { TexturePack } from '../textures';
import { computeBlockStats, type BlockStats } from './blockStats';
import {
  loadUi,
  meshOptionsFromSettings,
  readJson,
  sanitizeSettings,
  sanitizeShots,
  shotsKey,
  writeJson,
} from './persist';

export interface ExportState {
  options: ExportOptions;
  busy: boolean;
  progress: number;
  error: string | null;
}

export interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  message: string;
}

export interface PipelineStep {
  index: number;
  total: number;
  label: string;
}

export interface HdriEntry {
  id: string;
  name: string;
}

export type PackSource = 'bundled' | 'zip';
export type ExportTab = 'image' | 'turntable';

export interface AppState {
  volume: SchematicVolume | null;
  fileName: string | null;
  blockStats: BlockStats;
  loading: boolean;
  error: string | null;
  step: PipelineStep | null;
  setVolume: (volume: SchematicVolume | null, fileName: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setStep: (step: PipelineStep | null) => void;

  pack: TexturePack | null;
  packLoading: boolean;
  packSource: PackSource;
  packName: string | null;
  setPack: (pack: TexturePack | null, source?: PackSource, name?: string | null) => void;
  setPackLoading: (loading: boolean) => void;

  settings: RenderSettings;
  updateSettings: (patch: Partial<RenderSettings>) => void;
  replaceSettings: (settings: RenderSettings) => void;
  resetSettings: () => void;

  meshOptions: MeshOptions;
  updateMeshOptions: (patch: Partial<MeshOptions>) => void;
  setHideBlocks: (names: string[]) => void;

  camera: CameraState | null;
  setCamera: (camera: CameraState | null) => void;

  shotsStorageKey: string | null;
  shots: SavedShot[];
  selectedShotIds: string[];
  addShot: (shot: SavedShot) => void;
  renameShot: (id: string, name: string) => void;
  removeShot: (id: string) => void;
  moveShot: (id: string, offset: number) => void;
  toggleShotSelected: (id: string) => void;
  setSelectedShots: (ids: string[]) => void;

  exportState: ExportState;
  exportOpen: boolean;
  exportTab: ExportTab;
  setExportOpen: (open: boolean) => void;
  setExportTab: (tab: ExportTab) => void;
  updateExportOptions: (patch: Partial<ExportOptions>) => void;
  setExportProgress: (busy: boolean, progress: number, error?: string | null) => void;
  turntable: TurntableOptions;
  updateTurntable: (patch: Partial<TurntableOptions>) => void;

  hdriList: HdriEntry[];
  setHdriList: (list: HdriEntry[]) => void;

  openSections: Record<string, boolean>;
  setSectionOpen: (id: string, open: boolean) => void;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  helpOpen: boolean;
  creditsOpen: boolean;
  setCreditsOpen: (open: boolean) => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;

  toasts: Toast[];
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
}

const EMPTY_STATS: BlockStats = { total: 0, counts: [] };
let toastId = 1;

function loadInitialSettings(): RenderSettings {
  const raw = readJson('settings');
  return raw === null ? DEFAULT_RENDER_SETTINGS : sanitizeSettings(raw);
}

function mirrorMesh(
  settings: RenderSettings,
  meshOptions: MeshOptions,
  patch: Partial<RenderSettings>,
): MeshOptions {
  if (patch.textureMode === undefined && patch.ambientOcclusionVertex === undefined) {
    return meshOptions;
  }
  return {
    ...meshOptions,
    mode: settings.textureMode,
    ambientOcclusion: settings.ambientOcclusionVertex,
  };
}

const initialSettings = loadInitialSettings();
const initialUi = loadUi();

export const useAppStore = create<AppState>((set) => ({
  volume: null,
  fileName: null,
  blockStats: EMPTY_STATS,
  loading: false,
  error: null,
  step: null,
  setVolume: (volume, fileName) => {
    if (!volume || !fileName) {
      set({
        volume: null,
        fileName: null,
        blockStats: EMPTY_STATS,
        error: null,
        shotsStorageKey: null,
        shots: [],
        selectedShotIds: [],
      });
      return;
    }
    const key = shotsKey(fileName, volume.width, volume.height, volume.length);
    set({
      volume,
      fileName,
      blockStats: computeBlockStats(volume),
      error: null,
      shotsStorageKey: key,
      shots: sanitizeShots(readJson(key)),
      selectedShotIds: [],
    });
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setStep: (step) => set({ step }),

  pack: null,
  packLoading: false,
  packSource: 'bundled',
  packName: null,
  setPack: (pack, source = 'bundled', name = null) =>
    set({ pack, packSource: source, packName: name }),
  setPackLoading: (packLoading) => set({ packLoading }),

  settings: initialSettings,
  updateSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch };
      return { settings, meshOptions: mirrorMesh(settings, state.meshOptions, patch) };
    }),
  replaceSettings: (settings) =>
    set((state) => ({
      settings,
      meshOptions: mirrorMesh(settings, state.meshOptions, settings),
    })),
  resetSettings: () =>
    set((state) => ({
      settings: DEFAULT_RENDER_SETTINGS,
      meshOptions: mirrorMesh(DEFAULT_RENDER_SETTINGS, state.meshOptions, DEFAULT_RENDER_SETTINGS),
    })),

  meshOptions: meshOptionsFromSettings(initialSettings),
  updateMeshOptions: (patch) =>
    set((state) => ({ meshOptions: { ...state.meshOptions, ...patch } })),
  setHideBlocks: (names) =>
    set((state) => ({ meshOptions: { ...state.meshOptions, hideBlocks: names } })),

  camera: null,
  setCamera: (camera) => set({ camera }),

  shotsStorageKey: null,
  shots: [],
  selectedShotIds: [],
  addShot: (shot) => set((state) => ({ shots: [...state.shots, shot] })),
  renameShot: (id, name) =>
    set((state) => ({
      shots: state.shots.map((shot) => (shot.id === id ? { ...shot, name } : shot)),
    })),
  removeShot: (id) =>
    set((state) => ({
      shots: state.shots.filter((shot) => shot.id !== id),
      selectedShotIds: state.selectedShotIds.filter((other) => other !== id),
    })),
  moveShot: (id, offset) =>
    set((state) => {
      const from = state.shots.findIndex((shot) => shot.id === id);
      const to = from + offset;
      if (from === -1 || to < 0 || to >= state.shots.length) return state;
      const shots = [...state.shots];
      const [moved] = shots.splice(from, 1);
      if (!moved) return state;
      shots.splice(to, 0, moved);
      return { shots };
    }),
  toggleShotSelected: (id) =>
    set((state) => ({
      selectedShotIds: state.selectedShotIds.includes(id)
        ? state.selectedShotIds.filter((other) => other !== id)
        : [...state.selectedShotIds, id],
    })),
  setSelectedShots: (ids) => set({ selectedShotIds: ids }),

  exportState: { options: DEFAULT_EXPORT_OPTIONS, busy: false, progress: 0, error: null },
  exportOpen: false,
  exportTab: initialUi.exportTab,
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setExportTab: (exportTab) => set({ exportTab }),
  updateExportOptions: (patch) =>
    set((state) => ({
      exportState: {
        ...state.exportState,
        options: { ...state.exportState.options, ...patch },
      },
    })),
  setExportProgress: (busy, progress, error = null) =>
    set((state) => ({ exportState: { ...state.exportState, busy, progress, error } })),

  turntable: { width: 1280, height: 720, durationSec: 6, fps: 30, format: 'webm' },
  updateTurntable: (patch) => set((state) => ({ turntable: { ...state.turntable, ...patch } })),

  hdriList: [],
  setHdriList: (hdriList) => set({ hdriList }),

  openSections: initialUi.openSections,
  setSectionOpen: (id, open) =>
    set((state) => ({ openSections: { ...state.openSections, [id]: open } })),
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  helpOpen: false,
  creditsOpen: false,
  setCreditsOpen: (creditsOpen) => set({ creditsOpen }),
  setLeftDrawerOpen: (leftDrawerOpen) => set({ leftDrawerOpen }),
  setRightDrawerOpen: (rightDrawerOpen) => set({ rightDrawerOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),

  toasts: [],
  pushToast: (kind, message) =>
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id: toastId++, kind, message }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function startPersistence(delayMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const state = useAppStore.getState();
    writeJson('settings', state.settings);
    writeJson('ui', { openSections: state.openSections, exportTab: state.exportTab });
    if (state.shotsStorageKey) writeJson(state.shotsStorageKey, state.shots);
  };
  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (prev.shotsStorageKey && prev.shotsStorageKey !== state.shotsStorageKey) {
      writeJson(prev.shotsStorageKey, prev.shots);
    }
    const changed =
      state.settings !== prev.settings ||
      state.openSections !== prev.openSections ||
      state.exportTab !== prev.exportTab ||
      state.shots !== prev.shots;
    if (!changed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });
  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  };
}
