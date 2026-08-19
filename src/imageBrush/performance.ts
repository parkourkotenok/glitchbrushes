import type { Rectangle } from '../types';
import { clamp } from '../utils/geometry';
import {
  defaultImageBrushSettings,
  imageBrushFxDefinitions,
  type ImageBrushAsset,
  type ImageBrushFxItem,
  type ImageBrushFxLevel,
  type ImageBrushRenderingQuality,
  type ImageBrushSettings,
  type StampFxStage,
} from './types';

export const imageBrushFxStageCopy: Record<
  StampFxStage,
  {
    title: string;
    description: string;
    pipelineIndex: number[];
  }
> = {
  before: {
    title: 'Brush Tip',
    description: 'Process the uploaded image itself before it is placed.',
    pipelineIndex: [0],
  },
  each: {
    title: 'Every Stamp',
    description: 'Generate a deterministic processed variation for each repeated image.',
    pipelineIndex: [1],
  },
  after: {
    title: 'Completed Trail',
    description: 'Build the clean trail first, then glitch the whole trail as one local region.',
    pipelineIndex: [2],
  },
  'before-after': {
    title: 'Tip + Trail',
    description: 'Process stamp variants and then process the completed local trail again.',
    pipelineIndex: [0, 1, 2],
  },
};

export const imageBrushFxLevelAmount: Record<ImageBrushFxLevel, number> = {
  subtle: 0.28,
  medium: 0.52,
  strong: 0.72,
  broken: 0.88,
  extreme: 1,
};

export function normalizeImageBrushSettings(
  settings: Partial<ImageBrushSettings> | null | undefined,
): ImageBrushSettings {
  const mutationMode =
    (settings?.mutationMode as string | undefined) === 'stroke-feedback'
      ? 'evolving'
      : (settings?.mutationMode ?? defaultImageBrushSettings.mutationMode);
  return {
    ...defaultImageBrushSettings,
    ...settings,
    mutationMode,
    effectPool: Array.isArray(settings?.effectPool)
      ? settings.effectPool.filter((effectId) =>
          imageBrushFxDefinitions.some((definition) => definition.id === effectId),
        )
      : [...defaultImageBrushSettings.effectPool],
    customAnchor: {
      ...defaultImageBrushSettings.customAnchor,
      ...settings?.customAnchor,
    },
    maxLiveStampsPerFrame: clamp(
      Math.round(
        settings?.maxLiveStampsPerFrame ?? defaultImageBrushSettings.maxLiveStampsPerFrame,
      ),
      1,
      128,
    ),
    maxGeneratedStamps: clamp(
      Math.round(settings?.maxGeneratedStamps ?? defaultImageBrushSettings.maxGeneratedStamps),
      100,
      50_000,
    ),
    maxCachedVariants: clamp(
      Math.round(settings?.maxCachedVariants ?? defaultImageBrushSettings.maxCachedVariants),
      1,
      64,
    ),
    maxLiveFxIterations: clamp(
      Math.round(settings?.maxLiveFxIterations ?? defaultImageBrushSettings.maxLiveFxIterations),
      1,
      8,
    ),
    variantCount: clamp(
      Math.round(settings?.variantCount ?? defaultImageBrushSettings.variantCount),
      1,
      32,
    ),
    minimumEffects: clamp(
      Math.round(settings?.minimumEffects ?? defaultImageBrushSettings.minimumEffects),
      1,
      10,
    ),
    maximumEffects: clamp(
      Math.round(settings?.maximumEffects ?? defaultImageBrushSettings.maximumEffects),
      1,
      10,
    ),
    stackMinimumEffects: clamp(
      Math.round(settings?.stackMinimumEffects ?? defaultImageBrushSettings.stackMinimumEffects),
      1,
      10,
    ),
    stackMaximumEffects: clamp(
      Math.round(settings?.stackMaximumEffects ?? defaultImageBrushSettings.stackMaximumEffects),
      1,
      10,
    ),
    alternatingInterval: clamp(
      Math.round(settings?.alternatingInterval ?? defaultImageBrushSettings.alternatingInterval),
      1,
      32,
    ),
  };
}

