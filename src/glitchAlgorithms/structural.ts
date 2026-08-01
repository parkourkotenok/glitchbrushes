import type {
  GlitchAlgorithm,
  GlitchContext,
  GlitchResult,
  Orientation,
  Point,
  Rectangle,
} from '../types';
import { clamp } from '../utils/geometry';
import { createSeededRandom } from '../utils/prng';
import {
  averageRegion,
  extractRegion,
  forEachPixel,
  maskAt,
  pickMaskedPoint,
  sampleRegion,
  sourcePixel,
  structuralAmount,
  writeBlendedPixel,
} from './structuralUtils';

function result(context: GlitchContext, touchedPixels: number): GlitchResult {
  return {
    bounds: { ...(context.writeBounds ?? context.bounds) },
    touchedPixels,
  };
}

function chooseOrientation(
  orientation: Orientation,
  random: ReturnType<typeof createSeededRandom>,
): 'horizontal' | 'vertical' {
  if (orientation === 'mixed') return random.next() > 0.5 ? 'horizontal' : 'vertical';
  return orientation;
}

function signedOffset(
  random: ReturnType<typeof createSeededRandom>,
  minimum: number,
  maximum: number,
): number {
  const distance = random.int(Math.max(1, minimum), Math.max(minimum, maximum));
  return random.next() > 0.5 ? distance : -distance;
}

function structuralCount(base: number, context: GlitchContext, minimum = 1): number {
  return Math.max(
    minimum,
    Math.round(base * clamp(context.settings.structuralIntensity, 0.2, 1.6)),
  );
}

const sliceDisplacement: GlitchAlgorithm = {
  id: 'slice-displacement',
  name: 'Slice Displacement',
  family: 'region',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context);
    const count = structuralCount(settings.sliceCount, context, 1);
    let touched = 0;

    for (let slice = 0; slice < count; slice += 1) {
      const point = pickMaskedPoint(context, random);
      const orientation = chooseOrientation(settings.sliceOrientation, random);
      const thickness = random.int(settings.sliceMinThickness, settings.sliceMaxThickness);
      const offset =
        signedOffset(random, settings.sliceMinOffset, settings.sliceMaxOffset) *
        Math.max(0.45, settings.structuralIntensity);
      const rectangle: Rectangle =
        orientation === 'horizontal'
          ? {
              x: bounds.x,
              y: point.y - Math.floor(thickness / 2),
              width: bounds.width,
              height: thickness,
            }
          : {
              x: point.x - Math.floor(thickness / 2),
              y: bounds.y,
              width: thickness,
              height: bounds.height,
            };
      touched += forEachPixel(rectangle, context, (x, y) => {
        const sourceX = orientation === 'horizontal' ? x - offset : x;
        const sourceY = orientation === 'vertical' ? y - offset : y;
        writeBlendedPixel(
          pixels,
          width,
          x,
          y,
          sourcePixel(snapshot, sourceX, sourceY, settings.sliceEdgeMode),
          amount,
        );
      });
    }
    return result(context, touched);
  },
};

