import { describe, expect, it } from 'vitest';
import { flattenOnto, gifFrameDelay } from './encode';

describe('gifFrameDelay', () => {
  it('alternates centisecond delays so the total matches the frame rate', () => {
    for (const fps of [24, 30, 60]) {
      let total = 0;
      for (let i = 0; i < fps; i++) {
        const d = gifFrameDelay(fps, i);
        expect(d % 10).toBe(0);
        total += d;
      }
      expect(total).toBe(1000);
    }
  });

  it('uses 40 or 50 ms steps at 24 fps', () => {
    const set = new Set(Array.from({ length: 24 }, (_, i) => gifFrameDelay(24, i)));
    expect([...set].sort()).toEqual([40, 50]);
  });
});

describe('flattenOnto', () => {
  it('composites transparent pixels onto a vertical gradient', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    const image = { data, width: 2, height: 2 } as unknown as ImageData;
    flattenOnto(image, [100, 100, 100], [200, 200, 200]);
    expect(Array.from(data.slice(0, 4))).toEqual([100, 100, 100, 255]);
    expect(Array.from(data.slice(4, 8))).toEqual([255, 0, 0, 255]);
    expect(Array.from(data.slice(8, 12))).toEqual([200, 200, 200, 255]);
  });
});
