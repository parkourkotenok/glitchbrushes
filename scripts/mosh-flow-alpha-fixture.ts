import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { processImageBrushStroke } from '../src/imageBrush/engine';
import { defaultImageBrushSettings, type StampPoint } from '../src/imageBrush/types';

const size = 64;
const width = 512;
const height = 184;
const output = resolve(
  process.env.MOSH_FIXTURE_OUTPUT ?? 'artifacts/mosh-flow-alpha/mosh-flow-alpha-after.png',
);
const pixels = new Uint8ClampedArray(
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      'public/assets/image-brush-astronaut.png',
      '-frames:v',
      '1',
      '-vf',
      `scale=${size}:${size}:flags=lanczos`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      'pipe:1',
    ],
    { encoding: 'buffer' },
  ),
);
if (pixels.length !== size * size * 4)
  throw new Error(`Unexpected astronaut RGBA length ${pixels.length}.`);
const stamps: StampPoint[] = Array.from({ length: 9 }, (_, index) => {
  const x = 54 + index * 50;
  const y = 98 + Math.round(Math.sin(index * 0.72) * 35);
  const previousX = index ? 54 + (index - 1) * 50 : x;
  const previousY = index ? 98 + Math.round(Math.sin((index - 1) * 0.72) * 35) : y;
  const dx = x - previousX;
  const dy = y - previousY;
  return {
    position: { x, y },
    previousPosition: { x: previousX, y: previousY },
    direction: index ? { x: dx / Math.hypot(dx, dy), y: dy / Math.hypot(dx, dy) } : { x: 1, y: 0 },
    speed: Math.hypot(dx, dy),
    pressure: 1,
    distance: index * 50,
    index,
  };
});
const result = processImageBrushStroke({
  jobId: 'mosh-flow-alpha-fixture',
  width,
  height,
  pixels: new Uint8ClampedArray(width * height * 4),
  sourceBounds: { x: 0, y: 0, width, height },
  assets: [{ id: 'transparent-astronaut', width: size, height: size, pixels }],
  activeAssetId: 'transparent-astronaut',
  stamps,
  settings: {
    ...defaultImageBrushSettings,
    size: 64,
    spacing: 32,
    spacingUnit: 'pixels',
    opacity: 1,
    flow: 1,
    mutationMode: 'whole-trail',
    mutationAmount: 1,
    structuralDrift: 1,
    effectVariation: 0,
    alphaMode: 'bleed',
    bleedAmount: 4,
    fxStage: 'after',
    pressureSize: false,
    pressureOpacity: false,
    pressureSpacing: false,
    maxGeneratedStamps: 9,
  },
  rack: [{ id: 'flow-field', effectId: 'flow-field', enabled: true, amount: 1, mix: 1 }],
  seed: 'mosh-flow-alpha-v1',
  strokeId: 'mosh-flow-alpha-stroke',
  presetName: 'MOSH Flow Trail',
  evolutionOffset: 0,
});
const table = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1 ? 0xedb88320 : 0) ^ (crc >>> 1);
  return crc >>> 0;
});
const chunk = (type: string, data: Buffer) => {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) crc = table[(crc ^ byte) & 255]! ^ (crc >>> 8);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, sum]);
};
const raw = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1)
  raw.set(result.pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
const header = Buffer.alloc(13);
header.writeUInt32BE(width);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
writeFileSync(
  output,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
let hash = 0x811c9dc5;
for (const value of result.pixels) hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
console.log(
  JSON.stringify({
    output,
    pixelsHash: hash.toString(16).padStart(8, '0'),
    bounds: result.bounds,
    nonTransparent: result.pixels.filter((_, index) => index % 4 === 3).filter(Boolean).length,
  }),
);
