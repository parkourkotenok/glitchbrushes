import type {
  AlgorithmId,
  AlgorithmSettings,
  EdgeMode,
  GlitchContext,
  Point,
  Rectangle,
  SpillMode,
} from '../types';
import { clamp, pixelToByteOffset } from '../utils/geometry';
import type { RandomSource } from '../utils/prng';

export interface RegionSnapshot {
  data: Uint8ClampedArray;
  bounds: Rectangle;
}

export function clipRectangle(rectangle: Rectangle, width: number, height: number): Rectangle {
  const x = clamp(Math.floor(rectangle.x), 0, width);
  const y = clamp(Math.floor(rectangle.y), 0, height);
  const right = clamp(Math.ceil(rectangle.x + rectangle.width), 0, width);
  const bottom = clamp(Math.ceil(rectangle.y + rectangle.height), 0, height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function spillScale(mode: SpillMode): number {
  if (mode === 'small') return 0.16;
  if (mode === 'medium') return 0.34;
  if (mode === 'strong') return 0.62;
  return 0;
}

export function expandEffectBounds(
  bounds: Rectangle,
  imageWidth: number,
  imageHeight: number,
  mode: SpillMode,
  minimumPadding = 0,
): Rectangle {
  const padding = Math.ceil(
    Math.max(Math.max(bounds.width, bounds.height) * spillScale(mode), minimumPadding),
  );
  return clipRectangle(
    {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
    },
    imageWidth,
    imageHeight,
  );
}

function structuralReach(algorithm: AlgorithmId, settings: AlgorithmSettings): number {
  switch (algorithm) {
    case 'pixel-sort-brush':
      return settings.sortBrushSpill + settings.sortBrushEdgeSoftness;
    case 'feedback-brush':
      return (
        Math.max(Math.abs(settings.feedbackBrushOffsetX), Math.abs(settings.feedbackBrushOffsetY)) *
        settings.feedbackBrushEchoCount
      );
    case 'displacement-brush':
      return (
        Math.max(
          Math.abs(settings.displacementBrushStrengthX),
          Math.abs(settings.displacementBrushStrengthY),
        ) + settings.displacementBrushSpill
      );
    case 'flow-mosh-brush':
      return settings.flowBrushPropagation + settings.flowBrushTrailWidth;
    case 'clone-corruption-brush':
      return settings.cloneBrushBlockSize * settings.cloneBrushRepetition;
    case 'line-freeze-brush':
      return settings.lineBrushSpill + settings.lineBrushThickness * settings.lineBrushRepeatCount;
    case 'mirror-fold-brush':
      return (
        settings.mirrorFoldOffset * settings.mirrorFoldRepetitions + settings.mirrorFoldRgbSlip + 2
      );
    case 'raster-loom-brush':
      return (
        settings.rasterLoomSourceOffset + settings.rasterLoomRgbSlip + settings.rasterLoomGap + 2
      );
    case 'contour-crawl-brush':
      return (
        settings.contourCrawlLength +
        settings.contourCrawlSideDrift +
        settings.contourCrawlRgbSplit +
        settings.contourCrawlLineWidth +
        2
      );
    case 'slice-displacement':
      return settings.sliceMaxOffset * settings.structuralIntensity;
    case 'macroblock-shift':
      return settings.macroblockOffset + settings.macroblockMaxSize / 2;
    case 'datamosh-smear':
      return (
        settings.datamoshLength * settings.structuralIntensity +
        settings.datamoshBlockWidth / 2 +
        settings.datamoshJitter / 2
      );
    case 'packet-loss':
      return settings.packetBlockSize * 1.5;
    case 'rgb-chunk-split':
      return settings.rgbRegionSize / 2 + settings.rgbChunkOffset;
    case 'compression-block-damage':
      return settings.compressionTileSize * 2;
    case 'scanline-tear-pro':
      return settings.tearShift + settings.tearJitter + settings.tearColorSplit;
    case 'tile-scramble':
      return settings.tileGridSize;
    case 'row-column-repeat':
      return (
        settings.repeatLength * settings.repeatCount * settings.structuralIntensity +
        settings.repeatJitter
      );
    case 'structural-mixed':
      return Math.max(
        settings.sliceMaxOffset,
        settings.macroblockOffset + settings.macroblockMaxSize / 2,
        settings.datamoshLength * settings.structuralIntensity,
        settings.tearShift + settings.tearJitter,
        settings.repeatLength * settings.repeatCount,
      );
    default:
      return 0;
  }
}

export function structuralWriteBounds(
  bounds: Rectangle,
  imageWidth: number,
  imageHeight: number,
  algorithm: AlgorithmId,
  settings: AlgorithmSettings,
): Rectangle {
  const reachRatio =
    settings.spill === 'small'
      ? 0.68
      : settings.spill === 'medium'
        ? 1
        : settings.spill === 'strong'
          ? 1.35
          : 0;
  return expandEffectBounds(
    bounds,
    imageWidth,
    imageHeight,
    settings.spill,
    structuralReach(algorithm, settings) * reachRatio,
  );
}

export function extractRegion(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rectangle: Rectangle,
): RegionSnapshot {
  const bounds = clipRectangle(rectangle, imageWidth, imageHeight);
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let row = 0; row < bounds.height; row += 1) {
    const start = pixelToByteOffset(bounds.x, bounds.y + row, imageWidth);
    data.set(pixels.subarray(start, start + bounds.width * 4), row * bounds.width * 4);
  }
  return { data, bounds };
}

function wrap(value: number, min: number, max: number): number {
  const size = max - min + 1;
  return min + ((((value - min) % size) + size) % size);
}

export function sampleRegion(
  snapshot: RegionSnapshot,
  x: number,
  y: number,
  channel: number,
  edgeMode: EdgeMode = 'clamp',
): number {
  const { bounds, data } = snapshot;
  const maxX = bounds.x + bounds.width - 1;
  const maxY = bounds.y + bounds.height - 1;
  let sourceX = Math.round(x);
  let sourceY = Math.round(y);
  if (edgeMode === 'wrap') {
    sourceX = wrap(sourceX, bounds.x, maxX);
    sourceY = wrap(sourceY, bounds.y, maxY);
  } else {
    sourceX = clamp(sourceX, bounds.x, maxX);
    sourceY = clamp(sourceY, bounds.y, maxY);
  }
  const offset = ((sourceY - bounds.y) * bounds.width + sourceX - bounds.x) * 4 + channel;
  return data[offset]!;
}

export function writeBlendedPixel(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  x: number,
  y: number,
  rgba: readonly number[],
  amount: number,
): void {
  const offset = pixelToByteOffset(x, y, imageWidth);
  const blend = clamp(amount, 0, 1);
  for (let channel = 0; channel < 4; channel += 1) {
    pixels[offset + channel] = Math.round(
      pixels[offset + channel]! * (1 - blend) + rgba[channel]! * blend,
    );
  }
}

export function structuralAmount(context: GlitchContext): number {
  return clamp(context.strength * context.pressure * context.settings.structuralIntensity, 0.05, 1);
}

export function maskAt(context: GlitchContext, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= context.width || y >= context.height) return 0;
  return context.mask[Math.floor(y) * context.width + Math.floor(x)] ?? 0;
}

