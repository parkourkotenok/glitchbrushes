import type { Point, Rectangle } from '../types';
import { brushBounds, clamp } from '../utils/geometry';
import type { RandomSource } from '../utils/prng';

export interface MaskStampResult {
  bounds: Rectangle;
  touched: number[];
}

export function stampSoftBrush(
  mask: Float32Array,
  width: number,
  height: number,
  point: Point,
  radius: number,
  hardness: number,
  opacity: number,
  density: number,
  random: RandomSource,
  accumulate: boolean,
): MaskStampResult {
  const bounds = brushBounds(point, radius, width, height);
  const touched: number[] = [];
  const hardnessExponent = 0.55 + clamp(hardness, 0, 1) * 5.5;
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const dx = x + 0.5 - point.x;
      const dy = y + 0.5 - point.y;
      const normalizedDistance = Math.sqrt(dx * dx + dy * dy) / radius;
      if (normalizedDistance > 1 || random.next() > density) continue;
      const falloff = Math.pow(1 - normalizedDistance, hardnessExponent) * opacity;
      const index = y * width + x;
      mask[index] = accumulate
        ? clamp(mask[index]! + falloff, 0, 1)
        : Math.max(mask[index]!, falloff);
      touched.push(index);
    }
  }
  return { bounds, touched };
}

export function clearMask(mask: Float32Array, indices: readonly number[]): void {
  for (const index of indices) mask[index] = 0;
}
