/// <reference lib="webworker" />

import { processRetouch, RetouchCancelledError } from '../retouch/engine';
import type { RetouchProcessRequest } from '../retouch/types';

const cancelledJobs = new Set<string>();

self.onmessage = (
  event: MessageEvent<
    { type: 'process'; request: RetouchProcessRequest } | { type: 'cancel'; jobId: string }
  >,
) => {
  if (event.data.type === 'cancel') {
    cancelledJobs.add(event.data.jobId);
    return;
  }
  const { request } = event.data;
  try {
    const result = processRetouch(request, {
      shouldCancel: () => cancelledJobs.has(request.jobId),
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    if (cancelledJobs.has(request.jobId)) return;
    const pixels = result.pixels.buffer;
    self.postMessage({ type: 'result', result: { ...result, pixels } }, { transfer: [pixels] });
    self.close();
  } catch (error) {
    if (error instanceof RetouchCancelledError || cancelledJobs.has(request.jobId)) return;
    self.postMessage({
      type: 'error',
      jobId: request.jobId,
      message: error instanceof Error ? error.message : 'Unknown Retouch Worker error.',
    });
  } finally {
    cancelledJobs.delete(request.jobId);
  }
};

export {};
