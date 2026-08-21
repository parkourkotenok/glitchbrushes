import { algorithms, defaultAlgorithmSettings } from './glitchAlgorithms';
import { structuralWriteBounds } from './glitchAlgorithms/structuralUtils';
import { processImageBrushStroke } from './imageBrush/engine';
import {
  createImageBrushFx,
  defaultImageBrushSettings,
  type ImageBrushFxItem,
  type ImageBrushSettings,
  type StampPoint,
} from './imageBrush/types';
import type { AlgorithmId, AlgorithmSettings, GlitchContext, Point, Rectangle } from './types';

export type AuditFixture = 'photographic' | 'alpha-art' | 'gradient';
export type AuditMask = 'hard' | 'soft';
export type AuditStroke = 'short' | 'long';

export interface SensitivityMetrics {
  hash: string;
  changedPixels: number;
  meanAbsoluteRgbaDifference: number;
  changedBounds: Rectangle | null;
}

export interface SensitivityResult {
  defaultToMinimum: SensitivityMetrics;
  defaultToMaximum: SensitivityMetrics;
  minimumToMaximum: SensitivityMetrics;
  defaultWriteBounds: Rectangle;
  minimumWriteBounds: Rectangle;
  maximumWriteBounds: Rectangle;
}

const WIDTH = 96;
const HEIGHT = 72;

