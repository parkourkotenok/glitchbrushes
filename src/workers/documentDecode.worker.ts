/// <reference lib="webworker" />

import { fitImportedDocument, readEncodedImageDimensions } from '../documentImport';

interface DecodeRequest {
  jobId: string;
  file: File;
  mode?: 'document' | 'layer';
  maxWidth?: number;
  maxHeight?: number;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { jobId, file, mode = 'document', maxWidth, maxHeight } = event.data;
  try {
    const encodedBytes = await file.arrayBuffer();
    const encoded = readEncodedImageDimensions(encodedBytes, file.type);
    const fittedDocument = encoded ? fitImportedDocument(encoded.width, encoded.height) : null;
    const layerScale =
      mode === 'layer' && fittedDocument && maxWidth && maxHeight
        ? Math.min(1, maxWidth / fittedDocument.width, maxHeight / fittedDocument.height)
        : 1;
    const requested = encoded
      ? {
          width: Math.max(1, Math.round((fittedDocument?.width ?? encoded.width) * layerScale)),
          height: Math.max(1, Math.round((fittedDocument?.height ?? encoded.height) * layerScale)),
          resized: Boolean(fittedDocument?.resized || layerScale < 1),
        }
      : null;
    const resizeOptions: ImageBitmapOptions | undefined =
      requested?.resized && encoded
        ? {
            resizeWidth: requested.width,
            resizeHeight: requested.height,
            resizeQuality: 'high',
          }
        : undefined;
    const bitmap = resizeOptions
      ? await createImageBitmap(file, resizeOptions)
      : await createImageBitmap(file);
    try {
      const fitted = fitImportedDocument(bitmap.width, bitmap.height);
      const dimensions = {
        width: bitmap.width,
        height: bitmap.height,
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
      let opaque = true;
      for (let offset = 3; offset < original.length; offset += 4) {
        if (original[offset] !== 255) {
          opaque = false;
          break;
        }
      }
      const pixels = mode === 'document' ? original.slice() : null;
      const mask =
        mode === 'document' ? new Float32Array(dimensions.width * dimensions.height) : null;
      const response = {
        jobId,
        type: 'result' as const,
        ...dimensions,
        opaque,
        original: original.buffer,
        pixels: pixels?.buffer,
        mask: mask?.buffer,
      };
      self.postMessage(response, {
        transfer: [
          response.original,
          ...(response.pixels ? [response.pixels] : []),
          ...(response.mask ? [response.mask] : []),
        ],
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
