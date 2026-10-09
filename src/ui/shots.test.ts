import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockRenderer, createMockVolume, MOCK_CAMERA } from './dev/mocks';
import { setRenderer } from './rendererRef';
import { cleanShotName, flyToShot, nextShotName, renameShot, saveCurrentShot } from './shots';
import { useAppStore } from './store';

beforeEach(() => {
  useAppStore.setState({ shots: [], selectedShotIds: [], toasts: [], volume: createMockVolume() });
});

afterEach(() => {
  setRenderer(null);
});

describe('shots', () => {
  it('creates a shot from the renderer camera and thumbnail', async () => {
    const renderer = createMockRenderer();
    renderer.camera = { ...MOCK_CAMERA, position: [5, 6, 7] };
    setRenderer(renderer);
    const shot = await saveCurrentShot();
    expect(shot?.name).toBe('Shot 1');
    expect(shot?.camera.position).toEqual([5, 6, 7]);
    expect(shot?.thumbnail).toContain('data:image');
    expect(useAppStore.getState().shots).toHaveLength(1);
  });

  it('does nothing without a model', async () => {
    useAppStore.setState({ volume: null });
    setRenderer(createMockRenderer());
    expect(await saveCurrentShot()).toBeNull();
    expect(useAppStore.getState().shots).toHaveLength(0);
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe(
      'Open a schematic before saving a shot.',
    );
  });

  it('explains when the viewport is not ready yet', async () => {
    setRenderer(null);
    expect(await saveCurrentShot()).toBeNull();
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('The viewport is not ready yet.');
  });

  it('numbers new shots after existing ones', () => {
    expect(nextShotName([])).toBe('Shot 1');
    const base = { camera: MOCK_CAMERA, createdAt: 0 };
    expect(nextShotName([{ id: 'a', name: 'Shot 4', ...base }])).toBe('Shot 5');
  });

  it('renames and keeps the old name when the new one is blank', async () => {
    setRenderer(createMockRenderer());
    const shot = await saveCurrentShot();
    if (!shot) throw new Error('missing shot');
    renameShot(shot.id, '  Front view  ');
    expect(useAppStore.getState().shots[0]?.name).toBe('Front view');
    renameShot(shot.id, '   ');
    expect(useAppStore.getState().shots[0]?.name).toBe('Front view');
    expect(cleanShotName('x'.repeat(100), 'a')).toHaveLength(60);
  });

  it('deletes and reorders', async () => {
    setRenderer(createMockRenderer());
    await saveCurrentShot();
    await saveCurrentShot();
    await saveCurrentShot();
    const [a, b, c] = useAppStore.getState().shots;
    if (!a || !b || !c) throw new Error('missing shots');
    useAppStore.getState().moveShot(c.id, -1);
    expect(useAppStore.getState().shots.map((s) => s.id)).toEqual([a.id, c.id, b.id]);
    useAppStore.getState().moveShot(a.id, -1);
    expect(useAppStore.getState().shots[0]?.id).toBe(a.id);
    useAppStore.getState().toggleShotSelected(b.id);
    useAppStore.getState().removeShot(b.id);
    expect(useAppStore.getState().shots.map((s) => s.id)).toEqual([a.id, c.id]);
    expect(useAppStore.getState().selectedShotIds).toEqual([]);
  });

  it('flies the camera to a shot with animation', async () => {
    const renderer = createMockRenderer();
    setRenderer(renderer);
    const shot = await saveCurrentShot();
    if (!shot) throw new Error('missing shot');
    flyToShot(shot);
    expect(renderer.calls).toContain('setCamera:animated');
  });
});
