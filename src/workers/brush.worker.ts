/// <reference lib="webworker" />

import { BrushCancelledError, processBrushEffect, type BrushProcessRequest } from '../brush/engine';

const cancelledJobs = new Set<string>();

self.onmessage = (
  event: MessageEvent<
    { type: 'process'; request: BrushProcessRequest } | { type: 'cancel'; jobId: string }
  >,
) => {
  if (event.data.type === 'cancel') {
    cancelledJobs.add(event.data.jobId);
    return;
  }
  const { request } = event.data;
  try {
    const result = processBrushEffect(request, {
      shouldCancel: () => cancelledJobs.has(request.jobId),
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    if (cancelledJobs.has(request.jobId)) return;
    const buffer = result.pixels.buffer;
    self.postMessage(
      {
        type: 'result',
        result: {
          jobId: result.jobId,
          pixels: buffer,
          writeBounds: result.writeBounds,
          affectedPixels: result.affectedPixels,
        },
      },
      { transfer: [buffer] },
    );
    self.close();
  } catch (error) {
    if (error instanceof BrushCancelledError || cancelledJobs.has(request.jobId)) return;
    self.postMessage({
      type: 'error',
      jobId: request.jobId,
      message: error instanceof Error ? error.message : 'Unknown Brush Worker error.',
    });
  } finally {
    cancelledJobs.delete(request.jobId);
  }
};

export {};
