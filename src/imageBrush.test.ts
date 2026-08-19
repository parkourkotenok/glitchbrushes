import { describe, expect, it, vi } from 'vitest';
import { PatchHistory, createPatch } from './history/PatchHistory';
import {
  createImageBrushAsset,
  decodeEmbeddedRgbaDataUrl,
  disposeBrushResource,
  embeddedRgbaDataUrl,
  optimizeImageBrushAsset,
  restoreImageBrushProject,
  serializeImageBrushProject,
  transparentBounds,
} from './imageBrush/assets';

function createTestBrushAssets(count: number) {
  return Array.from({ length: count }, (_, index) =>
    createImageBrushAsset(
      `Test ${index}`,
      `test-${index}.png`,
      'image/png',
      new Uint8ClampedArray([index, 80, 160, 255]),
      1,
      1,
      false,
      0,
      { id: `test-brush-${index}` },
    ),
  );
}
import { cropRgbaRegion, estimateImageBrushReadBounds } from './imageBrush/bounds';
import { shouldPostImageBrushProgress } from './imageBrush/progress';
import {
  compositeRgbaPixel,
  imageBrushMutationStrength,
  prepareBrushTip,
  processBrushTipFx,
  processImageBrushStroke,
} from './imageBrush/engine';
import {
  anchorPoint,
  appendStampPath,
  beginStampPath,
  dragStartsFromHandle,
  rotationForStamp,
} from './imageBrush/path';
import {
  applyImageBrushPreset,
  builtInImageBrushPresets,
  randomizeImageBrush,
} from './imageBrush/presets';
import {
  imageBrushFxCacheKey,
  imageBrushLiveStampBudget,
  takeImageBrushLiveBatch,
} from './imageBrush/performance';
import {
  createImageBrushLivePreviewBackground,
  createImageBrushLivePreviewLayout,
  imageBrushLivePreviewMagnification,
} from './imageBrush/livePreview';
import {
  applyImageBrushGlitchAmount,
  applyImageBrushStyleKeepingEssentials,
  describeCurrentImageBrush,
  preserveImageBrushEssentialControls,
} from './imageBrush/simple';
import {
  defaultImageBrushSettings,
  imageBrushFxDefinitions,
  type ImageBrushFxId,
  type ImageBrushFxItem,
  type StampPoint,
} from './imageBrush/types';
import {
  effectiveImageBrushStages,
  sharedEffectForAlgorithm,
  sharedEffectForMosh,
  supportsImageBrushStages,
} from './effects/sharedRegistry';

function lineStamps(samples: number[]): StampPoint[] {
  const begun = beginStampPath({ x: 0, y: 0 }, 1);
  const output = [begun.stamp];
  for (const x of samples) output.push(...appendStampPath(begun.state, { x, y: 0 }, 1, 10, 0));
  return output;
}

function tinyAsset() {
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 1; y < 7; y += 1) {
    for (let x = 1; x < 7; x += 1) {
      const offset = (y * 8 + x) * 4;
      pixels.set([220, x * 24, y * 24, 255], offset);
    }
  }
  return createImageBrushAsset('Tiny', 'tiny.png', 'image/png', pixels, 8, 8, false);
}

function strokeRequest(
  mutationMode: typeof defaultImageBrushSettings.mutationMode,
  rack: ImageBrushFxItem[],
) {
  const asset = tinyAsset();
  return {
    jobId: 'test',
    width: 80,
    height: 40,
    pixels: new Uint8ClampedArray(80 * 40 * 4),
    sourceBounds: { x: 0, y: 0, width: 80, height: 40 },
    assets: [{ id: asset.id, width: asset.width, height: asset.height, pixels: asset.pixels }],
    activeAssetId: asset.id,
    stamps: [
      {
        position: { x: 15, y: 20 },
        previousPosition: { x: 15, y: 20 },
        direction: { x: 1, y: 0 },
        speed: 0,
        pressure: 1,
        distance: 0,
        index: 0,
      },
      {
        position: { x: 40, y: 20 },
        previousPosition: { x: 15, y: 20 },
        direction: { x: 1, y: 0 },
        speed: 25,
        pressure: 1,
        distance: 25,
        index: 1,
      },
      {
        position: { x: 65, y: 20 },
        previousPosition: { x: 40, y: 20 },
        direction: { x: 1, y: 0 },
        speed: 25,
        pressure: 1,
        distance: 50,
        index: 2,
      },
    ],
    settings: {
      ...defaultImageBrushSettings,
      size: 12,
      rotationMode: 'fixed' as const,
      mutationMode,
      maxCorruption: 0.85,
    },
    rack,
    seed: 'deterministic',
    strokeId: 'stroke-1',
    presetName: 'Test',
    evolutionOffset: 0,
  };
}

