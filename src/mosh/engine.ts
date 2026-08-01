import type { Point, Rectangle } from '../types';
import { clamp } from '../utils/geometry';
import { createSeededRandom, type RandomSource } from '../utils/prng';
import {
  moshEffectDefinitions,
  type MoshEffectCard,
  type MoshEffectId,
  type MoshEffectSettings,
  type MoshProcessResult,
  type MoshProgress,
} from './types';

export class MoshCancelledError extends Error {
  constructor() {
    super('MOSH LAB processing cancelled.');
    this.name = 'MoshCancelledError';
  }
}

interface ProcessContext {
  width: number;
  height: number;
  seed: string;
  selectionMask?: Uint8Array;
  brushMask?: Uint8Array;
  brushDirection?: Point;
  shouldCancel?: () => boolean;
  onProgress?: (progress: Omit<MoshProgress, 'jobId'>) => void;
  effectIndex: number;
  effectCount: number;
}

type IntervalMode = MoshEffectSettings['intervalMode'];

function guard(context: ProcessContext): void {
  if (context.shouldCancel?.()) throw new MoshCancelledError();
}

function pixelOffset(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

function lumaAt(pixels: Uint8ClampedArray, offset: number): number {
  return pixels[offset]! * 0.299 + pixels[offset + 1]! * 0.587 + pixels[offset + 2]! * 0.114;
}

function hueAndSaturation(r: number, g: number, b: number): [number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return [hue, maximum === 0 ? 0 : delta / maximum];
}

export function pixelSortValue(
  pixels: Uint8ClampedArray,
  offset: number,
  property: MoshEffectSettings['sortProperty'],
): number {
  const red = pixels[offset]!;
  const green = pixels[offset + 1]!;
  const blue = pixels[offset + 2]!;
  if (property === 'red') return red;
  if (property === 'green') return green;
  if (property === 'blue') return blue;
  if (property === 'rgb-sum') return red + green + blue;
  if (property === 'hue') return hueAndSaturation(red, green, blue)[0];
  if (property === 'saturation') return hueAndSaturation(red, green, blue)[1] * 255;
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

export function detectSortIntervals(
  values: readonly number[],
  mode: IntervalMode,
  lower: number,
  upper: number,
  minimumLength: number,
  maximumLength: number,
  random: RandomSource = createSeededRandom('intervals'),
): Array<[number, number]> {
  if (values.length === 0) return [];
  const minimum = Math.max(2, Math.floor(minimumLength));
  const maximum = Math.max(minimum, Math.floor(maximumLength));
  if (mode === 'full-row') return [[0, values.length]];
  if (mode === 'random') {
    const intervals: Array<[number, number]> = [];
    let cursor = random.int(0, Math.min(values.length - 1, minimum));
    while (cursor < values.length) {
      const length = random.int(minimum, maximum);
      const end = Math.min(values.length, cursor + length);
      if (end - cursor >= minimum) intervals.push([cursor, end]);
      cursor = end + random.int(2, Math.max(3, Math.round(minimum / 2)));
    }
    return intervals;
  }

  const active = (index: number): boolean => {
    const value = values[index]!;
    if (mode === 'waves') {
      const wave = (Math.sin(index / 11) + 1) * 0.5 * 255;
      return value >= Math.min(lower, wave) && value <= Math.max(upper, wave);
    }
    if (mode === 'edges') {
      const previous = values[Math.max(0, index - 1)]!;
      const next = values[Math.min(values.length - 1, index + 1)]!;
      return Math.abs(next - previous) <= Math.max(6, lower);
    }
    return value >= lower && value <= upper;
  };

  const intervals: Array<[number, number]> = [];
  let start = -1;
  for (let index = 0; index <= values.length; index += 1) {
    const inside = index < values.length && active(index);
    if (inside && start < 0) start = index;
    if ((!inside || index - start >= maximum) && start >= 0) {
      if (index - start >= minimum) intervals.push([start, index]);
      start = inside ? index : -1;
    }
  }
  return intervals;
}

function effectMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  card: MoshEffectCard,
  selectionMask?: Uint8Array,
  brushMask?: Uint8Array,
): Uint8Array | undefined {
  if (card.target === 'whole') return undefined;
  if (card.target === 'selection') return selectionMask ?? new Uint8Array(width * height);
  if (card.target === 'brush') return brushMask ?? new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  if (card.target === 'luminance') {
    for (let index = 0; index < width * height; index += 1) {
      const value = lumaAt(pixels, index * 4);
      mask[index] = value >= card.settings.maskLower && value <= card.settings.maskUpper ? 255 : 0;
    }
    return mask;
  }
  const luma = new Float32Array(width * height);
  for (let index = 0; index < luma.length; index += 1) luma[index] = lumaAt(pixels, index * 4);
  const threshold = Math.max(4, card.settings.edgeThreshold);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx =
        -luma[index - width - 1]! +
        luma[index - width + 1]! -
        2 * luma[index - 1]! +
        2 * luma[index + 1]! -
        luma[index + width - 1]! +
        luma[index + width + 1]!;
      const gy =
        -luma[index - width - 1]! -
        2 * luma[index - width]! -
        luma[index - width + 1]! +
        luma[index + width - 1]! +
        2 * luma[index + width]! +
        luma[index + width + 1]!;
      mask[index] = Math.hypot(gx, gy) >= threshold ? 255 : 0;
    }
  }
  return mask;
}

