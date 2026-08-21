/// <reference lib="webworker" />

import {
  prepareImageBrushLiveSourceVariants,
  processImageBrushStroke,
} from '../imageBrush/engine';
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
    const inputs = request.assets.map((asset) => {
      const resized = resizeRgbaNearest(
        new Uint8ClampedArray(asset.pixels),
        asset.width,
        asset.height,
        request.quality === 'draft' ? 64 : 256,
      );
      return { id: asset.id, ...resized };
    });
    const input = inputs.find((asset) => asset.id === request.assetId) ?? inputs[0];
    if (!input) throw new Error('No Image Brush preview assets were supplied.');
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
        assets: inputs,
        activeAssetId: request.assetId,
        assetMode: request.assetMode,
        assetOrder: request.assetOrder,
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
    const renderedVariants = (
      rendered.previewVariants?.length
        ? rendered.previewVariants
        : [{ pixels: input.pixels.slice(), width: input.width, height: input.height }]
    );
    // One Worker and bounded tip variants preserve live overlay source order
    // without scheduling a separate full preview trail for each asset.
    const variants = prepareImageBrushLiveSourceVariants({
      assets: inputs,
      activeAssetId: request.assetId,
      assetMode: request.assetMode,
      assetOrder: request.assetOrder,
      stamps: livePreview.stamps,
      settings: livePreview.settings,
      rack: request.rack,
      seed: request.seed,
      strokeId: request.strokeId,
      evolutionOffset: request.evolutionOffset,
      pixels: background,
      width: livePreview.width,
      height: livePreview.height,
    });
    const primary = renderedVariants[0]!;
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