const macroblockShift: GlitchAlgorithm = {
  id: 'macroblock-shift',
  name: 'Macroblock Shift',
  family: 'block',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context);
    const averageSize = Math.max(4, (settings.macroblockMinSize + settings.macroblockMaxSize) / 2);
    const estimated = (bounds.width * bounds.height) / (averageSize * averageSize);
    const count = Math.max(
      2,
      Math.round(estimated * settings.structuralDensity * (1.4 + settings.structuralIntensity)),
    );
    let touched = 0;

    for (let block = 0; block < count; block += 1) {
      const point = pickMaskedPoint(context, random);
      const blockWidth = random.int(settings.macroblockMinSize, settings.macroblockMaxSize);
      const blockHeight = random.int(settings.macroblockMinSize, settings.macroblockMaxSize);
      const destination = {
        x: point.x - Math.floor(blockWidth / 2),
        y: point.y - Math.floor(blockHeight / 2),
        width: blockWidth,
        height: blockHeight,
      };
      const dx = signedOffset(
        random,
        Math.max(3, settings.macroblockOffset / 4),
        settings.macroblockOffset,
      );
      const dy = signedOffset(random, 1, Math.max(2, settings.macroblockOffset / 2));
      const roll = random.next();
      const stretch =
        roll < settings.macroblockStretchChance ? (random.next() > 0.5 ? 1.75 : 0.56) : 1;
      const copyFromNeighbor =
        roll < settings.macroblockStretchChance + settings.macroblockNeighborChance;
      const sourceOrigin = copyFromNeighbor
        ? { x: destination.x + dx, y: destination.y + dy }
        : { x: destination.x - dx, y: destination.y - dy };

      touched += forEachPixel(destination, context, (x, y) => {
        const localX = (x - destination.x) / stretch;
        const localY = y - destination.y;
        writeBlendedPixel(
          pixels,
          width,
          x,
          y,
          sourcePixel(snapshot, sourceOrigin.x + localX, sourceOrigin.y + localY, 'clamp'),
          amount,
        );
      });

      if (
        roll <
        settings.macroblockStretchChance +
          settings.macroblockNeighborChance +
          settings.macroblockDuplicateChance
      ) {
        const duplicate = {
          ...destination,
          x: destination.x + Math.round(dx * 0.72),
          y: destination.y + Math.round(dy * 0.72),
        };
        touched += forEachPixel(duplicate, context, (x, y) => {
          writeBlendedPixel(
            pixels,
            width,
            x,
            y,
            sourcePixel(
              snapshot,
              destination.x + (x - duplicate.x),
              destination.y + (y - duplicate.y),
            ),
            amount * 0.88,
          );
        });
      }

      if (roll > 1 - settings.macroblockSwapChance) {
        const swapTarget = { ...destination, x: destination.x + dx, y: destination.y + dy };
        touched += forEachPixel(swapTarget, context, (x, y) => {
          writeBlendedPixel(
            pixels,
            width,
            x,
            y,
            sourcePixel(
              snapshot,
              destination.x + (x - swapTarget.x),
              destination.y + (y - swapTarget.y),
            ),
            amount,
          );
        });
      }
    }
    return result(context, touched);
  },
};

function smearVector(context: GlitchContext, random: ReturnType<typeof createSeededRandom>): Point {
  const { settings, movement } = context;
  let angle = (settings.smearAngle * Math.PI) / 180;
  if (
    settings.datamoshDirection === 'stroke' &&
    movement &&
    (Math.abs(movement.x) > 0.01 || Math.abs(movement.y) > 0.01)
  ) {
    angle = Math.atan2(movement.y, movement.x);
  } else if (settings.datamoshDirection === 'random') {
    angle = random.next() * Math.PI * 2;
  }
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

const datamoshSmear: GlitchAlgorithm = {
  id: 'datamosh-smear',
  name: 'Datamosh Smear',
  family: 'datamosh',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context) * settings.datamoshBlend;
    const direction = smearVector(context, random);
    const perpendicular = { x: -direction.y, y: direction.x };
    const trailLength = Math.max(
      settings.datamoshBlockWidth,
      settings.datamoshLength * settings.structuralIntensity,
    );
    const steps = Math.max(
      2,
      Math.round(
        (trailLength / Math.max(4, settings.datamoshBlockWidth * 0.55)) *
          settings.datamoshPersistence,
      ),
    );
    const clusterCount = structuralCount(
      Math.max(1, Math.round((bounds.width * bounds.height) / 22000)),
      context,
      2,
    );
    let touched = 0;

    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      const origin = pickMaskedPoint(context, random);
      const blockWidth = Math.max(6, settings.datamoshBlockWidth);
      const blockHeight = Math.max(3, settings.datamoshBlockHeight);
      const sourceRect = {
        x: origin.x - Math.floor(blockWidth / 2),
        y: origin.y - Math.floor(blockHeight / 2),
        width: blockWidth,
        height: blockHeight,
      };
      for (let step = 0; step < steps; step += 1) {
        const progress = (step + 1) / steps;
        const distance = trailLength * progress;
        const jitter = (random.next() - 0.5) * settings.datamoshJitter;
        const destination = {
          ...sourceRect,
          x: sourceRect.x + direction.x * distance + perpendicular.x * jitter,
          y: sourceRect.y + direction.y * distance + perpendicular.y * jitter,
        };
        const decay = Math.pow(1 - progress * settings.datamoshDecay, 1.35);
        touched += forEachPixel(destination, context, (x, y) => {
          const sourceX = sourceRect.x + (x - destination.x);
          const sourceY = sourceRect.y + (y - destination.y);
          const chromaShift = settings.datamoshChroma * (0.25 + progress);
          const rgba: [number, number, number, number] = [
            sampleRegion(
              snapshot,
              sourceX + perpendicular.x * chromaShift,
              sourceY + perpendicular.y * chromaShift,
              0,
            ),
            sampleRegion(snapshot, sourceX, sourceY, 1),
            sampleRegion(
              snapshot,
              sourceX - perpendicular.x * chromaShift,
              sourceY - perpendicular.y * chromaShift,
              2,
            ),
            sampleRegion(snapshot, sourceX, sourceY, 3),
          ];
          if (settings.datamoshLumaHold > 0) {
            const held = sourcePixel(snapshot, sourceX, sourceY);
            const luma = held[0] * 0.299 + held[1] * 0.587 + held[2] * 0.114;
            for (let channel = 0; channel < 3; channel += 1) {
              rgba[channel] = Math.round(
                rgba[channel] * (1 - settings.datamoshLumaHold) + luma * settings.datamoshLumaHold,
              );
            }
          }
          writeBlendedPixel(pixels, width, x, y, rgba, amount * decay);
        });
      }
    }
    return result(context, touched);
  },
};

