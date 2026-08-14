import { algorithms, defaultAlgorithmSettings } from '../glitchAlgorithms';
import {
  effectiveImageBrushStages,
  sharedEffectForImageBrush,
  supportsImageBrushStages,
} from '../effects/sharedRegistry';
import { countChangedPixels, processMoshStack } from '../mosh/engine';
import { defaultMoshSettings, type MoshEffectCard, type MoshEffectId } from '../mosh/types';
import type { Point, Rectangle } from '../types';
import { clamp, unionRect } from '../utils/geometry';
import { createSeededRandom } from '../utils/prng';
import { anchorPoint, rotationForStamp } from './path';
import {
  imageBrushFxDefinitions,
  type ImageBrushAsset,
  type ImageBrushFxId,
  type ImageBrushFxItem,
  type ImageBrushPerformanceMetrics,
  type ImageBrushProcessRequest,
  type ImageBrushProcessResult,
  type ImageBrushProgress,
  type ImageBrushSettings,
  type StampAlphaMode,
  type StampBlendMode,
  type StampPoint,
  type StampStrokeContext,
} from './types';

export class ImageBrushCancelledError extends Error {
  constructor() {
    super('Image Brush processing cancelled.');
    this.name = 'ImageBrushCancelledError';
  }
}

interface PreparedTip {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  padding: number;
  sourceAlpha: Uint8ClampedArray;
}

interface RenderAsset {
  id: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

interface StampVariant extends PreparedTip {
  contentWidth: number;
  contentHeight: number;
}

interface RenderOptions {
  shouldCancel?: () => boolean;
  onProgress?: (progress: Omit<ImageBrushProgress, 'jobId'>) => void;
  collectPreviewVariants?: boolean;
  maxPreviewVariants?: number;
}

interface RenderTimings {
  variantGenerationMs: number;
  fxProcessingMs: number;
  compositingMs: number;
  bufferCopyMs: number;
}

function clockNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function guard(options: RenderOptions): void {
  if (options.shouldCancel?.()) throw new ImageBrushCancelledError();
}

function alphaPadding(mode: StampAlphaMode, amount: number): number {
  return mode === 'bleed' ? Math.max(0, Math.min(32, Math.ceil(amount))) : 0;
}

export function prepareBrushTip(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaMode: StampAlphaMode,
  bleedAmount: number,
): PreparedTip {
  const padding = alphaPadding(alphaMode, bleedAmount);
  const outputWidth = width + padding * 2;
  const outputHeight = height + padding * 2;
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < height; y += 1) {
    const source = y * width * 4;
    const destination = ((y + padding) * outputWidth + padding) * 4;
    output.set(pixels.subarray(source, source + width * 4), destination);
  }
  const sourceAlpha = new Uint8ClampedArray(outputWidth * outputHeight);
  for (let pixel = 0; pixel < sourceAlpha.length; pixel += 1) {
    sourceAlpha[pixel] = output[pixel * 4 + 3]!;
  }
  return { pixels: output, width: outputWidth, height: outputHeight, padding, sourceAlpha };
}

function effectCanRun(effectId: ImageBrushFxId, width: number, height: number): boolean {
  const minimum = sharedEffectForImageBrush(effectId)?.minSize ?? 2;
  return width >= minimum && height >= minimum;
}

function mixBuffers(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  mix: number,
): Uint8ClampedArray {
  if (mix >= 0.999) return after;
  const output = before.slice();
  const amount = clamp(mix, 0, 1);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Math.round(before[index]! + (after[index]! - before[index]!) * amount);
  }
  return output;
}

function applyStructuralFx(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  item: ImageBrushFxItem,
  seed: string,
  direction: Point,
): Uint8ClampedArray {
  const algorithmId = sharedEffectForImageBrush(item.effectId)?.algorithmId;
  if (!algorithmId) return input.slice();
  const output = input.slice();
  const amount = clamp(item.amount, 0.01, 1);
  const small = Math.max(2, Math.min(width, height));
  const settings = {
    ...defaultAlgorithmSettings,
    microIntensity: Math.max(0.18, amount),
    structuralIntensity: 0.35 + amount,
    structuralDensity: 0.25 + amount * 0.7,
    affectAlpha: true,
    sliceMinThickness: 1,
    sliceMaxThickness: Math.max(2, Math.round(small * (0.08 + amount * 0.24))),
    sliceMinOffset: Math.max(1, Math.round(small * 0.02)),
    sliceMaxOffset: Math.max(2, Math.round(small * (0.08 + amount * 0.36))),
    sliceCount: Math.max(1, Math.round(1 + amount * 5)),
    macroblockMinSize: Math.max(2, Math.min(8, Math.round(small / 8))),
    macroblockMaxSize: Math.max(4, Math.min(24, Math.round(small / 3))),
    macroblockOffset: Math.max(2, Math.round(small * amount * 0.42)),
    datamoshLength: Math.max(3, Math.round(width * (0.1 + amount * 0.65))),
    datamoshBlockHeight: Math.max(1, Math.round(height / 10)),
    datamoshBlockWidth: Math.max(2, Math.round(width / 8)),
    rgbRegionSize: Math.max(3, Math.round(small * 0.35)),
    rgbChunkOffset: Math.max(1, Math.round(small * amount * 0.22)),
    tearBandCount: Math.max(1, Math.round(1 + amount * 5)),
    tearMinThickness: 1,
    tearMaxThickness: Math.max(2, Math.round(height / 8)),
    tearShift: Math.max(2, Math.round(width * amount * 0.35)),
    packetBlockSize: Math.max(2, Math.min(16, Math.round(small / 6))),
    packetLossDensity: 0.08 + amount * 0.55,
    compressionTileSize: 8 as const,
    tileGridSize: Math.max(2, Math.min(8, Math.round(small / 8))),
    repeatLength: Math.max(2, Math.round(small * amount * 0.35)),
    repeatCount: Math.max(1, Math.round(1 + amount * 4)),
    byteProbability: 0.02 + amount * 0.24,
    bitProbability: 0.02 + amount * 0.2,
    paletteLevels: Math.max(2, Math.round(12 - amount * 9)),
  };
  const mask = new Float32Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    mask[pixel] = Math.max(0.1, input[pixel * 4 + 3]! / 255);
  }
  algorithms[algorithmId].apply({
    pixels: output,
    originalPixels: input,
    width,
    height,
    mask,
    bounds: { x: 0, y: 0, width, height },
    writeBounds: { x: 0, y: 0, width, height },
    strength: amount,
    pressure: 1,
    seed,
    settings,
    movement: {
      x: direction.x * Math.max(1, width * amount),
      y: direction.y * Math.max(1, height * amount),
    },
  });
  return output;
}