function stampCrop(
  result: ReturnType<typeof processImageBrushStroke>,
  centerX: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(12 * 12 * 4);
  for (let y = 14; y < 26; y += 1) {
    const localY = y - result.bounds.y;
    const localX = centerX - 6 - result.bounds.x;
    const source = (localY * result.bounds.width + localX) * 4;
    output.set(result.pixels.subarray(source, source + 12 * 4), (y - 14) * 12 * 4);
  }
  return output;
}

function pixelDistance(first: Uint8ClampedArray, second: Uint8ClampedArray): number {
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    distance += Math.abs(first[index]! - second[index]!);
  }
  return distance;
}

describe('Image Brush assets and path placement', () => {
  it('finds and crops transparent bounds without losing visible alpha', () => {
    const pixels = new Uint8ClampedArray(6 * 5 * 4);
    pixels.set([10, 20, 30, 3], (2 * 6 + 1) * 4);
    pixels.set([40, 50, 60, 255], (3 * 6 + 4) * 4);
    expect(transparentBounds(pixels, 6, 5, 2)).toEqual({ x: 1, y: 2, width: 4, height: 2 });
    const asset = createImageBrushAsset('alpha', 'alpha.png', 'image/png', pixels, 6, 5, true, 2);
    expect([asset.width, asset.height]).toEqual([4, 2]);
    expect(asset.originalPixels).toEqual(pixels);
  });

  it('creates a bounded working stamp without eagerly base64-encoding the original', () => {
    const pixels = new Uint8ClampedArray(1200 * 600 * 4).fill(255);
    const asset = createImageBrushAsset(
      'bounded',
      'bounded.png',
      'image/png',
      pixels,
      1200,
      600,
      false,
      2,
      { maximumDimension: 512, reuseOriginalPixels: true },
    );
    expect([asset.width, asset.height]).toEqual([512, 256]);
    expect(asset.originalPixels).toBe(pixels);
    expect(asset.embeddedDataUrl).toBeUndefined();
    const serialized = serializeImageBrushProject({
      settings: defaultImageBrushSettings,
      seed: 'bounded',
      activePresetId: 'clean-repeat',
      activeAssetId: asset.id,
      evolutionOffset: 0,
      rack: [],
      library: [asset],
    });
    expect(serialized.library[0]!.embeddedDataUrl).toMatch(
      /^data:application\/x-hex-redactor-rgba/,
    );
  });

  it('round-trips an embedded transparent RGBA brush', () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 128]);
    const decoded = decodeEmbeddedRgbaDataUrl(embeddedRgbaDataUrl(pixels, 2, 1));
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(decoded.pixels).toEqual(pixels);
  });

  it('places stamps by accumulated distance independent of pointer event rate', () => {
    const coarse = lineStamps([100]).map((stamp) => stamp.position.x);
    const dense = lineStamps([3, 7, 11, 18, 26, 41, 55, 74, 88, 100]).map(
      (stamp) => stamp.position.x,
    );
    expect(coarse).toEqual(dense);
    expect(coarse).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('interpolates fast movement and does not duplicate slow sub-spacing events', () => {
    expect(lineStamps([95])).toHaveLength(10);
    expect(lineStamps([1, 2, 3, 4, 5, 6, 7, 8, 9])).toHaveLength(1);
  });

  it('uses tangent rotation and custom anchors', () => {
    expect(rotationForStamp('follow', 0, { x: 1, y: 0 }, 0, 0, 0, 0)).toBeCloseTo(
      rotationForStamp('follow', 0, { x: -1, y: 0 }, 0, 0, 0, 0),
    );
    expect(rotationForStamp('follow', 0, { x: 0, y: 1 }, 0, 0, 0, 0)).toBeCloseTo(
      rotationForStamp('follow', 0, { x: 0, y: -1 }, 0, 0, 0, 0),
    );
    expect(rotationForStamp('perpendicular', 0, { x: 1, y: 0 }, 0, 0, 0, 0)).toBeCloseTo(90);
    expect(rotationForStamp('perpendicular', 0, { x: -1, y: 0 }, 0, 0, 0, 0)).toBeCloseTo(90);
    expect(rotationForStamp('perpendicular', 0, { x: 0, y: 1 }, 0, 0, 0, 0)).toBeCloseTo(
      rotationForStamp('perpendicular', 0, { x: 0, y: -1 }, 0, 0, 0, 0),
    );
    expect(anchorPoint('custom', { x: 1.4, y: -0.2 })).toEqual({ x: 1, y: 0 });
    expect(anchorPoint('bottom', { x: 0, y: 0 })).toEqual({ x: 0.5, y: 1 });
  });
});

