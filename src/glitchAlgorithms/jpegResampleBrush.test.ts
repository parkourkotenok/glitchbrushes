import { describe, expect, it } from 'vitest';
import { defaultAlgorithmSettings } from './index';
import { jpegResampleBrushAlgorithm } from './jpegResampleBrush';
import type { GlitchContext } from '../types';

function context(): GlitchContext {
  const width = 48;
  const height = 40;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 29 + y * 7) & 255;
      pixels[offset + 1] = (x * 11 + y * 31) & 255;
      pixels[offset + 2] = (x * 5 + y * 17) & 255;
      pixels[offset + 3] = 40 + ((x * 9 + y * 13) % 216);
    }
  }
  const mask = new Float32Array(width * height);
  for (let y = 10; y < 30; y += 1) for (let x = 12; x < 36; x += 1) mask[y * width + x] = 1;
  return {
    pixels,
    originalPixels: pixels.slice(),
    width,
    height,
    mask,
    bounds: { x: 12, y: 10, width: 24, height: 20 },
    writeBounds: { x: 6, y: 5, width: 36, height: 30 },
    strength: 1,
    pressure: 1,
    seed: 'jpeg-effect-stroke',
    settings: {
      ...defaultAlgorithmSettings,
      jpegResampleTargetLongEdge: 16,
      jpegResampleQuality: 12,
      jpegResamplePasses: 3,
      jpegResampleNoise: true,
      jpegResampleNoiseAmount: 0.2,
    },
  };
}

describe('JPEG Resample Effect Brush adapter', () => {
  it('is deterministic, crop-bounded, mask-bounded, and alpha-safe', () => {
    const first = context();
    const second = context();
    const before = first.pixels.slice();
    const firstResult = jpegResampleBrushAlgorithm.apply(first);
    const secondResult = jpegResampleBrushAlgorithm.apply(second);

    expect(first.pixels).toEqual(second.pixels);
    expect(firstResult).toEqual({ bounds: first.writeBounds, touchedPixels: firstResult.touchedPixels });
    expect(secondResult.touchedPixels).toBe(firstResult.touchedPixels);
    expect(firstResult.touchedPixels).toBeGreaterThan(0);
    for (let pixel = 0; pixel < first.mask.length; pixel += 1) {
      const offset = pixel * 4;
      expect(first.pixels[offset + 3]).toBe(before[offset + 3]);
      if (first.mask[pixel] === 0) expect(first.pixels.slice(offset, offset + 4)).toEqual(before.slice(offset, offset + 4));
    }
  });
});