function applyMoshFx(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  item: ImageBrushFxItem,
  seed: string,
  direction: Point,
): Uint8ClampedArray {
  const effectId = sharedEffectForImageBrush(item.effectId)?.moshId;
  if (!effectId) return input.slice();
  const amount = clamp(item.amount, 0.01, 1);
  const small = Math.max(2, Math.min(width, height));
  const settings = {
    ...defaultMoshSettings,
    preserveAlpha: false,
    intervalMin: 2,
    intervalMax: Math.max(4, width),
    lowerThreshold: Math.round(30 + amount * 90),
    upperThreshold: 255,
    disorder: amount * 0.55,
    feedbackIterations: Math.max(1, Math.round(1 + amount * 4)),
    translateX: Math.round(direction.x * width * amount * 0.32),
    translateY: Math.round(direction.y * height * amount * 0.32),
    feedbackChannelOffset: Math.max(1, Math.round(small * amount * 0.12)),
    motionFieldSource: 'brush-direction' as const,
    motionBlockSize: Math.max(2, Math.min(16, Math.round(small / 5))),
    propagationLength: Math.max(3, Math.round(width * amount * 0.6)),
    motionIterations: Math.max(1, Math.round(1 + amount * 3)),
    vectorStrength: 0.5 + amount * 1.8,
    motionChromaDrift: Math.round(amount * 10),
    chromaX: Math.round(direction.x * small * amount * 0.25 + amount * 4),
    chromaY: Math.round(direction.y * small * amount * 0.25),
    chromaBlur: Math.round(amount * 3),
    dctBlockSize: 8 as const,
    dctQuantization: 0.15 + amount * 0.78,
    coefficientDropout: amount * 0.6,
    edgeThreshold: Math.round(24 + amount * 70),
    meltLength: Math.max(3, Math.round(height * amount * 0.65)),
    meltSpread: Math.max(1, Math.round(width * amount * 0.18)),
    flowScale: Math.max(4, Math.round(small * (0.3 + amount))),
    flowStrength: 2 + amount * small * 0.36,
    flowIterations: Math.max(1, Math.round(1 + amount * 3)),
    flowDirection: (Math.atan2(direction.y, direction.x) * 180) / Math.PI,
  };
  const horizontalTransfer = Math.abs(direction.x) >= Math.abs(direction.y);
  const transferSource = horizontalTransfer
    ? { x: 0, y: 0, width: Math.max(1, Math.floor(width / 2)), height }
    : { x: 0, y: 0, width, height: Math.max(1, Math.floor(height / 2)) };
  const transferDestination = horizontalTransfer
    ? { x: Math.floor(width / 2), y: 0, width: Math.max(1, width - Math.floor(width / 2)), height }
    : {
        x: 0,
        y: Math.floor(height / 2),
        width,
        height: Math.max(1, height - Math.floor(height / 2)),
      };
  const card: MoshEffectCard = {
    instanceId: `image-brush-${item.id}`,
    effectId,
    enabled: true,
    mix: 1,
    expanded: false,
    target: 'whole',
    settings,
    sourceRegion: effectId === 'motion-transfer' ? transferSource : null,
    destinationRegion: effectId === 'motion-transfer' ? transferDestination : null,
    activePresetId: 'image-brush',
  };
  return processMoshStack(input, width, height, [card], seed, {
    brushDirection: direction,
  }).pixels;
}

function nearestVisibleColor(
  pixels: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): readonly [number, number, number] {
  for (let distance = 1; distance <= radius; distance += 1) {
    for (let dy = -distance; dy <= distance; dy += 1) {
      for (let dx = -distance; dx <= distance; dx += 1) {
        if (Math.abs(dx) !== distance && Math.abs(dy) !== distance) continue;
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        const pixel = sy * width + sx;
        if (alpha[pixel]! <= 0) continue;
        const offset = pixel * 4;
        return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!];
      }
    }
  }
  return [0, 0, 0];
}

function enforceAlpha(
  processed: Uint8ClampedArray,
  sourcePixels: Uint8ClampedArray,
  sourceAlpha: Uint8ClampedArray,
  width: number,
  height: number,
  mode: StampAlphaMode,
  bleedAmount: number,
): Uint8ClampedArray {
  const output = processed.slice();
  if (mode === 'corrupt') return output;
  if (mode === 'preserve' || mode === 'inside') {
    for (let pixel = 0; pixel < sourceAlpha.length; pixel += 1) {
      const offset = pixel * 4;
      output[offset + 3] = sourceAlpha[pixel]!;
      if (sourceAlpha[pixel] === 0) {
        output[offset] = 0;
        output[offset + 1] = 0;
        output[offset + 2] = 0;
      }
    }
    return output;
  }
  const radius = Math.max(1, Math.min(32, Math.round(bleedAmount)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      let maximum = sourceAlpha[pixel]!;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const distance = Math.hypot(dx, dy);
          const faded = sourceAlpha[sy * width + sx]! * (1 - distance / (radius + 1));
          maximum = Math.max(maximum, faded);
        }
      }
      const offset = pixel * 4;
      output[offset + 3] = Math.round(maximum);
      if (maximum > 0 && output[offset] + output[offset + 1] + output[offset + 2] === 0) {
        const color = nearestVisibleColor(sourcePixels, sourceAlpha, width, height, x, y, radius);
        output[offset] = color[0];
        output[offset + 1] = color[1];
        output[offset + 2] = color[2];
      }
    }
  }
  return output;
}

