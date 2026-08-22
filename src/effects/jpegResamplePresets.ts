export const jpegResamplePresetIds = ['high', 'medium', 'low', 'melt'] as const;

export type JpegResamplePresetId = (typeof jpegResamplePresetIds)[number];

export interface JpegResamplePresetValues {
  targetLongEdge: number;
  quality: number;
  passes: number;
  noise: boolean;
  noiseAmount: number;
  sharpen: boolean;
  sharpenAmount: number;
  chromaBleed: number;
  noiseType?: 'luma' | 'rgb';
  upscale?: 'smooth' | 'pixelated';
  forceFullAmount?: boolean;
}

/**
 * UI-only JPEG preset metadata. This module deliberately does not import the
 * codec so Effect/Mosh/Image Brush controls stay out of the main-thread JPEG
 * bundle path.
 */
export function resolveJpegResamplePreset(
  preset: JpegResamplePresetId,
  referenceLongEdge: number,
): JpegResamplePresetValues {
  if (preset === 'melt') {
    return {
      targetLongEdge: 28,
      quality: 1,
      passes: 4,
      noise: true,
      noiseAmount: 0.32,
      sharpen: false,
      sharpenAmount: 0.25,
      chromaBleed: 0.65,
      noiseType: 'rgb',
      upscale: 'smooth',
      forceFullAmount: true,
    };
  }
  const ratio = preset === 'high' ? 0.84 : preset === 'medium' ? 0.5 : 0.22;
  const shared = {
    targetLongEdge: Math.min(
      2048,
      Math.max(28, Math.round(Math.max(1, referenceLongEdge) * ratio)),
    ),
  };
  if (preset === 'high') {
    return {
      ...shared,
      quality: 68,
      passes: 1,
      noise: false,
      noiseAmount: 0.03,
      sharpen: true,
      sharpenAmount: 0.16,
      chromaBleed: 0.02,
    };
  }
  if (preset === 'medium') {
    return {
      ...shared,
      quality: 32,
      passes: 2,
      noise: true,
      noiseAmount: 0.08,
      sharpen: true,
      sharpenAmount: 0.28,
      chromaBleed: 0.1,
    };
  }
  return {
    ...shared,
    quality: 10,
    passes: 3,
    noise: true,
    noiseAmount: 0.18,
    sharpen: true,
    sharpenAmount: 0.48,
    chromaBleed: 0.22,
  };
}