function mixOutput(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  mix: number,
  mask?: Uint8Array,
): Uint8ClampedArray {
  if (mix >= 0.999 && !mask) return output;
  const result = input.slice();
  for (let pixel = 0; pixel < input.length / 4; pixel += 1) {
    const amount = clamp(mix * (mask ? mask[pixel]! / 255 : 1), 0, 1);
    if (amount <= 0) continue;
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      result[offset + channel] = Math.round(
        input[offset + channel]! * (1 - amount) + output[offset + channel]! * amount,
      );
    }
  }
  return result;
}

function sortLine(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  indices: number[],
  settings: MoshEffectSettings,
  random: RandomSource,
): void {
  const values = indices.map((offset) => pixelSortValue(input, offset, settings.sortProperty));
  const intervals = detectSortIntervals(
    values,
    settings.intervalMode,
    settings.lowerThreshold,
    settings.upperThreshold,
    settings.intervalMin,
    settings.intervalMax,
    random,
  );
  for (const [start, end] of intervals) {
    const sorted = indices.slice(start, end).map((offset) => ({
      value: pixelSortValue(input, offset, settings.sortProperty),
      rgba: [input[offset]!, input[offset + 1]!, input[offset + 2]!, input[offset + 3]!] as [
        number,
        number,
        number,
        number,
      ],
    }));
    sorted.sort((first, second) =>
      settings.reverse ? second.value - first.value : first.value - second.value,
    );
    const disorderSwaps = Math.round(sorted.length * settings.disorder);
    for (let swap = 0; swap < disorderSwaps; swap += 1) {
      const first = random.int(0, sorted.length - 1);
      const second = random.int(0, sorted.length - 1);
      [sorted[first], sorted[second]] = [sorted[second]!, sorted[first]!];
    }
    for (let local = 0; local < sorted.length; local += 1) {
      const destination = indices[start + local]!;
      const rgba = sorted[local]!.rgba;
      output[destination] = rgba[0];
      output[destination + 1] = rgba[1];
      output[destination + 2] = rgba[2];
      if (!settings.preserveAlpha) output[destination + 3] = rgba[3];
    }
  }
}

function pixelSort(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  const output = input.slice();
  const random = createSeededRandom(`${context.seed}:${card.instanceId}:sort`);
  const processCoords = (coords: Array<[number, number]>) => {
    sortLine(
      input,
      output,
      coords.map(([x, y]) => pixelOffset(x, y, width)),
      settings,
      random,
    );
  };

  if (settings.pixelDirection === 'vertical') {
    for (let x = 0; x < width; x += 1) {
      const coords: Array<[number, number]> = [];
      for (let y = 0; y < height; y += 1) coords.push([x, y]);
      processCoords(coords);
      if (x % 32 === 0) guard(context);
    }
  } else if (
    settings.pixelDirection === 'diagonal-forward' ||
    settings.pixelDirection === 'diagonal-backward'
  ) {
    const backward = settings.pixelDirection === 'diagonal-backward';
    for (let diagonal = 0; diagonal < width + height - 1; diagonal += 1) {
      const coords: Array<[number, number]> = [];
      for (let y = 0; y < height; y += 1) {
        const rawX = diagonal - y;
        const x = backward ? width - 1 - rawX : rawX;
        if (x >= 0 && x < width) coords.push([x, y]);
      }
      if (coords.length > 1) processCoords(coords);
      if (diagonal % 32 === 0) guard(context);
    }
  } else if (settings.pixelDirection === 'radial') {
    const centerX = (width - 1) / 2;
    const centerY = (height - 1) / 2;
    const radius = Math.ceil(Math.hypot(width, height) / 2);
    const rays = Math.max(96, Math.round(Math.PI * Math.min(width, height)));
    for (let ray = 0; ray < rays; ray += 1) {
      const angle = (ray / rays) * Math.PI * 2;
      const coords: Array<[number, number]> = [];
      let previous = '';
      for (let distance = 0; distance < radius; distance += 1) {
        const x = Math.round(centerX + Math.cos(angle) * distance);
        const y = Math.round(centerY + Math.sin(angle) * distance);
        const key = `${x}:${y}`;
        if (x >= 0 && x < width && y >= 0 && y < height && key !== previous) coords.push([x, y]);
        previous = key;
      }
      if (coords.length > 1) processCoords(coords);
      if (ray % 24 === 0) guard(context);
    }
  } else {
    for (let y = 0; y < height; y += 1) {
      const coords: Array<[number, number]> = [];
      for (let x = 0; x < width; x += 1) coords.push([x, y]);
      processCoords(coords);
      if (y % 32 === 0) guard(context);
    }
  }
  return output;
}