export function processPreparedTipFx(
  prepared: PreparedTip,
  rack: ImageBrushFxItem[],
  settings: Pick<ImageBrushSettings, 'alphaMode' | 'bleedAmount'>,
  seed: string,
  context: Pick<StampStrokeContext, 'direction'> = { direction: { x: 1, y: 0 } },
): PreparedTip {
  let output = prepared.pixels.slice();
  for (const item of rack) {
    if (!item.enabled || !effectCanRun(item.effectId, prepared.width, prepared.height)) continue;
    const before = output;
    const structural = sharedEffectForImageBrush(item.effectId)?.algorithmId;
    const processed = structural
      ? applyStructuralFx(
          before,
          prepared.width,
          prepared.height,
          item,
          `${seed}:${item.id}`,
          context.direction,
        )
      : applyMoshFx(
          before,
          prepared.width,
          prepared.height,
          item,
          `${seed}:${item.id}`,
          context.direction,
        );
    output = mixBuffers(before, processed, item.mix);
  }
  output = enforceAlpha(
    output,
    prepared.pixels,
    prepared.sourceAlpha,
    prepared.width,
    prepared.height,
    settings.alphaMode,
    settings.bleedAmount,
  );
  return { ...prepared, pixels: output };
}

export function processBrushTipFx(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rack: ImageBrushFxItem[],
  settings: Pick<ImageBrushSettings, 'alphaMode' | 'bleedAmount'>,
  seed: string,
  direction: Point = { x: 1, y: 0 },
): PreparedTip {
  return processPreparedTipFx(
    prepareBrushTip(pixels, width, height, settings.alphaMode, settings.bleedAmount),
    rack,
    settings,
    seed,
    { direction },
  );
}

function blendChannel(backdrop: number, source: number, mode: StampBlendMode): number {
  if (mode === 'multiply') return backdrop * source;
  if (mode === 'screen') return backdrop + source - backdrop * source;
  if (mode === 'overlay') {
    return backdrop <= 0.5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source);
  }
  if (mode === 'difference') return Math.abs(backdrop - source);
  if (mode === 'lighten') return Math.max(backdrop, source);
  if (mode === 'darken') return Math.min(backdrop, source);
  if (mode === 'hard-light') {
    return source <= 0.5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source);
  }
  if (mode === 'color-dodge') return source >= 0.999 ? 1 : Math.min(1, backdrop / (1 - source));
  if (mode === 'exclusion') return backdrop + source - 2 * backdrop * source;
  return source;
}

export function compositeRgbaPixel(
  target: Uint8ClampedArray,
  targetOffset: number,
  source: readonly [number, number, number, number],
  mode: StampBlendMode,
): void {
  const sourceAlpha = clamp(source[3] / 255, 0, 1);
  if (sourceAlpha <= 0) return;
  const backdropAlpha = target[targetOffset + 3]! / 255;
  const outputAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
  for (let channel = 0; channel < 3; channel += 1) {
    const backdrop = target[targetOffset + channel]! / 255;
    const sourceColor = source[channel]! / 255;
    const blended = blendChannel(backdrop, sourceColor, mode);
    const premultiplied =
      sourceAlpha * (1 - backdropAlpha) * sourceColor +
      sourceAlpha * backdropAlpha * blended +
      (1 - sourceAlpha) * backdropAlpha * backdrop;
    target[targetOffset + channel] = Math.round(
      clamp(premultiplied / Math.max(outputAlpha, 0.000001), 0, 1) * 255,
    );
  }
  target[targetOffset + 3] = Math.round(outputAlpha * 255);
}

function curveAmount(
  curve: ImageBrushSettings['evolutionCurve'],
  progress: number,
  seed: string,
  index: number,
): number {
  if (curve === 'constant') return 1;
  if (curve === 'ease-in') return progress * progress;
  if (curve === 'ease-out') return 1 - (1 - progress) ** 2;
  if (curve === 'exponential')
    return progress <= 0 ? 0 : (Math.exp(progress * 4) - 1) / (Math.exp(4) - 1);
  if (curve === 'pulse') return 0.5 + Math.sin(progress * Math.PI * 4) * 0.5;
  if (curve === 'random-walk') {
    const random = createSeededRandom(`${seed}:walk:${Math.floor(index / 2)}`);
    return clamp(progress * 0.65 + random.next() * 0.55, 0, 1);
  }
  return progress;
}

export function imageBrushMutationStrength(
  settings: ImageBrushSettings,
  index: number,
  total: number,
  offset: number,
  seed: string,
): number {
  const progress = total <= 1 ? 1 : clamp((index + offset) / Math.max(1, total - 1 + offset), 0, 1);
  const curve = curveAmount(settings.evolutionCurve, progress, seed, index);
  if (settings.mutationMode === 'progressive') {
    const start = Math.min(settings.progressiveStart, settings.progressiveEnd);
    const end = Math.max(settings.progressiveStart, settings.progressiveEnd);
    const speedExponent = 2.5 - settings.evolutionSpeed * 2;
    const paced = clamp(curve ** speedExponent, 0, 1);
    return clamp(start + (end - start) * paced, 0, settings.maxCorruption);
  }
  return clamp(
    settings.mutationAmount + curve * settings.evolutionSpeed * settings.maxCorruption,
    0,
    settings.maxCorruption,
  );
}

function scaledRack(
  rack: ImageBrushFxItem[],
  amount: number,
  variation: number,
  seed: string,
): ImageBrushFxItem[] {
  const random = createSeededRandom(seed);
  return rack.map((item) => ({
    ...item,
    amount: clamp(
      item.amount * (0.4 + amount) + (random.next() * 2 - 1) * variation * 0.2,
      0.01,
      1,
    ),
  }));
}

const mutationEffectPool: ImageBrushFxId[] = [
  'slice',
  'block-corruption',
  'rgb-split',
  'scanline',
  'pixel-sort',
  'codec-block-damage',
  'datamosh',
  'chroma-drift',
];

function shuffled<T>(values: T[], random: ReturnType<typeof createSeededRandom>): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = random.int(0, index);
    [output[index], output[swap]] = [output[swap]!, output[index]!];
  }
  return output;
}

