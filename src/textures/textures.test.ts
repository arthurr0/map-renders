import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import {
  buildAtlas,
  fallbackColor,
  hexToRgb,
  layerPacks,
  loadZipPack,
  tintFor,
  srgbToLinear,
  linearToSrgb,
  BIOME_TINTS,
  type CanvasFactory,
  type TexturePack,
} from './index';
import { composeAtlas } from './atlas';
import {
  averageColor,
  bleedTransparent,
  layoutAtlas,
  classifyLayer,
  extractFrame,
  resolveAnimation,
  scaleNearest,
  type RgbaImage,
} from './pixels';

function image(width: number, height: number, fill: (x: number, y: number) => number[]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

const options = { padding: 4, minTileSize: 16, maxTileSize: 128, maxSize: 4096 };

describe('classifyLayer', () => {
  it('detects opaque, cutout and translucent', () => {
    expect(classifyLayer([1, 2, 3, 255, 4, 5, 6, 255])).toBe('opaque');
    expect(classifyLayer([1, 2, 3, 255, 4, 5, 6, 0])).toBe('cutout');
    expect(classifyLayer([1, 2, 3, 255, 4, 5, 6, 128])).toBe('translucent');
    expect(classifyLayer([1, 2, 3, 0, 4, 5, 6, 128])).toBe('translucent');
  });
});

describe('averageColor', () => {
  it('weights colors by alpha and reports coverage', () => {
    const [r, g, b, a] = averageColor([255, 0, 0, 255, 0, 0, 255, 0]);
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(0);
    expect(a).toBeCloseTo(0.5);
  });

  it('returns transparent black for empty images', () => {
    expect(averageColor([9, 9, 9, 0])).toEqual([0, 0, 0, 0]);
  });
});

describe('animation layout', () => {
  it('treats a tall strip as frames', () => {
    const layout = resolveAnimation(16, 64, null);
    expect(layout).toMatchObject({ frameWidth: 16, frameHeight: 16, frames: 4, firstFrame: 0 });
  });

  it('keeps square textures as a single frame', () => {
    expect(resolveAnimation(16, 16, { animation: {} }).frames).toBe(1);
  });

  it('uses the first frame listed in mcmeta', () => {
    const layout = resolveAnimation(16, 48, { animation: { frames: [{ index: 2, time: 4 }, 0] } });
    expect(layout.firstFrame).toBe(2);
    const frame = extractFrame(
      image(16, 48, (_x, y) => [Math.floor(y / 16) * 10, 0, 0, 255]),
      layout,
    );
    expect(frame.height).toBe(16);
    expect(frame.data[0]).toBe(20);
  });

  it('honors explicit animation frame size', () => {
    const layout = resolveAnimation(32, 16, { animation: { width: 16, height: 16 } });
    expect(layout.frames).toBe(2);
  });
});

describe('scaleNearest', () => {
  it('upscales without blending', () => {
    const src = image(2, 2, (x, y) => [x * 100, y * 100, 0, 255]);
    const scaled = scaleNearest(src, 4);
    expect(Array.from(scaled.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(scaled.data.slice(2 * 4, 2 * 4 + 4))).toEqual([100, 0, 0, 255]);
    expect(Array.from(scaled.data.slice((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4))).toEqual([
      100, 100, 0, 255,
    ]);
  });
});

describe('layoutAtlas', () => {
  it('produces power of two sizes that fit every cell', () => {
    for (const count of [1, 5, 17, 100, 700]) {
      const grid = layoutAtlas(count, 20, [], 16384);
      if (!grid) throw new Error('no grid');
      expect(Math.log2(grid.width) % 1).toBe(0);
      expect(Math.log2(grid.height) % 1).toBe(0);
      expect(grid.cols * grid.blockRows).toBeGreaterThanOrEqual(count);
      expect(grid.blockRows * 20).toBeLessThanOrEqual(grid.height);
      expect(grid.cols * 20).toBeLessThanOrEqual(grid.width);
    }
  });
});

describe('composeAtlas', () => {
  const solid = (r: number, g: number, b: number, a = 255) => image(16, 16, () => [r, g, b, a]);

  it('packs tiles with padding and classifies layers', () => {
    const composed = composeAtlas(
      [
        { id: 'block/b_glass', image: solid(10, 20, 30, 128), sheetFrames: 1 },
        { id: 'block/a_stone', image: solid(100, 100, 100), sheetFrames: 1 },
        {
          id: 'block/c_leaves',
          image: image(16, 16, (x) => [0, 200, 0, x < 8 ? 0 : 255]),
          sheetFrames: 1,
        },
        { id: 'block/d_water', image: solid(0, 0, 255), sheetFrames: 32 },
      ],
      ['block/mystery_log'],
      options,
    );
    const { data } = composed;
    expect(data.regions['block/a_stone']?.layer).toBe('opaque');
    expect(data.regions['block/b_glass']?.layer).toBe('translucent');
    expect(data.regions['block/c_leaves']?.layer).toBe('cutout');
    expect(data.regions['block/d_water']?.frames).toBe(32);
    expect(data.regions['block/a_stone']?.frames).toBeUndefined();
    expect(data.missing).toEqual(['block/mystery_log']);
    expect(data.regions['block/mystery_log']?.layer).toBe('opaque');
    expect(data.colors['block/mystery_log']?.[3]).toBe(1);
    expect(data.colors['block/c_leaves']?.[3]).toBeCloseTo(0.5);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);

    const first = data.regions['block/a_stone'];
    expect(first).toBeDefined();
    if (!first) return;
    const cell = 16 + 8;
    expect(first.u0 * data.width).toBe(4);
    expect(first.v0 * data.height).toBe(4);
    expect((first.u1 - first.u0) * data.width).toBe(16);
    const second = data.regions['block/b_glass'];
    expect(second && second.v0 * data.height).toBe(cell + 4);
  });

  it('extrudes tile edges into the padding', () => {
    const tile = image(16, 16, (x, y) => [x === 0 && y === 0 ? 200 : 50, 0, 0, 255]);
    const composed = composeAtlas([{ id: 'block/t', image: tile, sheetFrames: 1 }], [], options);
    const px = (x: number, y: number) => composed.image.data[(y * composed.image.width + x) * 4];
    expect(px(0, 0)).toBe(200);
    expect(px(3, 3)).toBe(200);
    expect(px(4, 4)).toBe(200);
    expect(px(5, 5)).toBe(50);
    expect(px(23, 23)).toBe(50);
  });

  it('scales smaller tiles up to the largest tile size', () => {
    const big = image(32, 32, () => [1, 1, 1, 255]);
    const composed = composeAtlas(
      [
        { id: 'block/big', image: big, sheetFrames: 1 },
        { id: 'block/small', image: image(16, 16, () => [9, 9, 9, 255]), sheetFrames: 1 },
      ],
      [],
      options,
    );
    expect(composed.tileSize).toBe(32);
    const small = composed.data.regions['block/small'];
    expect(small && (small.u1 - small.u0) * composed.data.width).toBe(32);
  });

  it('is deterministic', () => {
    const tiles = [
      { id: 'block/x', image: image(16, 16, () => [5, 5, 5, 255]), sheetFrames: 1 },
      { id: 'block/y', image: image(16, 16, () => [6, 6, 6, 255]), sheetFrames: 1 },
    ];
    const a = composeAtlas(tiles, ['block/z'], options);
    const b = composeAtlas([...tiles].reverse(), ['block/z'], options);
    expect(a.data).toEqual(b.data);
  });
});

describe('tile size selection', () => {
  const tile = (id: string, size: number) => ({
    id,
    image: image(size, size, () => [1, 2, 3, 255]),
    sheetFrames: 1,
  });

  it('uses the most common size and downscales outliers', () => {
    const composed = composeAtlas(
      [tile('block/a', 16), tile('block/b', 16), tile('block/c', 16), tile('block/d', 32)],
      [],
      options,
    );
    expect(composed.tileSize).toBe(16);
    const outlier = composed.data.regions['block/d'];
    expect(outlier && (outlier.u1 - outlier.u0) * composed.data.width).toBe(16);
  });

  it('halves the tile size until the atlas fits maxSize', () => {
    const tiles = Array.from({ length: 200 }, (_v, i) => tile(`block/t${i}`, 32));
    const composed = composeAtlas(tiles, [], { ...options, maxSize: 256 });
    expect(composed.tileSize).toBeLessThan(32);
    expect(composed.data.width).toBeLessThanOrEqual(256);
    expect(composed.data.height).toBeLessThanOrEqual(256);
  });
});

describe('entity sheets', () => {
  const sheet = (id: string, w: number, h: number) => ({
    id,
    image: image(w, h, (x, y) => [x, y, 7, 255]),
    sheetFrames: 1,
  });
  const block = (id: string) => ({
    id,
    image: image(16, 16, () => [1, 2, 3, 255]),
    sheetFrames: 1,
  });

  it('keeps the whole sheet at native size without overlapping blocks', () => {
    const composed = composeAtlas(
      [
        block('block/a'),
        block('block/b'),
        sheet('entity/chest/normal', 64, 64),
        sheet('entity/signs/oak', 64, 32),
      ],
      [],
      options,
    );
    const { data } = composed;
    const chest = data.regions['entity/chest/normal'];
    const sign = data.regions['entity/signs/oak'];
    expect(chest && Math.round((chest.u1 - chest.u0) * data.width)).toBe(64);
    expect(chest && Math.round((chest.v1 - chest.v0) * data.height)).toBe(64);
    expect(sign && Math.round((sign.u1 - sign.u0) * data.width)).toBe(64);
    expect(sign && Math.round((sign.v1 - sign.v0) * data.height)).toBe(32);
    expect(composed.tileSize).toBe(16);
    const rects = Object.entries(data.regions).map(([id, r]) => ({
      id,
      x0: Math.round(r.u0 * data.width) - 4,
      y0: Math.round(r.v0 * data.height) - 4,
      x1: Math.round(r.u1 * data.width) + 4,
      y1: Math.round(r.v1 * data.height) + 4,
    }));
    for (const a of rects) {
      for (const b of rects) {
        if (a.id >= b.id) continue;
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap).toBe(false);
      }
    }
    if (chest) {
      const x = Math.round(chest.u0 * data.width);
      const y = Math.round(chest.v0 * data.height);
      const offset = ((y + 10) * composed.image.width + x + 20) * 4;
      expect(composed.image.data[offset]).toBe(20);
      expect(composed.image.data[offset + 1]).toBe(10);
    }
  });

  it('shrinks entity sheets together with tiles when the atlas is too big', () => {
    const composed = composeAtlas([sheet('entity/dragon', 256, 256)], [], {
      ...options,
      maxSize: 128,
    });
    expect(composed.data.width).toBeLessThanOrEqual(128);
    expect(composed.data.height).toBeLessThanOrEqual(128);
  });
});

describe('transparent pixels', () => {
  it('fills the color of fully transparent pixels from opaque neighbors', () => {
    const tile = image(16, 16, (x) => (x < 8 ? [0, 0, 0, 0] : [10, 200, 30, 255]));
    const bled = bleedTransparent(tile);
    expect(Array.from(bled.data.slice(0, 4))).toEqual([10, 200, 30, 0]);
    expect(bled.data[3]).toBe(0);
  });

  it('keeps an entirely transparent tile unchanged', () => {
    const tile = image(16, 16, () => [0, 0, 0, 0]);
    expect(bleedTransparent(tile)).toBe(tile);
  });
});

describe('non square textures', () => {
  it('crops to the top left square', () => {
    const wide = image(32, 16, (x) => [x < 16 ? 10 : 200, 0, 0, 255]);
    const frame = extractFrame(wide, resolveAnimation(32, 16, null));
    expect(frame.width).toBe(16);
    expect(frame.height).toBe(16);
    expect(frame.data[0]).toBe(10);
    expect(frame.data[15 * 4]).toBe(10);
  });
});

describe('srgbToLinear', () => {
  it('converts the transfer curve', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    expect(linearToSrgb(srgbToLinear(0.3))).toBeCloseTo(0.3);
  });
});

