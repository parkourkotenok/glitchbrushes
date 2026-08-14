import { describe, expect, it } from 'vitest';
import {
  fitImportedDocument,
  MAX_DOCUMENT_PIXELS,
  readEncodedImageDimensions,
} from './documentImport';
import { stampSoftBrush } from './canvas/brushMask';
import { algorithms, defaultAlgorithmSettings, flipBits, swapChannels } from './glitchAlgorithms';
import { PatchHistory, restoreOriginalRange } from './history/PatchHistory';
import { contiguousPixelSelection, pixelSelectionToByteRuns } from './hexEditor/selection';
import type { GlitchContext, HistoryAction, Rectangle } from './types';
import { brushBounds, pixelToByteOffset } from './utils/geometry';
import { createSeededRandom } from './utils/prng';

function contextFor(
  pixels: Uint8ClampedArray,
  algorithmSeed = 'fixed',
  bounds: Rectangle = { x: 0, y: 0, width: 2, height: 2 },
): GlitchContext {
  return {
    pixels,
    originalPixels: pixels.slice(),
    width: 2,
    height: 2,
    mask: new Float32Array([1, 1, 1, 1]),
    bounds,
    strength: 1,
    pressure: 1,
    seed: algorithmSeed,
    settings: {
      ...defaultAlgorithmSettings,
      byteProbability: 1,
      bitProbability: 1,
    },
  };
}

describe('pixel coordinates', () => {
  it('maps a pixel to its RGBA byte offset', () => {
    expect(pixelToByteOffset(3, 2, 10)).toBe(92);
  });

  it('clamps brush bounds to the image', () => {
    expect(brushBounds({ x: 1, y: 1 }, 4, 10, 8)).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });
  });
});

describe('seeded random', () => {
  it('produces the same stream for the same seed', () => {
    const first = createSeededRandom('datamosh');
    const second = createSeededRandom('datamosh');
    expect(Array.from({ length: 12 }, () => first.next())).toEqual(
      Array.from({ length: 12 }, () => second.next()),
    );
  });
});

describe('algorithms', () => {
  it('Byte Noise is deterministic and changes bytes', () => {
    const first = new Uint8ClampedArray(16).fill(100);
    const second = first.slice();
    algorithms['byte-noise'].apply(contextFor(first, 'noise'));
    algorithms['byte-noise'].apply(contextFor(second, 'noise'));
    expect(first).toEqual(second);
    expect(first).not.toEqual(new Uint8ClampedArray(16).fill(100));
  });

  it('Bit Flip uses XOR', () => {
    expect(flipBits(0b00000001, [0, 3])).toBe(0b00001000);
    const pixels = new Uint8ClampedArray(16).fill(0);
    algorithms['bit-flip'].apply(contextFor(pixels, 'bits'));
    expect(pixels.some((value) => value !== 0)).toBe(true);
  });

  it('Channel Swap swaps RGB channels', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255]);
    swapChannels(pixels, 0, 'bgr');
    expect([...pixels]).toEqual([30, 20, 10, 255]);
  });
});

describe('patch history', () => {
  it('undoes and redoes a byte patch', () => {
    const buffer = new Uint8ClampedArray([1, 2, 3, 4]);
    const history = new PatchHistory();
    const action: HistoryAction = {
      id: 'one',
      label: 'Test',
      timestamp: 1,
      patches: [
        {
          start: 1,
          before: new Uint8ClampedArray([2, 3]),
          after: new Uint8ClampedArray([9, 8]),
        },
      ],
    };
    buffer.set(action.patches[0]!.after, 1);
    history.push(action);
    history.undo(buffer);
    expect([...buffer]).toEqual([1, 2, 3, 4]);
    history.redo(buffer);
    expect([...buffer]).toEqual([1, 9, 8, 4]);
  });

  it('restores a selected range from the original', () => {
    const original = new Uint8ClampedArray([1, 2, 3, 4]);
    const buffer = new Uint8ClampedArray([9, 9, 9, 9]);
    const patch = restoreOriginalRange(buffer, original, 1, 2);
    expect([...buffer]).toEqual([9, 2, 3, 9]);
    expect(patch?.before).toEqual(new Uint8ClampedArray([9, 9]));
  });
});