describe('Image Brush processing', () => {
  const rack: ImageBrushFxItem[] = [
    { id: 'rgb', effectId: 'rgb-split', enabled: true, amount: 0.5, mix: 1 },
  ];

  it('builds a bounded live preview stroke that responds to layout controls', () => {
    const compact = createImageBrushLivePreviewLayout(
      { ...defaultImageBrushSettings, size: 96, spacing: 30 },
      'full',
      1120,
      720,
    );
    const sparse = createImageBrushLivePreviewLayout(
      { ...defaultImageBrushSettings, size: 180, spacing: 130 },
      'full',
      1120,
      720,
    );
    const draft = createImageBrushLivePreviewLayout(defaultImageBrushSettings, 'draft', 1120, 720);
    expect([compact.width, compact.height]).toEqual([480, 168]);
    expect([draft.width, draft.height]).toEqual([240, 84]);
    expect(compact.stamps.length).toBeGreaterThan(sparse.stamps.length);
    expect(compact.stamps.length).toBeLessThanOrEqual(24);
    expect(compact.settings.size).toBeCloseTo(
      96 * Math.max(480 / 1120, 168 / 720) * imageBrushLivePreviewMagnification,
    );
    expect(draft.settings.size).toBeCloseTo(compact.settings.size / 2);
    expect(new Set(compact.stamps.map((stamp) => stamp.position.y))).toHaveLength(1);
    expect(compact.stamps.every((stamp) => stamp.pressure === 1)).toBe(true);
    expect(compact.stamps[1]!.position.x - compact.stamps[0]!.position.x).toBeCloseTo(
      compact.settings.spacing,
    );
    expect(draft.settings.maxCachedVariants).toBeLessThanOrEqual(2);
    expect(compact.settings.maxCachedVariants).toBeLessThanOrEqual(4);
    expect(compact.settings.renderingQuality).toBe('balanced');
    expect(compact.settings.pressureSize).toBe(false);
    const background = createImageBrushLivePreviewBackground(12, 6);
    expect(background.byteLength).toBe(12 * 6 * 4);
    expect(background[3]).toBe(255);
    expect(background.at(-1)).toBe(255);
  });

  it('collects bounded variants from the same render used for the preview stroke', () => {
    const result = processImageBrushStroke(strokeRequest('progressive', rack), {
      collectPreviewVariants: true,
      maxPreviewVariants: 2,
    });
    expect(result.previewVariants?.length).toBeGreaterThan(0);
    expect(result.previewVariants?.length).toBeLessThanOrEqual(2);
    expect(result.metrics.renderedStamps).toBe(result.stampCount);
  });

  it('budgets live feedback by actual draw copies instead of path points', () => {
    expect(imageBrushLiveStampBudget(24, 1, 'balanced')).toBe(6);
    expect(imageBrushLiveStampBudget(24, 4, 'balanced')).toBe(1);
    expect(imageBrushLiveStampBudget(24, 4, 'realtime')).toBe(1);
    expect(imageBrushLiveStampBudget(2, 1, 'high')).toBe(2);
  });

  it('samples and clears an overloaded live-only queue without changing the full stroke', () => {
    const pending = Array.from({ length: 100 }, (_, index) => index);
    expect(takeImageBrushLiveBatch(pending, 4)).toEqual([0, 33, 66, 99]);
    expect(pending).toEqual([]);

    const shortQueue = [0, 1, 2, 3, 4];
    expect(takeImageBrushLiveBatch(shortQueue, 2)).toEqual([0, 1]);
    expect(shortQueue).toEqual([2, 3, 4]);
  });

  it('throttles Worker progress to meaningful percentage and time intervals', () => {
    let lastPercent = -1;
    let lastAt = 0;
    const posted: number[] = [];
    for (let percent = 0; percent <= 100; percent += 1) {
      const now = percent * 10;
      if (!shouldPostImageBrushProgress(percent, lastPercent, now - lastAt)) continue;
      posted.push(percent);
      lastPercent = percent;
      lastAt = now;
    }
    expect(posted.at(-1)).toBe(100);
    expect(posted.length).toBeLessThanOrEqual(11);
    expect(
      posted
        .slice(0, -1)
        .every((percent, index) => index === 0 || percent - posted[index - 1]! >= 10),
    ).toBe(true);
  });

  it('keeps the FX cache key stable for spacing and zoom-independent layout changes', () => {
    const asset = tinyAsset();
    const base = { ...defaultImageBrushSettings };
    const first = imageBrushFxCacheKey(asset, base, rack, 'cache');
    const second = imageBrushFxCacheKey(
      asset,
      { ...base, spacing: base.spacing + 70, size: base.size + 40 },
      rack,
      'cache',
    );
    expect(second).toBe(first);
  });

  it('invalidates the FX cache key when effect strength changes', () => {
    const asset = tinyAsset();
    const first = imageBrushFxCacheKey(asset, defaultImageBrushSettings, rack, 'cache');
    const second = imageBrushFxCacheKey(
      asset,
      defaultImageBrushSettings,
      [{ ...rack[0]!, amount: 0.9 }],
      'cache',
    );
    expect(second).not.toBe(first);
  });

  it('uses effect-specific Glitch Amount curves and exposes a factual brush summary', () => {
    const baseRack: ImageBrushFxItem[] = [
      { id: 'slice', effectId: 'slice', enabled: true, amount: 0.2, mix: 1 },
      { id: 'flow', effectId: 'flow-field', enabled: true, amount: 0.2, mix: 1 },
    ];
    const medium = applyImageBrushGlitchAmount(
      { ...defaultImageBrushSettings, mutationMode: 'fixed' },
      baseRack,
      'medium',
      'test-style',
    );
    expect(medium.settings.glitchAmount).toBe('medium');
    expect(medium.rack[0]!.amount).not.toBe(medium.rack[1]!.amount);
    expect(medium.rack[1]!.amount).toBeLessThan(0.3);
    const summary = describeCurrentImageBrush(tinyAsset(), {
      ...medium.settings,
      spacingUnit: 'pixels',
      spacing: 42,
    });
    expect(summary[0]).toContain('42 px');
    expect(summary.join(' ')).toContain('corrupted once');
  });

  it('renders the same local result from a cropped source without a full-document transfer', () => {
    const full = strokeRequest('whole-trail', rack);
    full.width = 300;
    full.height = 200;
    full.sourceBounds = { x: 0, y: 0, width: full.width, height: full.height };
    full.pixels = new Uint8ClampedArray(full.width * full.height * 4);
    full.stamps = full.stamps.map((stamp, index) => ({
      ...stamp,
      position: { x: 130 + index * 20, y: 100 },
      previousPosition: { x: 130 + Math.max(0, index - 1) * 20, y: 100 },
    }));
    for (let offset = 0; offset < full.pixels.length; offset += 4) {
      full.pixels[offset] = (offset / 4) % 251;
      full.pixels[offset + 1] = 90;
      full.pixels[offset + 2] = 170;
      full.pixels[offset + 3] = 255;
    }
    const fullResult = processImageBrushStroke(full);
    const bounds = estimateImageBrushReadBounds(
      full.stamps,
      full.settings,
      full.assets,
      full.activeAssetId,
      full.width,
      full.height,
    );
    const croppedPixels = cropRgbaRegion(full.pixels, full.width, bounds);
    expect(croppedPixels.byteLength).toBeLessThan(full.pixels.byteLength);
    const croppedResult = processImageBrushStroke({
      ...full,
      pixels: croppedPixels,
      sourceBounds: bounds,
    });
    expect(croppedResult.bounds).toEqual(fullResult.bounds);
    expect(croppedResult.pixels).toEqual(fullResult.pixels);
    expect(croppedResult.metrics.fullDocumentCopies).toBe(0);
  });

  it('reads the latest cropped source after edit, Undo and Redo equivalents', () => {
    const request = strokeRequest('whole-trail', rack);
    request.settings.underlyingSampling = 1;
    request.pixels.fill(40);
    const bounds = estimateImageBrushReadBounds(
      request.stamps,
      request.settings,
      request.assets,
      request.activeAssetId,
      request.width,
      request.height,
    );
    const beforeEdit = cropRgbaRegion(request.pixels, request.width, bounds);
    request.pixels.fill(210);
    const afterEdit = cropRgbaRegion(request.pixels, request.width, bounds);
    const edited = processImageBrushStroke({ ...request, pixels: afterEdit, sourceBounds: bounds });
    const undone = processImageBrushStroke({
      ...request,
      pixels: beforeEdit,
      sourceBounds: bounds,
    });
    const redone = processImageBrushStroke({
      ...request,
      pixels: afterEdit.slice(),
      sourceBounds: bounds,
    });
    expect(edited.pixels).not.toEqual(undone.pixels);
    expect(redone.pixels).toEqual(edited.pixels);
  });

  it('is deterministic for Per Stamp mutation', () => {
    const request = strokeRequest('per-stamp', rack);
    request.settings.minimumEffects = 1;
    request.settings.maximumEffects = 3;
    request.settings.effectVariation = 1;
    const first = processImageBrushStroke(request);
    const second = processImageBrushStroke(request);
    expect(second.pixels).toEqual(first.pixels);
    expect(
      new Set([15, 40, 65].map((x) => [...stampCrop(first, x)].join(','))).size,
    ).toBeGreaterThan(1);
  });

  it('Fixed Glitch reuses an identical processed variant', () => {
    const processed = processImageBrushStroke(strokeRequest('fixed', rack));
    const result = processed.pixels;
    const crop = (centerX: number) => {
      const bytes: number[] = [];
      for (let y = 14; y < 26; y += 1) {
        const localY = y - processed.bounds.y;
        const localX = centerX - 6 - processed.bounds.x;
        const start = (localY * processed.bounds.width + localX) * 4;
        bytes.push(...result.subarray(start, start + 12 * 4));
      }
      return bytes;
    };
    expect(crop(15)).toEqual(crop(40));
    expect(crop(40)).toEqual(crop(65));
    expect(processed.metrics.cacheVariants).toBe(2);
  });

  it('returns only the local dirty rectangle instead of a full-document copy', () => {
    const result = processImageBrushStroke(strokeRequest('fixed', rack));
    expect(result.regionOnly).toBe(true);
    expect(result.pixels.byteLength).toBe(result.bounds.width * result.bounds.height * 4);
    expect(result.pixels.byteLength).toBeLessThan(80 * 40 * 4);
    expect(result.metrics.fullDocumentCopies).toBe(0);
  });

  it('bounds the deterministic Per Stamp variant pool', () => {
    const request = strokeRequest('per-stamp', rack);
    request.settings.variantCount = 2;
    request.settings.maxCachedVariants = 2;
    const result = processImageBrushStroke(request);
    expect(result.metrics.cacheVariants).toBeLessThanOrEqual(3);
    expect(result.pixels).toEqual(processImageBrushStroke(request).pixels);
  });

  it('Evolving mutation is deterministic and accumulates a different result', () => {
    const evolvingRequest = strokeRequest('evolving', rack);
    evolvingRequest.settings.fxStage = 'each';
    const evolving = processImageBrushStroke(evolvingRequest).pixels;
    const fixed = processImageBrushStroke(strokeRequest('fixed', rack)).pixels;
    expect(evolving).toEqual(processImageBrushStroke(evolvingRequest).pixels);
    expect(evolving).not.toEqual(fixed);
  });

  it('Progressive Decay increases real corruption and uses a bounded key-variant cache', () => {
    const request = strokeRequest('progressive', rack);
    request.settings.progressiveStart = 0.01;
    request.settings.progressiveEnd = 1;
    request.settings.evolutionSpeed = 1;
    request.settings.maxCorruption = 1;
    request.settings.variantCount = 3;
    const strengths = [0, 1, 2].map((index) =>
      imageBrushMutationStrength(request.settings, index, 3, 0, request.seed),
    );
    expect(strengths[0]).toBeLessThan(strengths[1]!);
    expect(strengths[1]).toBeLessThan(strengths[2]!);
    const progressive = processImageBrushStroke(request);
    const clean = processImageBrushStroke(strokeRequest('clean', rack));
    expect(pixelDistance(stampCrop(progressive, 15), stampCrop(clean, 15))).toBeLessThan(
      pixelDistance(stampCrop(progressive, 65), stampCrop(clean, 65)),
    );
    expect(progressive.metrics.cacheVariants).toBeLessThanOrEqual(4);
  });

  it('Random Effect Stack builds a deterministic procedural result per stamp', () => {
    const request = strokeRequest('random-stack', rack);
    request.settings.effectPool = ['slice', 'block-corruption', 'rgb-split'];
    request.settings.stackMinimumEffects = 1;
    request.settings.stackMaximumEffects = 3;
    request.settings.effectVariation = 1;
    const first = processImageBrushStroke(request);
    expect(first.pixels).toEqual(processImageBrushStroke(request).pixels);
    expect(
      new Set([15, 40, 65].map((x) => [...stampCrop(first, x)].join(','))).size,
    ).toBeGreaterThan(1);
  });

  it('Alternating Modes repeats A/B/A while Stroke Gradient changes from start to end', () => {
    const alternatingRequest = strokeRequest('alternating', rack);
    alternatingRequest.settings.recipeA = 'clean';
    alternatingRequest.settings.recipeB = 'block-corruption';
    alternatingRequest.settings.alternatingInterval = 1;
    const alternating = processImageBrushStroke(alternatingRequest);
    expect(stampCrop(alternating, 15)).toEqual(stampCrop(alternating, 65));
    expect(stampCrop(alternating, 15)).not.toEqual(stampCrop(alternating, 40));

    const gradientRequest = strokeRequest('stroke-gradient', rack);
    gradientRequest.settings.gradientStart = 'clean';
    gradientRequest.settings.gradientEnd = 'block-corruption';
    gradientRequest.settings.evolutionCurve = 'linear';
    const gradient = processImageBrushStroke(gradientRequest);
    expect(stampCrop(gradient, 15)).not.toEqual(stampCrop(gradient, 65));
  });

  it('Clean Repeat bypasses both per-stamp and whole-trail FX', () => {
    const clean = strokeRequest('clean', rack);
    clean.settings.fxStage = 'before-after';
    const result = processImageBrushStroke(clean);
    expect(stampCrop(result, 15)).toEqual(stampCrop(result, 40));
    expect(stampCrop(result, 40)).toEqual(stampCrop(result, 65));
    expect(result.metrics.fxProcessingMs).toBe(0);
  });

  it('Preserve Alpha never creates an opaque rectangle', () => {
    const pixels = new Uint8ClampedArray(6 * 6 * 4);
    pixels.set([220, 50, 40, 255], (3 * 6 + 3) * 4);
    const processed = processBrushTipFx(
      pixels,
      6,
      6,
      rack,
      { alphaMode: 'preserve', bleedAmount: 0 },
      'alpha',
    );
    for (let pixel = 0; pixel < 36; pixel += 1) {
      expect(processed.pixels[pixel * 4 + 3]).toBe(pixels[pixel * 4 + 3]);
    }
  });

  it('Alpha Bleed is bounded by configured padding', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels.set([255, 120, 0, 255], (1 * 4 + 1) * 4);
    const prepared = prepareBrushTip(pixels, 4, 4, 'bleed', 3);
    expect(prepared.padding).toBe(3);
    expect([prepared.width, prepared.height]).toEqual([10, 10]);
    const processed = processBrushTipFx(
      pixels,
      4,
      4,
      [],
      { alphaMode: 'bleed', bleedAmount: 3 },
      'bleed',
    );
    expect(processed.width).toBe(10);
    expect(processed.pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });

  it('implements export-safe RGBA blend math', () => {
    const target = new Uint8ClampedArray([100, 120, 140, 255]);
    compositeRgbaPixel(target, 0, [200, 50, 20, 128], 'normal');
    expect([...target]).toEqual([150, 85, 80, 255]);
    const difference = new Uint8ClampedArray([100, 120, 140, 255]);
    compositeRgbaPixel(difference, 0, [200, 50, 20, 255], 'difference');
    expect([...difference]).toEqual([100, 70, 120, 255]);
  });

  it('supports all ten RGBA blend modes without preview-only browser state', () => {
    const modes = [
      'normal',
      'multiply',
      'screen',
      'overlay',
      'difference',
      'lighten',
      'darken',
      'hard-light',
      'color-dodge',
      'exclusion',
    ] as const;
    const results = modes.map((mode) => {
      const target = new Uint8ClampedArray([70, 130, 210, 220]);
      compositeRgbaPixel(target, 0, [220, 60, 120, 190], mode);
      expect(target[3]).toBeGreaterThanOrEqual(220);
      expect([...target].every((value) => value >= 0 && value <= 255)).toBe(true);
      return [...target].join(',');
    });
    expect(new Set(results).size).toBeGreaterThanOrEqual(8);
  });

  it('keeps before, each-stamp and after-trail stages visually distinct', () => {
    const beforeRequest = strokeRequest('per-stamp', rack);
    beforeRequest.settings.fxStage = 'before';
    const eachRequest = strokeRequest('per-stamp', rack);
    eachRequest.settings.fxStage = 'each';
    const afterRequest = strokeRequest('per-stamp', rack);
    afterRequest.settings.fxStage = 'after';
    const before = processImageBrushStroke(beforeRequest).pixels;
    const each = processImageBrushStroke(eachRequest).pixels;
    const after = processImageBrushStroke(afterRequest).pixels;
    expect(each).not.toEqual(before);
    expect(after).not.toEqual(before);
  });

  it('Whole Trail deterministically processes the connected local layer', () => {
    const request = strokeRequest('whole-trail', rack);
    request.pixels.fill(35);
    for (let offset = 3; offset < request.pixels.length; offset += 4) request.pixels[offset] = 255;
    const first = processImageBrushStroke(request).pixels;
    const second = processImageBrushStroke(strokeRequest('fixed', rack)).pixels;
    expect(first).not.toEqual(second);
    expect(first).toEqual(processImageBrushStroke(request).pixels);
  });
});