const packetLoss: GlitchAlgorithm = {
  id: 'packet-loss',
  name: 'Packet Loss',
  family: 'block',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context);
    const blockSize = Math.max(4, settings.packetBlockSize);
    const count = Math.max(
      2,
      Math.round(
        ((bounds.width * bounds.height) / (blockSize * blockSize)) *
          settings.packetLossDensity *
          (1 + settings.structuralIntensity),
      ),
    );
    let touched = 0;

    for (let index = 0; index < count; index += 1) {
      const point = pickMaskedPoint(context, random);
      const alignment = Math.max(1, settings.packetAlignment);
      const rectangle = {
        x: Math.floor((point.x - blockSize / 2) / alignment) * alignment,
        y: Math.floor((point.y - blockSize / 2) / alignment) * alignment,
        width: blockSize * random.int(1, 3),
        height: Math.max(3, Math.round(blockSize * random.int(1, 2) * 0.65)),
      };
      const flat = random.next() < settings.packetFlatChance;
      const fill = averageRegion(snapshot, {
        ...rectangle,
        x: rectangle.x - settings.packetRepeatRadius,
      });
      const dx = signedOffset(random, 2, settings.packetRepeatRadius);
      const dy = random.int(-Math.round(blockSize / 2), Math.round(blockSize / 2));
      touched += forEachPixel(rectangle, context, (x, y) => {
        const rowTear =
          (y - rectangle.y) % Math.max(2, Math.round(blockSize / 4)) <
          Math.round(settings.packetEdgeTear * 3)
            ? dx * 0.4
            : 0;
        const rgba = flat ? fill : sourcePixel(snapshot, x + dx + rowTear, y + dy, 'clamp');
        writeBlendedPixel(pixels, width, x, y, rgba, amount);
      });
    }
    return result(context, touched);
  },
};

