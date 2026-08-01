/// <reference lib="webworker" />

import { algorithms, defaultAlgorithmSettings } from '../glitchAlgorithms';
import type { AlgorithmId, AlgorithmSettings, GlitchContext } from '../types';

interface EffectPreviewRequest {
  jobId: string;
  algorithm: AlgorithmId;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  settings: AlgorithmSettings;
  seed: string;
}

interface EffectPreviewResponse {
  jobId: string;
  algorithm: AlgorithmId;
  after: ArrayBuffer;
  difference: ArrayBuffer;
  changedPixels: number;
  elapsedMs: number;
}

self.onmessage = (event: MessageEvent<EffectPreviewRequest>) => {
  const request = event.data;
  const started = performance.now();
  try {
    const pixels = new Uint8ClampedArray(request.pixels);
    const before = pixels.slice();
    const mask = new Float32Array(request.width * request.height).fill(1);
    const bounds = { x: 0, y: 0, width: request.width, height: request.height };
    const context: GlitchContext = {
      pixels,
      originalPixels: before,
      width: request.width,
      height: request.height,
      mask,
      bounds,
      writeBounds: bounds,
      strength: 0.92,
      pressure: 1,
      seed: `${request.seed}:preview:${request.algorithm}`,
      settings: { ...defaultAlgorithmSettings, ...request.settings },
      movement: { x: Math.max(18, request.width * 0.28), y: request.height * 0.04 },
      cloneSource: {
        x: Math.round(request.width * 0.08),
        y: Math.round(request.height * 0.12),
        width: Math.max(12, Math.round(request.width * 0.34)),
        height: Math.max(12, Math.round(request.height * 0.42)),
      },
      feedbackMemory: before.slice(),
    };
    algorithms[request.algorithm].apply(context);
    const difference = new Uint8ClampedArray(pixels.length);
    let changedPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = Math.abs(pixels[offset]! - before[offset]!);
      const green = Math.abs(pixels[offset + 1]! - before[offset + 1]!);
      const blue = Math.abs(pixels[offset + 2]! - before[offset + 2]!);
      const alpha = Math.abs(pixels[offset + 3]! - before[offset + 3]!);
      if (red || green || blue || alpha) changedPixels += 1;
      difference[offset] = Math.min(255, red * 3);
      difference[offset + 1] = Math.min(255, green * 3);
      difference[offset + 2] = Math.min(255, blue * 3);
      difference[offset + 3] = 255;
    }
    const response: EffectPreviewResponse = {
      jobId: request.jobId,
      algorithm: request.algorithm,
      after: pixels.buffer,
      difference: difference.buffer,
      changedPixels,
      elapsedMs: performance.now() - started,
    };
    self.postMessage(response, [response.after, response.difference]);
  } catch (error) {
    self.postMessage({
      jobId: request.jobId,
      algorithm: request.algorithm,
      error: error instanceof Error ? error.message : 'Effect preview failed.',
    });
  }
};

export {};
