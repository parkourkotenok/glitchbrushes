import { decode, encode } from 'jpeg-js';

/**
 * Deterministic JPEG round-trip for a bounded RGBA buffer.
 *
 * This module is deliberately synchronous because jpeg-js is synchronous.  It is
 * worker-only: callers must invoke it from an effect/image-brush/MOSH worker and
 * transfer the cropped buffer, never import it into a main-thread interaction.
 */
export interface JpegResampleSettings {
  /** Desired long edge of the codec buffer. Values are clamped to 1…2048. */
  targetLongEdge?: number;
  /** JPEG codec quality, 1…100. */
  quality?: number;
  /** Additional deterministic JPEG encodes after the first, 1…4. */
  passes?: number;
  /** 0…1 blend of the processed local result with the original. */
  mix?: number;
  noise?: boolean;
  noiseAmount?: number;
  noiseType?: 'luma' | 'rgb';
  sharpen?: boolean;
  sharpenAmount?: number;
  upscale?: 'smooth' | 'pixelated';
  /** A restrained horizontal chroma shift applied to the decoded local buffer. */
  chromaBleed?: number;
}

export interface NormalizedJpegResampleSettings {
  targetLongEdge: number;
  quality: number;
  passes: number;
  mix: number;
  noise: boolean;
  noiseAmount: number;
  noiseType: 'luma' | 'rgb';
  sharpen: boolean;
  sharpenAmount: number;
  upscale: 'smooth' | 'pixelated';
  chromaBleed: number;
}

export interface JpegResampleResult {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  settings: NormalizedJpegResampleSettings;
}

export interface JpegResampleHooks {
  onPass?(pass: number, passes: number): void;
}

const CODEC_MAX_LONG_EDGE = 2048;
const CODEC_MAX_PASSES = 4;

interface JpegJsBufferShim {
  from(input: ArrayLike<number>): Uint8Array;
  alloc(size: number): Uint8Array;
}

/**
 * jpeg-js emits a Uint8Array-compatible Buffer and only needs `from` in our
 * encode path (`useTArray` keeps decode on typed arrays). Workers do not expose
 * Node's Buffer, so install the two tiny typed-array operations the codec may
 * reference instead of pulling a Node polyfill into every worker bundle.
 */
function ensureJpegJsBuffer(): void {
  const scope = globalThis as typeof globalThis & { Buffer?: JpegJsBufferShim };
  if (scope.Buffer) return;
  scope.Buffer = {
    from(input) {
      return Uint8Array.from(input);
    },
    alloc(size) {
      return new Uint8Array(size);
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeJpegResampleSettings(
  settings: JpegResampleSettings = {},
  sourceLongEdge = CODEC_MAX_LONG_EDGE,
): NormalizedJpegResampleSettings {
  const safeSourceLongEdge = Math.max(1, Math.round(finite(sourceLongEdge, 1)));
  const maximumTargetLongEdge = Math.min(CODEC_MAX_LONG_EDGE, safeSourceLongEdge);
  const minimumTargetLongEdge = Math.min(28, maximumTargetLongEdge);
  return {
    targetLongEdge: Math.round(
      clamp(
        finite(settings.targetLongEdge, safeSourceLongEdge),
        minimumTargetLongEdge,
        maximumTargetLongEdge,
      ),
    ),
    quality: Math.round(clamp(finite(settings.quality, 35), 1, 100)),
    passes: Math.round(clamp(finite(settings.passes, 1), 1, CODEC_MAX_PASSES)),
    mix: clamp(finite(settings.mix, 1), 0, 1),
    noise: Boolean(settings.noise),
    noiseAmount: clamp(finite(settings.noiseAmount, 0.08), 0, 1),
    noiseType: settings.noiseType === 'rgb' ? 'rgb' : 'luma',
    sharpen: Boolean(settings.sharpen),
    sharpenAmount: clamp(finite(settings.sharpenAmount, 0.25), 0, 1),
    upscale: settings.upscale === 'pixelated' ? 'pixelated' : 'smooth',
    chromaBleed: clamp(finite(settings.chromaBleed, 0), 0, 1),
  };
}

function assertRgba(pixels: Uint8ClampedArray, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('JPEG Resample needs positive integer buffer dimensions.');
  }
  if (pixels.length !== width * height * 4) {
    throw new Error('JPEG Resample RGBA buffer does not match its dimensions.');
  }
}

function dimensionsForLongEdge(width: number, height: number, targetLongEdge: number) {
  const scale = Math.min(1, targetLongEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Resizes premultiplied RGB. Alpha is intentionally omitted: it is restored byte-exact. */
function resizeRgb(
  pixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: 'smooth' | 'pixelated',
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const sample = (x: number, y: number, channel: number) =>
    pixels[
      (Math.min(sourceHeight - 1, Math.max(0, y)) * sourceWidth +
        Math.min(sourceWidth - 1, Math.max(0, x))) *
        4 +
        channel
    ]!;
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * sourceHeight) / targetHeight - 0.5;
    const nearestY = Math.round(sourceY);
    const y0 = Math.floor(sourceY);
    const fy = sourceY - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth) / targetWidth - 0.5;
      const nearestX = Math.round(sourceX);
      const x0 = Math.floor(sourceX);
      const fx = sourceX - x0;
      const offset = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        if (mode === 'pixelated') {
          output[offset + channel] = sample(nearestX, nearestY, channel);
        } else {
          const a = sample(x0, y0, channel) * (1 - fx) + sample(x0 + 1, y0, channel) * fx;
          const b = sample(x0, y0 + 1, channel) * (1 - fx) + sample(x0 + 1, y0 + 1, channel) * fx;
          output[offset + channel] = Math.round(a * (1 - fy) + b * fy);
        }
      }
      output[offset + 3] = 255;
    }
  }
  return output;
}

