import type {
  AlgorithmId,
  GlitchAlgorithm,
  GlitchContext,
  GlitchResult,
  Rectangle,
} from '../types';
import { clamp, mirrorCoordinate, pixelToByteOffset } from '../utils/geometry';
import { createSeededRandom, type RandomSource } from '../utils/prng';
import { legacyStructuralAlgorithms, structuralAlgorithms } from './structural';
import { advancedBrushAlgorithms } from './advancedBrush';

type PixelVisitor = (
  byteOffset: number,
  x: number,
  y: number,
  influence: number,
  random: RandomSource,
) => void;

function visitMask(context: GlitchContext, visitor: PixelVisitor): number {
  const { bounds, width, height, mask, strength, pressure, seed, settings } = context;
  const random = createSeededRandom(seed);
  let touched = 0;
  const right = Math.min(width, bounds.x + bounds.width);
  const bottom = Math.min(height, bounds.y + bounds.height);
  for (let y = Math.max(0, bounds.y); y < bottom; y += 1) {
    for (let x = Math.max(0, bounds.x); x < right; x += 1) {
      const influence = clamp(
        mask[y * width + x]! * strength * pressure * settings.microIntensity,
        0,
        1,
      );
      if (influence <= 0) continue;
      visitor(pixelToByteOffset(x, y, width), x, y, influence, random);
      touched += 1;
    }
  }
  return touched;
}

function result(bounds: Rectangle, touchedPixels: number): GlitchResult {
  return { bounds: { ...bounds }, touchedPixels };
}

const byteNoise: GlitchAlgorithm = {
  id: 'byte-noise',
  name: 'Pixel Noise (Legacy)',
  family: 'pixel',
  apply(context) {
    const { pixels, settings } = context;
    const touched = visitMask(context, (offset, _x, _y, influence, random) => {
      const maxChannel = settings.affectAlpha ? 4 : 3;
      for (let channel = 0; channel < maxChannel; channel += 1) {
        if (random.next() > settings.byteProbability * influence) continue;
        if (settings.fullRandom) {
          pixels[offset + channel] = random.int(0, 255);
        } else {
          const amount = random.int(settings.minDelta, settings.maxDelta);
          const direction = random.next() > 0.5 ? 1 : -1;
          pixels[offset + channel] = clamp(pixels[offset + channel]! + amount * direction, 0, 255);
        }
      }
    });
    return result(context.bounds, touched);
  },
};

function createPaddedSnapshot(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: Rectangle,
  padding: number,
): { data: Uint8ClampedArray; x: number; y: number; width: number; height: number } {
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const right = Math.min(width, bounds.x + bounds.width + padding);
  const bottom = Math.min(height, bounds.y + bounds.height + padding);
  const snapshotWidth = right - x;
  const snapshotHeight = bottom - y;
  const data = new Uint8ClampedArray(snapshotWidth * snapshotHeight * 4);
  for (let row = 0; row < snapshotHeight; row += 1) {
    const sourceStart = ((y + row) * width + x) * 4;
    data.set(
      pixels.subarray(sourceStart, sourceStart + snapshotWidth * 4),
      row * snapshotWidth * 4,
    );
  }
  return { data, x, y, width: snapshotWidth, height: snapshotHeight };
}

const channelShift: GlitchAlgorithm = {
  id: 'channel-shift',
  name: 'Channel Shift',
  family: 'pixel',
  apply(context) {
    const { pixels, width, height, settings } = context;
    const configured = [...settings.shiftR, ...settings.shiftG, ...settings.shiftB];
    const maxShift = Math.max(1, ...configured.map((value) => Math.abs(value)));
    const source = createPaddedSnapshot(pixels, width, height, context.bounds, maxShift);
    const shifts = [settings.shiftR, settings.shiftG, settings.shiftB] as const;
    const touched = visitMask(context, (offset, x, y, influence, random) => {
      for (let channel = 0; channel < 3; channel += 1) {
        if (random.next() > influence) continue;
        const configuredShift = shifts[channel]!;
        const dx = settings.randomShift ? random.int(-maxShift, maxShift) : configuredShift[0];
        const dy = settings.randomShift ? random.int(-maxShift, maxShift) : configuredShift[1];
        const sampleX = settings.mirrorEdges
          ? mirrorCoordinate(x + dx, width)
          : clamp(x + dx, 0, width - 1);
        const sampleY = settings.mirrorEdges
          ? mirrorCoordinate(y + dy, height)
          : clamp(y + dy, 0, height - 1);
        if (
          sampleX >= source.x &&
          sampleX < source.x + source.width &&
          sampleY >= source.y &&
          sampleY < source.y + source.height
        ) {
          const sourceOffset =
            ((sampleY - source.y) * source.width + (sampleX - source.x)) * 4 + channel;
          pixels[offset + channel] = source.data[sourceOffset]!;
        }
      }
    });
    return result(context.bounds, touched);
  },
};