function edgeCoordinate(
  value: number,
  maximum: number,
  mode: MoshEffectSettings['feedbackEdge'],
): number {
  if (mode === 'wrap') return ((value % maximum) + maximum) % maximum;
  if (mode === 'mirror') {
    const period = Math.max(1, (maximum - 1) * 2);
    const folded = ((value % period) + period) % period;
    return folded >= maximum ? period - folded : folded;
  }
  return clamp(value, 0, maximum - 1);
}

function sampleNearest(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
  edge: MoshEffectSettings['feedbackEdge'] = 'clamp',
): number {
  const sampleX = edgeCoordinate(Math.round(x), width, edge);
  const sampleY = edgeCoordinate(Math.round(y), height, edge);
  return pixels[pixelOffset(sampleX, sampleY, width) + channel]!;
}

function sampleBilinear(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
  wrap: boolean,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const edge = wrap ? 'wrap' : 'clamp';
  const a = sampleNearest(pixels, width, height, x0, y0, channel, edge);
  const b = sampleNearest(pixels, width, height, x0 + 1, y0, channel, edge);
  const c = sampleNearest(pixels, width, height, x0, y0 + 1, channel, edge);
  const d = sampleNearest(pixels, width, height, x0 + 1, y0 + 1, channel, edge);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function blendChannel(
  base: number,
  echo: number,
  mode: MoshEffectSettings['feedbackBlendMode'],
): number {
  if (mode === 'screen') return 255 - ((255 - base) * (255 - echo)) / 255;
  if (mode === 'multiply') return (base * echo) / 255;
  if (mode === 'difference') return Math.abs(base - echo);
  if (mode === 'lighten') return Math.max(base, echo);
  if (mode === 'darken') return Math.min(base, echo);
  return echo;
}

function feedback(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  let previous = input.slice();
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  for (let iteration = 0; iteration < settings.feedbackIterations; iteration += 1) {
    const next = previous.slice();
    const scale = Math.pow(settings.feedbackScale, iteration + 1);
    const angle = (settings.feedbackRotation * (iteration + 1) * Math.PI) / 180;
    const cosine = Math.cos(-angle);
    const sine = Math.sin(-angle);
    const amount = Math.pow(settings.opacityDecay, iteration + 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const translatedX = x - settings.translateX * (iteration + 1) - centerX;
        const translatedY = y - settings.translateY * (iteration + 1) - centerY;
        const sourceX = (translatedX * cosine - translatedY * sine) / scale + centerX;
        const sourceY = (translatedX * sine + translatedY * cosine) / scale + centerY;
        const destination = pixelOffset(x, y, width);
        for (let channel = 0; channel < 3; channel += 1) {
          const channelShift =
            channel === 0
              ? settings.feedbackChannelOffset
              : channel === 2
                ? -settings.feedbackChannelOffset
                : 0;
          let echo = sampleNearest(
            previous,
            width,
            height,
            sourceX + channelShift,
            sourceY,
            channel,
            settings.feedbackEdge,
          );
          const echoLuma =
            sampleNearest(previous, width, height, sourceX, sourceY, 0, settings.feedbackEdge) *
              0.299 +
            sampleNearest(previous, width, height, sourceX, sourceY, 1, settings.feedbackEdge) *
              0.587 +
            sampleNearest(previous, width, height, sourceX, sourceY, 2, settings.feedbackEdge) *
              0.114;
          echo = echoLuma + (echo - echoLuma) * Math.pow(settings.saturationDecay, iteration + 1);
          echo *= Math.pow(settings.brightnessDecay, iteration + 1);
          const blended = blendChannel(
            previous[destination + channel]!,
            echo,
            settings.feedbackBlendMode,
          );
          next[destination + channel] = Math.round(
            previous[destination + channel]! * (1 - amount) + blended * amount,
          );
        }
      }
      if (y % 24 === 0) guard(context);
    }
    if (settings.feedbackReset > 0) {
      const reset = clamp(settings.feedbackReset, 0, 1);
      for (let offset = 0; offset < next.length; offset += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          next[offset + channel] = Math.round(
            next[offset + channel]! * (1 - reset) + input[offset + channel]! * reset,
          );
        }
      }
    }
    previous = next;
    reportProgress(card, context, iteration + 1, settings.feedbackIterations);
  }
  return previous;
}

function scalarNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.0001) * 43758.5453;
  return value - Math.floor(value);
}

function fieldVector(
  source: MoshEffectSettings['motionFieldSource'],
  x: number,
  y: number,
  width: number,
  height: number,
  input: Uint8ClampedArray,
  seed: number,
  brushDirection?: Point,
): [number, number] {
  const centerX = width / 2;
  const centerY = height / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const length = Math.max(1, Math.hypot(dx, dy));
  if (source === 'radial') return [dx / length, dy / length];
  if (source === 'vortex') return [-dy / length, dx / length];
  if (source === 'noise-flow') {
    const angle = scalarNoise(x / 41, y / 41, seed) * Math.PI * 4;
    return [Math.cos(angle), Math.sin(angle)];
  }
  if (source === 'image-edges') {
    const gx =
      lumaAt(input, pixelOffset(clamp(x + 1, 0, width - 1), y, width)) -
      lumaAt(input, pixelOffset(clamp(x - 1, 0, width - 1), y, width));
    const gy =
      lumaAt(input, pixelOffset(x, clamp(y + 1, 0, height - 1), width)) -
      lumaAt(input, pixelOffset(x, clamp(y - 1, 0, height - 1), width));
    const gradient = Math.max(1, Math.hypot(gx, gy));
    return [-gy / gradient, gx / gradient];
  }
  if (source === 'brush-direction' && brushDirection) {
    const magnitude = Math.max(0.0001, Math.hypot(brushDirection.x, brushDirection.y));
    return [brushDirection.x / magnitude, brushDirection.y / magnitude];
  }
  return [1, 0];
}

function motionField(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  const block = Math.max(4, Math.round(settings.motionBlockSize));
  let previous = input.slice();
  const seedNumber = createSeededRandom(`${context.seed}:${card.instanceId}`).int(0, 0x7fffffff);
  for (let iteration = 0; iteration < settings.motionIterations; iteration += 1) {
    const next = settings.motionOverwrite ? previous.slice() : input.slice();
    const stepDistance =
      (settings.propagationLength / Math.max(1, settings.motionIterations)) *
      settings.vectorStrength *
      Math.pow(settings.motionPersistence, iteration);
    for (let blockY = 0; blockY < height; blockY += block) {
      for (let blockX = 0; blockX < width; blockX += block) {
        let [vectorX, vectorY] = fieldVector(
          settings.motionFieldSource,
          blockX,
          blockY,
          width,
          height,
          previous,
          seedNumber + iteration,
          context.brushDirection,
        );
        const jitter =
          (scalarNoise(blockX, blockY, seedNumber + iteration) - 0.5) * settings.vectorJitter;
        const cosine = Math.cos(jitter);
        const sine = Math.sin(jitter);
        [vectorX, vectorY] = [vectorX * cosine - vectorY * sine, vectorX * sine + vectorY * cosine];
        const sourceX = blockX - vectorX * stepDistance;
        const sourceY = blockY - vectorY * stepDistance;
        const amount = clamp(
          1 - (iteration * settings.motionDecay) / Math.max(1, settings.motionIterations),
          0.08,
          1,
        );
        for (let localY = 0; localY < block && blockY + localY < height; localY += 1) {
          for (let localX = 0; localX < block && blockX + localX < width; localX += 1) {
            const destination = pixelOffset(blockX + localX, blockY + localY, width);
            const sampleX = sourceX + localX;
            const sampleY = sourceY + localY;
            const red = sampleNearest(
              previous,
              width,
              height,
              sampleX,
              sampleY - settings.motionChromaDrift,
              0,
            );
            const green = sampleNearest(previous, width, height, sampleX, sampleY, 1);
            const blue = sampleNearest(
              previous,
              width,
              height,
              sampleX,
              sampleY + settings.motionChromaDrift,
              2,
            );
            const sourceLuma = red * 0.299 + green * 0.587 + blue * 0.114;
            for (let channel = 0; channel < 3; channel += 1) {
              const color = [red, green, blue][channel]!;
              const held =
                color * (1 - settings.motionLumaLock) + sourceLuma * settings.motionLumaLock;
              next[destination + channel] = Math.round(
                next[destination + channel]! * (1 - amount) + held * amount,
              );
            }
          }
        }
      }
      guard(context);
    }
    previous = next;
    reportProgress(card, context, iteration + 1, settings.motionIterations);
  }
  return previous;
}

function safeRegion(
  region: Rectangle | undefined,
  fallback: Rectangle,
  width: number,
  height: number,
): Rectangle {
  const source = region ?? fallback;
  const x = clamp(Math.floor(source.x), 0, width - 1);
  const y = clamp(Math.floor(source.y), 0, height - 1);
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.floor(source.width), width - x)),
    height: Math.max(1, Math.min(Math.floor(source.height), height - y)),
  };
}

