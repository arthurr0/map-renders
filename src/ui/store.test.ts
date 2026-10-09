import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RENDER_SETTINGS } from '../core';
import { createMockVolume } from './dev/mocks';
import { readJson, sanitizeSettings, sanitizeShots, writeJson } from './persist';

function throwingStorage() {
  const fail = () => {
    throw new Error('storage blocked');
  };
  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
    data,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.useRealTimers();
});

describe('persistence with broken storage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reads and writes without throwing', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(readJson('settings')).toBeNull();
    expect(writeJson('settings', { a: 1 })).toBe(false);
  });

  it('creates the store with defaults when storage throws', async () => {
    vi.stubGlobal('localStorage', throwingStorage());
    const { useAppStore, startPersistence } = await import('./store');
    const state = useAppStore.getState();
    expect(state.settings).toEqual(DEFAULT_RENDER_SETTINGS);
    expect(state.openSections).toEqual({});
    vi.useFakeTimers();
    const stop = startPersistence(10);
    state.updateSettings({ exposure: 2 });
    vi.advanceTimersByTime(20);
    expect(() => stop()).not.toThrow();
    expect(useAppStore.getState().settings.exposure).toBe(2);
    state.setVolume(createMockVolume(), 'a.schem');
    expect(useAppStore.getState().shots).toEqual([]);
  });

  it('survives corrupt stored json', async () => {
    vi.stubGlobal('localStorage', memoryStorage({ 'mr:settings': '{not json', 'mr:ui': '42' }));
    const { useAppStore } = await import('./store');
    expect(useAppStore.getState().settings).toEqual(DEFAULT_RENDER_SETTINGS);
  });
});

describe('persistence round trip', () => {
  it('restores saved settings and mirrors mesh options', async () => {
    const storage = memoryStorage({
      'mr:settings': JSON.stringify({
        ...DEFAULT_RENDER_SETTINGS,
        textureMode: 'simplified',
        ambientOcclusionVertex: false,
      }),
    });
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    const { useAppStore } = await import('./store');
    const state = useAppStore.getState();
    expect(state.settings.textureMode).toBe('simplified');
    expect(state.meshOptions.mode).toBe('simplified');
    expect(state.meshOptions.ambientOcclusion).toBe(false);
  });

  it('saves settings and shots per file key', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    vi.useFakeTimers();
    const { useAppStore, startPersistence } = await import('./store');
    const stop = startPersistence(10);
    useAppStore.getState().setVolume(createMockVolume(), 'house.schem');
    useAppStore.getState().addShot({
      id: 'a',
      name: 'Front',
      camera: {
        projection: 'perspective',
        position: [1, 2, 3],
        target: [0, 0, 0],
        fov: 50,
        zoom: 1,
      },
      createdAt: 1,
    });
    useAppStore.getState().updateSettings({ exposure: 1.7 });
    vi.advanceTimersByTime(50);
    stop();
    expect(JSON.parse(storage.data.get('mr:settings') ?? '{}').exposure).toBe(1.7);
    const key = 'mr:shots:house.schem|3x2x3';
    expect(JSON.parse(storage.data.get(key) ?? '[]')).toHaveLength(1);

    useAppStore.getState().setVolume(createMockVolume(), 'other.schem');
    expect(useAppStore.getState().shots).toEqual([]);
    useAppStore.getState().setVolume(createMockVolume(), 'house.schem');
    expect(useAppStore.getState().shots.map((s) => s.name)).toEqual(['Front']);
  });
});

describe('sanitizers', () => {
  it('falls back to defaults for invalid values', () => {
    const result = sanitizeSettings({
      ground: 'lava',
      exposure: 'bright',
      sun: { color: 'red', azimuth: 10 },
      background: { type: 'nope' },
    });
    expect(result.ground).toBe(DEFAULT_RENDER_SETTINGS.ground);
    expect(result.exposure).toBe(DEFAULT_RENDER_SETTINGS.exposure);
    expect(result.sun.color).toBe(DEFAULT_RENDER_SETTINGS.sun.color);
    expect(result.sun.azimuth).toBe(10);
    expect(result.background).toEqual(DEFAULT_RENDER_SETTINGS.background);
  });

  it('drops broken shots', () => {
    expect(sanitizeShots([{ id: 'x' }, 5, null])).toEqual([]);
    expect(sanitizeShots('nope')).toEqual([]);
  });
});