export function swapChannels(
  pixels: Uint8ClampedArray,
  offset: number,
  mode: 'bgr' | 'grb' | 'cycle',
): void {
  const red = pixels[offset]!;
  const green = pixels[offset + 1]!;
  const blue = pixels[offset + 2]!;
  if (mode === 'bgr') {
    pixels[offset] = blue;
    pixels[offset + 1] = green;
    pixels[offset + 2] = red;
  } else if (mode === 'grb') {
    pixels[offset] = green;
    pixels[offset + 1] = red;
    pixels[offset + 2] = blue;
  } else {
    pixels[offset] = blue;
    pixels[offset + 1] = red;
    pixels[offset + 2] = green;
  }
}

const byteSwap: GlitchAlgorithm = {
  id: 'byte-swap',
  name: 'Byte Swap',
  family: 'pixel',
  apply(context) {
    const { pixels, settings, width } = context;
    const modes = ['bgr', 'grb', 'cycle'] as const;
    const touched = visitMask(context, (offset, x, _y, influence, random) => {
      if (random.next() > influence) return;
      if (settings.swapMode === 'neighbor' && x < width - 1) {
        const neighbor = offset + 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const value = pixels[offset + channel]!;
          pixels[offset + channel] = pixels[neighbor + channel]!;
          pixels[neighbor + channel] = value;
        }
        return;
      }
      const mode = settings.swapMode === 'random' ? random.pick(modes) : settings.swapMode;
      swapChannels(pixels, offset, mode === 'neighbor' ? 'cycle' : mode);
    });
    return result(context.bounds, touched);
  },
};

export function flipBits(value: number, bits: readonly number[]): number {
  return bits.reduce((current, bit) => current ^ (1 << bit), value) & 0xff;
}

const bitFlip: GlitchAlgorithm = {
  id: 'bit-flip',
  name: 'Bit Flip',
  family: 'pixel',
  apply(context) {
    const { pixels, settings } = context;
    const touched = visitMask(context, (offset, _x, _y, influence, random) => {
      for (let channel = 0; channel < (settings.affectAlpha ? 4 : 3); channel += 1) {
        if (random.next() > settings.bitProbability * influence) continue;
        const bits = Array.from({ length: settings.bitCount }, () =>
          random.int(settings.bitMin, settings.bitMax),
        );
        pixels[offset + channel] = flipBits(pixels[offset + channel]!, bits);
      }
    });
    return result(context.bounds, touched);
  },
};

const blockCorruption: GlitchAlgorithm = {
  id: 'block-corruption',
  name: 'Legacy Block Corruption',
  family: 'block',
  apply(context) {
    const { pixels, width, height, mask, settings, strength, pressure, seed, bounds } = context;
    const random = createSeededRandom(seed);
    const source = createPaddedSnapshot(pixels, width, height, bounds, settings.blockMax);
    const attempts = Math.max(1, Math.round((bounds.width * bounds.height) / 5000));
    let touched = 0;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const blockWidth = random.int(settings.blockMin, settings.blockMax);
      const blockHeight =
        random.next() > 0.5
          ? random.int(2, Math.max(2, blockWidth / 3))
          : random.int(settings.blockMin, settings.blockMax);
      const startX = random.int(bounds.x, Math.max(bounds.x, bounds.x + bounds.width - 1));
      const startY = random.int(bounds.y, Math.max(bounds.y, bounds.y + bounds.height - 1));
      const dx = random.int(-settings.blockMax, settings.blockMax);
      const dy = random.int(-settings.blockMax, settings.blockMax);
      for (let y = startY; y < Math.min(height, startY + blockHeight); y += 1) {
        for (let x = startX; x < Math.min(width, startX + blockWidth); x += 1) {
          const influence = mask[y * width + x]! * strength * pressure;
          if (influence <= 0 || random.next() > influence) continue;
          const sampleX = clamp(x + dx, source.x, source.x + source.width - 1);
          const sampleY = clamp(y + dy, source.y, source.y + source.height - 1);
          const destination = pixelToByteOffset(x, y, width);
          const sourceOffset = ((sampleY - source.y) * source.width + (sampleX - source.x)) * 4;
          pixels.set(source.data.subarray(sourceOffset, sourceOffset + 4), destination);
          touched += 1;
        }
      }
    }
    return result(bounds, touched);
  },
};

