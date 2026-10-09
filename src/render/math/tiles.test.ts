import { describe, expect, it } from 'vitest';
import {
  aoMarginPixels,
  computeTileLayout,
  exportFov,
  exportFrame,
  exportHeightFraction,
  splitEven,
  type TileLayout,
} from './tiles';

function coverage(layout: TileLayout, w: number, h: number): Uint8Array {
  const hits = new Uint8Array(w * h);
  for (const t of layout.tiles) {
    for (let y = t.output.y; y < t.output.y + t.output.height; y++) {
      for (let x = t.output.x; x < t.output.x + t.output.width; x++) {
        hits[x + y * w] = (hits[x + y * w] ?? 0) + 1;
      }
    }
  }
  return hits;
}

describe('computeTileLayout', () => {
  it('uses a single tile when it fits', () => {
    const l = computeTileLayout({
      width: 1920,
      height: 1080,
      supersample: 2,
      maxTileSize: 4096,
      margin: 64,
    });
    expect(l.tiles).toHaveLength(1);
    expect(l.tiles[0]!.render).toEqual({ x: 0, y: 0, width: 3840, height: 2160 });
    expect(l.margin).toBe(0);
  });

  it('covers every output pixel exactly once for 8K with supersampling', () => {
    const l = computeTileLayout({
      width: 7680,
      height: 4320,
      supersample: 4,
      maxTileSize: 4096,
      margin: 100,
    });
    expect(l.fullWidth).toBe(30720);
    expect(coverage(l, 7680, 4320).every((v) => v === 1)).toBe(true);
  });

  it('keeps render tiles within limits and inside the full frame', () => {
    const l = computeTileLayout({
      width: 5000,
      height: 3001,
      supersample: 2,
      maxTileSize: 2048,
      margin: 77,
    });
    for (const t of l.tiles) {
      expect(t.render.width).toBeLessThanOrEqual(2048);
      expect(t.render.height).toBeLessThanOrEqual(2048);
      expect(t.render.x).toBeGreaterThanOrEqual(0);
      expect(t.render.y).toBeGreaterThanOrEqual(0);
      expect(t.render.x + t.render.width).toBeLessThanOrEqual(l.fullWidth);
      expect(t.render.y + t.render.height).toBeLessThanOrEqual(l.fullHeight);
    }
  });

  it('adds an overlap margin and a matching crop', () => {
    const l = computeTileLayout({
      width: 4000,
      height: 4000,
      supersample: 2,
      maxTileSize: 2048,
      margin: 63,
    });
    expect(l.margin % 2).toBe(0);
    expect(l.margin).toBeGreaterThanOrEqual(63);
    expect(l.tiles.length).toBeGreaterThan(1);
    for (const t of l.tiles) {
      expect(t.render.x + t.cropX).toBe(t.core.x);
      expect(t.render.y + t.cropY).toBe(t.core.y);
      expect(t.core.width).toBe(t.output.width * 2);
      expect(t.core.x).toBe(t.output.x * 2);
      expect(t.cropX).toBe(t.core.x > 0 ? l.margin : 0);
      if (t.core.x + t.core.width < l.fullWidth) {
        expect(t.render.x + t.render.width - (t.core.x + t.core.width)).toBe(l.margin);
      }
    }
  });

  it('caps the margin to a quarter of the tile', () => {
    const l = computeTileLayout({
      width: 3000,
      height: 3000,
      supersample: 1,
      maxTileSize: 1024,
      margin: 5000,
    });
    expect(l.margin).toBeLessThanOrEqual(256);
    expect(coverage(l, 3000, 3000).every((v) => v === 1)).toBe(true);
  });
});

describe('splitEven', () => {
  it('splits into near equal integer parts', () => {
    expect(splitEven(10, 3)).toEqual([4, 3, 3]);
    expect(splitEven(9, 3).reduce((a, b) => a + b, 0)).toBe(9);
  });
});

describe('exportFrame', () => {
  it('letterboxes a wide export in a squarer viewport', () => {
    const f = exportFrame(1000, 800, 2);
    expect(f.width).toBe(1000);
    expect(f.height).toBe(500);
    expect(f.y).toBe(150);
  });

  it('pillarboxes a tall export', () => {
    const f = exportFrame(1600, 900, 1);
    expect(f.width).toBe(900);
    expect(f.x).toBe(350);
  });

  it('narrows the vertical fov when the frame is shorter than the view', () => {
    expect(exportHeightFraction(1.25, 2)).toBeCloseTo(0.625);
    expect(exportHeightFraction(16 / 9, 1)).toBe(1);
    expect(exportFov(45, 16 / 9, 1)).toBeCloseTo(45);
    expect(exportFov(45, 1, 2)).toBeLessThan(45);
    const t = Math.tan((exportFov(60, 1, 2) * Math.PI) / 360);
    expect(t).toBeCloseTo(Math.tan(Math.PI / 6) / 2);
  });
});

describe('aoMarginPixels', () => {
  it('grows with projected radius', () => {
    expect(aoMarginPixels(0.5, 100, 8)).toBeGreaterThan(aoMarginPixels(0.5, 10, 8));
  });
});
