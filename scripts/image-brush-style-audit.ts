import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { processImageBrushStroke } from '../src/imageBrush/engine';
import { builtInImageBrushPresets } from '../src/imageBrush/presets';
import type { ImageBrushPreset, StampPoint } from '../src/imageBrush/types';

/**
 * Deterministic, engine-level style contact sheet. It deliberately avoids the UI and Worker
 * lifecycle: every built-in recipe gets the same source pixels, stroke samples, size, spacing
 * and seed, so a different cell is attributable to the recipe rather than presentation state.
 *
 * Run with:
 * node node_modules/esbuild/bin/esbuild scripts/image-brush-style-audit.ts --bundle --platform=node --format=esm --outfile=node_modules/.tmp/image-brush-style-audit.mjs
 * node node_modules/.tmp/image-brush-style-audit.mjs
 */

const outputDirectory = resolve('artifacts', 'image-brush-style-audit');
const sourceSize = 64;
const documentWidth = 512;
const documentHeight = 184;
const cellWidth = 672;
const rowHeight = 184;
const titleHeight = 46;
const seed = 'image-brush-style-audit-v1';
const strokeId = 'style-audit-stroke';

type AuditSource = { id: string; label: string; file: string; pixels: Uint8ClampedArray };
type RenderedCell = {
  pixels: Uint8ClampedArray;
  bounds: { x: number; y: number; width: number; height: number };
  hash: string;
  renderMs: number;
};

function decodeAsset(file: string): Uint8ClampedArray {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `scale=${sourceSize}:${sourceSize}:flags=lanczos`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      'pipe:1',
    ],
    { encoding: 'buffer' },
  );
  if (raw.length !== sourceSize * sourceSize * 4) {
    throw new Error(`Unexpected decoded byte count for ${file}: ${raw.length}.`);
  }
  return new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength).slice();
}

function makeStamps(): StampPoint[] {
  return Array.from({ length: 9 }, (_, index) => {
    const x = 54 + index * 50;
    const y = 98 + Math.round(Math.sin(index * 0.72) * 35);
    const previousX = index === 0 ? x : 54 + (index - 1) * 50;
    const previousY = index === 0 ? y : 98 + Math.round(Math.sin((index - 1) * 0.72) * 35);
    const dx = x - previousX;
    const dy = y - previousY;
    return {
      position: { x, y },
      previousPosition: { x: previousX, y: previousY },
      direction:
        index === 0 ? { x: 1, y: 0 } : { x: dx / Math.hypot(dx, dy), y: dy / Math.hypot(dx, dy) },
      speed: Math.hypot(dx, dy),
      pressure: 1,
      distance: index * 50,
      index,
    };
  });
}

function fnv1a(bytes: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function render(preset: ImageBrushPreset, source: AuditSource): RenderedCell {
  const started = performance.now();
  const result = processImageBrushStroke({
    jobId: `${preset.id}-${source.id}`,
    width: documentWidth,
    height: documentHeight,
    pixels: new Uint8ClampedArray(documentWidth * documentHeight * 4),
    sourceBounds: { x: 0, y: 0, width: documentWidth, height: documentHeight },
    assets: [{ id: source.id, width: sourceSize, height: sourceSize, pixels: source.pixels }],
    activeAssetId: source.id,
    stamps: makeStamps(),
    settings: {
      ...preset.settings,
      size: 64,
      spacing: 32,
      spacingUnit: 'pixels',
      opacity: 1,
      flow: 1,
      pressureSize: false,
      pressureOpacity: false,
      pressureSpacing: false,
      maxGeneratedStamps: 9,
    },
    rack: preset.rack.map((item) => ({ ...item })),
    seed,
    strokeId,
    presetName: preset.name,
    evolutionOffset: 0,
  });
  return {
    pixels: result.pixels,
    bounds: result.bounds,
    hash: fnv1a(result.pixels),
    renderMs: performance.now() - started,
  };
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1 ? 0xedb88320 : 0) ^ (crc >>> 1);
  return crc >>> 0;
});

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([typeBytes, data]))
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function pngRgba(width: number, height: number, pixels: Uint8ClampedArray): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1)
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function putPixel(
  target: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  rgba: number[],
): void {
  if (x < 0 || y < 0 || x >= width || y >= target.length / (width * 4)) return;
  target.set(rgba, (y * width + x) * 4);
}

function fill(
  target: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: number[],
): void {
  for (let yy = y; yy < y + h; yy += 1)
    for (let xx = x; xx < x + w; xx += 1) putPixel(target, width, xx, yy, rgba);
}

function checker(
  target: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      const shade = (Math.floor(xx / 12) + Math.floor(yy / 12)) % 2 === 0 ? 27 : 34;
      putPixel(target, width, x + xx, y + yy, [shade, shade + 3, shade + 8, 255]);
    }
  }
}