const blockCorruption: GlitchAlgorithm = {
  id: 'block-corruption',
  name: 'Block Corruption',
  family: 'block',
  apply(context) {
    const { settings } = context;
    const directionSeed = `${context.seed}:direction:${settings.blockCorruptionDirection}`;
    const runMacroblock = (overrides: Partial<typeof settings>, suffix: string, strength = 1) =>
      macroblockShift.apply({
        ...context,
        seed: `${directionSeed}:${suffix}`,
        strength: context.strength * settings.blockCorruptionMix * strength,
        settings: { ...settings, ...overrides },
      });
    const runPacket = (overrides: Partial<typeof settings>, suffix: string, strength = 1) =>
      packetLoss.apply({
        ...context,
        seed: `${directionSeed}:${suffix}`,
        strength: context.strength * settings.blockCorruptionMix * strength,
        settings: { ...settings, ...overrides },
      });

    if (settings.blockCorruptionMode === 'shift') {
      return runMacroblock(
        {
          macroblockDuplicateChance: 0,
          macroblockNeighborChance: 0,
          macroblockSwapChance: 0,
          macroblockStretchChance: 0,
        },
        'shift',
      );
    }
    if (settings.blockCorruptionMode === 'repeat') {
      return runMacroblock(
        {
          macroblockDuplicateChance: 1,
          macroblockNeighborChance: 0,
          macroblockSwapChance: 0,
          macroblockStretchChance: 0,
        },
        'repeat',
      );
    }
    if (settings.blockCorruptionMode === 'dropout') {
      return runPacket({ packetFlatChance: 1, packetEdgeTear: 0.85 }, 'dropout');
    }
    if (settings.blockCorruptionMode === 'neighbor-inherit') {
      return runMacroblock(
        {
          macroblockDuplicateChance: 0,
          macroblockNeighborChance: 1,
          macroblockSwapChance: 0,
          macroblockStretchChance: 0,
        },
        'neighbor',
      );
    }
    if (settings.blockCorruptionMode === 'swap') {
      return runMacroblock(
        {
          macroblockDuplicateChance: 0,
          macroblockNeighborChance: 0,
          macroblockSwapChance: 1,
          macroblockStretchChance: 0,
        },
        'swap',
      );
    }
    if (settings.blockCorruptionMode === 'stretch') {
      return runMacroblock(
        {
          macroblockDuplicateChance: 0,
          macroblockNeighborChance: 0,
          macroblockSwapChance: 0,
          macroblockStretchChance: 1,
        },
        'stretch',
      );
    }
    const packet = runPacket({}, 'mixed-packet', 0.9);
    const macro = runMacroblock({}, 'mixed-block', 0.62);
    return { bounds: packet.bounds, touchedPixels: packet.touchedPixels + macro.touchedPixels };
  },
};

const rgbChunkSplit: GlitchAlgorithm = {
  id: 'rgb-chunk-split',
  name: 'RGB Chunk Split',
  family: 'region',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context) * settings.rgbChunkBlend;
    const count = structuralCount(Math.max(1, Math.round(settings.sliceCount / 2)), context, 1);
    let touched = 0;

    for (let chunk = 0; chunk < count; chunk += 1) {
      const point = pickMaskedPoint(context, random);
      const regionWidth = Math.min(
        bounds.width,
        random.int(Math.max(12, settings.rgbRegionSize / 2), settings.rgbRegionSize),
      );
      const regionHeight = Math.min(
        bounds.height,
        random.int(Math.max(8, settings.rgbRegionSize / 3), settings.rgbRegionSize),
      );
      const rectangle = {
        x: point.x - Math.floor(regionWidth / 2),
        y: point.y - Math.floor(regionHeight / 2),
        width: regionWidth,
        height: regionHeight,
      };
      const offset = settings.rgbRandomOffset
        ? signedOffset(random, 4, settings.rgbChunkOffset)
        : settings.rgbChunkOffset;
      touched += forEachPixel(rectangle, context, (x, y) => {
        const edgeX = Math.min(x - rectangle.x, rectangle.x + rectangle.width - 1 - x);
        const edgeY = Math.min(y - rectangle.y, rectangle.y + rectangle.height - 1 - y);
        const softness = Math.max(1, settings.rgbEdgeSoftness);
        const edgeBlend = clamp(Math.min(edgeX, edgeY) / softness, 0.2, 1);
        writeBlendedPixel(
          pixels,
          width,
          x,
          y,
          [
            sampleRegion(snapshot, x - offset, y, 0),
            sampleRegion(snapshot, x, y, 1),
            sampleRegion(snapshot, x + offset, y, 2),
            sampleRegion(snapshot, x, y, 3),
          ],
          amount * edgeBlend,
        );
      });
    }
    return result(context, touched);
  },
};