export function imageBrushFxCacheKey(
  asset: Pick<ImageBrushAsset, 'id' | 'width' | 'height' | 'trimBounds'>,
  settings: ImageBrushSettings,
  rack: ImageBrushFxItem[],
  seed: string,
): string {
  return JSON.stringify({
    asset: asset.id,
    dimensions: [asset.width, asset.height],
    trim: asset.trimBounds,
    alphaMode: settings.alphaMode,
    bleedAmount: settings.bleedAmount,
    mutationMode: settings.mutationMode,
    mutationAmount: settings.mutationAmount,
    progressiveStart: settings.progressiveStart,
    progressiveEnd: settings.progressiveEnd,
    evolutionSpeed: settings.evolutionSpeed,
    maxCorruption: settings.maxCorruption,
    effectVariation: settings.effectVariation,
    seedEvolution: settings.seedEvolution,
    minimumEffects: settings.minimumEffects,
    maximumEffects: settings.maximumEffects,
    lockEffectPool: settings.lockEffectPool,
    allowRepeatedCombinations: settings.allowRepeatedCombinations,
    effectPool: settings.effectPool,
    accumulation: settings.accumulation,
    recovery: settings.recovery,
    alphaStability: settings.alphaStability,
    stackMinimumEffects: settings.stackMinimumEffects,
    stackMaximumEffects: settings.stackMaximumEffects,
    stackRandomOrder: settings.stackRandomOrder,
    stackMinimumStrength: settings.stackMinimumStrength,
    stackMaximumStrength: settings.stackMaximumStrength,
    visualCoherence: settings.visualCoherence,
    recipeA: settings.recipeA,
    recipeB: settings.recipeB,
    alternatingInterval: settings.alternatingInterval,
    randomAlternation: settings.randomAlternation,
    transitionBlend: settings.transitionBlend,
    gradientStart: settings.gradientStart,
    gradientEnd: settings.gradientEnd,
    feedbackAmount: settings.feedbackAmount,
    underlyingSampling: settings.underlyingSampling,
    decay: settings.decay,
    structuralDrift: settings.structuralDrift,
    evolutionCurve: settings.evolutionCurve,
    fxStage: settings.fxStage,
    variantCount: Math.min(settings.variantCount, settings.maxCachedVariants),
    rack: rack.map(({ effectId, enabled, amount, mix }) => ({
      effectId,
      enabled,
      amount,
      mix,
    })),
    seed,
  });
}

export function resolveImageBrushQuality(
  quality: ImageBrushRenderingQuality,
  documentPixels: number,
  tipPixels: number,
  expectedStamps: number,
  rack: ImageBrushFxItem[],
): Exclude<ImageBrushRenderingQuality, 'auto'> {
  if (quality !== 'auto') return quality;
  const enabled = rack.filter((item) => item.enabled);
  const cost = enabled.reduce((total, item) => {
    const definition = imageBrushFxDefinitions.find((entry) => entry.id === item.effectId);
    return (
      total +
      (definition?.cost === 'very-high'
        ? 5
        : definition?.cost === 'high'
          ? 3
          : definition?.cost === 'medium'
            ? 2
            : 1)
    );
  }, 0);
  const score = documentPixels / 1_000_000 + tipPixels / 16_384 + expectedStamps / 80 + cost;
  if (score >= 20) return 'realtime';
  if (score >= 9) return 'balanced';
  return 'high';
}

export function imageBrushLiveStampBudget(
  maxLiveStampsPerFrame: number,
  stampsPerStep: number,
  quality: Exclude<ImageBrushRenderingQuality, 'auto'>,
): number {
  const copies = Math.max(1, Math.round(stampsPerStep));
  const drawBudget = quality === 'high' ? 8 : quality === 'balanced' ? 6 : 4;
  return Math.min(
    Math.max(1, Math.round(maxLiveStampsPerFrame)),
    Math.max(1, Math.floor(drawBudget / copies)),
  );
}

/**
 * Samples an overloaded disposable live-overlay queue. The final worker still receives the
 * untouched full stroke, so this protects pointer responsiveness without changing final pixels.
 */
export function takeImageBrushLiveBatch<T>(pending: T[], budget: number, backlogLimit = 48): T[] {
  const count = Math.max(1, Math.floor(budget));
  if (pending.length <= Math.max(count, backlogLimit)) return pending.splice(0, count);
  const sourceLength = pending.length;
  const sampleCount = Math.min(count, sourceLength);
  const batch: T[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const sourceIndex =
      sampleCount === 1
        ? sourceLength - 1
        : Math.round((index * (sourceLength - 1)) / (sampleCount - 1));
    batch.push(pending[sourceIndex]!);
  }
  pending.length = 0;
  return batch;
}