function motionTransfer(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  if (!card.sourceRegion) {
    for (let repetition = 0; repetition < settings.transferRepetitions; repetition += 1) {
      reportProgress(card, context, repetition + 1, settings.transferRepetitions);
    }
    return input.slice();
  }
  const source = safeRegion(
    card.sourceRegion,
    { x: width * 0.1, y: height * 0.2, width: width * 0.28, height: height * 0.34 },
    width,
    height,
  );
  const destination = safeRegion(
    card.destinationRegion ?? undefined,
    { x: width * 0.56, y: height * 0.38, width: source.width, height: source.height },
    width,
    height,
  );
  const snapshot = input.slice();
  let output = input.slice();
  for (let repetition = 0; repetition < settings.transferRepetitions; repetition += 1) {
    const angle = (settings.transferRotation * repetition * Math.PI) / 180;
    const cosine = Math.cos(-angle);
    const sine = Math.sin(-angle);
    const scale = Math.pow(settings.transferScale, repetition);
    const distance = repetition * Math.min(source.width, source.height) * 0.24;
    const shiftX = Math.cos((settings.transferDirection * Math.PI) / 180) * distance;
    const shiftY = Math.sin((settings.transferDirection * Math.PI) / 180) * distance;
    const blend = settings.transferBlend * Math.pow(settings.transferDecay, repetition);
    for (let y = 0; y < destination.height; y += 1) {
      for (let x = 0; x < destination.width; x += 1) {
        const centeredX = (x - destination.width / 2) / Math.max(0.05, scale);
        const centeredY = (y - destination.height / 2) / Math.max(0.05, scale);
        const localX = centeredX * cosine - centeredY * sine + source.width / 2;
        const localY = centeredX * sine + centeredY * cosine + source.height / 2;
        const sourceX = source.x + (localX / destination.width) * source.width;
        const sourceY = source.y + (localY / destination.height) * source.height;
        const destinationX = Math.round(destination.x + x + shiftX);
        const destinationY = Math.round(destination.y + y + shiftY);
        if (destinationX < 0 || destinationX >= width || destinationY < 0 || destinationY >= height)
          continue;
        const offset = pixelOffset(destinationX, destinationY, width);
        const rgba = [0, 1, 2, 3].map((channel) =>
          sampleNearest(snapshot, width, height, sourceX, sourceY, channel),
        );
        if (settings.transferMode === 'copy-luma') {
          const luma = rgba[0]! * 0.299 + rgba[1]! * 0.587 + rgba[2]! * 0.114;
          const currentLuma = lumaAt(output, offset);
          for (let channel = 0; channel < 3; channel += 1) {
            rgba[channel] = clamp(output[offset + channel]! + luma - currentLuma, 0, 255);
          }
        } else if (settings.transferMode === 'copy-chroma') {
          const sourceLuma = rgba[0]! * 0.299 + rgba[1]! * 0.587 + rgba[2]! * 0.114;
          const targetLuma = lumaAt(output, offset);
          for (let channel = 0; channel < 3; channel += 1) {
            rgba[channel] = clamp(targetLuma + rgba[channel]! - sourceLuma, 0, 255);
          }
        }
        for (let channel = 0; channel < 3; channel += 1) {
          output[offset + channel] = Math.round(
            output[offset + channel]! * (1 - blend) + rgba[channel]! * blend,
          );
        }
        if (settings.transferMode === 'swap') {
          const swapX = Math.round(source.x + (x / destination.width) * source.width);
          const swapY = Math.round(source.y + (y / destination.height) * source.height);
          const swapOffset = pixelOffset(
            clamp(swapX, 0, width - 1),
            clamp(swapY, 0, height - 1),
            width,
          );
          for (let channel = 0; channel < 3; channel += 1) {
            output[swapOffset + channel] = snapshot[offset + channel]!;
          }
        }
      }
      if (y % 24 === 0) guard(context);
    }
    reportProgress(card, context, repetition + 1, settings.transferRepetitions);
  }
  return output;
}

function rgbToYcbcr(red: number, green: number, blue: number): [number, number, number] {
  return [
    red * 0.299 + green * 0.587 + blue * 0.114,
    128 - red * 0.168736 - green * 0.331264 + blue * 0.5,
    128 + red * 0.5 - green * 0.418688 - blue * 0.081312,
  ];
}

function ycbcrToRgb(y: number, cb: number, cr: number): [number, number, number] {
  return [
    clamp(y + 1.402 * (cr - 128), 0, 255),
    clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128), 0, 255),
    clamp(y + 1.772 * (cb - 128), 0, 255),
  ];
}