const compressionBlockDamage: GlitchAlgorithm = {
  id: 'compression-block-damage',
  name: 'Compression Block Damage',
  family: 'block',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context);
    const tile = settings.compressionTileSize;
    const startX = Math.floor(bounds.x / tile) * tile;
    const startY = Math.floor(bounds.y / tile) * tile;
    let touched = 0;

    for (let y = startY; y < bounds.y + bounds.height; y += tile) {
      for (let x = startX; x < bounds.x + bounds.width; x += tile) {
        if (
          maskAt(context, x + tile / 2, y + tile / 2) <= 0.04 &&
          random.next() > settings.structuralDensity
        ) {
          continue;
        }
        const rectangle = { x, y, width: tile, height: tile };
        const roll = random.next();
        const dx =
          roll < settings.compressionScramble + settings.compressionTileOffset
            ? signedOffset(random, tile, tile * 4)
            : 0;
        const dy = roll < settings.compressionScramble ? signedOffset(random, tile, tile * 2) : 0;
        const average = averageRegion(snapshot, { ...rectangle, x: x + dx, y: y + dy });
        const levels = Math.max(2, Math.round(18 - settings.compressionQuantization * 16));
        const step = 255 / (levels - 1);
        touched += forEachPixel(rectangle, context, (pixelX, pixelY) => {
          const displacedRgba = sourcePixel(snapshot, pixelX + dx, pixelY + dy);
          const localRgba = sourcePixel(snapshot, pixelX, pixelY);
          const sourceRgba = roll < settings.compressionReplication ? displacedRgba : localRgba;
          const rgba = sourceRgba.slice() as [number, number, number, number];
          for (let channel = 0; channel < 3; channel += 1) {
            rgba[channel] = Math.round(
              sourceRgba[channel]! * (1 - settings.codecHighFrequencyLoss) +
                average[channel]! * settings.codecHighFrequencyLoss,
            );
            if (random.next() < settings.codecCoefficientDropout) {
              rgba[channel] = average[channel]!;
            }
          }
          for (let channel = 0; channel < 3; channel += 1) {
            rgba[channel] = Math.round(rgba[channel]! / step) * step;
            rgba[channel] = clamp(
              (rgba[channel]! - 128) * settings.compressionContrast + 128,
              0,
              255,
            );
          }
          if (settings.compressionChromaLoss > 0) {
            const luma = rgba[0] * 0.299 + rgba[1] * 0.587 + rgba[2] * 0.114;
            for (let channel = 0; channel < 3; channel += 1) {
              rgba[channel] = Math.round(
                rgba[channel]! * (1 - settings.compressionChromaLoss) +
                  luma * settings.compressionChromaLoss,
              );
            }
          }
          const localX = (((pixelX - x) % tile) + tile) % tile;
          const localY = (((pixelY - y) % tile) + tile) % tile;
          const boundary =
            localX === 0 || localY === 0 || localX === tile - 1 || localY === tile - 1;
          if (boundary && settings.codecBoundaryStrength > 0) {
            const boundaryGain = 1 - settings.codecBoundaryStrength * 0.42;
            for (let channel = 0; channel < 3; channel += 1) rgba[channel] *= boundaryGain;
          }
          if (settings.codecRinging > 0 && (localX <= 1 || localY <= 1)) {
            const ringing = ((localX + localY) % 2 === 0 ? 1 : -1) * settings.codecRinging * 54;
            for (let channel = 0; channel < 3; channel += 1) {
              rgba[channel] = clamp(rgba[channel]! + ringing, 0, 255);
            }
          }
          writeBlendedPixel(pixels, width, pixelX, pixelY, rgba, amount);
        });
      }
    }
    return result(context, touched);
  },
};

const scanlineTearPro: GlitchAlgorithm = {
  id: 'scanline-tear-pro',
  name: 'Scanline Tear Pro',
  family: 'line',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context);
    const count = structuralCount(settings.tearBandCount, context, 1);
    let touched = 0;

    for (let band = 0; band < count; band += 1) {
      const point = pickMaskedPoint(context, random);
      const thickness = random.int(settings.tearMinThickness, settings.tearMaxThickness);
      const shift =
        signedOffset(random, Math.max(2, settings.tearShift / 4), settings.tearShift) +
        random.int(-settings.tearJitter, settings.tearJitter);
      const rectangle = {
        x: bounds.x,
        y: point.y - Math.floor(thickness / 2),
        width: bounds.width,
        height: thickness,
      };
      const dropout = random.next() < settings.tearDropout;
      const duplicate = random.next() < settings.tearDuplication;
      touched += forEachPixel(rectangle, context, (x, y) => {
        const sourceY = duplicate ? rectangle.y - 1 : y;
        const sourceX = x - shift;
        const colorOffset = settings.tearColorSplit;
        const rgba: [number, number, number, number] = dropout
          ? [
              sampleRegion(snapshot, sourceX, sourceY, 0) * 0.22,
              sampleRegion(snapshot, sourceX, sourceY, 1) * 0.22,
              sampleRegion(snapshot, sourceX, sourceY, 2) * 0.22,
              sampleRegion(snapshot, sourceX, sourceY, 3),
            ]
          : [
              sampleRegion(snapshot, sourceX - colorOffset, sourceY, 0),
              sampleRegion(snapshot, sourceX, sourceY, 1),
              sampleRegion(snapshot, sourceX + colorOffset, sourceY, 2),
              sampleRegion(snapshot, sourceX, sourceY, 3),
            ];
        writeBlendedPixel(pixels, width, x, y, rgba, amount);
      });
    }
    return result(context, touched);
  },
};

