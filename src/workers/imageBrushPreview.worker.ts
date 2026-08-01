/// <reference lib="webworker" />

import { imageBrushMutationStrength, processBrushTipFx } from '../imageBrush/engine';
import { compareTipPixels, resizeRgbaNearest } from '../imageBrush/performance';
import type {
  ImageBrushFxItem,
  ImageBrushPreviewRequest,
  ImageBrushPreviewResult,
} from '../imageBrush/types';
import { clamp } from '../utils/geometry';
import { createSeededRandom } from '../utils/prng';
import { effectiveImageBrushStages, supportsImageBrushStages } from '../effects/sharedRegistry';

function previewRack(
  rack: ImageBrushFxItem[],
  seed: string,
  variation: number,
  strength = 1,
): ImageBrushFxItem[] {
  const random = createSeededRandom(seed);
  return rack.map((item) => ({
    ...item,
    amount: clamp(
      item.amount * (0.35 + strength) + (random.next() * 2 - 1) * variation * 0.3,
      0.01,
      1,
    ),
  }));
}

self.onmessage = (event: MessageEvent<ImageBrushPreviewRequest>) => {
  const request = event.data;
  const started = performance.now();
  try {
    const original = new Uint8ClampedArray(request.pixels);
    const input =
      request.quality === 'draft'
        ? resizeRgbaNearest(original, request.width, request.height, 64)
        : { pixels: original, width: request.width, height: request.height };
    const clean = processBrushTipFx(
      input.pixels,
      input.width,
      input.height,
      [],
      request.settings,
      `${request.seed}:clean`,
    );
    const mutationMode = request.settings.mutationMode;
    const compatibleRack = request.rack.filter((item) =>
      supportsImageBrushStages(
        item.effectId,
        effectiveImageBrushStages(request.settings.fxStage, request.settings.mutationMode),
      ),
    );
    const rack =
      mutationMode === 'clean' || mutationMode === 'whole-trail'
        ? []
        : compatibleRack.filter((item) => item.enabled);
    const variantCount =
      mutationMode === 'per-stamp' || mutationMode === 'progressive'
        ? Math.max(
            1,
            Math.min(
              request.settings.variantCount,
              request.settings.maxCachedVariants,
              request.quality === 'draft' ? 4 : 16,
            ),
          )
        : mutationMode === 'evolving' ||
            mutationMode === 'random-stack' ||
            mutationMode === 'stroke-gradient'
          ? Math.max(
              1,
              Math.min(
                request.settings.maxLiveFxIterations,
                request.settings.maxCachedVariants,
                request.quality === 'draft' ? 2 : 8,
              ),
            )
          : mutationMode === 'alternating'
            ? 2
            : 1;
    const variants = Array.from({ length: variantCount }, (_, index) => {
      if (!rack.length)
        return {
          pixels: clean.pixels.slice(),
          width: clean.width,
          height: clean.height,
        };
      const variantSeed = `${request.seed}:preview:${index}`;
      const strength =
        mutationMode === 'progressive'
          ? imageBrushMutationStrength(request.settings, index, variantCount, 0, request.seed)
          : mutationMode === 'stroke-gradient'
            ? variantCount <= 1
              ? 1
              : index / (variantCount - 1)
            : request.settings.mutationAmount;
      const variantRack = previewRack(
        rack,
        variantSeed,
        index ? request.settings.effectVariation : 0,
        strength,
      );
      const selectedRack =
        mutationMode === 'random-stack' && variantRack.length > 1
          ? variantRack.filter(
              (_, effectIndex) =>
                (effectIndex + index) % Math.max(2, Math.min(4, variantRack.length)) !== 0,
            )
          : mutationMode === 'alternating' && variantRack.length > 1
            ? [variantRack[index % variantRack.length]!]
            : variantRack;
      const processed = processBrushTipFx(
        input.pixels,
        input.width,
        input.height,
        selectedRack,
        request.settings,
        variantSeed,
      );
      return {
        pixels: processed.pixels,
        width: processed.width,
        height: processed.height,
      };
    });
    const primary = variants[0]!;
    const comparison = compareTipPixels(
      clean.pixels,
      clean.width,
      clean.height,
      primary.pixels,
      primary.width,
      primary.height,
    );
    const cacheBytes = variants.reduce((total, variant) => total + variant.pixels.byteLength, 0);
    const result: ImageBrushPreviewResult = {
      jobId: request.jobId,
      generation: request.generation,
      quality: request.quality,
      pixels: primary.pixels,
      width: primary.width,
      height: primary.height,
      variants,
      diagnostics: {
        quality: request.quality,
        ...comparison,
        cacheVariants: variants.length,
        cacheBytes,
        processingMs: performance.now() - started,
        noVisibleChange:
          rack.length > 0 &&
          (comparison.changedPixels === 0 || comparison.differencePercent < 0.02),
      },
    };
    const transfers = [...new Set(variants.map((variant) => variant.pixels.buffer))];
    self.postMessage(result, { transfer: transfers });
  } catch (error) {
    self.postMessage({
      type: 'error',
      jobId: request.jobId,
      generation: request.generation,
      message: error instanceof Error ? error.message : 'Image Brush preview failed.',
    });
  }
};

export {};