function proceduralRack(
  settings: ImageBrushSettings,
  rack: ImageBrushFxItem[],
  seed: string,
  mode: 'pool' | 'stack',
  strength: number,
): ImageBrushFxItem[] {
  const random = createSeededRandom(seed);
  const enabledIds = rack.filter((item) => item.enabled).map((item) => item.effectId);
  const configured = settings.effectPool.length ? settings.effectPool : mutationEffectPool;
  const sourcePool =
    settings.lockEffectPool && enabledIds.length
      ? [...new Set(enabledIds)]
      : [...new Set(configured)];
  const fullPool = sourcePool.length ? sourcePool : mutationEffectPool;
  const diversityPoolSize = clamp(
    Math.round(1 + (fullPool.length - 1) * settings.effectVariation),
    1,
    fullPool.length,
  );
  const pool = fullPool.slice(0, diversityPoolSize);
  const minimum = mode === 'stack' ? settings.stackMinimumEffects : settings.minimumEffects;
  const maximum = mode === 'stack' ? settings.stackMaximumEffects : settings.maximumEffects;
  const diversityMaximum = Math.round(
    Math.min(minimum, maximum) +
      (Math.max(minimum, maximum) - Math.min(minimum, maximum)) * settings.effectVariation,
  );
  const count = clamp(
    random.int(Math.min(minimum, diversityMaximum), Math.max(minimum, diversityMaximum)),
    1,
    pool.length,
  );
  const chosen = shuffled(pool, random).slice(0, count);
  const ordered =
    mode === 'stack' && !settings.stackRandomOrder
      ? pool.filter((effectId) => chosen.includes(effectId))
      : chosen;
  return ordered.map((effectId, index) => {
    const base = rack.find((item) => item.effectId === effectId);
    const variation = settings.effectVariation;
    const minimumStrength =
      mode === 'stack' ? settings.stackMinimumStrength : strength * (1 - variation * 0.45);
    const maximumStrength =
      mode === 'stack' ? settings.stackMaximumStrength : strength * (1 + variation * 0.45);
    const coherentRandom =
      random.next() * (1 - settings.visualCoherence) + 0.5 * settings.visualCoherence;
    return {
      id: `${mode}-${effectId}-${index}`,
      effectId,
      enabled: true,
      amount: clamp(
        (minimumStrength + (maximumStrength - minimumStrength) * coherentRandom) *
          (base ? 0.55 + base.amount * 0.65 : 1),
        0.01,
        1,
      ),
      mix: base?.mix ?? 1,
    };
  });
}

function recipeRack(
  recipe: ImageBrushSettings['recipeA'],
  rack: ImageBrushFxItem[],
  strength: number,
  seed: string,
): ImageBrushFxItem[] {
  if (recipe === 'clean') return [];
  if (recipe === 'mixed') return scaledRack(rack, strength, 0.18, seed);
  const base = rack.find((item) => item.effectId === recipe);
  return [
    {
      id: `recipe-${recipe}`,
      effectId: recipe,
      enabled: true,
      amount: clamp(strength * (base ? 0.65 + base.amount * 0.55 : 1), 0.01, 1),
      mix: base?.mix ?? 1,
    },
  ];
}

function blendPreparedSource(
  clean: PreparedTip,
  previous: PreparedTip,
  previousAmount: number,
): PreparedTip {
  return {
    ...clean,
    pixels: mixBuffers(clean.pixels, previous.pixels, clamp(previousAmount, 0, 1)),
  };
}

function mixTipSources(
  original: PreparedTip,
  previous: PreparedTip | null,
  underlying: Uint8ClampedArray | null,
  settings: ImageBrushSettings,
): PreparedTip {
  const output = original.pixels.slice();
  for (let offset = 0; offset < output.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      let value = output[offset + channel]!;
      if (previous) {
        value =
          value * (1 - settings.feedbackAmount) +
          previous.pixels[offset + channel]! * settings.feedbackAmount;
      }
      if (underlying) {
        value =
          value * (1 - settings.underlyingSampling) +
          underlying[offset + channel]! * settings.underlyingSampling;
      }
      output[offset + channel] = Math.round(value * (1 - settings.decay * 0.2));
    }
  }
  return { ...original, pixels: output };
}

function sampleUnderlyingTip(
  documentPixels: Uint8ClampedArray,
  documentWidth: number,
  documentHeight: number,
  point: Point,
  tip: PreparedTip,
  visualWidth: number,
  visualHeight: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(tip.pixels.length);
  for (let y = 0; y < tip.height; y += 1) {
    for (let x = 0; x < tip.width; x += 1) {
      const documentX = clamp(
        Math.round(point.x + (x / tip.width - 0.5) * visualWidth),
        0,
        documentWidth - 1,
      );
      const documentY = clamp(
        Math.round(point.y + (y / tip.height - 0.5) * visualHeight),
        0,
        documentHeight - 1,
      );
      const source = (documentY * documentWidth + documentX) * 4;
      const destination = (y * tip.width + x) * 4;
      output.set(documentPixels.subarray(source, source + 4), destination);
    }
  }
  return output;
}