const dataSmear: GlitchAlgorithm = {
  id: 'data-smear',
  name: 'Legacy Pixel Smear',
  family: 'pixel',
  apply(context) {
    const { pixels, width, height, settings, movement } = context;
    const movementAngle =
      movement && (movement.x !== 0 || movement.y !== 0)
        ? Math.atan2(movement.y, movement.x)
        : (settings.smearAngle * Math.PI) / 180;
    const dx = Math.cos(movementAngle);
    const dy = Math.sin(movementAngle);
    const source = createPaddedSnapshot(
      pixels,
      width,
      height,
      context.bounds,
      settings.smearLength,
    );
    const touched = visitMask(context, (offset, x, y, influence, random) => {
      if (random.next() > influence) return;
      const distance = random.int(1, settings.smearLength);
      const sampleX = clamp(Math.round(x - dx * distance), source.x, source.x + source.width - 1);
      const sampleY = clamp(Math.round(y - dy * distance), source.y, source.y + source.height - 1);
      const sourceOffset = ((sampleY - source.y) * source.width + (sampleX - source.x)) * 4;
      pixels.set(source.data.subarray(sourceOffset, sourceOffset + 3), offset);
    });
    return result(context.bounds, touched);
  },
};

const scanline: GlitchAlgorithm = {
  id: 'scanline',
  name: 'Legacy Scanline',
  family: 'line',
  apply(context) {
    const { pixels, width, settings } = context;
    const cycle = Math.max(1, settings.scanThickness + settings.scanGap);
    const touched = visitMask(context, (offset, x, y, influence, random) => {
      if (y % cycle >= settings.scanThickness || random.next() > influence) return;
      const shift = Math.max(1, Math.round(settings.maxDelta / 2));
      const sourceX = clamp(x + random.int(-shift, shift), 0, width - 1);
      const sourceOffset = pixelToByteOffset(sourceX, y, width);
      pixels[offset] = pixels[sourceOffset + 1]!;
      pixels[offset + 1] = pixels[sourceOffset + 2]!;
      pixels[offset + 2] = pixels[sourceOffset]!;
    });
    return result(context.bounds, touched);
  },
};

const compression: GlitchAlgorithm = {
  id: 'compression',
  name: 'Legacy Compression',
  family: 'block',
  apply(context) {
    const { pixels, width, height, mask, settings, strength, pressure, bounds } = context;
    const size = settings.blockSize;
    let touched = 0;
    for (let blockY = bounds.y; blockY < bounds.y + bounds.height; blockY += size) {
      for (let blockX = bounds.x; blockX < bounds.x + bounds.width; blockX += size) {
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let y = blockY; y < Math.min(height, blockY + size); y += 1) {
          for (let x = blockX; x < Math.min(width, blockX + size); x += 1) {
            if (mask[y * width + x]! <= 0) continue;
            const offset = pixelToByteOffset(x, y, width);
            red += pixels[offset]!;
            green += pixels[offset + 1]!;
            blue += pixels[offset + 2]!;
            count += 1;
          }
        }
        if (!count) continue;
        const average = [red / count, green / count, blue / count];
        for (let y = blockY; y < Math.min(height, blockY + size); y += 1) {
          for (let x = blockX; x < Math.min(width, blockX + size); x += 1) {
            const influence = mask[y * width + x]! * strength * pressure;
            if (influence <= 0) continue;
            const offset = pixelToByteOffset(x, y, width);
            for (let channel = 0; channel < 3; channel += 1) {
              const quantized = Math.round(average[channel]! / 24) * 24;
              pixels[offset + channel] = Math.round(
                pixels[offset + channel]! * (1 - influence) + quantized * influence,
              );
            }
            touched += 1;
          }
        }
      }
    }
    return result(bounds, touched);
  },
};

