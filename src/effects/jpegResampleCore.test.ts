import { describe, expect, it } from 'vitest';
import { normalizeJpegResampleSettings, processJpegResample } from './jpegResampleCore';
import { resolveJpegResamplePreset } from './jpegResamplePresets';

function fixture(width = 64, height = 48): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const checker = (x + y) % 2 ? 255 : 0;
      pixels[offset] = (x * 17 + y * 7 + checker) % 256;
      pixels[offset + 1] = (x * 5 + y * 19 + (checker ? 90 : 0)) % 256;
      pixels[offset + 2] = (x * 23 + y * 3) % 256;
      pixels[offset + 3] = x < 8 || y < 5 ? 0 : 48 + ((x * 13 + y * 11) % 208);
    }
  }
  return pixels;
}

function rgbDistance(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let distance = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    distance += Math.abs(a[offset]! - b[offset]!);
    distance += Math.abs(a[offset + 1]! - b[offset + 1]!);
    distance += Math.abs(a[offset + 2]! - b[offset + 2]!);
  }
  return distance;
}

describe('JPEG Resample processing core (worker-only)', () => {
  it('runs in a browser worker where Node Buffer is absent', () => {
    const scope = globalThis as typeof globalThis & { Buffer?: unknown };
    const existingBuffer = scope.Buffer;
    try {
      delete scope.Buffer;
      const result = processJpegResample(fixture(12, 8), 12, 8, {
        quality: 25,
        targetLongEdge: 6,
      });
      expect(result.pixels).toHaveLength(12 * 8 * 4);
      expect(scope.Buffer).toBeDefined();
    } finally {
      if (existingBuffer === undefined) delete scope.Buffer;
      else scope.Buffer = existingBuffer;
    }
  });

  it('is deterministic for an identical local crop, settings, and seed', () => {
    const source = fixture();
    const settings = { targetLongEdge: 31, quality: 28, passes: 2, noise: true, noiseAmount: 0.4 };
    expect(processJpegResample(source, 64, 48, settings, 'stable')).toEqual(
      processJpegResample(source, 64, 48, settings, 'stable'),
    );
  });

  it('makes low JPEG quality and smaller local resolution visibly more destructive', () => {
    const source = fixture();
    const high = processJpegResample(source, 64, 48, { quality: 80, targetLongEdge: 64 });
    const low = processJpegResample(source, 64, 48, { quality: 5, targetLongEdge: 64 });
    const tiny = processJpegResample(source, 64, 48, { quality: 80, targetLongEdge: 8 });
    expect(rgbDistance(low.pixels, source)).toBeGreaterThan(rgbDistance(high.pixels, source));
    expect(rgbDistance(tiny.pixels, source)).toBeGreaterThan(rgbDistance(high.pixels, source));
  });

  it('makes repeated JPEG passes progressively degrade the local crop', () => {
    const source = fixture();
    const once = processJpegResample(source, 64, 48, { quality: 17, passes: 1 });
    const repeated = processJpegResample(source, 64, 48, { quality: 17, passes: 4 });
    expect(rgbDistance(repeated.pixels, source)).toBeGreaterThan(rgbDistance(once.pixels, source));
  });

  it('offers a deterministic Melt preset that is stronger than Low without raising pass limits', () => {
    const source = fixture();
    const lowSettings = resolveJpegResamplePreset('low', 64);
    const meltSettings = resolveJpegResamplePreset('melt', 64);
    expect(meltSettings.forceFullAmount).toBe(true);
    const low = processJpegResample(source, 64, 48, lowSettings, 'preset');
    const melt = processJpegResample(source, 64, 48, meltSettings, 'preset');
    expect(melt).toEqual(processJpegResample(source, 64, 48, meltSettings, 'preset'));
    expect(melt.settings).toMatchObject({
      targetLongEdge: 28,
      quality: 1,
      passes: 4,
      noise: true,
      noiseType: 'rgb',
      upscale: 'smooth',
    });
    expect(rgbDistance(melt.pixels, source)).toBeGreaterThan(rgbDistance(low.pixels, source));
    for (let offset = 3; offset < source.length; offset += 4) {
      expect(melt.pixels[offset]).toBe(source[offset]);
    }
  });

  it('honours noise and sharpen toggles without changing alpha', () => {
    const source = fixture();
    const base = processJpegResample(source, 64, 48, { quality: 55, targetLongEdge: 32 }, 'seed');
    const noisy = processJpegResample(
      source,
      64,
      48,
      { quality: 55, targetLongEdge: 32, noise: true, noiseAmount: 0.8, noiseType: 'rgb' },
      'seed',
    );
    const sharp = processJpegResample(
      source,
      64,
      48,
      { quality: 55, targetLongEdge: 32, sharpen: true, sharpenAmount: 1 },
      'seed',
    );
    expect(noisy.pixels).not.toEqual(base.pixels);
    expect(sharp.pixels).not.toEqual(base.pixels);
    for (let offset = 3; offset < source.length; offset += 4) {
      expect(noisy.pixels[offset]).toBe(source[offset]);
      expect(sharp.pixels[offset]).toBe(source[offset]);
    }
  });

  it('restores alpha byte-exactly and never leaves RGB in fully transparent pixels', () => {
    const source = fixture();
    const result = processJpegResample(source, 64, 48, {
      quality: 3,
      targetLongEdge: 12,
      passes: 4,
      chromaBleed: 1,
      noise: true,
      noiseAmount: 1,
    });
    for (let offset = 0; offset < source.length; offset += 4) {
      expect(result.pixels[offset + 3]).toBe(source[offset + 3]);
      if (source[offset + 3] === 0) {
        expect(result.pixels[offset]).toBe(0);
        expect(result.pixels[offset + 1]).toBe(0);
        expect(result.pixels[offset + 2]).toBe(0);
      }
    }
  });

  it('keeps the source dimensions and clamps hostile settings to local codec bounds', () => {
    const source = fixture(7, 3);
    const result = processJpegResample(source, 7, 3, {
      targetLongEdge: 99_999,
      quality: -20,
      passes: 99,
      mix: 5,
      noiseAmount: -1,
      sharpenAmount: Number.NaN,
    });
    expect([result.width, result.height, result.pixels.length]).toEqual([7, 3, 84]);
    expect(result.settings).toMatchObject({
      targetLongEdge: 7,
      quality: 1,
      passes: 4,
      mix: 1,
      noiseAmount: 0,
      sharpenAmount: 0.25,
    });
    expect(() => processJpegResample(new Uint8ClampedArray(3), 1, 1)).toThrow(/RGBA buffer/);
    expect(normalizeJpegResampleSettings({ targetLongEdge: 0, passes: 0 })).toMatchObject({
      targetLongEdge: 28,
      passes: 1,
    });
    expect(normalizeJpegResampleSettings({ targetLongEdge: 8 }, 64).targetLongEdge).toBe(28);
    expect(normalizeJpegResampleSettings({ targetLongEdge: 8 }, 12).targetLongEdge).toBe(12);
  });
});
