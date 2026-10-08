import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeferred,
  createMockAtlas,
  createMockFile,
  createMockMesh,
  createMockPack,
  createMockRenderer,
  createMockVolume,
} from './dev/mocks';

const log: string[] = [];

vi.mock('./parseClient', () => ({ parseInWorker: vi.fn() }));
vi.mock('../blocks', () => ({ requiredTextures: vi.fn() }));
vi.mock('../mesher/client', () => ({ meshInWorker: vi.fn() }));
vi.mock('../textures', () => ({
  loadBundledPack: vi.fn(),
  loadZipPack: vi.fn(),
  buildAtlas: vi.fn(),
}));

import { requiredTextures } from '../blocks';
import { meshInWorker } from '../mesher/client';
import { buildAtlas, loadBundledPack } from '../textures';
import { parseInWorker } from './parseClient';
import {
  decideUpdate,
  loadSchematicFile,
  rebuildModel,
  resetPipelineForTests,
  startPipelineSync,
} from './pipeline';
import { setRenderer } from './rendererRef';
import { useAppStore } from './store';
import { DEFAULT_RENDER_SETTINGS } from '../core';

const parseMock = vi.mocked(parseInWorker);
const meshMock = vi.mocked(meshInWorker);
const atlasMock = vi.mocked(buildAtlas);
const textureIdsMock = vi.mocked(requiredTextures);
const bundledMock = vi.mocked(loadBundledPack);

function resetStore() {
  useAppStore.setState({
    volume: null,
    fileName: null,
    loading: false,
    error: null,
    step: null,
    pack: null,
    toasts: [],
    settings: DEFAULT_RENDER_SETTINGS,
    meshOptions: {
      mode: 'textured',
      ambientOcclusion: true,
      chunkSize: 32,
      hideBlocks: [],
    },
  });
}

beforeEach(() => {
  log.length = 0;
  resetPipelineForTests();
  resetStore();
  parseMock.mockReset();
  meshMock.mockReset();
  atlasMock.mockReset();
  textureIdsMock.mockReset();
  bundledMock.mockReset();
  parseMock.mockImplementation(async () => {
    log.push('parse');
    return createMockVolume();
  });
  bundledMock.mockImplementation(async () => {
    log.push('loadBundledPack');
    return createMockPack('bundled');
  });
  textureIdsMock.mockImplementation(() => {
    log.push('requiredTextures');
    return ['block/stone'];
  });
  atlasMock.mockImplementation(async () => {
    log.push('buildAtlas');
    return createMockAtlas();
  });
  meshMock.mockImplementation(async () => {
    log.push('mesh');
    return createMockMesh();
  });
});

afterEach(() => {
  setRenderer(null);
});

