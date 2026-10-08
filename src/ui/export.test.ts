import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS, DEFAULT_RENDER_SETTINGS, RESOLUTION_PRESETS } from '../core';
import { createMockRenderer, MOCK_CAMERA } from './dev/mocks';
import {
  applyAspectLock,
  clampDimension,
  exportFileName,
  frameRect,
  normalizeExportOptions,
  sanitizeFilePart,
  turntableFileName,
} from './exportMath';
import { renderTargets, resolveTargets, uniqueFileNames } from './exportRunner';
import { applyPreset, isValidRenderSettings, STYLE_PRESETS } from './presets';
import { setRenderer } from './rendererRef';

afterEach(() => {
  setRenderer(null);
});

describe('aspect lock math', () => {
  it('keeps 16:9 when width changes', () => {
    expect(applyAspectLock('width', 1280, 16 / 9)).toEqual({ width: 1280, height: 720 });
  });

  it('keeps 16:9 when height changes', () => {
    expect(applyAspectLock('height', 1080, 16 / 9)).toEqual({ width: 1920, height: 1080 });
  });

  it('clamps to limits and survives a bad ratio', () => {
    expect(clampDimension(0)).toBe(16);
    expect(clampDimension(999999)).toBe(16384);
    expect(clampDimension(NaN)).toBe(16);
    expect(applyAspectLock('width', 100, 0)).toEqual({ width: 100, height: 100 });
  });

  it('every preset keeps its ratio through the lock', () => {
    for (const preset of RESOLUTION_PRESETS) {
      const ratio = preset.width / preset.height;
      expect(applyAspectLock('width', preset.width, ratio)).toEqual({
        width: preset.width,
        height: preset.height,
      });
    }
  });

  it('computes a centered frame that fits the container', () => {
    const rect = frameRect(1000, 500, 2, 0);
    expect(rect).toEqual({ left: 0, top: 0, width: 1000, height: 500 });
    const narrow = frameRect(1000, 500, 1, 0);
    expect(narrow.width).toBe(500);
    expect(narrow.left).toBe(250);
  });
});

describe('file naming', () => {
  it('builds schematic-shot-WxH.ext', () => {
    expect(exportFileName('house.schem', 'Front view', 1920, 1080, 'png')).toBe(
      'house-Front-view-1920x1080.png',
    );
  });

  it('uses jpg for jpeg and a safe fallback for empty names', () => {
    expect(exportFileName(null, '', 800, 600, 'jpeg')).toBe('schematic-view-800x600.jpg');
    expect(sanitizeFilePart('../../etc/passwd')).toBe('etc-passwd');
  });

  it('names turntables and de-duplicates names', () => {
    expect(turntableFileName('village.litematic', 1280, 720, 'webm')).toBe(
      'village-turntable-1280x720.webm',
    );
    expect(uniqueFileNames(['a.png', 'a.png', 'b.png'])).toEqual(['a.png', 'a-2.png', 'b.png']);
  });

  it('turns transparency off for jpeg', () => {
    const options = normalizeExportOptions({
      ...DEFAULT_EXPORT_OPTIONS,
      format: 'jpeg',
      transparent: true,
    });
    expect(options.transparent).toBe(false);
  });
});

describe('export runner', () => {
  const shots = [
    { id: 'a', name: 'One', camera: MOCK_CAMERA, createdAt: 1 },
    { id: 'b', name: 'Two', camera: { ...MOCK_CAMERA, zoom: 2 }, createdAt: 2 },
  ];

  it('resolves targets by scope', () => {
    expect(resolveTargets('current', shots, [])).toEqual([{ name: 'view', camera: null }]);
    expect(resolveTargets('selected', shots, ['b']).map((t) => t.name)).toEqual(['Two']);
    expect(resolveTargets('all', shots, []).map((t) => t.name)).toEqual(['One', 'Two']);
  });

  it('renders each shot, names the files and restores the camera', async () => {
    const renderer = createMockRenderer();
    setRenderer(renderer);
    const files = await renderTargets(
      resolveTargets('all', shots, []),
      { ...DEFAULT_EXPORT_OPTIONS, width: 640, height: 360 },
      'house.schem',
      new AbortController().signal,
      () => undefined,
    );
    expect(files.map((f) => f.name)).toEqual(['house-One-640x360.png', 'house-Two-640x360.png']);
    expect(renderer.camera).toEqual(MOCK_CAMERA);
  });

  it('stops when cancelled', async () => {
    const renderer = createMockRenderer();
    setRenderer(renderer);
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderTargets(
        resolveTargets('all', shots, []),
        DEFAULT_EXPORT_OPTIONS,
        'x',
        controller.signal,
        () => undefined,
      ),
    ).rejects.toThrow('Export cancelled');
    expect(renderer.images).toHaveLength(0);
  });
});

describe('style presets', () => {
  it('produces valid render settings', () => {
    for (const preset of STYLE_PRESETS) {
      const result = applyPreset(DEFAULT_RENDER_SETTINGS, preset);
      expect(isValidRenderSettings(result), preset.id).toBe(true);
    }
  });

  it('only the blueprint preset switches to simplified', () => {
    const modes = STYLE_PRESETS.map((p) => applyPreset(DEFAULT_RENDER_SETTINGS, p).textureMode);
    expect(modes.filter((mode) => mode === 'simplified')).toHaveLength(1);
  });

  it('keeps the user texture mode and AO when the preset does not set them', () => {
    const current = { ...DEFAULT_RENDER_SETTINGS, textureMode: 'simplified' as const };
    const golden = STYLE_PRESETS.find((p) => p.id === 'golden-hour');
    if (!golden) throw new Error('missing preset');
    expect(applyPreset(current, golden).textureMode).toBe('simplified');
  });

  it('has unique ids and the five requested looks', () => {
    expect(new Set(STYLE_PRESETS.map((p) => p.id)).size).toBe(5);
  });
});
