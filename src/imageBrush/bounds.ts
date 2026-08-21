import type { Rectangle } from '../types';
import { clamp } from '../utils/geometry';
import type { ImageBrushAssetMode, ImageBrushSettings, StampPoint } from './types';

export interface ImageBrushBoundsAsset {
  id: string;
  width: number;
  height: number;
}

export function estimateImageBrushReadBounds(
  stamps: StampPoint[],
  settings: ImageBrushSettings,
  assets: ImageBrushBoundsAsset[],
  activeAssetId: string,
  documentWidth: number,
  documentHeight: number,
  assetMode?: ImageBrushAssetMode,
): Rectangle {
  const active = assets.find((asset) => asset.id === activeAssetId) ?? assets[0];
  if (!active || !stamps.length || documentWidth <= 0 || documentHeight <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const relevantAssets =
    assetMode === 'all' ||
    (!assetMode && (settings.mode === 'sequence' || settings.mode === 'random-hose'))
      ? assets
      : [active];
  const scaleJitter = 1 + Math.max(0, settings.scaleJitter);
  const padding = settings.alphaMode === 'bleed' ? Math.max(0, settings.bleedAmount) : 0;
  let maximumRadius = 1;
  for (const asset of relevantAssets) {
    const scale = (settings.size / Math.max(1, asset.width)) * scaleJitter;
    const width = (asset.width + padding * 2) * scale;
    const height = (asset.height + padding * 2) * scale;
    // Edge/custom anchors can put the path coordinate at a corner. The full
    // diagonal is therefore the safe rotation-independent read/write radius.
    maximumRadius = Math.max(maximumRadius, Math.hypot(width, height) + 4);
  }
  const scatterActive = settings.mode === 'scatter' || settings.mode === 'random-hose';
  const scatterX = scatterActive ? Math.abs(settings.scatterX * settings.size) : 0;
  const scatterY = scatterActive ? Math.abs(settings.scatterY * settings.size) : 0;
  let left = documentWidth;
  let top = documentHeight;
  let right = 0;
  let bottom = 0;
  for (const stamp of stamps) {
    left = Math.min(left, stamp.position.x - maximumRadius - scatterX);
    top = Math.min(top, stamp.position.y - maximumRadius - scatterY);
    right = Math.max(right, stamp.position.x + maximumRadius + scatterX);
    bottom = Math.max(bottom, stamp.position.y + maximumRadius + scatterY);
  }
  const x = clamp(Math.floor(left), 0, Math.max(0, documentWidth - 1));
  const y = clamp(Math.floor(top), 0, Math.max(0, documentHeight - 1));
  const endX = clamp(Math.ceil(right), x + 1, documentWidth);
  const endY = clamp(Math.ceil(bottom), y + 1, documentHeight);
  return { x, y, width: endX - x, height: endY - y };
}

export function cropRgbaRegion(
  pixels: Uint8ClampedArray,
  documentWidth: number,
  bounds: Rectangle,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let row = 0; row < bounds.height; row += 1) {
    const source = ((bounds.y + row) * documentWidth + bounds.x) * 4;
    output.set(pixels.subarray(source, source + bounds.width * 4), row * bounds.width * 4);
  }
  return output;
}