describe('responsive document import sizing', () => {
  it('keeps small images unchanged', () => {
    expect(fitImportedDocument(1280, 720)).toMatchObject({
      width: 1280,
      height: 720,
      resized: false,
    });
  });

  it('bounds large photos by both dimension and pixel budget', () => {
    const fitted = fitImportedDocument(8064, 6048);
    expect(fitted.resized).toBe(true);
    expect(Math.max(fitted.width, fitted.height)).toBeLessThanOrEqual(1920);
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(MAX_DOCUMENT_PIXELS);
    expect(fitted.sourceWidth).toBe(8064);
    expect(fitted.sourceHeight).toBe(6048);
  });

  it('reads PNG dimensions before decoding the full bitmap', () => {
    const pngHeader = new Uint8Array(24);
    pngHeader.set([0x89, 0x50, 0x4e, 0x47], 0);
    const view = new DataView(pngHeader.buffer);
    view.setUint32(16, 4032);
    view.setUint32(20, 3024);
    expect(readEncodedImageDimensions(pngHeader.buffer, 'image/png')).toEqual({
      width: 4032,
      height: 3024,
    });
  });
});

describe('soft brush mask', () => {
  it('has a stronger center and soft edge', () => {
    const mask = new Float32Array(11 * 11);
    stampSoftBrush(
      mask,
      11,
      11,
      { x: 5.5, y: 5.5 },
      5,
      0.4,
      1,
      1,
      createSeededRandom('mask'),
      false,
    );
    expect(mask[5 * 11 + 5]).toBeGreaterThan(mask[5 * 11 + 1]!);
    expect(mask[5 * 11 + 1]).toBeGreaterThan(0);
    expect(mask[0]).toBe(0);
  });

  it('can skip per-pixel bookkeeping while preserving the mask', () => {
    const mask = new Float32Array(21 * 21);
    const result = stampSoftBrush(
      mask,
      21,
      21,
      { x: 10.5, y: 10.5 },
      8,
      0.5,
      1,
      1,
      createSeededRandom('retouch-mask'),
      true,
      false,
    );
    expect(result.touched).toHaveLength(0);
    expect(mask[10 * 21 + 10]).toBeGreaterThan(0);
  });
});

function structuralContext(seed: string): GlitchContext {
  const width = 96;
  const height = 96;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 3 + y) & 0xff;
      pixels[offset + 1] = (y * 4 + x) & 0xff;
      pixels[offset + 2] = (x * 2 + y * 5) & 0xff;
      pixels[offset + 3] = 255;
    }
  }
  const mask = new Float32Array(width * height);
  for (let y = 24; y < 72; y += 1) {
    for (let x = 24; x < 72; x += 1) mask[y * width + x] = 1;
  }
  return {
    pixels,
    originalPixels: pixels.slice(),
    width,
    height,
    mask,
    bounds: { x: 24, y: 24, width: 48, height: 48 },
    writeBounds: { x: 12, y: 12, width: 72, height: 72 },
    strength: 0.9,
    pressure: 1,
    seed,
    movement: { x: 18, y: 4 },
    settings: { ...defaultAlgorithmSettings },
  };
}

describe('structural glitch stamps', () => {
  const required = [
    'slice-displacement',
    'macroblock-shift',
    'datamosh-smear',
    'rgb-chunk-split',
    'scanline-tear-pro',
  ] as const;

  it.each(required)('%s creates a clearly visible single stamp', (algorithm) => {
    const context = structuralContext(`single-${algorithm}`);
    const before = context.pixels.slice();
    const result = algorithms[algorithm].apply(context);
    let changedPixels = 0;
    for (let offset = 0; offset < before.length; offset += 4) {
      if (
        before[offset] !== context.pixels[offset] ||
        before[offset + 1] !== context.pixels[offset + 1] ||
        before[offset + 2] !== context.pixels[offset + 2]
      ) {
        changedPixels += 1;
      }
    }
    expect(result.touchedPixels).toBeGreaterThan(80);
    expect(changedPixels).toBeGreaterThan(80);
  });

  it('the five core structural effects have distinct output signatures', () => {
    const signatures = required.map((algorithm) => {
      const context = structuralContext('same-gesture');
      algorithms[algorithm].apply(context);
      let hash = 2166136261;
      for (const value of context.pixels) {
        hash ^= value;
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    });
    expect(new Set(signatures).size).toBe(required.length);
  });
});

describe('HEX pixel selection', () => {
  it('converts non-contiguous pixels into complete RGBA byte runs', () => {
    expect(pixelSelectionToByteRuns([2, 3, 7], 64)).toEqual([
      { start: 8, end: 15 },
      { start: 28, end: 31 },
    ]);
  });

  it('creates a contiguous multi-pixel range in either direction', () => {
    expect(contiguousPixelSelection(5, 2)).toEqual([2, 3, 4, 5]);
  });
});