describe('fallbackColor', () => {
  it('is stable and follows keywords', () => {
    expect(fallbackColor('block/foo_bar')).toEqual(fallbackColor('block/foo_bar'));
    const log = fallbackColor('block/mystery_log');
    expect(log[0]).toBeGreaterThan(log[2]);
    const leaves = fallbackColor('block/weird_leaves');
    expect(leaves[1]).toBeGreaterThan(leaves[0]);
    expect(leaves[1]).toBeGreaterThan(leaves[2]);
    const wool = fallbackColor('block/red_wool');
    expect(wool[0]).toBeGreaterThan(wool[1]);
    const stone = fallbackColor('block/strange_stone');
    expect(Math.abs(stone[0] - stone[2])).toBeLessThan(0.1);
  });

  it('never returns magenta', () => {
    for (const id of ['block/a', 'block/qq', 'block/unknown_thing', 'block/zzzz']) {
      const [r, g, b] = fallbackColor(id);
      expect(r > 0.8 && b > 0.8 && g < 0.2).toBe(false);
    }
  });
});

describe('tints', () => {
  it('returns plains defaults', () => {
    expect(tintFor('grass')).toBe(BIOME_TINTS.grass);
    expect(tintFor('foliage', 'minecraft:plains')).toBe(BIOME_TINTS.foliage);
    expect(tintFor('water')).toBe(BIOME_TINTS.water);
    expect(tintFor('foliage', 'minecraft:swamp')).toBe('#6a7039');
    expect(tintFor('spruce_leaves')).toBe('#619961');
  });

  it('converts hex to floats', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
  });
});

