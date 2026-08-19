/// <reference lib="webworker" />

import { createImageBrushAsset, isSupportedBrushMime } from '../imageBrush/assets';
import type { ImageBrushAsset, ImageBrushSettings } from '../imageBrush/types';

interface DecodeRequest {
  jobId: string;
  files: File[];
  settings: Pick<ImageBrushSettings, 'trimTransparent' | 'trimThreshold'>;
  maximumDimension: number;
}

interface DecodeResult {
  jobId: string;
  type: 'result';
  assets: ImageBrushAsset[];
}

interface DecodeError {
  jobId: string;
  type: 'error';
  message: string;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const request = event.data;
  try {
    const assets: ImageBrushAsset[] = [];
    for (const file of request.files) {
      if (!isSupportedBrushMime(file.type)) {
        throw new Error('Choose a PNG, JPEG, or WebP brush image.');
      }
      if (file.size > 48 * 1024 * 1024) {
        throw new Error('Brush image exceeds the 48 MB safety limit.');
      }
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 16_000_000) {
          throw new Error('Decoded brush image exceeds the 16 megapixel safety limit.');
        }
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Offscreen Canvas 2D context is unavailable.');
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        assets.push(
          createImageBrushAsset(
            file.name.replace(/\.[^.]+$/, '') || 'Brush image',
            file.name,
            file.type,
            pixels,
            bitmap.width,
            bitmap.height,
            request.settings.trimTransparent && file.type !== 'image/jpeg',
            request.settings.trimThreshold,
            {
              maximumDimension: request.maximumDimension,
              reuseOriginalPixels: true,
            },
          ),
        );
      } finally {
        bitmap.close();
      }
    }
    const response: DecodeResult = { jobId: request.jobId, type: 'result', assets };
    const transfers = assets.flatMap((asset) => [asset.originalPixels.buffer, asset.pixels.buffer]);
    self.postMessage(response, { transfer: [...new Set(transfers)] });
  } catch (error) {
    const response: DecodeError = {
      jobId: request.jobId,
      type: 'error',
      message: error instanceof Error ? error.message : 'Brush image decoding failed.',
    };
    self.postMessage(response);
  }
};
