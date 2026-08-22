import { algorithms } from '../glitchAlgorithms';
import { jpegResampleBrushAlgorithm } from '../glitchAlgorithms/jpegResampleBrush';
import { structuralWriteBounds } from '../glitchAlgorithms/structuralUtils';
import type { AlgorithmId, AlgorithmSettings, BrushSettings, Point, Rectangle } from '../types';
import { pixelToByteOffset } from '../utils/geometry';
import { createSeededRandom } from '../utils/prng';

export interface BrushProcessRequest {
  jobId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  originalPixels?: ArrayBuffer;
  mask: ArrayBuffer;
  maskBounds: Rectangle;
  bounds: Rectangle;
  algorithm: AlgorithmId;
  settings: AlgorithmSettings;
  brush: BrushSettings;
  pressure: number;
  seed: string;
  movement: Point;
  cloneSource?: Rectangle;
  feedbackMemory?: ArrayBuffer;
  /** Document-space origin when `pixels` is a cropped worker-only buffer. */
  origin?: Point;
  tool: 'brush' | 'restore';
}

export interface BrushProgress {
  jobId: string;
  effectName: string;
  percent: number;
}

export interface BrushProcessResult {
  jobId: string;
  pixels: Uint8ClampedArray;
  writeBounds: Rectangle;
  affectedPixels: number;
}

export class BrushCancelledError extends Error {
  constructor() {
    super('Brush Worker processing cancelled.');
    this.name = 'BrushCancelledError';
  }
}

function countChangedPixels(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
): number {
  let changed = 0;
  for (let offset = 0; offset < before.length; offset += 4) {
    if (
      before[offset] !== after[offset] ||
      before[offset + 1] !== after[offset + 1] ||
      before[offset + 2] !== after[offset + 2] ||
      before[offset + 3] !== after[offset + 3]
    ) {
      changed += 1;
    }
  }
  return changed;
}

export function processBrushEffect(
  request: BrushProcessRequest,
  options: {
    shouldCancel?: () => boolean;
    onProgress?: (progress: BrushProgress) => void;
  } = {},
): BrushProcessResult {
  const guard = () => {
    if (options.shouldCancel?.()) throw new BrushCancelledError();
  };
  const effectName =
    request.tool === 'restore' ? 'Restore Original' : algorithms[request.algorithm].name;
  const progress = (percent: number) =>
    options.onProgress?.({ jobId: request.jobId, effectName, percent });
  const pixels = new Uint8ClampedArray(request.pixels);
  const originalPixels = request.originalPixels
    ? new Uint8ClampedArray(request.originalPixels)
    : pixels;
  const compactMask = new Uint8Array(request.mask);
  const mask = new Float32Array(request.width * request.height);
  for (let row = 0; row < request.maskBounds.height; row += 1) {
    for (let column = 0; column < request.maskBounds.width; column += 1) {
      const source = row * request.maskBounds.width + column;
      const destination =
        (request.maskBounds.y + row) * request.width + request.maskBounds.x + column;
      mask[destination] = compactMask[source]! / 255;
    }
  }
  const activeAlgorithm =
    request.algorithm === 'jpeg-resample-brush'
      ? jpegResampleBrushAlgorithm
      : algorithms[request.algorithm];
  const writeBounds =
    request.tool === 'restore' || activeAlgorithm.family === 'pixel'
      ? request.bounds
      : structuralWriteBounds(
          request.bounds,
          request.width,
          request.height,
          request.algorithm,
          request.settings,
        );
  const before = new Uint8ClampedArray(writeBounds.width * writeBounds.height * 4);
  for (let row = 0; row < writeBounds.height; row += 1) {
    const sourceStart = ((writeBounds.y + row) * request.width + writeBounds.x) * 4;
    before.set(
      pixels.subarray(sourceStart, sourceStart + writeBounds.width * 4),
      row * writeBounds.width * 4,
    );
  }

  guard();
  progress(8);
  if (request.tool === 'restore') {
    if (!request.originalPixels) {
      throw new Error('Restore processing requires immutable original pixels.');
    }
    const random = createSeededRandom(`${request.seed}:restore`);
    for (let y = request.bounds.y; y < request.bounds.y + request.bounds.height; y += 1) {
      for (let x = request.bounds.x; x < request.bounds.x + request.bounds.width; x += 1) {
        const maskValue = mask[y * request.width + x]!;
        if (random.next() > maskValue * request.brush.strength * request.pressure) continue;
        const offset = pixelToByteOffset(x, y, request.width);
        pixels.set(originalPixels.subarray(offset, offset + 4), offset);
      }
    }
  } else {
    activeAlgorithm.apply({
      pixels,
      originalPixels,
      width: request.width,
      height: request.height,
      mask,
      bounds: request.bounds,
      writeBounds,
      strength: request.brush.strength,
      pressure: request.pressure,
      seed: request.seed,
      settings: request.settings,
      movement: request.movement,
      cloneSource: request.cloneSource,
      feedbackMemory: request.feedbackMemory
        ? new Uint8ClampedArray(request.feedbackMemory)
        : undefined,
    });
  }
  progress(92);
  guard();
  const resultPixels = new Uint8ClampedArray(writeBounds.width * writeBounds.height * 4);
  for (let row = 0; row < writeBounds.height; row += 1) {
    const sourceStart = ((writeBounds.y + row) * request.width + writeBounds.x) * 4;
    resultPixels.set(
      pixels.subarray(sourceStart, sourceStart + writeBounds.width * 4),
      row * writeBounds.width * 4,
    );
  }
  const affectedPixels = countChangedPixels(before, resultPixels);
  progress(100);
  return {
    jobId: request.jobId,
    pixels: resultPixels,
    writeBounds: request.origin
      ? {
          ...writeBounds,
          x: writeBounds.x + request.origin.x,
          y: writeBounds.y + request.origin.y,
        }
      : writeBounds,
    affectedPixels,
  };
}