function chromaDrift(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  const output = input.slice();
  const block = Math.max(1, Math.round(settings.chromaBlockSize));
  const blur = Math.round(settings.chromaBlur);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelOffset(x, y, width);
      const lumaX = x - settings.lumaOffset;
      const luma = lumaAt(input, pixelOffset(clamp(Math.round(lumaX), 0, width - 1), y, width));
      const sampleX = Math.floor((x - settings.chromaX - settings.channelDelay) / block) * block;
      const sampleY = Math.floor((y - settings.chromaY) / block) * block;
      let cb = 0;
      let cr = 0;
      let samples = 0;
      for (let by = -blur; by <= blur; by += Math.max(1, blur || 1)) {
        for (let bx = -blur; bx <= blur; bx += Math.max(1, blur || 1)) {
          const source = pixelOffset(
            clamp(sampleX + bx, 0, width - 1),
            clamp(sampleY + by, 0, height - 1),
            width,
          );
          const converted = rgbToYcbcr(input[source]!, input[source + 1]!, input[source + 2]!);
          cb += converted[1];
          cr += converted[2];
          samples += 1;
        }
      }
      cb /= samples;
      cr /= samples;
      const neutral = 128;
      cb = neutral + (cb - neutral) * (1 - settings.chromaSubsampling * 0.45);
      cr = neutral + (cr - neutral) * (1 - settings.chromaSubsampling * 0.45);
      const rgb = ycbcrToRgb(luma, cb, cr);
      const heldLuma = lumaAt(input, offset);
      for (let channel = 0; channel < 3; channel += 1) {
        const sharp = input[offset + channel]!;
        const drifted = rgb[channel]!;
        const withHold = drifted + (heldLuma - luma) * settings.lumaHold;
        output[offset + channel] = Math.round(
          sharp * (1 - settings.colorBleed) + withHold * settings.colorBleed,
        );
      }
    }
    if (y % 24 === 0) guard(context);
  }
  reportProgress(card, context, 1, 1);
  return output;
}

export function alignedBlockOrigins(
  width: number,
  height: number,
  blockSize: number,
): Array<[number, number]> {
  const origins: Array<[number, number]> = [];
  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) origins.push([x, y]);
  }
  return origins;
}

function dctDamage(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  const block = settings.dctBlockSize;
  const output = input.slice();
  const random = createSeededRandom(`${context.seed}:${card.instanceId}:dct`);
  const quantizationStep = Math.max(2, Math.round(2 + settings.dctQuantization * 62));
  for (const [blockX, blockY] of alignedBlockOrigins(width, height, block)) {
    const blockWidth = Math.min(block, width - blockX);
    const blockHeight = Math.min(block, height - blockY);
    const average = [0, 0, 0];
    let count = 0;
    for (let y = 0; y < blockHeight; y += 1) {
      for (let x = 0; x < blockWidth; x += 1) {
        const offset = pixelOffset(blockX + x, blockY + y, width);
        for (let channel = 0; channel < 3; channel += 1)
          average[channel] += input[offset + channel]!;
        count += 1;
      }
    }
    for (let channel = 0; channel < 3; channel += 1) average[channel] /= count;
    const dropout = random.next() < settings.coefficientDropout;
    const replace = random.next() < settings.randomBlockReplacement;
    const inherit = random.next() < settings.neighborInheritance;
    const neighborX = clamp(blockX - block, 0, width - 1);
    for (let y = 0; y < blockHeight; y += 1) {
      for (let x = 0; x < blockWidth; x += 1) {
        const destination = pixelOffset(blockX + x, blockY + y, width);
        const neighbor = pixelOffset(neighborX + Math.min(x, block - 1), blockY + y, width);
        const boundary =
          x === 0 || y === 0 || x === blockWidth - 1 || y === blockHeight - 1 ? 1 : 0;
        const ring = Math.sin(((x + y) / block) * Math.PI * 4) * settings.ringingStrength * 32;
        for (let channel = 0; channel < 3; channel += 1) {
          const source =
            replace || inherit ? input[neighbor + channel]! : input[destination + channel]!;
          const detail = dropout ? 0 : source - average[channel]!;
          let value =
            average[channel]! * (1 + settings.lowFrequencyBoost * 0.2) +
            detail * (1 - settings.highFrequencyRemoval);
          value = Math.round(value / quantizationStep) * quantizationStep;
          value += ring + boundary * settings.blockBoundaryStrength * 42;
          if (channel !== 0 && settings.chromaQuality < 1) {
            const luma = average[0]! * 0.299 + average[1]! * 0.587 + average[2]! * 0.114;
            value = value * settings.chromaQuality + luma * (1 - settings.chromaQuality);
          }
          output[destination + channel] = clamp(Math.round(value), 0, 255);
        }
      }
    }
    if (blockY % (block * 16) === 0) guard(context);
  }
  reportProgress(card, context, 1, 1);
  return output;
}