function alphaOver(
  target: Uint8ClampedArray,
  targetOffset: number,
  source: Uint8ClampedArray,
  sourceOffset: number,
): void {
  const alpha = source[sourceOffset + 3]! / 255;
  if (alpha <= 0) return;
  const inverse = 1 - alpha;
  target[targetOffset] = Math.round(
    source[sourceOffset]! * alpha + target[targetOffset]! * inverse,
  );
  target[targetOffset + 1] = Math.round(
    source[sourceOffset + 1]! * alpha + target[targetOffset + 1]! * inverse,
  );
  target[targetOffset + 2] = Math.round(
    source[sourceOffset + 2]! * alpha + target[targetOffset + 2]! * inverse,
  );
  target[targetOffset + 3] = 255;
}

function blitContained(
  target: Uint8ClampedArray,
  targetWidth: number,
  source: RenderedCell,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.min(w / source.bounds.width, h / source.bounds.height);
  const drawWidth = Math.max(1, Math.floor(source.bounds.width * scale));
  const drawHeight = Math.max(1, Math.floor(source.bounds.height * scale));
  const left = x + Math.floor((w - drawWidth) / 2);
  const top = y + Math.floor((h - drawHeight) / 2);
  for (let yy = 0; yy < drawHeight; yy += 1) {
    for (let xx = 0; xx < drawWidth; xx += 1) {
      const sx = Math.min(
        source.bounds.width - 1,
        Math.floor((xx / drawWidth) * source.bounds.width),
      );
      const sy = Math.min(
        source.bounds.height - 1,
        Math.floor((yy / drawHeight) * source.bounds.height),
      );
      alphaOver(
        target,
        ((top + yy) * targetWidth + left + xx) * 4,
        source.pixels,
        (sy * source.bounds.width + sx) * 4,
      );
    }
  }
}

