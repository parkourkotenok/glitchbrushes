import { describe, expect, it } from 'vitest';
import { processRetouch } from './retouch/engine';
import {
  defaultRetouchSettings,
  type RetouchProcessRequest,
  type RetouchTool,
} from './retouch/types';
import {
  activeLayer,
  composeLayerStack,
  createLayerStack,
  eraseActiveLayerWithMask,
  layerTileCount,
  setLayerPixel,
} from './layers/sparseLayers';
import type { BrushSettings } from './types';

const brush: BrushSettings = {
  size: 8,
  hardness: 0.7,
  opacity: 1,
  strength: 1,
  density: 1,
  scatter: 0,
  spacing: 20,
  accumulate: true,
  pressure: true,
  minPressureSize: 0.2,
  minPressureStrength: 0.2,
};

function request(
  tool: RetouchTool,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  overrides: Partial<RetouchProcessRequest> = {},
): RetouchProcessRequest {
  const mask = new Uint8Array(width * height).fill(255);
  return {
    jobId: `test-${tool}`,
    width,
    height,
    pixels: pixels.slice().buffer,
    mask: mask.buffer,
    maskBounds: { x: 0, y: 0, width, height },
    path: [
      { x: 2, y: height / 2, pressure: 1 },
      { x: width - 2, y: height / 2, pressure: 1 },
    ],
    tool,
    brush,
    settings: { ...defaultRetouchSettings },
    ...overrides,
  };
}

function edgeContrast(pixels: Uint8ClampedArray, width: number, x: number, y: number): number {
  const left = (y * width + x - 1) * 4;
  const right = (y * width + x + 1) * 4;
  return Math.abs(pixels[right]! - pixels[left]!);
}

describe('retouch engine', () => {
  it('Smudge transports sampled structure along the pointer path instead of merely blurring', () => {
    const width = 16;
    const height = 7;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = x <= 5 ? 240 : 15;
        pixels[offset + 1] = x <= 5 ? 35 : 80;
        pixels[offset + 2] = 30;
        pixels[offset + 3] = 255;
      }
    }
    const result = processRetouch(request('smudge', pixels, width, height));
    const destination = (3 * width + 11) * 4;
    expect(result.affectedPixels).toBeGreaterThan(0);
    expect(result.pixels[destination]).toBeGreaterThan(pixels[destination]!);
    expect(result.pixels[destination + 1]).toBeLessThan(pixels[destination + 1]!);
  });

  it('Blur reduces local high-frequency variation', () => {
    const width = 14;
    const height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      const value = ((index % width) + Math.floor(index / width)) % 2 ? 255 : 0;
      pixels[index * 4] = pixels[index * 4 + 1] = pixels[index * 4 + 2] = value;
      pixels[index * 4 + 3] = 255;
    }
    const result = processRetouch(
      request('blur', pixels, width, height, {
        settings: {
          ...defaultRetouchSettings,
          blurRadius: 2,
          blurIterations: 2,
          blurEdgeProtection: 0,
        },
      }),
    );
    const variation = (buffer: Uint8ClampedArray) => {
      let total = 0;
      for (let x = 2; x < width - 2; x += 1)
        total += Math.abs(buffer[(5 * width + x) * 4]! - buffer[(5 * width + x - 1) * 4]!);
      return total;
    };
    expect(variation(result.pixels)).toBeLessThan(variation(pixels));
  });

  it('Sharpen increases contrast at a soft edge without changing flat alpha', () => {
    const width = 18;
    const height = 8;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const value = x < 7 ? 60 : x > 10 ? 190 : 60 + (x - 6) * 32;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      }
    }
    const result = processRetouch(
      request('sharpen', pixels, width, height, {
        settings: {
          ...defaultRetouchSettings,
          sharpenRadius: 2,
          sharpenThreshold: 1,
          sharpenProtectNoise: 0,
        },
      }),
    );
    expect(edgeContrast(result.pixels, width, 8, 4)).toBeGreaterThanOrEqual(
      edgeContrast(pixels, width, 8, 4),
    );
    expect(result.pixels[(4 * width + 8) * 4 + 3]).toBe(255);
  });

  it('Restore reads the explicitly selected source buffer', () => {
    const pixels = new Uint8ClampedArray(6 * 4 * 4).fill(20);
    for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    const source = pixels.slice();
    for (let offset = 0; offset < source.length; offset += 4) {
      source[offset] = 210;
      source[offset + 1] = 120;
      source[offset + 2] = 60;
    }
    const result = processRetouch(
      request('restore', pixels, 6, 4, { sourcePixels: source.buffer }),
    );
    expect([...result.pixels.slice(0, 4)]).toEqual([210, 120, 60, 255]);
  });
});

describe('layer-aware eraser', () => {
  it('clears only the active glitch layer and releases an empty sparse tile', () => {
    const stack = createLayerStack(16, 16);
    const original = new Uint8ClampedArray(16 * 16 * 4);
    for (let offset = 0; offset < original.length; offset += 4) {
      original[offset] = 30;
      original[offset + 1] = 50;
      original[offset + 2] = 70;
      original[offset + 3] = 255;
    }
    setLayerPixel(stack, activeLayer(stack), 5, 6, [240, 10, 20, 255]);
    expect(layerTileCount(activeLayer(stack))).toBe(1);
    const changed = eraseActiveLayerWithMask(
      stack,
      new Uint8Array([255]),
      { x: 5, y: 6, width: 1, height: 1 },
      1,
    );
    expect(changed).toBe(1);
    expect(layerTileCount(activeLayer(stack))).toBe(0);
    const composite = composeLayerStack(stack, original);
    expect([...composite.slice((6 * 16 + 5) * 4, (6 * 16 + 5) * 4 + 4)]).toEqual([30, 50, 70, 255]);
  });
});