function edgeData(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): {
  magnitude: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
} {
  const luma = new Float32Array(width * height);
  const magnitude = new Float32Array(width * height);
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let index = 0; index < luma.length; index += 1) luma[index] = lumaAt(input, index * 4);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      gx[index] = luma[index + 1]! - luma[index - 1]!;
      gy[index] = luma[index + width]! - luma[index - width]!;
      magnitude[index] = Math.hypot(gx[index]!, gy[index]!);
    }
  }
  return { magnitude, gx, gy };
}

function edgeMelt(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  const output = input.slice();
  const edges = edgeData(input, width, height);
  const threshold = settings.edgeThreshold / Math.max(0.1, settings.edgeSensitivity);
  const vertical = settings.edgeDirection === 'down' || settings.edgeDirection === 'up';
  const reverse = settings.edgeDirection === 'up' || settings.edgeDirection === 'toward';
  const outer = vertical ? width : height;
  const inner = vertical ? height : width;
  for (let line = 0; line < outer; line += 1) {
    let carriedOffset = -1;
    let age = settings.meltLength + 1;
    for (let step = 0; step < inner; step += 1) {
      const position = reverse ? inner - 1 - step : step;
      const x = vertical ? line : position;
      const y = vertical ? position : line;
      const index = y * width + x;
      const strong = edges.magnitude[index]! >= threshold;
      const eligible = settings.invertEdgeMask ? !strong : strong;
      if (eligible) {
        carriedOffset = index * 4;
        age = 0;
      } else {
        age += 1;
      }
      if (carriedOffset < 0 || age > settings.meltLength) continue;
      if (settings.preserveStrongEdges && strong) continue;
      const spreadPhase = Math.sin((age / Math.max(1, settings.meltLength)) * Math.PI * 3);
      const lateral = Math.round(spreadPhase * settings.meltSpread);
      const destinationX = clamp(x + (vertical ? lateral : 0), 0, width - 1);
      const destinationY = clamp(y + (vertical ? 0 : lateral), 0, height - 1);
      const destination = pixelOffset(destinationX, destinationY, width);
      const fade = Math.pow(1 - age / Math.max(1, settings.meltLength), 1 + settings.meltBlur);
      const amount = settings.colorCarry * fade;
      for (let channel = 0; channel < 3; channel += 1) {
        output[destination + channel] = Math.round(
          input[destination + channel]! * (1 - amount) + input[carriedOffset + channel]! * amount,
        );
      }
    }
    if (line % 24 === 0) guard(context);
  }
  reportProgress(card, context, 1, 1);
  return output;
}

function flowVector(
  settings: MoshEffectSettings,
  x: number,
  y: number,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  seed: number,
  iteration: number,
): [number, number] {
  const centerX = width / 2;
  const centerY = height / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const radius = Math.max(1, Math.hypot(dx, dy));
  let vectorX = 0;
  let vectorY = 0;
  if (settings.flowType === 'vortex') [vectorX, vectorY] = [-dy / radius, dx / radius];
  else if (settings.flowType === 'radial-explosion')
    [vectorX, vectorY] = [dx / radius, dy / radius];
  else if (settings.flowType === 'radial-implosion')
    [vectorX, vectorY] = [-dx / radius, -dy / radius];
  else if (settings.flowType === 'waves') {
    vectorX = Math.sin(y / Math.max(4, settings.flowScale) + iteration);
    vectorY = Math.cos(x / Math.max(4, settings.flowScale) + iteration) * 0.5;
  } else if (settings.flowType === 'image-luminance') {
    const value = lumaAt(pixels, pixelOffset(x, y, width)) / 255;
    const angle = value * Math.PI * 2 + (settings.flowDirection * Math.PI) / 180;
    vectorX = Math.cos(angle);
    vectorY = Math.sin(angle);
  } else {
    for (let octave = 0; octave < settings.flowOctaves; octave += 1) {
      const frequency = Math.pow(2, octave) / Math.max(4, settings.flowScale);
      const weight = Math.pow(settings.flowPersistence, octave);
      const phase = ((seed % 100003) / 100003) * Math.PI * 2 + octave * 1.73;
      const wave =
        Math.sin(x * frequency + phase + iteration * 0.31) +
        Math.cos(y * frequency * 1.17 - phase - iteration * 0.23) +
        Math.sin((x + y) * frequency * 0.47 + phase * 0.6);
      const angle = wave * Math.PI * (settings.flowType === 'turbulence' ? 1.35 : 0.72);
      vectorX += Math.cos(angle) * weight;
      vectorY += Math.sin(angle) * weight;
    }
    if (settings.flowType === 'curl-noise') [vectorX, vectorY] = [-vectorY, vectorX];
  }
  const rotation = (settings.flowDirection * Math.PI) / 180;
  return [
    vectorX * Math.cos(rotation) - vectorY * Math.sin(rotation),
    vectorX * Math.sin(rotation) + vectorY * Math.cos(rotation),
  ];
}

