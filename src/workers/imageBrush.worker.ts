/// <reference lib="webworker" />

import { ImageBrushCancelledError, processImageBrushStroke } from '../imageBrush/engine';
import { shouldPostImageBrushProgress } from '../imageBrush/progress';
import type { ImageBrushProcessRequest } from '../imageBrush/types';

const cancelledJobs = new Set<string>();

self.onmessage = (
  event: MessageEvent<
    { type: 'process'; request: ImageBrushProcessRequest } | { type: 'cancel'; jobId: string }
  >,
) => {
  if (event.data.type === 'cancel') {
    cancelledJobs.add(event.data.jobId);
    return;
  }
  const { request } = event.data;
  try {
    let lastProgressAt = 0;
    let lastProgressPercent = -1;
    const result = processImageBrushStroke(
      {
        ...request,
        pixels: new Uint8ClampedArray(request.pixels),
        assets: request.assets.map((asset) => ({
          ...asset,
          pixels: new Uint8ClampedArray(asset.pixels),
        })),
      },
      {
        shouldCancel: () => cancelledJobs.has(request.jobId),
        onProgress: (progress) => {
          const now = Date.now();
          if (
            !shouldPostImageBrushProgress(
              progress.percent,
              lastProgressPercent,
              now - lastProgressAt,
            )
          )
            return;
          lastProgressAt = now;
          lastProgressPercent = progress.percent;
          self.postMessage({
            type: 'progress',
            progress: { ...progress, jobId: request.jobId },
          });
        },
      },
    );
    if (cancelledJobs.has(request.jobId)) return;
    const buffer = result.pixels.buffer;
    self.postMessage(
      {
        type: 'result',
        result: { ...result, pixels: buffer },
      },
      { transfer: [buffer] },
    );
    self.close();
  } catch (error) {
    if (error instanceof ImageBrushCancelledError || cancelledJobs.has(request.jobId)) return;
    self.postMessage({
      type: 'error',
      jobId: request.jobId,
      message: error instanceof Error ? error.message : 'Unknown Image Brush Worker error.',
    });
  } finally {
    cancelledJobs.delete(request.jobId);
  }
};

export {};
