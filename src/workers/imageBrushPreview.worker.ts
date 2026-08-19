/// <reference lib="webworker" />

import { processImageBrushStroke } from '../imageBrush/engine';
import {
  createImageBrushLivePreviewBackground,
  createImageBrushLivePreviewLayout,
} from '../imageBrush/livePreview';
import { compareTipPixels, resizeRgbaNearest } from '../imageBrush/performance';
import type { ImageBrushPreviewRequest, ImageBrushPreviewResult } from '../imageBrush/types';

self.onmessage = (event: MessageEvent<ImageBrushPreviewRequest>) => {
  const request = event.data;
  const started = performance.now();
  try {
    const original = new Uint8ClampedArray(request.pixels);
    const input = resizeRgbaNearest(
      original,
      request.width,
      request.height,
      request.quality === 'draft' ? 64 : 256,
    );
    const livePreview = createImageBrushLivePreviewLayout(
      request.settings,
      request.quality,
      request.documentWidth,
      request.documentHeight,
    );
    const background = createImageBrushLivePreviewBackground(
      livePreview.width,
      livePreview.height,
      {
        pixels: new Uint8ClampedArray(request.backgroundPixels),
        width: request.backgroundWidth,
        height: request.backgroundHeight,
      },
    );
    const rendered = processImageBrushStroke(
      {
        jobId: `${request.jobId}:stroke`,
        width: livePreview.width,
        height: livePreview.height,
        pixels: background,
        sourceBounds: { x: 0, y: 0, width: livePreview.width, height: livePreview.height },
        assets: [
          {
            id: request.assetId,
            width: input.width,
            height: input.height,
            pixels: input.pixels,
          },
        ],
        activeAssetId: request.assetId,
        stamps: livePreview.stamps,
        settings: livePreview.settings,
        rack: request.rack,
        seed: request.seed,
        strokeId: request.strokeId,
        presetName: 'Live Preview',
        evolutionOffset: request.evolutionOffset,
      },
      {
        collectPreviewVariants: true,
        maxPreviewVariants: request.quality === 'draft' ? 1 : 4,
      },
    );
    const strokePixels = background.slice();
    for (let row = 0; row < rendered.bounds.height; row += 1) {
      const source = row * rendered.bounds.width * 4;
      const destination = ((rendered.bounds.y + row) * livePreview.width + rendered.bounds.x) * 4;
      strokePixels.set(
        rendered.pixels.subarray(source, source + rendered.bounds.width * 4),
        destination,
      );
    }
    const variants = (
      rendered.previewVariants?.length
        ? rendered.previewVariants
        : [{ pixels: input.pixels.slice(), width: input.width, height: input.height }]
    ).map((variant) => ({
      ...variant,
      contentWidth: input.width,
      contentHeight: input.height,
    }));
    const primary = variants[0]!;
    const comparison = compareTipPixels(
      background,
      livePreview.width,
      livePreview.height,
      strokePixels,
      livePreview.width,
      livePreview.height,
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
      stroke: {
        pixels: strokePixels,
        width: livePreview.width,
        height: livePreview.height,
        stampCount: rendered.stampCount,
        processingMs: performance.now() - started,
      },
      diagnostics: {
        quality: request.quality,
        ...comparison,
        cacheVariants: variants.length,
        cacheBytes,
        processingMs: performance.now() - started,
        noVisibleChange:
          request.rack.some((item) => item.enabled) &&
          (comparison.changedPixels === 0 || comparison.differencePercent < 0.02),
      },
    };
    const transfers = [
      ...new Set([...variants.map((variant) => variant.pixels.buffer), strokePixels.buffer]),
    ];
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