const tileScramble: GlitchAlgorithm = {
  id: 'tile-scramble',
  name: 'Tile Scramble',
  family: 'block',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context);
    const tile = Math.max(4, settings.tileGridSize);
    const columns = Math.max(1, Math.floor(bounds.width / tile));
    const rows = Math.max(1, Math.floor(bounds.height / tile));
    const positions: Point[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        positions.push({ x: bounds.x + column * tile, y: bounds.y + row * tile });
      }
    }
    const shuffled = [...positions];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = random.int(0, index);
      [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
    }
    let touched = 0;
    positions.forEach((destination, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const border = column === 0 || row === 0 || column === columns - 1 || row === rows - 1;
      if (settings.tilePreserveBorder && border) return;
      if (random.next() > settings.tileShuffle) return;
      const source =
        random.next() < settings.tileRepeat && index > 0
          ? shuffled[Math.max(0, index - 1)]!
          : shuffled[index]!;
      const drop = random.next() < settings.tileDrop;
      const flat = drop ? averageRegion(snapshot, { ...source, width: tile, height: tile }) : null;
      touched += forEachPixel({ ...destination, width: tile, height: tile }, context, (x, y) => {
        const rgba =
          flat ??
          sourcePixel(snapshot, source.x + (x - destination.x), source.y + (y - destination.y));
        writeBlendedPixel(pixels, width, x, y, rgba, amount);
      });
    });
    return result(context, touched);
  },
};

const codecBlockDamage: GlitchAlgorithm = {
  id: 'codec-block-damage',
  name: 'Codec Block Damage',
  family: 'block',
  apply(context) {
    const { settings } = context;
    const withMix = (strength = 1) => ({
      ...context,
      strength: context.strength * settings.codecMix * strength,
    });
    if (settings.codecBlockDamageMode === 'compression-loss') {
      return compressionBlockDamage.apply({
        ...withMix(),
        seed: `${context.seed}:compression-loss`,
        settings: { ...settings, codecCoefficientDropout: 0, compressionScramble: 0 },
      });
    }
    if (settings.codecBlockDamageMode === 'tile-scramble') {
      return tileScramble.apply({
        ...withMix(),
        seed: `${context.seed}:tile-scramble`,
        settings: { ...settings, tileGridSize: settings.compressionTileSize },
      });
    }
    if (settings.codecBlockDamageMode === 'coefficient-dropout') {
      return compressionBlockDamage.apply({
        ...withMix(),
        seed: `${context.seed}:coefficient-dropout`,
        settings: {
          ...settings,
          codecCoefficientDropout: Math.max(0.45, settings.codecCoefficientDropout),
          compressionReplication: 0,
        },
      });
    }
    if (settings.codecBlockDamageMode === 'block-repeat') {
      return tileScramble.apply({
        ...withMix(),
        seed: `${context.seed}:block-repeat`,
        settings: {
          ...settings,
          tileGridSize: settings.compressionTileSize,
          tileRepeat: Math.max(0.7, settings.tileRepeat),
          tileShuffle: Math.max(0.45, settings.tileShuffle),
        },
      });
    }
    if (settings.codecBlockDamageMode === 'recompressed') {
      const first = compressionBlockDamage.apply({
        ...withMix(0.82),
        seed: `${context.seed}:recompressed:1`,
      });
      const second = compressionBlockDamage.apply({
        ...withMix(0.72),
        seed: `${context.seed}:recompressed:2`,
        settings: {
          ...settings,
          compressionTileSize: settings.compressionTileSize === 8 ? 16 : 8,
        },
      });
      return { bounds: first.bounds, touchedPixels: first.touchedPixels + second.touchedPixels };
    }
    const compressionResult = compressionBlockDamage.apply({
      ...withMix(0.82),
      seed: `${context.seed}:mixed:compression`,
    });
    const tileResult = tileScramble.apply({
      ...withMix(0.68),
      seed: `${context.seed}:mixed:tiles`,
      settings: { ...settings, tileGridSize: settings.compressionTileSize },
    });
    return {
      bounds: compressionResult.bounds,
      touchedPixels: compressionResult.touchedPixels + tileResult.touchedPixels,
    };
  },
};

