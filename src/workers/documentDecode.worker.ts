/// <reference lib="webworker" />

import { fitImportedDocument, readEncodedImageDimensions } from '../documentImport';

interface DecodeRequest {
  jobId: string;
  file: File;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { jobId, file } = event.data;
  try {
    const encodedBytes = await file.arrayBuffer();
    const encoded = readEncodedImageDimensions(encodedBytes, file.type);
    const requested = encoded ? fitImportedDocument(encoded.width, encoded.height) : null;
    const resizeOptions: ImageBitmapOptions | undefined =
      requested?.resized && encoded
        ? encoded.width >= encoded.height
          ? { resizeWidth: requested.width, resizeQuality: 'high' }
          : { resizeHeight: requested.height, resizeQuality: 'high' }
        : undefined;
    const bitmap = resizeOptions
      ? await createImageBitmap(file, resizeOptions)
      : await createImageBitmap(file);
    try {
      const fitted = fitImportedDocument(bitmap.width, bitmap.height);
      const dimensions = {
        ...fitted,
        sourceWidth: encoded?.width ?? fitted.sourceWidth,
        sourceHeight: encoded?.height ?? fitted.sourceHeight,
        resized: Boolean(requested?.resized || fitted.resized),
      };
      const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Offscreen Canvas 2D context is unavailable.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
      const original = context.getImageData(0, 0, dimensions.width, dimensions.height).data;
      const pixels = original.slice();
      const mask = new Float32Array(dimensions.width * dimensions.height);
      const response = {
        jobId,
        type: 'result' as const,
        ...dimensions,
        original: original.buffer,
        pixels: pixels.buffer,
        mask: mask.buffer,
      };
      self.postMessage(response, {
        transfer: [response.original, response.pixels, response.mask],
      });
      self.close();
    } finally {
      bitmap.close();
    }
  } catch (error) {
    self.postMessage({
      jobId,
      type: 'error',
      message: error instanceof Error ? error.message : 'Image decoding failed.',
    });
    self.close();
  }
};