function variantForStamp(
  asset: RenderAsset,
  stamp: StampPoint,
  stampIndex: number,
  totalStamps: number,
  settings: ImageBrushSettings,
  rack: ImageBrushFxItem[],
  seed: string,
  strokeId: string,
  evolutionOffset: number,
  previous: PreparedTip | null,
  documentPixels: Uint8ClampedArray,
  documentWidth: number,
  documentHeight: number,
  cleanCache: Map<string, PreparedTip>,
  fixedCache: Map<string, PreparedTip>,
  perStampCache: Map<string, PreparedTip[]>,
  timings: RenderTimings,
): PreparedTip {
  const prepareStarted = clockNow();
  const cleanKey = `${asset.id}:${settings.alphaMode}:${settings.bleedAmount}`;
  let prepared = cleanCache.get(cleanKey);
  if (!prepared) {
    prepared = prepareBrushTip(
      asset.pixels,
      asset.width,
      asset.height,
      settings.alphaMode,
      settings.bleedAmount,
    );
    cleanCache.set(cleanKey, prepared);
  }
  timings.variantGenerationMs += clockNow() - prepareStarted;
  if (settings.mutationMode === 'clean') return prepared;
  if (
    rack.every((item) => !item.enabled) &&
    settings.mutationMode !== 'per-stamp' &&
    settings.mutationMode !== 'random-stack' &&
    settings.mutationMode !== 'alternating' &&
    settings.mutationMode !== 'stroke-gradient'
  )
    return prepared;
  const amount = imageBrushMutationStrength(
    settings,
    stampIndex,
    totalStamps,
    evolutionOffset,
    seed,
  );
  const progress = totalStamps <= 1 ? 1 : clamp(stampIndex / (totalStamps - 1), 0, 1);
  const contextSeed = `${seed}:${strokeId}:${stampIndex}:${settings.seedEvolution}`;
  const context: StampStrokeContext = {
    strokeId,
    stampIndex,
    position: stamp.position,
    previousPosition: stamp.previousPosition,
    direction: stamp.direction,
    speed: stamp.speed,
    pressure: stamp.pressure,
    rotation: 0,
    seed: contextSeed,
  };
  const compatiblePrevious =
    previous && previous.width === prepared.width && previous.height === prepared.height
      ? previous
      : null;
  if (settings.mutationMode === 'fixed') {
    const cacheKey = `${asset.id}:${seed}:${JSON.stringify(rack)}:${settings.alphaMode}:${settings.bleedAmount}`;
    const cached = fixedCache.get(cacheKey);
    if (cached) return cached;
    const fxStarted = clockNow();
    const processed = processPreparedTipFx(
      prepared,
      scaledRack(rack, amount, 0, seed),
      settings,
      seed,
      context,
    );
    timings.fxProcessingMs += clockNow() - fxStarted;
    fixedCache.set(cacheKey, processed);
    return processed;
  }
  if (settings.mutationMode === 'per-stamp') {
    const poolSize = Math.max(
      1,
      Math.min(settings.variantCount, settings.maxCachedVariants, totalStamps),
    );
    const cacheKey = `${asset.id}:${seed}:${JSON.stringify(rack)}:${settings.alphaMode}:${settings.bleedAmount}:${poolSize}`;
    let pool = perStampCache.get(cacheKey);
    if (!pool) {
      pool = [];
      perStampCache.set(cacheKey, pool);
    }
    const poolIndex = stampIndex % poolSize;
    const cached = pool[poolIndex];
    if (cached) return cached;
    const recipeIndex = settings.allowRepeatedCombinations
      ? poolIndex % Math.max(1, Math.ceil(poolSize / 2))
      : poolIndex;
    const variantSeed = `${seed}:${strokeId}:variant-pool:${recipeIndex}`;
    const variantAmount = imageBrushMutationStrength(
      settings,
      poolIndex,
      poolSize,
      evolutionOffset,
      seed,
    );
    const fxStarted = clockNow();
    const processed = processPreparedTipFx(
      prepared,
      proceduralRack(settings, rack, variantSeed, 'pool', variantAmount),
      settings,
      variantSeed,
      context,
    );
    timings.fxProcessingMs += clockNow() - fxStarted;
    pool[poolIndex] = processed;
    return processed;
  }
  if (settings.mutationMode === 'progressive') {
    const poolSize = Math.max(
      2,
      Math.min(settings.variantCount, settings.maxCachedVariants, totalStamps),
    );
    const poolIndex = Math.round(progress * (poolSize - 1));
    const cacheKey = `${asset.id}:${seed}:progressive:${JSON.stringify(rack)}:${settings.alphaMode}:${settings.bleedAmount}:${poolSize}`;
    let pool = perStampCache.get(cacheKey);
    if (!pool) {
      pool = [];
      perStampCache.set(cacheKey, pool);
    }
    const cached = pool[poolIndex];
    if (cached) return cached;
    const variantSeed = `${seed}:${strokeId}:progressive:${poolIndex}`;
    const variantAmount = imageBrushMutationStrength(
      settings,
      poolIndex,
      poolSize,
      evolutionOffset,
      seed,
    );
    const fxStarted = clockNow();
    const processed = processPreparedTipFx(
      prepared,
      scaledRack(rack, variantAmount, settings.effectVariation * progress, variantSeed),
      settings,
      variantSeed,
      context,
    );
    timings.fxProcessingMs += clockNow() - fxStarted;
    pool[poolIndex] = processed;
    return processed;
  }
  if (settings.mutationMode === 'random-stack') {
    const stackSeed = `${seed}:${strokeId}:random-stack:${stampIndex}`;
    const fxStarted = clockNow();
    const processed = processPreparedTipFx(
      prepared,
      proceduralRack(settings, rack, stackSeed, 'stack', amount),
      settings,
      stackSeed,
      context,
    );
    timings.fxProcessingMs += clockNow() - fxStarted;
    return processed;
  }
  if (settings.mutationMode === 'alternating') {
    const intervalIndex = Math.floor(stampIndex / Math.max(1, settings.alternatingInterval));
    const alternatingRandom = createSeededRandom(
      `${seed}:${strokeId}:alternating:${intervalIndex}`,
    );
    const useB = settings.randomAlternation
      ? alternatingRandom.next() >= 0.5
      : intervalIndex % 2 === 1;
    const primary = recipeRack(
      useB ? settings.recipeB : settings.recipeA,
      rack,
      amount,
      contextSeed,
    );
    const secondary =
      settings.transitionBlend > 0
        ? recipeRack(
            useB ? settings.recipeA : settings.recipeB,
            rack,
            amount * settings.transitionBlend,
            `${contextSeed}:blend`,
          )
        : [];
    const fxStarted = clockNow();
    const processed = processPreparedTipFx(
      prepared,
      [...primary, ...secondary],
      settings,
      contextSeed,
      context,
    );
    timings.fxProcessingMs += clockNow() - fxStarted;
    return processed;
  }
  if (settings.mutationMode === 'stroke-gradient') {
    const gradientProgress = curveAmount(settings.evolutionCurve, progress, seed, stampIndex);
    const startRack = recipeRack(
      settings.gradientStart,
      rack,
      amount * (1 - gradientProgress),
      `${contextSeed}:start`,
    );
    const endRack = recipeRack(
      settings.gradientEnd,
      rack,
      amount * gradientProgress,
      `${contextSeed}:end`,
    );
    const fxStarted = clockNow();
    const processed = processPreparedTipFx(
      prepared,
      [...startRack, ...endRack],
      settings,
      contextSeed,
      context,
    );
    timings.fxProcessingMs += clockNow() - fxStarted;
    return processed;
  }
  if (settings.mutationMode === 'whole-trail') return prepared;
  const source =
    settings.mutationMode === 'evolving' && compatiblePrevious
      ? blendPreparedSource(
          prepared,
          compatiblePrevious,
          clamp(settings.accumulation * (1 - settings.recovery), 0, 1),
        )
      : prepared;
  const fxStarted = clockNow();
  const evolvingRack = scaledRack(
    rack,
    amount * (0.55 + settings.accumulation * 0.75),
    settings.effectVariation,
    contextSeed,
  ).map((item) => ({
    ...item,
    amount: clamp(
      item.amount +
        (item.effectId === 'chroma-drift'
          ? settings.chromaDrift * 0.35
          : settings.structuralDrift * 0.12),
      0.01,
      1,
    ),
  }));
  let processed = processPreparedTipFx(source, evolvingRack, settings, contextSeed, context);
  if (settings.mutationMode === 'evolving' && settings.alphaStability < 1) {
    const pixels = processed.pixels.slice();
    for (let pixel = 0; pixel < processed.sourceAlpha.length; pixel += 1) {
      const offset = pixel * 4 + 3;
      pixels[offset] = Math.round(
        pixels[offset]! * (1 - settings.alphaStability) +
          prepared.sourceAlpha[pixel]! * settings.alphaStability,
      );
    }
    processed = { ...processed, pixels };
  }
  timings.fxProcessingMs += clockNow() - fxStarted;
  return processed;
}

