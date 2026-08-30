/// <reference lib="webworker" />
import { resizeRgbaBilinear } from '../layers/resizeRgba';

self.onmessage = (
  event: MessageEvent<{
    pixels: ArrayBuffer;
    sourceWidth: number;
    sourceHeight: number;
    targetWidth: number;
    targetHeight: number;
  }>,
) => {
  try {
    const result = resizeRgbaBilinear(
      new Uint8ClampedArray(event.data.pixels),
      event.data.sourceWidth,
      event.data.sourceHeight,
      event.data.targetWidth,
      event.data.targetHeight,
    );
    self.postMessage({ ok: true, pixels: result.buffer }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Resize failed.',
    });
  }
};

export {};