const rowColumnRepeat: GlitchAlgorithm = {
  id: 'row-column-repeat',
  name: 'Row / Column Repeat',
  family: 'line',
  apply(context) {
    const { settings, bounds, pixels, width, height } = context;
    const random = createSeededRandom(context.seed);
    const snapshot = extractRegion(pixels, width, height, context.writeBounds ?? bounds);
    const amount = structuralAmount(context);
    const orientation = chooseOrientation(settings.repeatOrientation, random);
    const point = pickMaskedPoint(context, random);
    const repetitions = structuralCount(settings.repeatCount, context, 1);
    let touched = 0;

    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      const jitter = random.int(-settings.repeatJitter, settings.repeatJitter);
      const fade = Math.pow(1 - repeat / Math.max(1, repetitions), settings.repeatFade);
      const rectangle =
        orientation === 'horizontal'
          ? {
              x: bounds.x,
              y: point.y + repeat * settings.repeatLength + jitter,
              width: bounds.width,
              height: settings.repeatLength,
            }
          : {
              x: point.x + repeat * settings.repeatLength + jitter,
              y: bounds.y,
              width: settings.repeatLength,
              height: bounds.height,
            };
      touched += forEachPixel(rectangle, context, (x, y) => {
        const sourceX = orientation === 'vertical' ? point.x : x;
        const sourceY = orientation === 'horizontal' ? point.y : y;
        writeBlendedPixel(
          pixels,
          width,
          x,
          y,
          sourcePixel(snapshot, sourceX, sourceY),
          amount * fade,
        );
      });
    }
    return result(context, touched);
  },
};

const structuralBase = [
  sliceDisplacement,
  blockCorruption,
  datamoshSmear,
  rgbChunkSplit,
  codecBlockDamage,
  scanlineTearPro,
  rowColumnRepeat,
] as const;

const structuralMixed: GlitchAlgorithm = {
  id: 'structural-mixed',
  name: 'Mixed Structural Glitch',
  family: 'mixed',
  apply(context) {
    const random = createSeededRandom(context.seed);
    const configuredPool = context.settings.structuralMixPool ?? [];
    const pool = structuralBase.filter((algorithm) => configuredPool.includes(algorithm.id));
    const available = pool.length ? pool : structuralBase;
    const minimum = clamp(
      context.settings.structuralMixMinEffects ?? context.settings.structuralMixCount,
      1,
      5,
    );
    const maximum = clamp(
      context.settings.structuralMixMaxEffects ?? context.settings.structuralMixCount,
      minimum,
      Math.min(5, available.length),
    );
    const count = random.int(minimum, maximum);
    let touched = 0;
    for (let index = 0; index < count; index += 1) {
      const algorithm = random.pick(available);
      touched += algorithm.apply({
        ...context,
        seed: `${context.seed}:structural:${index}:${algorithm.id}`,
        strength: clamp(context.strength * 0.88, 0.1, 1),
      }).touchedPixels;
    }
    return result(context, touched);
  },
};

export const structuralAlgorithms: GlitchAlgorithm[] = [
  sliceDisplacement,
  blockCorruption,
  datamoshSmear,
  rgbChunkSplit,
  scanlineTearPro,
  codecBlockDamage,
  rowColumnRepeat,
  structuralMixed,
];

export const legacyStructuralAlgorithms: GlitchAlgorithm[] = [
  macroblockShift,
  packetLoss,
  compressionBlockDamage,
  tileScramble,
];
