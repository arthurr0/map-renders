import { create } from 'zustand';
import {
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_MESH_OPTIONS,
  DEFAULT_RENDER_SETTINGS,
} from '../core/defaults';
import type {
  ExportOptions,
  MeshOptions,
  RenderSettings,
  SavedShot,
  SchematicVolume,
} from '../core/types';
import type { TexturePack } from '../textures';

export interface ExportState {
  options: ExportOptions;
  busy: boolean;
  progress: number;
  error: string | null;
}

export interface AppState {
  volume: SchematicVolume | null;
  fileName: string | null;
  loading: boolean;
  error: string | null;
  setVolume: (volume: SchematicVolume | null, fileName: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  pack: TexturePack | null;
  packLoading: boolean;
  setPack: (pack: TexturePack | null) => void;
  setPackLoading: (loading: boolean) => void;

  settings: RenderSettings;
  updateSettings: (patch: Partial<RenderSettings>) => void;
  resetSettings: () => void;

  meshOptions: MeshOptions;
  updateMeshOptions: (patch: Partial<MeshOptions>) => void;

  shots: SavedShot[];
  addShot: (shot: SavedShot) => void;
  renameShot: (id: string, name: string) => void;
  removeShot: (id: string) => void;

  exportState: ExportState;
  updateExportOptions: (patch: Partial<ExportOptions>) => void;
  setExportProgress: (busy: boolean, progress: number, error?: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  volume: null,
  fileName: null,
  loading: false,
  error: null,
  setVolume: (volume, fileName) => set({ volume, fileName, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  pack: null,
  packLoading: false,
  setPack: (pack) => set({ pack }),
  setPackLoading: (packLoading) => set({ packLoading }),

  settings: DEFAULT_RENDER_SETTINGS,
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  resetSettings: () => set({ settings: DEFAULT_RENDER_SETTINGS }),

  meshOptions: DEFAULT_MESH_OPTIONS,
  updateMeshOptions: (patch) =>
    set((state) => ({ meshOptions: { ...state.meshOptions, ...patch } })),

  shots: [],
  addShot: (shot) => set((state) => ({ shots: [...state.shots, shot] })),
  renameShot: (id, name) =>
    set((state) => ({
      shots: state.shots.map((shot) => (shot.id === id ? { ...shot, name } : shot)),
    })),
  removeShot: (id) => set((state) => ({ shots: state.shots.filter((shot) => shot.id !== id) })),

  exportState: { options: DEFAULT_EXPORT_OPTIONS, busy: false, progress: 0, error: null },
  updateExportOptions: (patch) =>
    set((state) => ({
      exportState: {
        ...state.exportState,
        options: { ...state.exportState.options, ...patch },
      },
    })),
  setExportProgress: (busy, progress, error = null) =>
    set((state) => ({ exportState: { ...state.exportState, busy, progress, error } })),
}));
