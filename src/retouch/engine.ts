import type { Rectangle } from '../types';
import { clamp, pixelToByteOffset } from '../utils/geometry';
import type { RetouchProcessRequest, RetouchProcessResult, RetouchProgress } from './types';

export class RetouchCancelledError extends Error {
  constructor() {
    super('Retouch Worker processing cancelled.');
    this.name = 'RetouchCancelledError';
  }
}

const TOOL_NAMES = {
  smudge: 'Smudge',
  blur: 'Blur',
  sharpen: 'Sharpen',
  restore: 'Restore',
  eraser: 'Eraser',
} as const;

function maskAt(mask: Uint8Array, bounds: Rectangle, x: number, y: number): number {
  if (x < bounds.x || y < bounds.y || x >= bounds.x + bounds.width || y >= bounds.y + bounds.height)
    return 0;
  return mask[(y - bounds.y) * bounds.width + x - bounds.x]! / 255;
}

function luminance(pixels: Uint8ClampedArray, offset: number): number {
  return (
    (pixels[offset]! * 0.2126 + pixels[offset + 1]! * 0.7152 + pixels[offset + 2]! * 0.0722) / 255
  );
}

function mixPixel(
  target: Uint8ClampedArray,
  targetOffset: number,
  source: ArrayLike<number>,
  sourceOffset: number,
  amount: number,
): void {
  const mix = clamp(amount, 0, 1);
  for (let channel = 0; channel < 4; channel += 1) {
    target[targetOffset + channel] = Math.round(
      target[targetOffset + channel]! * (1 - mix) + (source[sourceOffset + channel] ?? 0) * mix,
    );
  }
}

function nearestPathIndex(path: RetouchProcessRequest['path'], x: number, y: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const stride = Math.max(1, Math.floor(path.length / 96));
  for (let index = 0; index < path.length; index += stride) {
    const point = path[index]!;
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function applySmudge(
  request: RetouchProcessRequest,
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  before: Uint8ClampedArray,
): void {
  if (request.path.length < 2) return;
  const source = request.samplePixels ? new Uint8ClampedArray(request.samplePixels) : before;
  const origin = request.path[0]!;
  const pickup = clamp(request.settings.smudgePickup, 0, 1);
  const wetness = clamp(request.settings.smudgeWetness, 0, 1);
  for (let y = request.maskBounds.y; y < request.maskBounds.y + request.maskBounds.height; y += 1) {
    for (
      let x = request.maskBounds.x;
      x < request.maskBounds.x + request.maskBounds.width;
      x += 1
    ) {
      const maskValue = maskAt(mask, request.maskBounds, x, y);
      if (maskValue <= 0) continue;
      const pathPoint = request.path[nearestPathIndex(request.path, x, y)]!;
      const transport = pickup * (0.38 + wetness * 0.62);
      const sourceX = clamp(
        Math.round(x - (pathPoint.x - origin.x) * transport),
        0,
        request.width - 1,
      );
      const sourceY = clamp(
        Math.round(y - (pathPoint.y - origin.y) * transport),
        0,
        request.height - 1,
      );
      const destinationOffset = pixelToByteOffset(x, y, request.width);
      const sourceOffset = pixelToByteOffset(sourceX, sourceY, request.width);
      const pressure = request.settings.smudgePressureStrength ? pathPoint.pressure : 1;
      mixPixel(
        pixels,
        destinationOffset,
        source,
        sourceOffset,
        maskValue * request.brush.strength * pressure * (0.45 + wetness * 0.55),
      );
    }
  }
}
function separableBlurRegion(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  rect: Rectangle,
  radius: number,
  edgeProtection: number,
): Uint8ClampedArray {
  const kernel = new Float32Array(radius * 2 + 1);
  for (let offset = -radius; offset <= radius; offset += 1)
    kernel[offset + radius] = 1 / (1 + Math.abs(offset));
  const luma = new Float32Array(width * height);
  for (let pixel = 0; pixel < luma.length; pixel += 1) luma[pixel] = luminance(source, pixel * 4);
  const startX = rect.x;
  const endX = rect.x + rect.width;
  const startY = rect.y;
  const endY = rect.y + rect.height;
  const temp = new Float32Array(source.length);
  for (let y = startY; y < endY; y += 1) {
    const row = y * width;
    for (let x = startX; x < endX; x += 1) {
      const centerLuma = luma[row + x];
      let totalWeight = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = clamp(x + offset, 0, width - 1);
        const weight =
          kernel[offset + radius]! *
          Math.exp(-Math.abs(luma[row + sampleX]! - centerLuma) * edgeProtection * 18);
        const offset4 = (row + sampleX) * 4;
        r += source[offset4]! * weight;
        g += source[offset4 + 1]! * weight;
        b += source[offset4 + 2]! * weight;
        a += source[offset4 + 3]! * weight;
        totalWeight += weight;
      }
      const out4 = (row + x) * 4;
      const normalize = 1 / Math.max(0.0001, totalWeight);
      temp[out4] = r * normalize;
      temp[out4 + 1] = g * normalize;
      temp[out4 + 2] = b * normalize;
      temp[out4 + 3] = a * normalize;
    }
  }
  const out = new Uint8ClampedArray(source.length);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const centerLuma = luma[y * width + x];
      let totalWeight = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = clamp(y + offset, 0, height - 1);
        const weight =
          kernel[offset + radius]! *
          Math.exp(-Math.abs(luma[sampleY * width + x]! - centerLuma) * edgeProtection * 18);
        const offset4 = (sampleY * width + x) * 4;
        r += temp[offset4]! * weight;
        g += temp[offset4 + 1]! * weight;
        b += temp[offset4 + 2]! * weight;
        a += temp[offset4 + 3]! * weight;
        totalWeight += weight;
      }
      const out4 = (y * width + x) * 4;
      const normalize = 1 / Math.max(0.0001, totalWeight);
      out[out4] = Math.round(r * normalize);
      out[out4 + 1] = Math.round(g * normalize);
      out[out4 + 2] = Math.round(b * normalize);
      out[out4 + 3] = Math.round(a * normalize);
    }
  }
  return out;
}