export function estimateImageBrushCost(
  documentPixels: number,
  tipPixels: number,
  expectedStamps: number,
  settings: ImageBrushSettings,
  rack: ImageBrushFxItem[],
): {
  label: 'Low' | 'Medium' | 'High' | 'Very High';
  expectedVariants: number;
  postStroke: boolean;
  suggestions: string[];
} {
  const enabled = rack.filter((item) => item.enabled);
  const rackWeight = enabled.reduce((total, item) => {
    const cost = imageBrushFxDefinitions.find((entry) => entry.id === item.effectId)?.cost;
    return total + (cost === 'very-high' ? 5 : cost === 'high' ? 3 : cost === 'medium' ? 2 : 1);
  }, 0);
  const expectedVariants =
    settings.mutationMode === 'fixed'
      ? Math.min(1, enabled.length ? 1 : 0)
      : settings.mutationMode === 'per-stamp' || settings.mutationMode === 'progressive'
        ? Math.min(expectedStamps, settings.variantCount, settings.maxCachedVariants)
        : settings.mutationMode === 'whole-trail'
          ? 1
          : settings.mutationMode === 'clean'
            ? 0
            : expectedStamps;
  const postStroke =
    settings.mutationMode === 'whole-trail' ||
    settings.fxStage === 'after' ||
    settings.fxStage === 'before-after';
  const score =
    documentPixels / 2_000_000 +
    (tipPixels * Math.max(1, expectedVariants)) / 65_536 +
    expectedStamps / 100 +
    rackWeight * (postStroke ? 1.5 : 1);
  const label = score > 28 ? 'Very High' : score > 15 ? 'High' : score > 7 ? 'Medium' : 'Low';
  const suggestions: string[] = [];
  if (label === 'Very High' || label === 'High') {
    suggestions.push('Use Realtime preview while drawing.');
    if (settings.variantCount > 8) suggestions.push('Reduce the variant pool to 8.');
    if (!postStroke) suggestions.push('Move expensive FX to Completed Trail.');
    if (settings.maxLiveFxIterations > 3) suggestions.push('Reduce live FX iterations.');
  }
  return { label, expectedVariants, postStroke, suggestions };
}

export function resizeRgbaNearest(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maximumDimension: number,
): { pixels: Uint8ClampedArray; width: number; height: number } {
  const ratio = Math.min(1, maximumDimension / Math.max(width, height));
  if (ratio >= 1) return { pixels: pixels.slice(), width, height };
  const outputWidth = Math.max(1, Math.round(width * ratio));
  const outputHeight = Math.max(1, Math.round(height * ratio));
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y / ratio));
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x / ratio));
      const source = (sourceY * width + sourceX) * 4;
      const destination = (y * outputWidth + x) * 4;
      output.set(pixels.subarray(source, source + 4), destination);
    }
  }
  return { pixels: output, width: outputWidth, height: outputHeight };
}

export function compareTipPixels(
  original: Uint8ClampedArray,
  originalWidth: number,
  originalHeight: number,
  processed: Uint8ClampedArray,
  processedWidth: number,
  processedHeight: number,
): {
  changedPixels: number;
  differencePercent: number;
  changedBounds: Rectangle | null;
} {
  const width = Math.min(originalWidth, processedWidth);
  const height = Math.min(originalHeight, processedHeight);
  let changedPixels = 0;
  let totalDifference = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const originalOffset = (y * originalWidth + x) * 4;
      const processedOffset = (y * processedWidth + x) * 4;
      let pixelDifference = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        pixelDifference += Math.abs(
          original[originalOffset + channel]! - processed[processedOffset + channel]!,
        );
      }
      totalDifference += pixelDifference;
      if (pixelDifference < 8) continue;
      changedPixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const comparedPixels = Math.max(1, width * height);
  return {
    changedPixels,
    differencePercent: (totalDifference / (comparedPixels * 4 * 255)) * 100,
    changedBounds: changedPixels
      ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
      : null,
  };
}