function stampBounds(
  position: Point,
  variantWidth: number,
  variantHeight: number,
  anchor: Point,
  scaleX: number,
  scaleY: number,
  rotationRadians: number,
): Rectangle {
  const corners = [
    { x: -anchor.x * variantWidth * scaleX, y: -anchor.y * variantHeight * scaleY },
    { x: (1 - anchor.x) * variantWidth * scaleX, y: -anchor.y * variantHeight * scaleY },
    { x: -anchor.x * variantWidth * scaleX, y: (1 - anchor.y) * variantHeight * scaleY },
    { x: (1 - anchor.x) * variantWidth * scaleX, y: (1 - anchor.y) * variantHeight * scaleY },
  ];
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  const xs = corners.map((corner) => position.x + corner.x * cosine - corner.y * sine);
  const ys = corners.map((corner) => position.y + corner.x * sine + corner.y * cosine);
  const left = Math.floor(Math.min(...xs));
  const top = Math.floor(Math.min(...ys));
  const right = Math.ceil(Math.max(...xs));
  const bottom = Math.ceil(Math.max(...ys));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function placeVariant(
  layer: Uint8ClampedArray,
  layerWidth: number,
  layerHeight: number,
  layerOrigin: Point,
  variant: StampVariant,
  position: Point,
  anchor: Point,
  visualScale: number,
  rotationDegrees: number,
  opacity: number,
  flipX: boolean,
  flipY: boolean,
  edgeSoftness: number,
  blendMode: StampBlendMode,
): Rectangle {
  const scaleX = visualScale * (flipX ? -1 : 1);
  const scaleY = visualScale * (flipY ? -1 : 1);
  const rotation = (rotationDegrees * Math.PI) / 180;
  const bounds = stampBounds(
    position,
    variant.width,
    variant.height,
    anchor,
    scaleX,
    scaleY,
    rotation,
  );
  const clipped = {
    x: clamp(bounds.x, layerOrigin.x, layerOrigin.x + layerWidth),
    y: clamp(bounds.y, layerOrigin.y, layerOrigin.y + layerHeight),
    width: 0,
    height: 0,
  };
  const right = clamp(bounds.x + bounds.width, layerOrigin.x, layerOrigin.x + layerWidth);
  const bottom = clamp(bounds.y + bounds.height, layerOrigin.y, layerOrigin.y + layerHeight);
  clipped.width = Math.max(0, right - clipped.x);
  clipped.height = Math.max(0, bottom - clipped.y);
  if (clipped.width <= 0 || clipped.height <= 0) return clipped;
  const cosine = Math.cos(-rotation);
  const sine = Math.sin(-rotation);
  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
      const dx = x + 0.5 - position.x;
      const dy = y + 0.5 - position.y;
      const localX = (dx * cosine - dy * sine) / scaleX + anchor.x * variant.width;
      const localY = (dx * sine + dy * cosine) / scaleY + anchor.y * variant.height;
      if (localX < 0 || localY < 0 || localX >= variant.width || localY >= variant.height) continue;
      const sourceX = clamp(Math.floor(localX), 0, variant.width - 1);
      const sourceY = clamp(Math.floor(localY), 0, variant.height - 1);
      const sourceOffset = (sourceY * variant.width + sourceX) * 4;
      let alpha = (variant.pixels[sourceOffset + 3]! / 255) * opacity;
      if (edgeSoftness > 0) {
        const edgeDistance = Math.min(
          localX,
          localY,
          variant.width - localX,
          variant.height - localY,
        );
        const softnessPixels = Math.max(
          0.5,
          Math.min(variant.width, variant.height) * edgeSoftness * 0.18,
        );
        alpha *= clamp(edgeDistance / softnessPixels, 0, 1);
      }
      if (alpha <= 0) continue;
      compositeRgbaPixel(
        layer,
        ((y - layerOrigin.y) * layerWidth + (x - layerOrigin.x)) * 4,
        [
          variant.pixels[sourceOffset]!,
          variant.pixels[sourceOffset + 1]!,
          variant.pixels[sourceOffset + 2]!,
          Math.round(alpha * 255),
        ],
        blendMode,
      );
    }
  }
  return clipped;
}

function cropDocumentRegion(
  documentPixels: Uint8ClampedArray,
  documentWidth: number,
  bounds: Rectangle,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let row = 0; row < bounds.height; row += 1) {
    const source = ((bounds.y + row) * documentWidth + bounds.x) * 4;
    output.set(documentPixels.subarray(source, source + bounds.width * 4), row * bounds.width * 4);
  }
  return output;
}

function compositeLocalLayer(
  targetRegion: Uint8ClampedArray,
  layer: Uint8ClampedArray,
  mode: StampBlendMode,
): void {
  for (let offset = 0; offset < targetRegion.length; offset += 4) {
    compositeRgbaPixel(
      targetRegion,
      offset,
      [layer[offset]!, layer[offset + 1]!, layer[offset + 2]!, layer[offset + 3]!],
      mode,
    );
  }
}