function applyBlur(
  request: RetouchProcessRequest,
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
): void {
  const radius = clamp(Math.round(request.settings.blurRadius), 1, 24);
  const iterations = clamp(Math.round(request.settings.blurIterations), 1, 4);
  const rect = {
    x: clamp(request.maskBounds.x - radius, 0, request.width - 1),
    y: clamp(request.maskBounds.y - radius, 0, request.height - 1),
    width: Math.min(
      request.width - clamp(request.maskBounds.x - radius, 0, request.width - 1),
      request.maskBounds.width + radius * 2,
    ),
    height: Math.min(
      request.height - clamp(request.maskBounds.y - radius, 0, request.height - 1),
      request.maskBounds.height + radius * 2,
    ),
  };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const source =
      iteration === 0 && request.samplePixels
        ? new Uint8ClampedArray(request.samplePixels)
        : pixels.slice();
    const blurred = separableBlurRegion(
      source,
      request.width,
      request.height,
      rect,
      radius,
      request.settings.blurEdgeProtection,
    );
    for (
      let y = request.maskBounds.y;
      y < request.maskBounds.y + request.maskBounds.height;
      y += 1
    ) {
      for (
        let x = request.maskBounds.x;
        x < request.maskBounds.x + request.maskBounds.width;
        x += 1
      ) {
        const maskValue = maskAt(mask, request.maskBounds, x, y);
        if (maskValue <= 0) continue;
        const offset = pixelToByteOffset(x, y, request.width);
        mixPixel(
          pixels,
          offset,
          blurred,
          offset,
          (maskValue * request.brush.strength) / iterations,
        );
      }
    }
  }
}

function applySharpen(
  request: RetouchProcessRequest,
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
): void {
  const source = request.samplePixels
    ? new Uint8ClampedArray(request.samplePixels)
    : pixels.slice();
  const radius = clamp(Math.round(request.settings.sharpenRadius), 1, 12);
  const threshold = clamp(request.settings.sharpenThreshold, 0, 64);
  const protectNoise = clamp(request.settings.sharpenProtectNoise, 0, 1);
  const rect = {
    x: clamp(request.maskBounds.x - radius, 0, request.width - 1),
    y: clamp(request.maskBounds.y - radius, 0, request.height - 1),
    width: Math.min(
      request.width - clamp(request.maskBounds.x - radius, 0, request.width - 1),
      request.maskBounds.width + radius * 2,
    ),
    height: Math.min(
      request.height - clamp(request.maskBounds.y - radius, 0, request.height - 1),
      request.maskBounds.height + radius * 2,
    ),
  };
  const blurred = separableBlurRegion(source, request.width, request.height, rect, radius, 0.15);
  for (let y = request.maskBounds.y; y < request.maskBounds.y + request.maskBounds.height; y += 1) {
    for (
      let x = request.maskBounds.x;
      x < request.maskBounds.x + request.maskBounds.width;
      x += 1
    ) {
      const maskValue = maskAt(mask, request.maskBounds, x, y);
      if (maskValue <= 0) continue;
      const offset = pixelToByteOffset(x, y, request.width);
      for (let channel = 0; channel < 3; channel += 1) {
        const detail = source[offset + channel]! - blurred[offset + channel]!;
        if (Math.abs(detail) < threshold) continue;
        const noiseGuard = 1 - protectNoise * clamp((Math.abs(detail) - threshold) / 160, 0, 1);
        const amount = maskValue * request.brush.strength * noiseGuard;
        pixels[offset + channel] = clamp(
          Math.round(source[offset + channel]! + detail * amount * 1.35),
          0,
          255,
        );
      }
    }
  }
}