const paletteCollapse: GlitchAlgorithm = {
  id: 'palette-collapse',
  name: 'Palette Collapse',
  family: 'pixel',
  apply(context) {
    const { pixels, settings } = context;
    const levels = Math.max(2, settings.paletteLevels);
    const step = 255 / (levels - 1);
    const touched = visitMask(context, (offset, x, y, influence, random) => {
      for (let channel = 0; channel < 3; channel += 1) {
        if (random.next() > influence) continue;
        const dither = settings.dither ? (((x + y) % 2 === 0 ? -1 : 1) * step) / 5 : 0;
        pixels[offset + channel] = clamp(
          Math.round((pixels[offset + channel]! + dither) / step) * step,
          0,
          255,
        );
      }
    });
    return result(context.bounds, touched);
  },
};

const baseAlgorithms: GlitchAlgorithm[] = [
  byteNoise,
  channelShift,
  byteSwap,
  bitFlip,
  dataSmear,
  scanline,
  compression,
  paletteCollapse,
];

const mixed: GlitchAlgorithm = {
  id: 'mixed',
  name: 'Legacy Mixed Noise',
  family: 'mixed',
  apply(context) {
    const random = createSeededRandom(context.seed);
    const count = clamp(context.settings.mixedEffects, 1, 4);
    let touched = 0;
    for (let index = 0; index < count; index += 1) {
      const algorithm = random.pick(baseAlgorithms);
      touched += algorithm.apply({
        ...context,
        seed: `${context.seed}:mix:${index}:${algorithm.id}`,
        strength: context.strength / Math.sqrt(count),
      }).touchedPixels;
    }
    return result(context.bounds, touched);
  },
};

export const algorithms: Record<AlgorithmId, GlitchAlgorithm> = Object.fromEntries(
  [
    ...advancedBrushAlgorithms,
    ...structuralAlgorithms,
    ...legacyStructuralAlgorithms,
    ...baseAlgorithms,
    mixed,
  ].map((algorithm) => [algorithm.id, algorithm]),
) as Record<AlgorithmId, GlitchAlgorithm>;

export const algorithmList = [...advancedBrushAlgorithms, ...structuralAlgorithms];

export const legacyAlgorithmList = [paletteCollapse, channelShift, byteSwap];