describe('loadSchematicFile', () => {
  it('calls the modules in order and feeds the renderer', async () => {
    const renderer = createMockRenderer();
    setRenderer(renderer);
    await loadSchematicFile(createMockFile('house.schem'));
    expect(log).toEqual(['parse', 'loadBundledPack', 'requiredTextures', 'buildAtlas', 'mesh']);
    expect(renderer.calls).toEqual(['setModel', 'setSettings', 'fitCamera:iso']);
    expect(useAppStore.getState().volume).not.toBeNull();
    expect(useAppStore.getState().fileName).toBe('house.schem');
    expect(useAppStore.getState().loading).toBe(false);
    expect(useAppStore.getState().step).toBeNull();
  });

  it('passes the palette, atlas data and mesh options through', async () => {
    await loadSchematicFile(createMockFile('house.schem'));
    expect(textureIdsMock).toHaveBeenCalledWith(createMockVolume().palette);
    expect(atlasMock.mock.calls[0]?.[1]).toEqual(['block/stone']);
    const meshArgs = meshMock.mock.calls[0];
    expect(meshArgs?.[1]).toEqual(createMockAtlas().data);
    expect(meshArgs?.[2]).toMatchObject({ mode: 'textured', ambientOcclusion: true });
  });

  it('shows the parse error message and does not touch the renderer', async () => {
    const renderer = createMockRenderer();
    setRenderer(renderer);
    parseMock.mockRejectedValueOnce(new Error('This file is not a schematic.'));
    await loadSchematicFile(createMockFile('bad.schem'));
    const state = useAppStore.getState();
    expect(state.error).toBe('This file is not a schematic.');
    expect(state.toasts[0]?.kind).toBe('error');
    expect(renderer.calls).toEqual([]);
    expect(state.loading).toBe(false);
  });

  it('ignores the result of a file that was replaced mid pipeline', async () => {
    const renderer = createMockRenderer();
    setRenderer(renderer);
    const first = createDeferred<ReturnType<typeof createMockVolume>>();
    parseMock.mockImplementationOnce(() => first.promise);
    const slow = loadSchematicFile(createMockFile('old.schem'));
    await vi.waitFor(() => expect(parseMock).toHaveBeenCalledTimes(1));
    const fresh = loadSchematicFile(createMockFile('new.schem'));
    await fresh;
    first.resolve(createMockVolume('old'));
    await slow;
    expect(useAppStore.getState().fileName).toBe('new.schem');
    expect(renderer.calls.filter((call) => call === 'setModel')).toHaveLength(1);
    expect(meshMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().loading).toBe(false);
  });

  it('ignores a stale mesh result', async () => {
    const renderer = createMockRenderer();
    setRenderer(renderer);
    const slowMesh = createDeferred<ReturnType<typeof createMockMesh>>();
    meshMock.mockImplementationOnce(() => slowMesh.promise);
    const slow = loadSchematicFile(createMockFile('old.schem'));
    await vi.waitFor(() => expect(meshMock).toHaveBeenCalledTimes(1));
    const fresh = loadSchematicFile(createMockFile('new.schem'));
    await fresh;
    slowMesh.resolve(createMockMesh());
    await slow;
    expect(renderer.calls.filter((call) => call === 'setModel')).toHaveLength(1);
    expect(useAppStore.getState().fileName).toBe('new.schem');
  });
});

describe('re-mesh versus setSettings decisions', () => {
  const base = {
    settings: DEFAULT_RENDER_SETTINGS,
    meshOptions: {
      mode: 'textured' as const,
      ambientOcclusion: true,
      chunkSize: 32,
      hideBlocks: [],
    },
    pack: null,
  };

  it('does not re-mesh for lighting changes', () => {
    const next = { ...base, settings: { ...base.settings, exposure: 2 } };
    expect(decideUpdate(base, next)).toEqual({
      applySettings: true,
      remesh: false,
      rebuildAtlas: false,
    });
  });

  it('re-meshes for mode, AO and hidden blocks', () => {
    expect(
      decideUpdate(base, { ...base, meshOptions: { ...base.meshOptions, mode: 'simplified' } })
        .remesh,
    ).toBe(true);
    expect(
      decideUpdate(base, { ...base, meshOptions: { ...base.meshOptions, ambientOcclusion: false } })
        .remesh,
    ).toBe(true);
    expect(
      decideUpdate(base, {
        ...base,
        meshOptions: { ...base.meshOptions, hideBlocks: ['minecraft:glass'] },
      }).remesh,
    ).toBe(true);
  });

  it('rebuilds the atlas when the pack changes', () => {
    const decision = decideUpdate(base, { ...base, pack: createMockPack() });
    expect(decision.remesh).toBe(true);
    expect(decision.rebuildAtlas).toBe(true);
  });

  describe('store subscription', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('applies slider changes live and debounces re-mesh', async () => {
      const renderer = createMockRenderer();
      setRenderer(renderer);
      await loadSchematicFile(createMockFile('house.schem'));
      meshMock.mockClear();
      renderer.calls.length = 0;
      const stop = startPipelineSync(250);
      renderer.calls.length = 0;

      useAppStore.getState().updateSettings({ exposure: 1.5 });
      expect(renderer.calls).toEqual(['setSettings']);
      await vi.advanceTimersByTimeAsync(400);
      expect(meshMock).not.toHaveBeenCalled();

      useAppStore.getState().updateSettings({ textureMode: 'simplified' });
      useAppStore.getState().updateSettings({ ambientOcclusionVertex: false });
      expect(meshMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);
      expect(meshMock).toHaveBeenCalledTimes(1);
      expect(meshMock.mock.calls[0]?.[2]).toMatchObject({
        mode: 'simplified',
        ambientOcclusion: false,
      });
      expect(renderer.models.at(-1)?.mode).toBe('simplified');
      stop();
    });

    it('skips rebuild without a loaded model', async () => {
      await rebuildModel();
      expect(meshMock).not.toHaveBeenCalled();
    });
  });
});