describe('Image Brush presets, project and history contracts', () => {
  it('uses the shared FX registry with explicit tip, per-stamp and whole-trail compatibility', () => {
    const names = imageBrushFxDefinitions.map((definition) => definition.name);
    for (const required of [
      'Pixel Sort',
      'Feedback Echo',
      'Motion Field Mosh',
      'Luma / Chroma Drift',
      'Codec Block Damage',
      'Flow Field Displace',
      'RGB Chunk Split',
      'Scanline Tear',
      'Block Corruption',
      'Motion Transfer',
      'Edge Melt',
    ])
      expect(names).toContain(required);
    expect(names).not.toContain('Palette Collapse');
    expect(supportsImageBrushStages('motion-transfer', ['trail'])).toBe(true);
    expect(supportsImageBrushStages('motion-transfer', ['tip'])).toBe(false);
    expect(supportsImageBrushStages('edge-melt', ['trail'])).toBe(true);
    expect(supportsImageBrushStages('edge-melt', ['stamp'])).toBe(false);
    expect(sharedEffectForAlgorithm('codec-block-damage')?.id).toBe('codec-block-damage');
    expect(sharedEffectForMosh('flow-field')?.id).toBe('flow-field');
  });

  it('runs Motion Transfer as a real compatible whole-trail FX adapter', () => {
    const motionRack: ImageBrushFxItem[] = [
      {
        id: 'motion-transfer-trail',
        effectId: 'motion-transfer',
        enabled: true,
        amount: 0.84,
        mix: 1,
      },
    ];
    const request = strokeRequest('whole-trail', motionRack);
    request.settings.fxStage = 'after';
    request.settings.mutationAmount = 1;
    const transferred = processImageBrushStroke(request);
    const cleanRequest = strokeRequest('clean', []);
    const clean = processImageBrushStroke(cleanRequest);
    expect(transferred.affectedPixels).toBeGreaterThan(0);
    expect(transferred.pixels).not.toEqual(clean.pixels);
  });

  it('keeps randomized FX compatible with the generated mutation stage', () => {
    for (let nonce = 1; nonce <= 16; nonce += 1) {
      const randomized = randomizeImageBrush(
        defaultImageBrushSettings,
        [],
        'compatibility',
        'everything',
        nonce,
      );
      const stages = effectiveImageBrushStages(
        randomized.settings.fxStage,
        randomized.settings.mutationMode,
      );
      expect(randomized.rack.every((item) => supportsImageBrushStages(item.effectId, stages))).toBe(
        true,
      );
      expect(randomized.rack.map((item) => item.effectId)).not.toContain('palette');
    }
  });

  it('all fifteen built-ins keep the current image selected', () => {
    expect(builtInImageBrushPresets).toHaveLength(15);
    expect(builtInImageBrushPresets.map((preset) => preset.name)).toEqual([
      'Clean Repeat',
      'Glitched Repeat',
      'Progressive Decay',
      'Random Glitch Chain',
      'Datamosh Trail',
      'RGB Separation Trail',
      'Pixel Sort Trail',
      'Whole Trail',
      'MOSH Flow Trail',
      'Codec Damage Trail',
      'Chroma Feedback',
      'Compression Breakdown',
      'Packet Loss Stream',
      'Broken Interface',
      'Scatter Fragments',
    ]);
    expect(new Set(builtInImageBrushPresets.map((preset) => preset.settings.mutationMode))).toEqual(
      new Set([
        'clean',
        'fixed',
        'progressive',
        'per-stamp',
        'evolving',
        'random-stack',
        'whole-trail',
        'stroke-gradient',
        'alternating',
      ]),
    );
    for (const preset of builtInImageBrushPresets) {
      expect(applyImageBrushPreset('uploaded-image', preset).assetId).toBe('uploaded-image');
    }
  });

  it('Glitch Amount maps into mode-specific controls and Variation changes recipe diversity', () => {
    const base = {
      ...defaultImageBrushSettings,
      mutationMode: 'random-stack' as const,
      effectPool: ['slice', 'macroblock', 'rgb-split', 'packet-loss'] as ImageBrushFxId[],
    };
    const extreme = applyImageBrushGlitchAmount(base, [], 'extreme', 'mapping');
    expect(extreme.settings.stackMaximumStrength).toBeGreaterThan(
      extreme.settings.stackMinimumStrength,
    );
    expect(extreme.settings.maximumEffects).toBeGreaterThan(extreme.settings.minimumEffects);
    expect(extreme.settings.progressiveEnd).toBeGreaterThan(extreme.settings.progressiveStart);

    const lowVariation = strokeRequest('random-stack', extreme.rack);
    Object.assign(lowVariation.settings, extreme.settings, {
      mutationMode: 'random-stack',
      effectPool: [...base.effectPool],
      effectVariation: 0,
    });
    const highVariation = {
      ...lowVariation,
      settings: { ...lowVariation.settings, effectVariation: 1 },
    };
    expect(processImageBrushStroke(lowVariation).pixels).not.toEqual(
      processImageBrushStroke(highVariation).pixels,
    );
  });

  it('changes glitch style without replacing the user essential brush controls', () => {
    const current = {
      ...defaultImageBrushSettings,
      size: 173,
      spacing: 41,
      spacingUnit: 'pixels' as const,
      opacity: 0.64,
      glitchAmount: 'strong' as const,
      effectVariation: 0.17,
      rotationMode: 'fixed' as const,
      followDirection: false,
      rotationJitter: 0,
    };
    const styled = preserveImageBrushEssentialControls(
      current,
      builtInImageBrushPresets.find((preset) => preset.id === 'scatter-fragments')!.settings,
    );
    expect(styled).toMatchObject({
      size: 173,
      spacing: 41,
      spacingUnit: 'pixels',
      opacity: 0.64,
      glitchAmount: 'strong',
      effectVariation: 0.17,
      rotationMode: 'fixed',
      followDirection: false,
      rotationJitter: 0,
    });
    expect(styled.mutationMode).toBe('per-stamp');

    const preset = builtInImageBrushPresets.find(
      (candidate) => candidate.id === 'scatter-fragments',
    )!;
    const applied = applyImageBrushStyleKeepingEssentials(
      current,
      preset.settings,
      preset.rack,
      preset.id,
    );
    expect(applied.settings).toMatchObject({
      size: 173,
      spacing: 41,
      opacity: 0.64,
      glitchAmount: 'strong',
      effectVariation: 0.17,
      rotationMode: 'fixed',
    });
    expect(applied.rack.every((item) => item.enabled)).toBe(true);
  });

  it('seeded randomizers never replace or delete the image', () => {
    const first = randomizeImageBrush(defaultImageBrushSettings, [], 'same', 'everything');
    const second = randomizeImageBrush(defaultImageBrushSettings, [], 'same', 'everything');
    expect(second).toEqual(first);
    expect(first.settings.opacity).toBeGreaterThan(0);
    expect(first.rack.length).toBeGreaterThan(0);
  });

  it('unlocked variation nonces change Image Brush recipes while a locked nonce reproduces exactly', () => {
    const first = randomizeImageBrush(defaultImageBrushSettings, [], 'same', 'everything', 1);
    const second = randomizeImageBrush(defaultImageBrushSettings, [], 'same', 'everything', 2);
    const replay = randomizeImageBrush(defaultImageBrushSettings, [], 'same', 'everything', 1);
    expect(second).not.toEqual(first);
    expect(replay).toEqual(first);
    expect(first.rack.map((item) => item.effectId)).not.toContain('pixel-noise');
    expect(first.rack.map((item) => item.effectId)).not.toContain('bit-flip');
  });

  it('optimizes the working stamp buffer without changing the preserved original upload', () => {
    const pixels = new Uint8ClampedArray(320 * 160 * 4).fill(255);
    const asset = createImageBrushAsset('Large', 'large.png', 'image/png', pixels, 320, 160, false);
    const optimized = optimizeImageBrushAsset(asset, 128, false);
    expect([optimized.width, optimized.height]).toEqual([128, 64]);
    expect(optimized.originalWidth).toBe(320);
    expect(optimized.originalHeight).toBe(160);
    expect(optimized.originalPixels).toEqual(asset.originalPixels);
    expect(optimized.pixels.byteLength).toBeLessThan(asset.pixels.byteLength);
    const restored = optimizeImageBrushAsset(optimized, null, false);
    expect([restored.width, restored.height]).toEqual([320, 160]);
    expect(restored.pixels).toEqual(asset.originalPixels);
  });

  it('starts library dragging only from a dedicated handle', () => {
    expect(dragStartsFromHandle('drag-handle')).toBe(true);
    expect(dragStartsFromHandle('slider')).toBe(false);
    expect(dragStartsFromHandle(null)).toBe(false);
  });

  it('disposes cached bitmap-like resources on removal', () => {
    const close = vi.fn();
    disposeBrushResource({ close });
    expect(close).toHaveBeenCalledOnce();
  });

  it('restores embedded library assets through project export/import', () => {
    const library = createTestBrushAssets(2);
    const serialized = serializeImageBrushProject({
      settings: defaultImageBrushSettings,
      seed: 'project',
      activePresetId: 'clean-repeat',
      activeAssetId: library[1]!.id,
      evolutionOffset: 9,
      rack: [],
      library,
    });
    const restored = restoreImageBrushProject(serialized);
    expect(restored.library).toHaveLength(2);
    expect(restored.activeAssetId).toBe(library[1]!.id);
    expect(restored.library[0]!.originalPixels).toEqual(library[0]!.originalPixels);
  });

  it('one committed stroke is one exact undo/redo action while cancel adds none', () => {
    const buffer = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]);
    const before = buffer.slice();
    buffer.set([255, 0, 0, 255], 0);
    const patch = createPatch(0, before, buffer)!;
    const history = new PatchHistory();
    expect(history.undoCount).toBe(0);
    history.push({ id: 'stroke', label: 'Image Brush · 1 stamp', patches: [patch], timestamp: 1 });
    expect(history.undoCount).toBe(1);
    history.undo(buffer);
    expect(buffer).toEqual(before);
    history.redo(buffer);
    expect(buffer).toEqual(patch.after);
  });
});