function fakeCanvasFactory(sources: Map<number, RgbaImage>): CanvasFactory {
  return (width, height) => {
    const store = new Uint8ClampedArray(width * height * 4);
    return {
      width,
      height,
      getContext: () => ({
        drawImage: (bitmap) => {
          const source = sources.get((bitmap as unknown as { key: number }).key);
          if (source) store.set(source.data);
        },
        getImageData: () => ({ data: store.slice() }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (d) => store.set(d.data),
      }),
    };
  };
}

describe('buildAtlas', () => {
  it('loads requested textures, reports missing and layers packs', async () => {
    const sources = new Map<number, RgbaImage>();
    sources.set(
      1,
      image(16, 32, (_x, y) => [y < 16 ? 10 : 200, 0, 0, 255]),
    );
    sources.set(
      2,
      image(16, 16, () => [0, 0, 200, 255]),
    );
    const bitmap = (key: number, w: number, h: number) =>
      ({ key, width: w, height: h, close: () => undefined }) as unknown as ImageBitmap;

    const primary: TexturePack = {
      id: 'p',
      name: 'P',
      attribution: 'attr p',
      getTexture: async (id) => (id === 'block/anim' ? bitmap(1, 16, 32) : null),
      getMcmeta: async () => null,
    };
    const fallback: TexturePack = {
      id: 'f',
      name: 'F',
      attribution: 'attr f',
      getTexture: async (id) => (id === 'block/plain' ? bitmap(2, 16, 16) : null),
      getMcmeta: async () => null,
    };
    const layered = layerPacks(primary, fallback);
    expect(layered.attribution).toContain('attr p');
    expect(layered.attribution).toContain('attr f');

    const { data, image: atlas } = await buildAtlas(
      layered,
      ['block/anim', 'block/plain', 'block/nothing_log', 'block/anim'],
      { createCanvas: fakeCanvasFactory(sources) },
    );
    expect(data.regions['block/anim']?.frames).toBe(2);
    expect(data.regions['block/plain']?.frames).toBeUndefined();
    expect(data.missing).toEqual(['block/nothing_log']);
    expect(Object.keys(data.regions)).toHaveLength(3);
    expect(data.colors['block/anim']?.[0]).toBeCloseTo(10 / 255);
    expect((atlas as unknown as { width: number }).width).toBe(data.width);
  });
});

describe('loadZipPack', () => {
  it('rejects archives without block textures', async () => {
    const zip = zipSync({ 'pack.mcmeta': new Uint8Array([123, 125]) });
    await expect(loadZipPack(zip.buffer as ArrayBuffer, 'x')).rejects.toThrow();
  });

  it('accepts a legacy blocks folder only with current names', async () => {
    const ok = zipSync({ 'assets/minecraft/textures/blocks/oak_planks.png': new Uint8Array([1]) });
    const pack = await loadZipPack(ok.buffer as ArrayBuffer, 'legacy');
    expect(await pack.has?.('block/oak_planks')).toBe(true);
    const old = zipSync({ 'assets/minecraft/textures/blocks/planks_oak.png': new Uint8Array([1]) });
    await expect(loadZipPack(old.buffer as ArrayBuffer, 'old')).rejects.toThrow(/1\.13/);
  });

  it('indexes entity textures with nested paths', async () => {
    const zip = zipSync({
      'assets/minecraft/textures/block/stone.png': new Uint8Array([1]),
      'assets/minecraft/textures/entity/chest/normal.png': new Uint8Array([2]),
    });
    const pack = await loadZipPack(zip.buffer as ArrayBuffer, 'ent');
    expect(await pack.has?.('entity/chest/normal')).toBe(true);
    expect(await pack.has?.('block/chest/normal')).toBe(false);
    expect(await pack.has?.('entity/stone')).toBe(false);
  });

  it('rejects data that is not a zip', async () => {
    await expect(loadZipPack(new Uint8Array([1, 2, 3]).buffer, 'x')).rejects.toThrow(/zip/);
  });

  it('indexes textures and mcmeta, including nested roots', async () => {
    const zip = zipSync({
      'MyPack/assets/minecraft/textures/block/stone.png': new Uint8Array([1]),
      'MyPack/assets/minecraft/textures/block/water_still.png.mcmeta': new TextEncoder().encode(
        '{"animation":{"frametime":2}}',
      ),
      'MyPack/assets/minecraft/textures/block/water_still.png': new Uint8Array([2]),
      'MyPack/assets/minecraft/textures/item/apple.png': new Uint8Array([3]),
    });
    const pack = await loadZipPack(zip.buffer as ArrayBuffer, 'My Pack');
    expect(await pack.has?.('block/stone')).toBe(true);
    expect(await pack.has?.('block/apple')).toBe(false);
    expect(await pack.getMcmeta('block/water_still')).toEqual({ animation: { frametime: 2 } });
    expect(await pack.getMcmeta('block/stone')).toBeNull();
    expect(pack.attribution).toContain('My Pack');
  });
});
