/// <reference lib="webworker" />

import { MoshCancelledError, processMoshStack } from '../mosh/engine';
import type { MoshProcessRequest } from '../mosh/types';

const cancelledJobs = new Set<string>();

self.onmessage = (
  event: MessageEvent<
    { type: 'process'; request: MoshProcessRequest } | { type: 'cancel'; jobId: string }
  >,
) => {
  if (event.data.type === 'cancel') {
    cancelledJobs.add(event.data.jobId);
    return;
  }
  const { request } = event.data;
  try {
    let brushMask: Uint8Array | undefined;
    if (request.brushMask && request.brushMaskBounds) {
      const compact = new Uint8Array(request.brushMask);
      brushMask = new Uint8Array(request.width * request.height);
      for (let row = 0; row < request.brushMaskBounds.height; row += 1) {
        const sourceStart = row * request.brushMaskBounds.width;
        const destinationStart =
          (request.brushMaskBounds.y + row) * request.width + request.brushMaskBounds.x;
        brushMask.set(
          compact.subarray(sourceStart, sourceStart + request.brushMaskBounds.width),
          destinationStart,
        );
      }
    }
    const result = processMoshStack(
      new Uint8ClampedArray(request.pixels),
      request.width,
      request.height,
      request.rack,
      request.seed,
      {
        selectionMask: request.selectionMask ? new Uint8Array(request.selectionMask) : undefined,
        brushMask,
        brushDirection: request.brushDirection,
        shouldCancel: () => cancelledJobs.has(request.jobId),
        onProgress: (progress) => {
          self.postMessage({ type: 'progress', progress: { ...progress, jobId: request.jobId } });
        },
      },
    );
    if (cancelledJobs.has(request.jobId)) return;
    const buffer = result.pixels.buffer;
    self.postMessage(
      {
        type: 'result',
        result: {
          jobId: request.jobId,
          pixels: buffer,
          affectedPixels: result.affectedPixels,
          completedEffects: result.completedEffects,
        },
      },
      { transfer: [buffer] },
    );
    self.close();
  } catch (error) {
    if (error instanceof MoshCancelledError || cancelledJobs.has(request.jobId)) return;
    self.postMessage({
      type: 'error',
      jobId: request.jobId,
      message: error instanceof Error ? error.message : 'Unknown MOSH LAB Worker error.',
    });
  } finally {
    cancelledJobs.delete(request.jobId);
  }
};

export {};
