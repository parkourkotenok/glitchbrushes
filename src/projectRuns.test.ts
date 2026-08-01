import { describe, expect, it } from 'vitest';
import { applyProjectRuns, encodeProjectRuns } from './projectRuns';

describe('project change chunks', () => {
  it('round-trips sparse RGB changes without fragmenting on unchanged alpha bytes', () => {
    const original = new Uint8ClampedArray(40_000);
    const pixels = original.slice();
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = offset % 251;
      pixels[offset + 1] = (offset * 3) % 251;
      pixels[offset + 2] = (offset * 7) % 251;
      pixels[offset + 3] = 255;
    }

    const runs = encodeProjectRuns(pixels, original, 4096);
    expect(runs.length).toBeLessThanOrEqual(Math.ceil(pixels.length / 4096));

    const restored = new Uint8ClampedArray(pixels.length);
    applyProjectRuns(restored, original, runs);
    expect(restored).toEqual(pixels);
  });

  it('skips fully unchanged chunks and rejects out-of-bounds data', () => {
    const original = new Uint8ClampedArray(16);
    const pixels = original.slice();
    pixels[13] = 99;
    const runs = encodeProjectRuns(pixels, original, 8);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.start).toBe(8);
    expect(() => applyProjectRuns(new Uint8ClampedArray(8), original, runs)).toThrow();
  });
});
