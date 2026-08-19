import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  algorithmList,
  algorithms,
  defaultAlgorithmSettings,
  legacyAlgorithmList,
} from '../src/glitchAlgorithms/index';
import type { GlitchContext } from '../src/types/index';

const width = 180;
const height = 112;
const root = resolve(process.cwd());
const input = join(root, 'public', 'assets', 'parkour-kotenok-road.jpg');
const output = join(root, 'public', 'assets', 'effect-previews');
const temporary = mkdtempSync(join(tmpdir(), 'glitch-brush-previews-'));

function ffmpeg(...args: string[]): void {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(`ffmpeg exited with status ${result.status ?? 'unknown'}`);
}

function encodeRaw(pixels: Uint8ClampedArray, name: string): void {
  const rawPath = join(temporary, `${name}.rgba`);
  writeFileSync(rawPath, pixels);
  ffmpeg(
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-video_size',
    `${width}x${height}`,
    '-i',
    rawPath,
    '-frames:v',
    '1',
    '-c:v',
    'libwebp',
    '-quality',
    '84',
    join(output, `${name}.webp`),
  );
}

mkdirSync(output, { recursive: true });
try {
  const originalRaw = join(temporary, 'original.rgba');
  ffmpeg(
    '-i',
    input,
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    originalRaw,
  );
  const original = new Uint8ClampedArray(readFileSync(originalRaw));
  encodeRaw(original, 'original');

  const items = [...algorithmList, ...legacyAlgorithmList];
  for (const item of items) {
    const pixels = original.slice();
    const mask = new Float32Array(width * height).fill(1);
    const bounds = { x: 0, y: 0, width, height };
    const context: GlitchContext = {
      pixels,
      originalPixels: original,
      width,
      height,
      mask,
      bounds,
      writeBounds: bounds,
      strength: 0.92,
      pressure: 1,
      seed: `parkour-kotenok:static-preview:${item.id}`,
      settings: { ...defaultAlgorithmSettings },
      movement: { x: Math.max(18, width * 0.28), y: height * 0.04 },
      cloneSource: {
        x: Math.round(width * 0.08),
        y: Math.round(height * 0.12),
        width: Math.round(width * 0.34),
        height: Math.round(height * 0.42),
      },
      feedbackMemory: original.slice(),
    };
    algorithms[item.id].apply(context);
    const difference = new Uint8ClampedArray(pixels.length);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      difference[offset] = Math.min(255, Math.abs(pixels[offset]! - original[offset]!) * 3);
      difference[offset + 1] = Math.min(
        255,
        Math.abs(pixels[offset + 1]! - original[offset + 1]!) * 3,
      );
      difference[offset + 2] = Math.min(
        255,
        Math.abs(pixels[offset + 2]! - original[offset + 2]!) * 3,
      );
      difference[offset + 3] = 255;
    }
    encodeRaw(pixels, `${item.id}-after`);
    encodeRaw(difference, `${item.id}-difference`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