function flowField(
  input: Uint8ClampedArray,
  card: MoshEffectCard,
  context: ProcessContext,
): Uint8ClampedArray {
  const { width, height } = context;
  const settings = card.settings;
  let previous = input.slice();
  const seedNumber = createSeededRandom(`${context.seed}:${card.instanceId}:flow`).int(
    0,
    0x7fffffff,
  );
  for (let iteration = 0; iteration < settings.flowIterations; iteration += 1) {
    const next = new Uint8ClampedArray(previous.length);
    const stepStrength = settings.flowStrength / Math.max(1, settings.flowIterations);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const [vectorX, vectorY] = flowVector(
          settings,
          x,
          y,
          width,
          height,
          previous,
          seedNumber,
          iteration,
        );
        const sourceX = x - vectorX * stepStrength;
        const sourceY = y - vectorY * stepStrength;
        const destination = pixelOffset(x, y, width);
        for (let channel = 0; channel < 4; channel += 1) {
          next[destination + channel] =
            settings.flowInterpolation === 'bilinear'
              ? sampleBilinear(
                  previous,
                  width,
                  height,
                  sourceX,
                  sourceY,
                  channel,
                  settings.flowWrapping,
                )
              : sampleNearest(
                  previous,
                  width,
                  height,
                  sourceX,
                  sourceY,
                  channel,
                  settings.flowWrapping ? 'wrap' : 'clamp',
                );
        }
      }
      if (y % 24 === 0) guard(context);
    }
    previous = next;
    reportProgress(card, context, iteration + 1, settings.flowIterations);
  }
  return previous;
}

function reportProgress(
  card: MoshEffectCard,
  context: ProcessContext,
  pass: number,
  passes: number,
): void {
  const definition = moshEffectDefinitions.find((item) => item.id === card.effectId)!;
  context.onProgress?.({
    effectId: card.effectId,
    effectName: definition.name,
    effectIndex: context.effectIndex,
    effectCount: context.effectCount,
    pass,
    passes,
    percent: Math.round(
      ((context.effectIndex + pass / Math.max(1, passes)) / Math.max(1, context.effectCount)) * 100,
    ),
  });
}

const processors: Record<
  MoshEffectId,
  (input: Uint8ClampedArray, card: MoshEffectCard, context: ProcessContext) => Uint8ClampedArray
> = {
  'pixel-sort': pixelSort,
  feedback,
  'motion-field': motionField,
  'motion-transfer': motionTransfer,
  'chroma-drift': chromaDrift,
  'dct-damage': dctDamage,
  'edge-melt': edgeMelt,
  'flow-field': flowField,
};

export function countChangedPixels(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let changed = 0;
  const length = Math.min(before.length, after.length);
  for (let offset = 0; offset < length; offset += 4) {
    if (
      before[offset] !== after[offset] ||
      before[offset + 1] !== after[offset + 1] ||
      before[offset + 2] !== after[offset + 2] ||
      before[offset + 3] !== after[offset + 3]
    ) {
      changed += 1;
    }
  }
  return changed;
}

export function processMoshStack(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rack: MoshEffectCard[],
  seed: string,
  options: {
    selectionMask?: Uint8Array;
    brushMask?: Uint8Array;
    brushDirection?: Point;
    shouldCancel?: () => boolean;
    onProgress?: (progress: Omit<MoshProgress, 'jobId'>) => void;
  } = {},
): MoshProcessResult {
  const enabled = rack.filter((card) => card.enabled);
  let output = pixels.slice();
  enabled.forEach((card, effectIndex) => {
    const context: ProcessContext = {
      width,
      height,
      seed,
      selectionMask: options.selectionMask,
      brushMask: options.brushMask,
      brushDirection: options.brushDirection,
      shouldCancel: options.shouldCancel,
      onProgress: options.onProgress,
      effectIndex,
      effectCount: enabled.length,
    };
    guard(context);
    const input = output;
    const processed = processors[card.effectId](input, card, context);
    const mask = effectMask(input, width, height, card, options.selectionMask, options.brushMask);
    output = mixOutput(input, processed, card.mix, mask);
    if (card.effectId === 'pixel-sort') reportProgress(card, context, 1, 1);
  });
  return {
    jobId: '',
    pixels: output,
    affectedPixels: countChangedPixels(pixels, output),
    completedEffects: enabled.length,
  };
}