export const defaultAlgorithmSettings = {
  microIntensity: 0.62,
  structuralIntensity: 0.92,
  spill: 'small' as const,
  byteProbability: 0.34,
  minDelta: 18,
  maxDelta: 150,
  affectAlpha: false,
  fullRandom: false,
  shiftR: [14, 0] as [number, number],
  shiftG: [-5, 2] as [number, number],
  shiftB: [-14, 0] as [number, number],
  randomShift: false,
  mirrorEdges: true,
  swapMode: 'random' as const,
  bitCount: 2,
  bitProbability: 0.28,
  bitMin: 0,
  bitMax: 7,
  blockMin: 6,
  blockMax: 42,
  smearLength: 36,
  smearAngle: 0,
  scanThickness: 2,
  scanGap: 5,
  blockSize: 8 as const,
  paletteLevels: 6,
  dither: true,
  mixedEffects: 2,
  sliceOrientation: 'horizontal' as const,
  sliceMinThickness: 6,
  sliceMaxThickness: 24,
  sliceMinOffset: 18,
  sliceMaxOffset: 92,
  sliceCount: 3,
  sliceEdgeMode: 'clamp' as const,
  macroblockMinSize: 12,
  macroblockMaxSize: 42,
  macroblockOffset: 70,
  macroblockDuplicateChance: 0.28,
  macroblockNeighborChance: 0.42,
  macroblockSwapChance: 0.24,
  macroblockStretchChance: 0.2,
  blockCorruptionMode: 'mixed-packet-loss' as const,
  blockCorruptionDirection: 'horizontal' as const,
  blockCorruptionMix: 0.92,
  structuralDensity: 0.64,
  datamoshLength: 170,
  datamoshDirection: 'stroke' as const,
  datamoshBlockHeight: 18,
  datamoshBlockWidth: 40,
  datamoshPersistence: 0.96,
  datamoshDecay: 0.48,
  datamoshBlend: 0.94,
  datamoshJitter: 12,
  datamoshChroma: 8,
  datamoshLumaHold: 0.08,
  packetBlockSize: 22,
  packetLossDensity: 0.48,
  packetRepeatRadius: 70,
  packetFlatChance: 0.24,
  packetAlignment: 8,
  packetEdgeTear: 0.55,
  rgbRegionSize: 96,
  rgbChunkOffset: 18,
  rgbChunkBlend: 0.96,
  rgbRandomOffset: true,
  rgbEdgeSoftness: 4,
  compressionTileSize: 16 as const,
  compressionQuantization: 0.72,
  compressionReplication: 0.34,
  compressionScramble: 0.26,
  compressionTileOffset: 0.3,
  compressionContrast: 1.35,
  compressionChromaLoss: 0.28,
  codecBlockDamageMode: 'mixed-codec-failure' as const,
  codecHighFrequencyLoss: 0.62,
  codecCoefficientDropout: 0.24,
  codecBoundaryStrength: 0.3,
  codecRinging: 0.18,
  codecMix: 0.9,
  tearBandCount: 5,
  tearMinThickness: 3,
  tearMaxThickness: 18,
  tearShift: 86,
  tearDuplication: 0.36,
  tearDropout: 0.16,
  tearColorSplit: 9,
  tearJitter: 14,
  tileGridSize: 24,
  tileShuffle: 0.66,
  tilePreserveBorder: false,
  tileRepeat: 0.24,
  tileDrop: 0.12,
  repeatOrientation: 'horizontal' as const,
  repeatLength: 6,
  repeatCount: 7,
  repeatJitter: 5,
  repeatFade: 0.5,
  structuralMixCount: 3,
  structuralMixMinEffects: 2,
  structuralMixMaxEffects: 3,
  structuralMixPool: [
    'slice-displacement',
    'block-corruption',
    'datamosh-smear',
    'rgb-chunk-split',
    'scanline-tear-pro',
    'codec-block-damage',
    'row-column-repeat',
    'pixel-sort-brush',
    'feedback-brush',
    'displacement-brush',
    'flow-mosh-brush',
    'clone-corruption-brush',
    'line-freeze-brush',
  ] as AlgorithmId[],
  sortBrushDirection: 'stroke' as const,
  sortBrushProperty: 'luminance' as const,
  sortBrushThresholdLow: 54,
  sortBrushThresholdHigh: 236,
  sortBrushIntervalMin: 10,
  sortBrushIntervalMax: 220,
  sortBrushReverse: false,
  sortBrushDisorder: 0.08,
  sortBrushEdgeSoftness: 5,
  sortBrushLength: 180,
  sortBrushSpill: 18,
  feedbackBrushEchoCount: 6,
  feedbackBrushOffsetX: 16,
  feedbackBrushOffsetY: 5,
  feedbackBrushScale: 1.012,
  feedbackBrushRotation: 0.6,
  feedbackBrushOpacityDecay: 0.72,
  feedbackBrushBrightnessDecay: 0.98,
  feedbackBrushBlendMode: 'normal' as const,
  feedbackBrushRgbDelay: 4,
  feedbackBrushPersistence: 0.82,
  displacementBrushSource: 'noise' as const,
  displacementBrushStrengthX: 34,
  displacementBrushStrengthY: 20,
  displacementBrushScale: 72,
  displacementBrushRoughness: 0.55,
  displacementBrushOctaves: 3,
  displacementBrushInterpolation: 'nearest' as const,
  displacementBrushEdgeMode: 'clamp' as const,
  displacementBrushIterations: 2,
  displacementBrushSpill: 22,
  flowBrushBlockSize: 14,
  flowBrushPropagation: 150,
  flowBrushIterations: 5,
  flowBrushDirectionInfluence: 0.88,
  flowBrushVectorPersistence: 0.82,
  flowBrushJitter: 0.18,
  flowBrushDecay: 0.22,
  flowBrushOverwrite: false,
  flowBrushLumaLock: 0.12,
  flowBrushChromaLag: 7,
  flowBrushTrailWidth: 48,
  flowBrushFallbackAngle: 0,
  cloneBrushMode: 'fragment' as const,
  cloneBrushAlignment: 'non-aligned' as const,
  cloneBrushScaleJitter: 0.08,
  cloneBrushRotationJitter: 4,
  cloneBrushChannelSplit: 5,
  cloneBrushTileFragmentation: 0.3,
  cloneBrushRepetition: 3,
  cloneBrushDecay: 0.72,
  cloneBrushBlockSize: 18,
  cloneBrushBlend: 0.9,
  lineBrushOrientation: 'stroke' as const,
  lineBrushSource: 'center' as const,
  lineBrushRepeatCount: 8,
  lineBrushStretch: 2.2,
  lineBrushJitter: 3,
  lineBrushRgbSplit: 5,
  lineBrushDropout: 0.08,
  lineBrushThickness: 4,
  lineBrushSpill: 28,
};