export function pickMaskedPoint(
  context: GlitchContext,
  random: RandomSource,
  attempts = 18,
): Point {
  const { bounds } = context;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const point = {
      x: random.int(bounds.x, Math.max(bounds.x, bounds.x + bounds.width - 1)),
      y: random.int(bounds.y, Math.max(bounds.y, bounds.y + bounds.height - 1)),
    };
    if (maskAt(context, point.x, point.y) > 0.08) return point;
  }
  return {
    x: clamp(Math.floor(bounds.x + bounds.width / 2), 0, context.width - 1),
    y: clamp(Math.floor(bounds.y + bounds.height / 2), 0, context.height - 1),
  };
}

export function forEachPixel(
  rectangle: Rectangle,
  context: GlitchContext,
  visitor: (x: number, y: number, maskInfluence: number) => void,
): number {
  const writeBounds = context.writeBounds ?? context.bounds;
  const clipped = clipRectangle(
    {
      x: Math.max(rectangle.x, writeBounds.x),
      y: Math.max(rectangle.y, writeBounds.y),
      width:
        Math.min(rectangle.x + rectangle.width, writeBounds.x + writeBounds.width) -
        Math.max(rectangle.x, writeBounds.x),
      height:
        Math.min(rectangle.y + rectangle.height, writeBounds.y + writeBounds.height) -
        Math.max(rectangle.y, writeBounds.y),
    },
    context.width,
    context.height,
  );
  let touched = 0;
  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
      const maskInfluence = maskAt(context, x, y);
      if (maskInfluence <= 0.01) continue;
      visitor(x, y, maskInfluence);
      touched += 1;
    }
  }
  return touched;
}

export function averageRegion(
  snapshot: RegionSnapshot,
  rectangle: Rectangle,
): [number, number, number, number] {
  const clipped = clipRectangle(
    {
      x: Math.max(rectangle.x, snapshot.bounds.x),
      y: Math.max(rectangle.y, snapshot.bounds.y),
      width:
        Math.min(rectangle.x + rectangle.width, snapshot.bounds.x + snapshot.bounds.width) -
        Math.max(rectangle.x, snapshot.bounds.x),
      height:
        Math.min(rectangle.y + rectangle.height, snapshot.bounds.y + snapshot.bounds.height) -
        Math.max(rectangle.y, snapshot.bounds.y),
    },
    snapshot.bounds.x + snapshot.bounds.width,
    snapshot.bounds.y + snapshot.bounds.height,
  );
  const total = [0, 0, 0, 0];
  let count = 0;
  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        total[channel] += sampleRegion(snapshot, x, y, channel);
      }
      count += 1;
    }
  }
  if (!count) return [0, 0, 0, 255];
  return total.map((value) => Math.round(value / count)) as [number, number, number, number];
}

export function sourcePixel(
  snapshot: RegionSnapshot,
  x: number,
  y: number,
  edgeMode: EdgeMode = 'clamp',
): [number, number, number, number] {
  return [0, 1, 2, 3].map((channel) => sampleRegion(snapshot, x, y, channel, edgeMode)) as [
    number,
    number,
    number,
    number,
  ];
}