export function processImageBrushStroke(
  request: Omit<ImageBrushProcessRequest, 'pixels' | 'assets'> & {
    pixels: Uint8ClampedArray;
    assets: RenderAsset[];
  },
  options: RenderOptions = {},
): ImageBrushProcessResult {
  const totalStarted = clockNow();
  const requiredFxStages = effectiveImageBrushStages(
    request.settings.fxStage,
    request.settings.mutationMode,
  );
  const compatibleRack = request.rack.filter((item) =>
    supportsImageBrushStages(item.effectId, requiredFxStages),
  );
  const sourceDocument = request.pixels;
  const sourceBounds = request.sourceBounds ?? {
    x: 0,
    y: 0,
    width: request.width,
    height: request.height,
  };
  if (sourceDocument.length !== sourceBounds.width * sourceBounds.height * 4) {
    throw new Error('Image Brush cropped source region does not match its declared bounds.');
  }
  const assetMap = new Map(request.assets.map((asset) => [asset.id, asset]));
  const active = assetMap.get(request.activeAssetId);
  if (!active) throw new Error('The active Image Brush asset is unavailable.');
  const assetList = request.assets.filter((asset) => asset.width > 0 && asset.height > 0);
  const timings: RenderTimings = {
    variantGenerationMs: 0,
    fxProcessingMs: 0,
    compositingMs: 0,
    bufferCopyMs: 0,
  };
  const cleanCache = new Map<string, PreparedTip>();
  const fixedCache = new Map<string, PreparedTip>();
  const perStampCache = new Map<string, PreparedTip[]>();
  const previewVariants: PreparedTip[] = [];
  const previewVariantBuffers = new Set<ArrayBuffer>();
  let previous: PreparedTip | null = null;
  const copies = Math.max(1, Math.round(request.settings.stampsPerStep));
  const totalPlacements = Math.min(
    request.settings.maxGeneratedStamps,
    request.stamps.length * copies,
  );
  const baseAnchor = anchorPoint(request.settings.anchor, request.settings.customAnchor);
  interface Placement {
    asset: RenderAsset;
    pathStamp: StampPoint;
    flatIndex: number;
    position: Point;
    direction: Point;
    contentScale: number;
    rotation: number;
    opacity: number;
    flipX: boolean;
    flipY: boolean;
    anchor: Point;
    bounds: Rectangle;
  }
  const placements: Placement[] = [];
  let affectedBounds: Rectangle | null = null;
  let placementIndex = 0;
  outer: for (const pathStamp of request.stamps) {
    for (let copy = 0; copy < copies; copy += 1) {
      if (placementIndex >= totalPlacements) break outer;
      guard(options);
      const flatIndex = placementIndex;
      const random = createSeededRandom(`${request.seed}:${request.strokeId}:layout:${flatIndex}`);
      let asset = active;
      if (request.settings.mode === 'sequence')
        asset = assetList[flatIndex % assetList.length] ?? active;
      if (request.settings.mode === 'random-hose')
        asset = random.pick(assetList.length ? assetList : [active]);
      const scatterMultiplier =
        request.settings.mode === 'scatter' || request.settings.mode === 'random-hose' ? 1 : 0;
      const position = {
        x:
          pathStamp.position.x +
          (random.next() * 2 - 1) *
            request.settings.scatterX *
            request.settings.size *
            scatterMultiplier,
        y:
          pathStamp.position.y +
          (random.next() * 2 - 1) *
            request.settings.scatterY *
            request.settings.size *
            scatterMultiplier,
      };
      const pressureSize = request.settings.pressureSize
        ? request.settings.minPressureSize +
          (1 - request.settings.minPressureSize) * pathStamp.pressure
        : 1;
      const jitterScale = Math.max(
        0.08,
        1 + (random.next() * 2 - 1) * request.settings.scaleJitter,
      );
      const contentScale =
        (request.settings.size / Math.max(1, asset.width)) * pressureSize * jitterScale;
      const pressureOpacity = request.settings.pressureOpacity
        ? request.settings.minPressureOpacity +
          (1 - request.settings.minPressureOpacity) * pathStamp.pressure
        : 1;
      const opacity = clamp(
        request.settings.opacity *
          request.settings.flow *
          pressureOpacity *
          (1 - random.next() * request.settings.opacityJitter),
        0.01,
        1,
      );
      const direction = request.settings.followDirection
        ? pathStamp.direction
        : {
            x: Math.cos((request.settings.fallbackAngle * Math.PI) / 180),
            y: Math.sin((request.settings.fallbackAngle * Math.PI) / 180),
          };
      const rotation = rotationForStamp(
        request.settings.rotationMode,
        request.settings.angle,
        direction,
        flatIndex,
        random.next(),
        request.settings.randomRotation,
        request.settings.rotationJitter,
      );
      const padding = alphaPadding(request.settings.alphaMode, request.settings.bleedAmount);
      const variantWidth = asset.width + padding * 2;
      const variantHeight = asset.height + padding * 2;
      const anchor = {
        x: (padding + baseAnchor.x * asset.width) / variantWidth,
        y: (padding + baseAnchor.y * asset.height) / variantHeight,
      };
      const flipX = random.next() < request.settings.flipXChance;
      const flipY = random.next() < request.settings.flipYChance;
      const bounds = stampBounds(
        position,
        variantWidth,
        variantHeight,
        anchor,
        contentScale * (flipX ? -1 : 1),
        contentScale * (flipY ? -1 : 1),
        (rotation * Math.PI) / 180,
      );
      const left = clamp(bounds.x, 0, request.width);
      const top = clamp(bounds.y, 0, request.height);
      const right = clamp(bounds.x + bounds.width, 0, request.width);
      const bottom = clamp(bounds.y + bounds.height, 0, request.height);
      const clipped = {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
      if (clipped.width > 0 && clipped.height > 0) {
        affectedBounds = unionRect(affectedBounds, clipped);
      }
      placements.push({
        asset,
        pathStamp,
        flatIndex,
        position,
        direction,
        contentScale,
        rotation,
        opacity,
        flipX,
        flipY,
        anchor,
        bounds: clipped,
      });
      placementIndex += 1;
    }
  }
  if (!affectedBounds) {
    affectedBounds = { x: 0, y: 0, width: 1, height: 1 };
  }
  const localAffectedBounds = {
    x: affectedBounds.x - sourceBounds.x,
    y: affectedBounds.y - sourceBounds.y,
    width: affectedBounds.width,
    height: affectedBounds.height,
  };
  if (
    localAffectedBounds.x < 0 ||
    localAffectedBounds.y < 0 ||
    localAffectedBounds.x + localAffectedBounds.width > sourceBounds.width ||
    localAffectedBounds.y + localAffectedBounds.height > sourceBounds.height
  ) {
    throw new Error('Image Brush read bounds did not cover the final dirty region.');
  }
  const bufferStarted = clockNow();
  const layer = new Uint8ClampedArray(affectedBounds.width * affectedBounds.height * 4);
  const sourceRegion = cropDocumentRegion(sourceDocument, sourceBounds.width, localAffectedBounds);
  const outputRegion = sourceRegion.slice();
  timings.bufferCopyMs += clockNow() - bufferStarted;
  let renderedStamps = 0;
  let lastReportedPercent = -1;
  for (const placement of placements) {
    guard(options);
    const variant = variantForStamp(
      placement.asset,
      {
        ...placement.pathStamp,
        position: {
          x: placement.position.x - sourceBounds.x,
          y: placement.position.y - sourceBounds.y,
        },
        direction: placement.direction,
      },
      placement.flatIndex,
      totalPlacements,
      request.settings,
      request.settings.fxStage === 'after' ||
        request.settings.mutationMode === 'whole-trail' ||
        request.settings.mutationMode === 'clean'
        ? []
        : compatibleRack,
      request.seed,
      `${request.strokeId}:${request.settings.fxStage}`,
      request.evolutionOffset,
      previous,
      sourceDocument,
      sourceBounds.width,
      sourceBounds.height,
      cleanCache,
      fixedCache,
      perStampCache,
      timings,
    );
    if (
      options.collectPreviewVariants &&
      !previewVariantBuffers.has(variant.pixels.buffer) &&
      previewVariants.length < Math.max(1, options.maxPreviewVariants ?? 8)
    ) {
      previewVariantBuffers.add(variant.pixels.buffer);
      previewVariants.push(variant);
    }
    if (request.settings.mutationMode === 'evolving') {
      previous = variant;
    }
    const compositeStarted = clockNow();
    placeVariant(
      layer,
      affectedBounds.width,
      affectedBounds.height,
      { x: affectedBounds.x, y: affectedBounds.y },
      {
        ...variant,
        contentWidth: placement.asset.width,
        contentHeight: placement.asset.height,
      },
      placement.position,
      placement.anchor,
      placement.contentScale,
      placement.rotation,
      placement.opacity,
      placement.flipX,
      placement.flipY,
      request.settings.edgeSoftness,
      request.settings.blendMode,
    );
    timings.compositingMs += clockNow() - compositeStarted;
    renderedStamps += 1;
    const percent = Math.round((renderedStamps / Math.max(1, totalPlacements)) * 82);
    if (percent >= lastReportedPercent + 2 || renderedStamps === totalPlacements) {
      lastReportedPercent = percent;
      options.onProgress?.({
        phase: 'stamping',
        percent,
        detail: `Compositing ${renderedStamps} of ${totalPlacements} stamps`,
        current: renderedStamps,
        total: totalPlacements,
      });
    }
  }
  guard(options);
  if (
    request.settings.mutationMode !== 'clean' &&
    (request.settings.mutationMode === 'whole-trail' ||
      request.settings.fxStage === 'after' ||
      request.settings.fxStage === 'before-after')
  ) {
    options.onProgress?.({
      phase: 'post-fx',
      percent: 86,
      detail: 'Applying the FX rack to the local stroke region',
    });
    const prepared = prepareBrushTip(
      layer,
      affectedBounds.width,
      affectedBounds.height,
      request.settings.alphaMode,
      0,
    );
    const fxStarted = clockNow();
    const processed = processPreparedTipFx(
      prepared,
      scaledRack(
        compatibleRack,
        request.settings.mutationMode === 'whole-trail'
          ? clamp(
              request.settings.mutationAmount +
                request.settings.structuralDrift * 0.45 +
                request.settings.effectVariation * 0.2,
              0.01,
              1,
            )
          : request.settings.mutationAmount + request.settings.structuralDrift * 0.3,
        request.settings.effectVariation,
        `${request.seed}:post`,
      ),
      request.settings,
      `${request.seed}:${request.strokeId}:post`,
      { direction: request.stamps.at(-1)?.direction ?? { x: 1, y: 0 } },
    );
    if (
      options.collectPreviewVariants &&
      !previewVariantBuffers.has(processed.pixels.buffer) &&
      previewVariants.length < Math.max(1, options.maxPreviewVariants ?? 8)
    ) {
      previewVariantBuffers.add(processed.pixels.buffer);
      previewVariants.push(processed);
    }
    timings.fxProcessingMs += clockNow() - fxStarted;
    layer.set(processed.pixels.subarray(0, layer.length));
  }
  const compositeStarted = clockNow();
  compositeLocalLayer(outputRegion, layer, request.settings.blendMode);
  timings.compositingMs += clockNow() - compositeStarted;
  const affectedPixels = countChangedPixels(sourceRegion, outputRegion);
  const cachedBuffers = new Set<ArrayBuffer>();
  for (const tip of cleanCache.values()) cachedBuffers.add(tip.pixels.buffer);
  for (const tip of fixedCache.values()) cachedBuffers.add(tip.pixels.buffer);
  for (const pool of perStampCache.values()) {
    for (const tip of pool) if (tip) cachedBuffers.add(tip.pixels.buffer);
  }
  const cacheBytes = [...cachedBuffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const metrics: ImageBrushPerformanceMetrics = {
    pathInterpolationMs: 0,
    variantGenerationMs: timings.variantGenerationMs,
    fxProcessingMs: timings.fxProcessingMs,
    compositingMs: timings.compositingMs,
    bufferCopyMs: timings.bufferCopyMs,
    totalRenderMs: clockNow() - totalStarted,
    renderedStamps,
    changedPixels: affectedPixels,
    cacheVariants: cachedBuffers.size,
    cacheBytes,
    fullDocumentCopies: 0,
    localBufferBytes: layer.byteLength + sourceRegion.byteLength + outputRegion.byteLength,
  };
  options.onProgress?.({
    phase: 'post-fx',
    percent: 100,
    detail: `Finished ${renderedStamps} stamps in ${Math.round(metrics.totalRenderMs)} ms`,
    current: renderedStamps,
    total: totalPlacements,
  });
  return {
    jobId: request.jobId,
    pixels: outputRegion,
    bounds: affectedBounds,
    regionOnly: true,
    stampCount: renderedStamps,
    affectedPixels,
    nextEvolutionOffset: request.settings.continueBetweenStrokes
      ? request.evolutionOffset + renderedStamps
      : 0,
    metrics,
    previewVariants: options.collectPreviewVariants
      ? previewVariants.map((variant) => ({
          pixels: variant.pixels.slice(),
          width: variant.width,
          height: variant.height,
        }))
      : undefined,
  };
}
