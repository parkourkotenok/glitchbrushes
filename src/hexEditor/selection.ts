export interface ByteRun {
  start: number;
  end: number;
}

export function normalizePixels(pixels: readonly number[], pixelCount: number): number[] {
  return [...new Set(pixels)]
    .filter((pixel) => Number.isInteger(pixel) && pixel >= 0 && pixel < pixelCount)
    .sort((a, b) => a - b);
}

export function pixelSelectionToByteRuns(
  pixels: readonly number[],
  bufferLength: number,
): ByteRun[] {
  const normalized = normalizePixels(pixels, Math.floor(bufferLength / 4));
  if (!normalized.length) return [];
  const runs: ByteRun[] = [];
  let runStart = normalized[0]!;
  let previous = runStart;
  for (let index = 1; index < normalized.length; index += 1) {
    const pixel = normalized[index]!;
    if (pixel === previous + 1) {
      previous = pixel;
      continue;
    }
    runs.push({ start: runStart * 4, end: previous * 4 + 3 });
    runStart = pixel;
    previous = pixel;
  }
  runs.push({ start: runStart * 4, end: previous * 4 + 3 });
  return runs;
}

export function contiguousPixelSelection(anchor: number, target: number): number[] {
  const start = Math.min(anchor, target);
  const end = Math.max(anchor, target);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
