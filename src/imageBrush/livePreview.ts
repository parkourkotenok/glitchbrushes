import { clamp } from '../utils/geometry';
import type { ImageBrushPreviewQuality, ImageBrushSettings, StampPoint } from './types';

export interface ImageBrushLivePreviewLayout {
  width: number;
  height: number;
  settings: ImageBrushSettings;
  stamps: StampPoint[];
}

/**
 * The inspector preview is intentionally enlarged so small stamp details and FX remain readable.
 * This affects only the demonstration strip; the canvas stroke continues to use the exact Size.
 */
export const imageBrushLivePreviewMagnification = 1.5;

export function createImageBrushLivePreviewBackground(
  width: number,
  height: number,
  source?: { pixels: Uint8ClampedArray; width: number; height: number },
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  if (source && source.width > 0 && source.height > 0) {
    const scale = Math.max(width / source.width, height / source.height);
    const scaledWidth = source.width * scale;
    const scaledHeight = source.height * scale;
    const offsetX = (scaledWidth - width) / 2;
    const offsetY = (scaledHeight - height) / 2;
    for (let y = 0; y < height; y += 1) {
      const sourceY = clamp(Math.floor((y + offsetY) / scale), 0, source.height - 1);
      for (let x = 0; x < width; x += 1) {
        const sourceX = clamp(Math.floor((x + offsetX) / scale), 0, source.width - 1);
        const sourceOffset = (sourceY * source.width + sourceX) * 4;
        const destination = (y * width + x) * 4;
        pixels.set(source.pixels.subarray(sourceOffset, sourceOffset + 4), destination);
      }
    }
    return pixels;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const horizontal = x / Math.max(1, width - 1);
      const vertical = y / Math.max(1, height - 1);
      pixels[offset] = Math.round(28 + horizontal * 34);
      pixels[offset + 1] = Math.round(31 + vertical * 26);
      pixels[offset + 2] = Math.round(35 + (1 - horizontal) * 34);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export function createImageBrushLivePreviewLayout(
  settings: ImageBrushSettings,
  quality: ImageBrushPreviewQuality,
  documentWidth: number,
  documentHeight: number,
): ImageBrushLivePreviewLayout {
  const width = quality === 'draft' ? 240 : 480;
  const height = quality === 'draft' ? 84 : 168;
  const scale = Math.max(width / Math.max(1, documentWidth), height / Math.max(1, documentHeight));
  const previewSize = Math.max(0.5, settings.size * scale * imageBrushLivePreviewMagnification);
  const spacingPixels =
    settings.spacingUnit === 'percent'
      ? previewSize * (settings.spacing / 100)
      : settings.spacing * scale * imageBrushLivePreviewMagnification;
  const spacing = Math.max(0.5, spacingPixels);
  const left = Math.min(width / 2, previewSize * 0.62);
  const right = Math.max(width / 2, width - previewSize * 0.62);
  const available = Math.max(1, right - left);
  const stampCount = Math.max(1, Math.min(24, Math.floor(available / spacing) + 1));
  const step = spacing;
  const occupied = Math.min(available, Math.max(0, stampCount - 1) * step);
  const centeredLeft = (width - occupied) / 2;
  const points = Array.from({ length: stampCount }, (_, index) => ({
    x: centeredLeft + index * step,
    y: height * 0.5,
  }));
  const stamps = points.map<StampPoint>((position, index) => {
    const previousPosition = points[Math.max(0, index - 1)]!;
    const nextPosition = points[Math.min(points.length - 1, index + 1)]!;
    const dx = nextPosition.x - previousPosition.x;
    const dy = nextPosition.y - previousPosition.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      position,
      previousPosition,
      direction: { x: dx / length, y: dy / length },
      speed:
        index === 0
          ? 0
          : Math.hypot(position.x - previousPosition.x, position.y - previousPosition.y),
      pressure: 1,
      distance: index * step,
      index,
    };
  });
  return {
    width,
    height,
    stamps,
    settings: {
      ...settings,
      customAnchor: { ...settings.customAnchor },
      size: previewSize,
      spacing,
      spacingUnit: 'pixels',
      maxGeneratedStamps: Math.min(settings.maxGeneratedStamps, 24),
      maxCachedVariants:
        quality === 'draft'
          ? Math.min(settings.maxCachedVariants, 2)
          : Math.min(settings.maxCachedVariants, 4),
      maxLiveFxIterations:
        quality === 'draft'
          ? Math.min(settings.maxLiveFxIterations, 2)
          : Math.min(settings.maxLiveFxIterations, 3),
      variantCount:
        quality === 'draft'
          ? Math.min(settings.variantCount, 2)
          : Math.min(settings.variantCount, 4),
      renderingQuality:
        quality === 'draft'
          ? 'realtime'
          : settings.renderingQuality === 'auto'
            ? 'balanced'
            : settings.renderingQuality,
      pressureSize: false,
      pressureOpacity: false,
      pressureSpacing: false,
    },
  };
}