function fnv1a(bytes: Uint8ClampedArray): string {
  let value = 2166136261;
  for (const byte of bytes) {
    value ^= byte;
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

export function createAuditFixture(
  fixture: AuditFixture,
  width = WIDTH,
  height = HEIGHT,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (fixture === 'gradient') {
        pixels[offset] = Math.round((x / Math.max(1, width - 1)) * 255);
        pixels[offset + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
        pixels[offset + 2] = Math.round(((x + y) / Math.max(1, width + height - 2)) * 255);
        pixels[offset + 3] = 255;
      } else if (fixture === 'alpha-art') {
        const checker = ((x >> 3) + (y >> 3)) % 2;
        const inside =
          x > Math.floor(width * 0.12) &&
          x < Math.ceil(width * 0.88) &&
          y > Math.floor(height * 0.12) &&
          y < Math.ceil(height * 0.88);
        pixels[offset] = checker ? 244 : 18;
        pixels[offset + 1] = checker ? 42 : 218;
        pixels[offset + 2] = (x * 13 + y * 7) & 255;
        pixels[offset + 3] = inside ? (checker ? 255 : 156) : 0;
      } else {
        const wave = Math.sin(x * 0.19) * 36 + Math.cos(y * 0.27) * 28;
        pixels[offset] = (x * 7 + y * 3 + wave + 512) & 255;
        pixels[offset + 1] = (x * 2 + y * 11 + ((x * y) % 71)) & 255;
        pixels[offset + 2] = ((x >> 3) * 37 + (y >> 2) * 23 + wave + 512) & 255;
        pixels[offset + 3] = 255;
      }
    }
  }
  return pixels;
}

export function createAuditMask(
  kind: AuditMask,
  width = WIDTH,
  height = HEIGHT,
): { mask: Float32Array; bounds: Rectangle } {
  const bounds = { x: 20, y: 14, width: width - 40, height: height - 28 };
  const mask = new Float32Array(width * height);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radiusX = bounds.width / 2;
  const radiusY = bounds.height / 2;
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const distance = Math.sqrt(((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2);
      mask[y * width + x] = kind === 'hard' ? (distance <= 1 ? 1 : 0) : Math.max(0, 1 - distance);
    }
  }
  return { mask, bounds };
}

function diffMetrics(before: Uint8ClampedArray, after: Uint8ClampedArray): SensitivityMetrics {
  let changedPixels = 0;
  let absoluteDifference = 0;
  let minX = WIDTH;
  let minY = HEIGHT;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < before.length; offset += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(before[offset + channel]! - after[offset + channel]!);
      absoluteDifference += difference;
      pixelChanged ||= difference > 0;
    }
    if (pixelChanged) {
      changedPixels += 1;
      const pixel = offset / 4;
      const x = pixel % WIDTH;
      const y = Math.floor(pixel / WIDTH);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    hash: fnv1a(after),
    changedPixels,
    meanAbsoluteRgbaDifference: absoluteDifference / Math.max(1, before.length),
    changedBounds:
      maxX < minX ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

function runEffect(
  algorithm: AlgorithmId,
  settings: AlgorithmSettings,
  fixture: AuditFixture,
  maskKind: AuditMask,
  movement: Point,
): { pixels: Uint8ClampedArray; writeBounds: Rectangle } {
  const pixels = createAuditFixture(fixture);
  const originalPixels = pixels.slice();
  const { mask, bounds } = createAuditMask(maskKind);
  const writeBounds =
    algorithms[algorithm].family === 'pixel'
      ? bounds
      : structuralWriteBounds(bounds, WIDTH, HEIGHT, algorithm, settings);
  const context: GlitchContext = {
    pixels,
    originalPixels,
    width: WIDTH,
    height: HEIGHT,
    mask,
    bounds,
    writeBounds,
    strength: 1,
    pressure: 1,
    seed: 'control-sensitivity:v1',
    settings,
    movement,
    cloneSource: { x: 2, y: 2, width: 18, height: 18 },
    feedbackMemory: originalPixels.slice(),
  };
  algorithms[algorithm].apply(context);
  return { pixels, writeBounds };
}

export function measureEffectControl<K extends keyof AlgorithmSettings>(options: {
  algorithm: AlgorithmId;
  key: K;
  minimum: AlgorithmSettings[K];
  maximum: AlgorithmSettings[K];
  activate?: Partial<AlgorithmSettings>;
  fixture?: AuditFixture;
  mask?: AuditMask;
  stroke?: AuditStroke;
}): SensitivityResult {
  const base = { ...defaultAlgorithmSettings, ...options.activate } as AlgorithmSettings;
  const movement = options.stroke === 'short' ? { x: 2, y: 1 } : { x: 34, y: 12 };
  const fixture = options.fixture ?? 'photographic';
  const mask = options.mask ?? 'hard';
  const defaultResult = runEffect(options.algorithm, base, fixture, mask, movement);
  const minimumResult = runEffect(
    options.algorithm,
    { ...base, [options.key]: options.minimum },
    fixture,
    mask,
    movement,
  );
  const maximumResult = runEffect(
    options.algorithm,
    { ...base, [options.key]: options.maximum },
    fixture,
    mask,
    movement,
  );
  return {
    defaultToMinimum: diffMetrics(defaultResult.pixels, minimumResult.pixels),
    defaultToMaximum: diffMetrics(defaultResult.pixels, maximumResult.pixels),
    minimumToMaximum: diffMetrics(minimumResult.pixels, maximumResult.pixels),
    defaultWriteBounds: defaultResult.writeBounds,
    minimumWriteBounds: minimumResult.writeBounds,
    maximumWriteBounds: maximumResult.writeBounds,
  };
}

function auditStamps(stroke: AuditStroke): StampPoint[] {
  const points = stroke === 'short' ? [28, 42] : [16, 32, 48, 64, 80];
  return points.map((x, index) => ({
    position: { x, y: 36 + Math.round(Math.sin(index * 0.8) * 8) },
    previousPosition: {
      x: points[Math.max(0, index - 1)]!,
      y: 36 + Math.round(Math.sin(Math.max(0, index - 1) * 0.8) * 8),
    },
    direction: { x: 1, y: index === 0 ? 0 : 0.25 },
    speed: index === 0 ? 0 : 16,
    pressure: 1,
    distance: index * 16,
    index,
  }));
}

function runImageBrush(
  settings: ImageBrushSettings,
  rack: ImageBrushFxItem[],
  fixture: AuditFixture,
  stroke: AuditStroke,
): { pixels: Uint8ClampedArray; writeBounds: Rectangle } {
  const background = createAuditFixture(fixture);
  const assetPixels = createAuditFixture(fixture, 24, 20);
  const request = {
    jobId: 'control-sensitivity',
    width: WIDTH,
    height: HEIGHT,
    pixels: background.slice(),
    sourceBounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    assets: [{ id: 'audit-asset', width: 24, height: 20, pixels: assetPixels.slice() }],
    activeAssetId: 'audit-asset',
    stamps: auditStamps(stroke),
    settings,
    rack,
    seed: 'control-sensitivity:v1',
    strokeId: 'audit-stroke',
    presetName: 'Audit',
    evolutionOffset: 7,
  };
  const result = processImageBrushStroke(request);
  const composed = background.slice();
  for (let row = 0; row < result.bounds.height; row += 1) {
    const source = row * result.bounds.width * 4;
    const destination = ((result.bounds.y + row) * WIDTH + result.bounds.x) * 4;
    composed.set(result.pixels.subarray(source, source + result.bounds.width * 4), destination);
  }
  return { pixels: composed, writeBounds: result.bounds };
}

export function measureImageBrushControl<K extends keyof ImageBrushSettings>(options: {
  key: K;
  minimum: ImageBrushSettings[K];
  maximum: ImageBrushSettings[K];
  activate?: Partial<ImageBrushSettings>;
  rack?: ImageBrushFxItem[];
  fixture?: AuditFixture;
  stroke?: AuditStroke;
}): SensitivityResult {
  const settings = {
    ...defaultImageBrushSettings,
    ...options.activate,
    customAnchor: {
      ...defaultImageBrushSettings.customAnchor,
      ...options.activate?.customAnchor,
    },
  };
  const rack = options.rack ?? [createImageBrushFx('pixel-embroidery')];
  const fixture = options.fixture ?? 'alpha-art';
  const stroke = options.stroke ?? 'long';
  const defaultResult = runImageBrush(settings, rack, fixture, stroke);
  const minimumResult = runImageBrush(
    { ...settings, [options.key]: options.minimum },
    rack,
    fixture,
    stroke,
  );
  const maximumResult = runImageBrush(
    { ...settings, [options.key]: options.maximum },
    rack,
    fixture,
    stroke,
  );
  return {
    defaultToMinimum: diffMetrics(defaultResult.pixels, minimumResult.pixels),
    defaultToMaximum: diffMetrics(defaultResult.pixels, maximumResult.pixels),
    minimumToMaximum: diffMetrics(minimumResult.pixels, maximumResult.pixels),
    defaultWriteBounds: defaultResult.writeBounds,
    minimumWriteBounds: minimumResult.writeBounds,
    maximumWriteBounds: maximumResult.writeBounds,
  };
}
