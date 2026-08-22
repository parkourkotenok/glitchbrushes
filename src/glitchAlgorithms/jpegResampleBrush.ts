import { processJpegResample } from '../effects/jpegResampleCore';
import type { GlitchAlgorithm, GlitchContext, GlitchResult, Rectangle } from '../types';
import { clamp } from '../utils/geometry';
import { clipRectangle } from './structuralUtils';

function result(bounds: Rectangle, touchedPixels: number): GlitchResult {
  return { bounds: { ...bounds }, touchedPixels };
}

function extractCrop(context: GlitchContext, bounds: Rectangle): Uint8ClampedArray {
  const crop = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let row = 0; row < bounds.height; row += 1) {
    const sourceStart = ((bounds.y + row) * context.width + bounds.x) * 4;
    crop.set(context.pixels.subarray(sourceStart, sourceStart + bounds.width * 4), row * bounds.width * 4);
  }
  return crop;
}

/**
 * Worker-pipeline adapter for JPEG Resample. It deliberately allocates and
 * processes only writeBounds; the Effect Brush worker owns the resulting
 * single stroke commit and dirty-rectangle transfer.
 */
export const jpegResampleBrushAlgorithm: GlitchAlgorithm = {
  id: 'jpeg-resample-brush',
  name: 'JPEG Resample',
  family: 'advanced-brush',
  experimental: true,
  apply(context) {
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, context.width, context.height);
    if (!bounds.width || !bounds.height) return result(bounds, 0);

    const crop = extractCrop(context, bounds);
    const processed = processJpegResample(
      crop,
      bounds.width,
      bounds.height,
      {
        targetLongEdge: context.settings.jpegResampleTargetLongEdge,
        quality: context.settings.jpegResampleQuality,
        passes: context.settings.jpegResamplePasses,
        mix: context.settings.jpegResampleMix,
        noise: context.settings.jpegResampleNoise,
        noiseAmount: context.settings.jpegResampleNoiseAmount,
        noiseType: context.settings.jpegResampleNoiseType,
        sharpen: context.settings.jpegResampleSharpen,
        sharpenAmount: context.settings.jpegResampleSharpenAmount,
        upscale: context.settings.jpegResampleUpscale,
        chromaBleed: context.settings.jpegResampleChromaBleed,
      },
      `${context.seed}:jpeg-resample-brush`,
    ).pixels;

    let touchedPixels = 0;
    for (let row = 0; row < bounds.height; row += 1) {
      for (let column = 0; column < bounds.width; column += 1) {
        const x = bounds.x + column;
        const y = bounds.y + row;
        const influence = clamp(
          (context.mask[y * context.width + x] ?? 0) * context.strength * context.pressure,
          0,
          1,
        );
        if (influence <= 0) continue;
        const destination = (y * context.width + x) * 4;
        const source = (row * bounds.width + column) * 4;
        let changed = false;
        for (let channel = 0; channel < 3; channel += 1) {
          const next = Math.round(
            context.pixels[destination + channel]! * (1 - influence) +
              processed[source + channel]! * influence,
          );
          if (next !== context.pixels[destination + channel]) changed = true;
          context.pixels[destination + channel] = next;
        }
        if (changed) touchedPixels += 1;
      }
    }
    return result(bounds, touchedPixels);
  },
};
