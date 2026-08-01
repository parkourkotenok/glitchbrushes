export interface ProjectRun {
  start: number;
  data: string;
}

function bytesToBase64(bytes: Uint8ClampedArray): string {
  let binary = '';
  const stringChunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += stringChunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stringChunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8ClampedArray {
  const binary = atob(value);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeProjectRuns(
  pixels: Uint8ClampedArray,
  original: Uint8ClampedArray,
  chunkSize = 65_536,
): ProjectRun[] {
  if (pixels.length !== original.length) {
    throw new Error('Project buffers must have matching lengths.');
  }
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  const runs: ProjectRun[] = [];
  for (let start = 0; start < pixels.length; start += safeChunkSize) {
    const end = Math.min(pixels.length, start + safeChunkSize);
    let changed = false;
    for (let index = start; index < end; index += 1) {
      if (pixels[index] === original[index]) continue;
      changed = true;
      break;
    }
    if (!changed) continue;
    runs.push({
      start,
      data: bytesToBase64(pixels.subarray(start, end)),
    });
  }
  return runs;
}

export function applyProjectRuns(
  target: Uint8ClampedArray,
  original: Uint8ClampedArray,
  runs: ProjectRun[],
): void {
  if (target.length !== original.length) {
    throw new Error('Project buffers must have matching lengths.');
  }
  target.set(original);
  for (const run of runs) {
    const bytes = base64ToBytes(run.data);
    if (
      !Number.isSafeInteger(run.start) ||
      run.start < 0 ||
      run.start + bytes.length > target.length
    ) {
      throw new Error('Project change range is outside the image buffer.');
    }
    target.set(bytes, run.start);
  }
}
