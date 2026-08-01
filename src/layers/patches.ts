import { createPatch } from '../history/PatchHistory';
import { pixelToByteOffset } from '../utils/geometry';
import type { BytePatch, Rectangle } from '../types';

export function rowPatchesBefore(
  buffer: Uint8ClampedArray,
  width: number,
  bounds: Rectangle,
): Array<{ start: number; before: Uint8ClampedArray }> {
  const patches: Array<{ start: number; before: Uint8ClampedArray }> = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    const start = pixelToByteOffset(bounds.x, y, width);
    patches.push({ start, before: buffer.slice(start, start + bounds.width * 4) });
  }
  return patches;
}

export function finalizePatches(
  before: Array<{ start: number; before: Uint8ClampedArray }>,
  buffer: Uint8ClampedArray,
): BytePatch[] {
  return before
    .map((patch) => createPatch(patch.start, patch.before, buffer))
    .filter((patch): patch is BytePatch => patch !== null);
}