const glyphs: Record<string, string[]> = {
  A: ['0110', '1001', '1001', '1111', '1001', '1001', '1001'],
  B: ['1110', '1001', '1110', '1001', '1001', '1001', '1110'],
  C: ['0111', '1000', '1000', '1000', '1000', '1000', '0111'],
  D: ['1110', '1001', '1001', '1001', '1001', '1001', '1110'],
  E: ['1111', '1000', '1110', '1000', '1000', '1000', '1111'],
  F: ['1111', '1000', '1110', '1000', '1000', '1000', '1000'],
  G: ['0111', '1000', '1000', '1011', '1001', '1001', '0111'],
  H: ['1001', '1001', '1111', '1001', '1001', '1001', '1001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  J: ['0011', '0001', '0001', '0001', '1001', '1001', '0110'],
  K: ['1001', '1010', '1100', '1010', '1001', '1001', '1001'],
  L: ['1000', '1000', '1000', '1000', '1000', '1000', '1111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['1001', '1101', '1101', '1011', '1011', '1001', '1001'],
  O: ['0110', '1001', '1001', '1001', '1001', '1001', '0110'],
  P: ['1110', '1001', '1001', '1110', '1000', '1000', '1000'],
  Q: ['0110', '1001', '1001', '1001', '1011', '1010', '0101'],
  R: ['1110', '1001', '1001', '1110', '1010', '1001', '1001'],
  S: ['0111', '1000', '1000', '0110', '0001', '0001', '1110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['1001', '1001', '1001', '1001', '1001', '1001', '0110'],
  V: ['1001', '1001', '1001', '1001', '1001', '0110', '0110'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['1001', '1001', '0110', '0110', '0110', '1001', '1001'],
  Y: ['1001', '1001', '0110', '0010', '0010', '0010', '0010'],
  Z: ['1111', '0001', '0010', '0010', '0100', '1000', '1111'],
  0: ['0110', '1001', '1011', '1011', '1101', '1001', '0110'],
  1: ['010', '110', '010', '010', '010', '010', '111'],
  2: ['0110', '1001', '0001', '0010', '0100', '1000', '1111'],
  3: ['1110', '0001', '0001', '0110', '0001', '0001', '1110'],
  4: ['1001', '1001', '1001', '1111', '0001', '0001', '0001'],
  5: ['1111', '1000', '1000', '1110', '0001', '0001', '1110'],
  6: ['0111', '1000', '1000', '1110', '1001', '1001', '0110'],
  7: ['1111', '0001', '0010', '0010', '0100', '0100', '0100'],
  8: ['0110', '1001', '1001', '0110', '1001', '1001', '0110'],
  9: ['0110', '1001', '1001', '0111', '0001', '0001', '1110'],
  '#': ['01010', '11111', '01010', '01010', '11111', '01010', '01010'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
  '/': ['0001', '0001', '0010', '0010', '0100', '1000', '1000'],
};

function text(
  target: Uint8ClampedArray,
  width: number,
  value: string,
  x: number,
  y: number,
  scale: number,
  rgba: number[],
): void {
  let cursor = x;
  for (const char of value.toUpperCase()) {
    const glyph = glyphs[char] ?? glyphs[' ']!;
    for (let row = 0; row < glyph.length; row += 1)
      for (let column = 0; column < glyph[row]!.length; column += 1)
        if (glyph[row]![column] === '1')
          fill(target, width, cursor + column * scale, y + row * scale, scale, scale, rgba);
    cursor += (glyph[0]!.length + 1) * scale;
  }
}

function renderSheet(results: Map<string, RenderedCell>): Buffer {
  const width = cellWidth * 2;
  const height = titleHeight + builtInImageBrushPresets.length * rowHeight;
  const pixels = new Uint8ClampedArray(width * height * 4);
  fill(pixels, width, 0, 0, width, height, [12, 15, 20, 255]);
  text(
    pixels,
    width,
    'IMAGE BRUSH STYLE AUDIT / SAME PATH SIZE SPACING SEED',
    18,
    13,
    2,
    [239, 205, 126, 255],
  );
  for (const [index, preset] of builtInImageBrushPresets.entries()) {
    const rowTop = titleHeight + index * rowHeight;
    fill(
      pixels,
      width,
      0,
      rowTop,
      width,
      rowHeight - 1,
      index % 2 === 0 ? [17, 21, 29, 255] : [20, 25, 33, 255],
    );
    text(pixels, width, preset.name, 14, rowTop + 11, 2, [230, 234, 241, 255]);
    for (const [sourceIndex, source] of [
      'transparent illustration',
      'photographic image',
    ].entries()) {
      const cellX = sourceIndex * cellWidth;
      const imageTop = rowTop + 35;
      checker(pixels, width, cellX + 10, imageTop, cellWidth - 20, rowHeight - 47);
      text(pixels, width, source, cellX + 16, imageTop + 8, 1, [188, 195, 208, 255]);
      const cell = results.get(`${preset.id}:${sourceIndex}`)!;
      blitContained(pixels, width, cell, cellX + 14, imageTop + 20, cellWidth - 28, rowHeight - 72);
      text(
        pixels,
        width,
        `#${cell.hash}`,
        cellX + 16,
        rowTop + rowHeight - 17,
        1,
        [161, 173, 191, 255],
      );
    }
  }
  return pngRgba(width, height, pixels);
}

const sources: AuditSource[] = [
  {
    id: 'transparent-illustration',
    label: 'transparent illustration',
    file: 'public/assets/image-brush-astronaut.png',
    pixels: decodeAsset(resolve('public/assets/image-brush-astronaut.png')),
  },
  {
    id: 'photographic-image',
    label: 'photographic image',
    file: 'public/assets/parkour-kotenok-road.jpg',
    pixels: decodeAsset(resolve('public/assets/parkour-kotenok-road.jpg')),
  },
];

mkdirSync(outputDirectory, { recursive: true });
const rendered = new Map<string, RenderedCell>();
const manifest: Array<Record<string, unknown>> = [];
for (const preset of builtInImageBrushPresets) {
  const entry: Record<string, unknown> = { id: preset.id, name: preset.name, sources: [] };
  for (const [sourceIndex, source] of sources.entries()) {
    const first = render(preset, source);
    const second = render(preset, source);
    if (
      first.hash !== second.hash ||
      first.bounds.width !== second.bounds.width ||
      first.bounds.height !== second.bounds.height
    ) {
      throw new Error(`${preset.id} is not byte-deterministic for ${source.label}.`);
    }
    rendered.set(`${preset.id}:${sourceIndex}`, first);
    (entry.sources as Array<Record<string, unknown>>).push({
      id: source.id,
      label: source.label,
      pixelHash: first.hash,
      bounds: first.bounds,
      firstRenderMs: Number(first.renderMs.toFixed(2)),
    });
  }
  manifest.push(entry);
}

writeFileSync(resolve(outputDirectory, 'contact-sheet.png'), renderSheet(rendered));
writeFileSync(
  resolve(outputDirectory, 'manifest.json'),
  JSON.stringify(
    {
      harnessVersion: 1,
      sourceSize,
      document: { width: documentWidth, height: documentHeight },
      fixedInput: {
        seed,
        strokeId,
        size: 64,
        spacing: 32,
        spacingUnit: 'pixels',
        stamps: makeStamps().length,
      },
      sources: sources.map(({ id, label, file }) => ({ id, label, file })),
      presets: manifest,
    },
    null,
    2,
  ),
);

const timings = manifest.flatMap((entry) =>
  (entry.sources as Array<{ firstRenderMs: number }>).map((source) => source.firstRenderMs),
);
console.log(
  JSON.stringify(
    {
      presets: builtInImageBrushPresets.length,
      sources: sources.length,
      contactSheet: resolve(outputDirectory, 'contact-sheet.png'),
      manifest: resolve(outputDirectory, 'manifest.json'),
      deterministic: true,
      renderMs: {
        min: Math.min(...timings),
        max: Math.max(...timings),
        total: Number(timings.reduce((sum, value) => sum + value, 0).toFixed(2)),
      },
    },
    null,
    2,
  ),
);