function premultiplyRgb(source: Uint8ClampedArray): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  for (let offset = 0; offset < source.length; offset += 4) {
    const alpha = source[offset + 3]! / 255;
    output[offset] = Math.round(source[offset]! * alpha);
    output[offset + 1] = Math.round(source[offset + 1]! * alpha);
    output[offset + 2] = Math.round(source[offset + 2]! * alpha);
    output[offset + 3] = 255;
  }
  return output;
}

function applyChromaBleed(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0) return;
  const before = pixels.slice();
  const radius = Math.max(1, Math.round(amount * 4));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const left = (y * width + Math.max(0, x - radius)) * 4;
      const right = (y * width + Math.min(width - 1, x + radius)) * 4;
      pixels[offset] = Math.round(before[offset]! * (1 - amount) + before[right]! * amount);
      pixels[offset + 2] = Math.round(
        before[offset + 2]! * (1 - amount) + before[left + 2]! * amount,
      );
    }
  }
}

function seedToState(seed: string | number): number {
  const text = String(seed);
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

function nextRandom(state: { value: number }): number {
  state.value += 0x6d2b79f5;
  let value = state.value;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function applyNoise(
  pixels: Uint8ClampedArray,
  seed: string | number,
  amount: number,
  type: 'luma' | 'rgb',
): void {
  if (amount <= 0) return;
  const state = { value: seedToState(seed) };
  const magnitude = amount * 42;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const luma = (nextRandom(state) - 0.5) * magnitude;
    for (let channel = 0; channel < 3; channel += 1) {
      const noise = type === 'luma' ? luma : (nextRandom(state) - 0.5) * magnitude;
      pixels[offset + channel] = Math.round(clamp(pixels[offset + channel]! + noise, 0, 255));
    }
  }
}

function applySharpen(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0 || width < 2 || height < 2) return;
  const before = pixels.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const left = (y * width + Math.max(0, x - 1)) * 4;
      const right = (y * width + Math.min(width - 1, x + 1)) * 4;
      const top = (Math.max(0, y - 1) * width + x) * 4;
      const bottom = (Math.min(height - 1, y + 1) * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const blurred =
          (before[left + channel]! +
            before[right + channel]! +
            before[top + channel]! +
            before[bottom + channel]!) /
          4;
        pixels[offset + channel] = Math.round(
          clamp(
            before[offset + channel]! + (before[offset + channel]! - blurred) * amount * 1.25,
            0,
            255,
          ),
        );
      }
    }
  }
}

function restoreAlphaAndMix(
  original: Uint8ClampedArray,
  processedPremultiplied: Uint8ClampedArray,
  mix: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(original.length);
  for (let offset = 0; offset < output.length; offset += 4) {
    const alpha = original[offset + 3]!;
    if (alpha === 0) {
      // Fully transparent RGB is zeroed so later Canvas/ImageData composition cannot reveal JPEG bleed.
      output[offset + 3] = 0;
      continue;
    }
    const unpremultiply = 255 / alpha;
    for (let channel = 0; channel < 3; channel += 1) {
      const jpegRgb = clamp(processedPremultiplied[offset + channel]! * unpremultiply, 0, 255);
      output[offset + channel] = Math.round(
        original[offset + channel]! * (1 - mix) + jpegRgb * mix,
      );
    }
    output[offset + 3] = alpha;
  }
  return output;
}

/**
 * Processes one cropped RGBA region. This function has no DOM or browser-codec
 * dependency and must run only inside a Worker; UI wrappers should transfer the
 * local buffer and commit the returned pixels as one atomic history action.
 */
export function processJpegResample(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  settings: JpegResampleSettings = {},
  seed: string | number = 'jpeg-resample',
  hooks: JpegResampleHooks = {},
): JpegResampleResult {
  assertRgba(pixels, width, height);
  ensureJpegJsBuffer();
  const normalized = normalizeJpegResampleSettings(settings, Math.max(width, height));
  const codecDimensions = dimensionsForLongEdge(width, height, normalized.targetLongEdge);
  let codecPixels = resizeRgb(
    premultiplyRgb(pixels),
    width,
    height,
    codecDimensions.width,
    codecDimensions.height,
    'smooth',
  );
  for (let pass = 0; pass < normalized.passes; pass += 1) {
    const encoded = encode(
      { data: codecPixels, width: codecDimensions.width, height: codecDimensions.height },
      normalized.quality,
    );
    const decoded = decode(encoded.data, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
      maxResolutionInMP: 5,
      maxMemoryUsageInMB: 64,
    });
    codecPixels = new Uint8ClampedArray(decoded.data);
    hooks.onPass?.(pass + 1, normalized.passes);
  }
  applyChromaBleed(
    codecPixels,
    codecDimensions.width,
    codecDimensions.height,
    normalized.chromaBleed,
  );
  let processed = resizeRgb(
    codecPixels,
    codecDimensions.width,
    codecDimensions.height,
    width,
    height,
    normalized.upscale,
  );
  if (normalized.noise) applyNoise(processed, seed, normalized.noiseAmount, normalized.noiseType);
  if (normalized.sharpen) applySharpen(processed, width, height, normalized.sharpenAmount);
  return {
    pixels: restoreAlphaAndMix(pixels, processed, normalized.mix),
    width,
    height,
    settings: normalized,
  };
}