function applySourceRestore(
  request: RetouchProcessRequest,
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
): void {
  if (!request.sourcePixels) throw new Error('Restore requires an explicit source buffer.');
  const source = new Uint8ClampedArray(request.sourcePixels);
  if (source.length !== pixels.length)
    throw new Error('Restore source dimensions do not match the document.');
  for (let y = request.maskBounds.y; y < request.maskBounds.y + request.maskBounds.height; y += 1) {
    for (
      let x = request.maskBounds.x;
      x < request.maskBounds.x + request.maskBounds.width;
      x += 1
    ) {
      const maskValue = maskAt(mask, request.maskBounds, x, y);
      if (maskValue <= 0) continue;
      const offset = pixelToByteOffset(x, y, request.width);
      mixPixel(pixels, offset, source, offset, maskValue * request.brush.strength);
    }
  }
}

function applyEraserPreview(
  request: RetouchProcessRequest,
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
): void {
  for (let y = request.maskBounds.y; y < request.maskBounds.y + request.maskBounds.height; y += 1) {
    for (
      let x = request.maskBounds.x;
      x < request.maskBounds.x + request.maskBounds.width;
      x += 1
    ) {
      const maskValue = maskAt(mask, request.maskBounds, x, y);
      if (maskValue <= 0) continue;
      const offset = pixelToByteOffset(x, y, request.width);
      pixels[offset + 3] = Math.round(
        pixels[offset + 3]! * (1 - maskValue * request.brush.strength),
      );
    }
  }
}

export function processRetouch(
  request: RetouchProcessRequest,
  options: {
    shouldCancel?: () => boolean;
    onProgress?: (progress: RetouchProgress) => void;
  } = {},
): RetouchProcessResult {
  const guard = () => {
    if (options.shouldCancel?.()) throw new RetouchCancelledError();
  };
  const progress = (percent: number) =>
    options.onProgress?.({
      jobId: request.jobId,
      effectName: TOOL_NAMES[request.tool],
      percent,
    });
  const pixels = new Uint8ClampedArray(request.pixels);
  const before = pixels.slice();
  const mask = new Uint8Array(request.mask);
  if (mask.length !== request.maskBounds.width * request.maskBounds.height) {
    throw new Error('Retouch mask dimensions are invalid.');
  }
  guard();
  progress(6);
  if (request.tool === 'smudge') applySmudge(request, pixels, mask, before);
  else if (request.tool === 'blur') applyBlur(request, pixels, mask);
  else if (request.tool === 'sharpen') applySharpen(request, pixels, mask);
  else if (request.tool === 'restore') applySourceRestore(request, pixels, mask);
  else applyEraserPreview(request, pixels, mask);
  progress(92);
  guard();
  let affectedPixels = 0;
  for (let y = request.maskBounds.y; y < request.maskBounds.y + request.maskBounds.height; y += 1) {
    for (
      let x = request.maskBounds.x;
      x < request.maskBounds.x + request.maskBounds.width;
      x += 1
    ) {
      const offset = pixelToByteOffset(x, y, request.width);
      if (
        before[offset] !== pixels[offset] ||
        before[offset + 1] !== pixels[offset + 1] ||
        before[offset + 2] !== pixels[offset + 2] ||
        before[offset + 3] !== pixels[offset + 3]
      )
        affectedPixels += 1;
    }
  }
  progress(100);
  return { jobId: request.jobId, pixels, writeBounds: request.maskBounds, affectedPixels };
}
