import type { GlitchAlgorithm, GlitchContext, GlitchResult, Rectangle } from '../types';
import { clamp, mirrorCoordinate, pixelToByteOffset } from '../utils/geometry';
import { createSeededRandom } from '../utils/prng';
import { clipRectangle, extractRegion, type RegionSnapshot } from './structuralUtils';

function result(bounds: Rectangle, touchedPixels: number): GlitchResult {
  return { bounds: { ...bounds }, touchedPixels };
}

function luma(pixels: Uint8ClampedArray, offset: number): number {
  return pixels[offset]! * 0.299 + pixels[offset + 1]! * 0.587 + pixels[offset + 2]! * 0.114;
}

function hueSaturation(red: number, green: number, blue: number): [number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return [hue, maximum === 0 ? 0 : delta / maximum];
}

function sortValue(
  pixels: Uint8ClampedArray,
  offset: number,
  property: GlitchContext['settings']['sortBrushProperty'],
): number {
  if (property === 'luminance') return luma(pixels, offset);
  if (property === 'rgb-sum') {
    return (pixels[offset]! + pixels[offset + 1]! + pixels[offset + 2]!) / 3;
  }
  const [hue, saturation] = hueSaturation(
    pixels[offset]!,
    pixels[offset + 1]!,
    pixels[offset + 2]!,
  );
  return property === 'hue' ? (hue / 360) * 255 : saturation * 255;
}

function influenceAt(context: GlitchContext, x: number, y: number, _spill = 0): number {
  if (x < 0 || y < 0 || x >= context.width || y >= context.height) return 0;
  const masked = context.mask[y * context.width + x] ?? 0;
  return clamp(masked * context.strength * context.pressure, 0, 1);
}

function edgeCoordinate(value: number, size: number, edge: 'clamp' | 'wrap' | 'mirror'): number {
  if (edge === 'wrap') return ((Math.round(value) % size) + size) % size;
  if (edge === 'mirror') return mirrorCoordinate(Math.round(value), size);
  return clamp(Math.round(value), 0, size - 1);
}

function sampleNearest(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
  edge: 'clamp' | 'wrap' | 'mirror' = 'clamp',
): number {
  const sourceX = edgeCoordinate(x, width, edge);
  const sourceY = edgeCoordinate(y, height, edge);
  return pixels[pixelToByteOffset(sourceX, sourceY, width) + channel]!;
}

function sampleBilinear(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
  edge: 'clamp' | 'wrap' | 'mirror',
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const top =
    sampleNearest(pixels, width, height, x0, y0, channel, edge) * (1 - tx) +
    sampleNearest(pixels, width, height, x0 + 1, y0, channel, edge) * tx;
  const bottom =
    sampleNearest(pixels, width, height, x0, y0 + 1, channel, edge) * (1 - tx) +
    sampleNearest(pixels, width, height, x0 + 1, y0 + 1, channel, edge) * tx;
  return top * (1 - ty) + bottom * ty;
}

function blendChannel(
  current: number,
  incoming: number,
  amount: number,
  mode: GlitchContext['settings']['feedbackBrushBlendMode'] = 'normal',
): number {
  let blended = incoming;
  if (mode === 'screen') blended = 255 - ((255 - current) * (255 - incoming)) / 255;
  else if (mode === 'multiply') blended = (current * incoming) / 255;
  else if (mode === 'difference') blended = Math.abs(current - incoming);
  else if (mode === 'lighten') blended = Math.max(current, incoming);
  return clamp(Math.round(current * (1 - amount) + blended * amount), 0, 255);
}

function strokeFrame(context: GlitchContext, fallbackAngle: number) {
  let dx = context.movement?.x ?? 0;
  let dy = context.movement?.y ?? 0;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    const angle = (fallbackAngle * Math.PI) / 180;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
  } else {
    dx /= length;
    dy /= length;
  }
  return { tangentX: dx, tangentY: dy, normalX: -dy, normalY: dx };
}

function sampleSnapshot(
  snapshot: RegionSnapshot,
  x: number,
  y: number,
  channel: number,
  edgeMode: 'clamp' | 'mirror' | 'wrap' = 'clamp',
): number {
  const localWidth = snapshot.bounds.width;
  const localHeight = snapshot.bounds.height;
  let localX = Math.round(x) - snapshot.bounds.x;
  let localY = Math.round(y) - snapshot.bounds.y;
  if (edgeMode === 'wrap') {
    localX = ((localX % localWidth) + localWidth) % localWidth;
    localY = ((localY % localHeight) + localHeight) % localHeight;
  } else if (edgeMode === 'mirror') {
    localX = mirrorCoordinate(localX, localWidth);
    localY = mirrorCoordinate(localY, localHeight);
  } else {
    localX = clamp(localX, 0, localWidth - 1);
    localY = clamp(localY, 0, localHeight - 1);
  }
  return snapshot.data[(localY * localWidth + localX) * 4 + channel]!;
}

function snapshotLuma(snapshot: RegionSnapshot, x: number, y: number): number {
  return (
    sampleSnapshot(snapshot, x, y, 0) * 0.299 +
    sampleSnapshot(snapshot, x, y, 1) * 0.587 +
    sampleSnapshot(snapshot, x, y, 2) * 0.114
  );
}

const pixelSortBrush: GlitchAlgorithm = {
  id: 'pixel-sort-brush',
  name: 'Pixel Sort Brush',
  family: 'advanced-brush',
  apply(context) {
    const { settings, width, height } = context;
    const source = context.pixels.slice();
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    const movement = context.movement ?? { x: 1, y: 0 };
    const strokeVertical = Math.abs(movement.y) > Math.abs(movement.x);
    let vertical =
      settings.sortBrushDirection === 'vertical' ||
      (settings.sortBrushDirection === 'stroke' && strokeVertical) ||
      (settings.sortBrushDirection === 'perpendicular' && !strokeVertical);
    if (settings.sortBrushDirection === 'horizontal') vertical = false;
    const lineStart = vertical ? bounds.x : bounds.y;
    const lineEnd = vertical ? bounds.x + bounds.width : bounds.y + bounds.height;
    const axisStart = vertical ? bounds.y : bounds.x;
    const axisEnd = vertical ? bounds.y + bounds.height : bounds.x + bounds.width;
    const random = createSeededRandom(`${context.seed}:pixel-sort-brush`);
    let touched = 0;
    for (let line = lineStart; line < lineEnd; line += 1) {
      let cursor = axisStart;
      while (cursor < axisEnd) {
        const x = vertical ? line : cursor;
        const y = vertical ? cursor : line;
        const offset = pixelToByteOffset(x, y, width);
        const candidateValue = sortValue(source, offset, settings.sortBrushProperty);
        const eligible =
          influenceAt(context, x, y, 0) > 0.03 &&
          candidateValue >= settings.sortBrushThresholdLow &&
          candidateValue <= settings.sortBrushThresholdHigh;
        if (!eligible) {
          cursor += 1;
          continue;
        }
        const runStart = cursor;
        let softGap = 0;
        let runEnd = runStart;
        while (cursor < axisEnd) {
          const runX = vertical ? line : cursor;
          const runY = vertical ? cursor : line;
          const runOffset = pixelToByteOffset(runX, runY, width);
          if (influenceAt(context, runX, runY, 0) <= 0.03) break;
          const runValue = sortValue(source, runOffset, settings.sortBrushProperty);
          if (
            runValue < settings.sortBrushThresholdLow ||
            runValue > settings.sortBrushThresholdHigh
          ) {
            softGap += 1;
            if (softGap > settings.sortBrushEdgeSoftness) break;
          } else {
            softGap = 0;
            runEnd = cursor + 1;
          }
          cursor += 1;
        }
        const rawLength = runEnd - runStart;
        cursor = runEnd;
        if (rawLength < settings.sortBrushIntervalMin) continue;
        const runLength = Math.min(
          rawLength,
          settings.sortBrushIntervalMax,
          settings.sortBrushLength,
        );
        const pixels = Array.from({ length: runLength }, (_, index) => {
          const position = runStart + index;
          const sourceX = vertical ? line : position;
          const sourceY = vertical ? position : line;
          const sourceOffset = pixelToByteOffset(sourceX, sourceY, width);
          return {
            rgba: source.slice(sourceOffset, sourceOffset + 4),
            value: sortValue(source, sourceOffset, settings.sortBrushProperty),
          };
        }).sort((a, b) => (settings.sortBrushReverse ? b.value - a.value : a.value - b.value));
        const swaps = Math.round(pixels.length * settings.sortBrushDisorder);
        for (let swap = 0; swap < swaps; swap += 1) {
          const first = random.int(0, pixels.length - 1);
          const second = clamp(first + random.int(-4, 4), 0, pixels.length - 1);
          [pixels[first], pixels[second]] = [pixels[second]!, pixels[first]!];
        }
        for (let index = 0; index < pixels.length; index += 1) {
          const position = runStart + index;
          const destinationX = vertical ? line : position;
          const destinationY = vertical ? position : line;
          const influence = influenceAt(context, destinationX, destinationY, 0);
          const destination = pixelToByteOffset(destinationX, destinationY, width);
          for (let channel = 0; channel < 3; channel += 1) {
            context.pixels[destination + channel] = blendChannel(
              source[destination + channel]!,
              pixels[index]!.rgba[channel]!,
              influence,
            );
          }
          touched += 1;
        }
      }
    }
    return result(bounds, touched);
  },
};

const feedbackBrush: GlitchAlgorithm = {
  id: 'feedback-brush',
  name: 'Feedback Brush',
  family: 'advanced-brush',
  apply(context) {
    const { settings, width, height } = context;
    const source =
      context.feedbackMemory?.length === context.pixels.length
        ? context.feedbackMemory
        : context.pixels.slice();
    const base = context.pixels.slice();
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    const centerX = context.bounds.x + context.bounds.width / 2;
    const centerY = context.bounds.y + context.bounds.height / 2;
    let touched = 0;
    for (let echo = settings.feedbackBrushEchoCount; echo >= 1; echo -= 1) {
      const angle = (-settings.feedbackBrushRotation * echo * Math.PI) / 180;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const scale = Math.pow(settings.feedbackBrushScale, echo);
      const opacity =
        Math.pow(settings.feedbackBrushOpacityDecay, echo) * settings.feedbackBrushPersistence;
      const brightness = Math.pow(settings.feedbackBrushBrightnessDecay, echo);
      for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
        for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
          const influence = influenceAt(
            context,
            x,
            y,
            Math.max(
              8,
              Math.abs(settings.feedbackBrushOffsetX) + Math.abs(settings.feedbackBrushOffsetY),
            ),
          );
          if (influence <= 0.015) continue;
          const localX =
            (x - centerX - settings.feedbackBrushOffsetX * echo) / Math.max(0.1, scale);
          const localY =
            (y - centerY - settings.feedbackBrushOffsetY * echo) / Math.max(0.1, scale);
          const sourceX = centerX + localX * cosine - localY * sine;
          const sourceY = centerY + localX * sine + localY * cosine;
          const destination = pixelToByteOffset(x, y, width);
          const channelDelay = settings.feedbackBrushRgbDelay * echo;
          const sampledRed =
            sampleNearest(source, width, height, sourceX - channelDelay, sourceY, 0, 'clamp') *
            brightness;
          const sampledGreen =
            sampleNearest(source, width, height, sourceX, sourceY, 1, 'clamp') * brightness;
          const sampledBlue =
            sampleNearest(source, width, height, sourceX + channelDelay, sourceY, 2, 'clamp') *
            brightness;
          const blendAmount = clamp(opacity * influence, 0, 1);
          context.pixels[destination] = blendChannel(
            context.pixels[destination]!,
            sampledRed,
            blendAmount,
            settings.feedbackBrushBlendMode,
          );
          context.pixels[destination + 1] = blendChannel(
            context.pixels[destination + 1]!,
            sampledGreen,
            blendAmount,
            settings.feedbackBrushBlendMode,
          );
          context.pixels[destination + 2] = blendChannel(
            context.pixels[destination + 2]!,
            sampledBlue,
            blendAmount,
            settings.feedbackBrushBlendMode,
          );
          touched += 1;
        }
      }
    }
    if (context.feedbackMemory) {
      for (let offset = 0; offset < context.pixels.length; offset += 4) {
        if (
          base[offset] !== context.pixels[offset] ||
          base[offset + 1] !== context.pixels[offset + 1] ||
          base[offset + 2] !== context.pixels[offset + 2]
        ) {
          touched += 1;
        }
      }
    }
    return result(bounds, touched);
  },
};

function scalarNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.017) * 43758.5453;
  return value - Math.floor(value);
}

const displacementBrush: GlitchAlgorithm = {
  id: 'displacement-brush',
  name: 'Displacement Brush',
  family: 'advanced-brush',
  apply(context) {
    const { settings, width, height } = context;
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    const random = createSeededRandom(`${context.seed}:displacement`);
    const seed = random.int(1, 0x7fffffff);
    let previous = context.pixels.slice();
    let touched = 0;
    const centerX = context.bounds.x + context.bounds.width / 2;
    const centerY = context.bounds.y + context.bounds.height / 2;
    for (let iteration = 0; iteration < settings.displacementBrushIterations; iteration += 1) {
      const next = previous.slice();
      for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
        for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
          const influence = influenceAt(context, x, y, settings.displacementBrushSpill);
          if (influence <= 0.01) continue;
          let fieldX = 0;
          let fieldY = 0;
          if (settings.displacementBrushSource === 'waves') {
            fieldX = Math.sin(y / Math.max(3, settings.displacementBrushScale));
            fieldY = Math.cos(x / Math.max(3, settings.displacementBrushScale));
          } else if (settings.displacementBrushSource === 'pressure') {
            fieldX = context.pressure * 2 - 1;
            fieldY = (1 - context.pressure) * 0.65;
          } else if (settings.displacementBrushSource === 'luminance') {
            const value = luma(previous, pixelToByteOffset(x, y, width)) / 255;
            const angle = value * Math.PI * 2;
            fieldX = Math.cos(angle);
            fieldY = Math.sin(angle);
          } else if (settings.displacementBrushSource === 'edges') {
            fieldX =
              (luma(previous, pixelToByteOffset(clamp(x + 1, 0, width - 1), y, width)) -
                luma(previous, pixelToByteOffset(clamp(x - 1, 0, width - 1), y, width))) /
              255;
            fieldY =
              (luma(previous, pixelToByteOffset(x, clamp(y + 1, 0, height - 1), width)) -
                luma(previous, pixelToByteOffset(x, clamp(y - 1, 0, height - 1), width))) /
              255;
          } else if (
            settings.displacementBrushSource === 'radial' ||
            settings.displacementBrushSource === 'vortex'
          ) {
            const dx = x - centerX;
            const dy = y - centerY;
            const magnitude = Math.max(1, Math.hypot(dx, dy));
            fieldX = dx / magnitude;
            fieldY = dy / magnitude;
            if (settings.displacementBrushSource === 'vortex') {
              [fieldX, fieldY] = [-fieldY, fieldX];
            }
          } else {
            let amplitude = 1;
            let frequency = 1 / Math.max(3, settings.displacementBrushScale);
            for (let octave = 0; octave < settings.displacementBrushOctaves; octave += 1) {
              const angle =
                scalarNoise(x * frequency, y * frequency, seed + octave * 97) * Math.PI * 2;
              fieldX += Math.cos(angle) * amplitude;
              fieldY += Math.sin(angle) * amplitude;
              amplitude *= settings.displacementBrushRoughness;
              frequency *= 2;
            }
          }
          const sourceX = x - fieldX * settings.displacementBrushStrengthX * influence;
          const sourceY = y - fieldY * settings.displacementBrushStrengthY * influence;
          const destination = pixelToByteOffset(x, y, width);
          for (let channel = 0; channel < 3; channel += 1) {
            const sampled =
              settings.displacementBrushInterpolation === 'bilinear'
                ? sampleBilinear(
                    previous,
                    width,
                    height,
                    sourceX,
                    sourceY,
                    channel,
                    settings.displacementBrushEdgeMode,
                  )
                : sampleNearest(
                    previous,
                    width,
                    height,
                    sourceX,
                    sourceY,
                    channel,
                    settings.displacementBrushEdgeMode,
                  );
            next[destination + channel] = blendChannel(
              previous[destination + channel]!,
              sampled,
              influence,
            );
          }
          touched += 1;
        }
      }
      previous = next;
    }
    context.pixels.set(previous);
    return result(bounds, touched);
  },
};

const flowMoshBrush: GlitchAlgorithm = {
  id: 'flow-mosh-brush',
  name: 'Flow Mosh Brush',
  family: 'advanced-brush',
  apply(context) {
    const { settings, width, height } = context;
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    const movement = context.movement ?? { x: 0, y: 0 };
    const speed = Math.hypot(movement.x, movement.y);
    const fallback = (settings.flowBrushFallbackAngle * Math.PI) / 180;
    const movementAngle = speed > 0.001 ? Math.atan2(movement.y, movement.x) : fallback;
    const angle =
      movementAngle * settings.flowBrushDirectionInfluence +
      fallback * (1 - settings.flowBrushDirectionInfluence);
    const vectorX = Math.cos(angle);
    const vectorY = Math.sin(angle);
    const speedFactor = clamp(0.65 + speed / 80, 0.65, 1.85);
    const random = createSeededRandom(`${context.seed}:flow-mosh-brush`);
    let previous = context.pixels.slice();
    let touched = 0;
    const block = Math.max(3, Math.round(settings.flowBrushBlockSize));
    for (let iteration = 0; iteration < settings.flowBrushIterations; iteration += 1) {
      const next = settings.flowBrushOverwrite ? previous.slice() : context.pixels.slice();
      const distance =
        (settings.flowBrushPropagation / Math.max(1, settings.flowBrushIterations)) *
        (iteration + 1) *
        speedFactor;
      const jitterAngle = (random.next() - 0.5) * settings.flowBrushJitter * Math.PI;
      const dx = vectorX * Math.cos(jitterAngle) - vectorY * Math.sin(jitterAngle);
      const dy = vectorX * Math.sin(jitterAngle) + vectorY * Math.cos(jitterAngle);
      const decay = Math.pow(1 - settings.flowBrushDecay, iteration);
      for (let blockY = bounds.y; blockY < bounds.y + bounds.height; blockY += block) {
        for (let blockX = bounds.x; blockX < bounds.x + bounds.width; blockX += block) {
          const blockJitter = (random.next() - 0.5) * block * settings.flowBrushJitter;
          for (
            let localY = 0;
            localY < block && blockY + localY < bounds.y + bounds.height;
            localY += 1
          ) {
            for (
              let localX = 0;
              localX < block && blockX + localX < bounds.x + bounds.width;
              localX += 1
            ) {
              const x = blockX + localX;
              const y = blockY + localY;
              const influence = influenceAt(context, x, y);
              if (influence <= 0.015) continue;
              const destination = pixelToByteOffset(x, y, width);
              const sourceX = x - dx * distance - dy * blockJitter;
              const sourceY = y - dy * distance + dx * blockJitter;
              const sampled = [
                sampleNearest(
                  previous,
                  width,
                  height,
                  sourceX - dx * settings.flowBrushChromaLag,
                  sourceY - dy * settings.flowBrushChromaLag,
                  0,
                ),
                sampleNearest(previous, width, height, sourceX, sourceY, 1),
                sampleNearest(
                  previous,
                  width,
                  height,
                  sourceX + dx * settings.flowBrushChromaLag,
                  sourceY + dy * settings.flowBrushChromaLag,
                  2,
                ),
              ];
              const sourceLuma = sampled[0]! * 0.299 + sampled[1]! * 0.587 + sampled[2]! * 0.114;
              for (let channel = 0; channel < 3; channel += 1) {
                const held =
                  sampled[channel]! * (1 - settings.flowBrushLumaLock) +
                  sourceLuma * settings.flowBrushLumaLock;
                next[destination + channel] = blendChannel(
                  next[destination + channel]!,
                  held,
                  clamp(influence * decay * settings.flowBrushVectorPersistence, 0, 1),
                );
              }
              touched += 1;
            }
          }
        }
      }
      previous = next;
    }
    context.pixels.set(previous);
    return result(bounds, touched);
  },
};

const cloneCorruptionBrush: GlitchAlgorithm = {
  id: 'clone-corruption-brush',
  name: 'Clone Corruption Brush',
  family: 'advanced-brush',
  apply(context) {
    const { cloneSource, settings, width, height } = context;
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    if (!cloneSource) return result(bounds, 0);
    const sourceBounds = clipRectangle(cloneSource, width, height);
    if (!sourceBounds.width || !sourceBounds.height) return result(bounds, 0);
    const source = context.pixels.slice();
    let touched = 0;
    const mode = settings.cloneBrushMode;
    const block = Math.max(2, Math.round(settings.cloneBrushBlockSize));
    const repetitionCount =
      mode === 'evolving'
        ? Math.max(2, settings.cloneBrushRepetition)
        : mode === 'packet'
          ? Math.max(2, Math.min(4, settings.cloneBrushRepetition))
          : 1;
    for (let repetition = 0; repetition < repetitionCount; repetition += 1) {
      const repetitionBlend =
        settings.cloneBrushBlend * Math.pow(settings.cloneBrushDecay, repetition);
      const drift = mode === 'evolving' || mode === 'packet' ? repetition * block * 0.55 : 0;
      for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
        for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
          const influence = influenceAt(context, x, y, block * repetitionCount);
          if (influence <= 0.02) continue;
          const tileX = Math.floor((x - bounds.x) / block);
          const tileY = Math.floor((y - bounds.y) / block);
          const tileNoise = scalarNoise(tileX, tileY, repetition + sourceBounds.x * 31);
          if (
            (mode === 'fragment' || mode === 'evolving') &&
            tileNoise < settings.cloneBrushTileFragmentation * 0.36
          )
            continue;
          if (
            mode === 'packet' &&
            scalarNoise(tileX, tileY, repetition + 907) <
              settings.cloneBrushTileFragmentation * 0.22
          )
            continue;
          const transformFragments = mode === 'fragment' || mode === 'evolving';
          const scale = transformFragments
            ? Math.max(0.25, 1 + (tileNoise - 0.5) * settings.cloneBrushScaleJitter * 2)
            : 1;
          const angle = transformFragments
            ? ((tileNoise - 0.5) * settings.cloneBrushRotationJitter * 2 * Math.PI) / 180
            : 0;
          const localX =
            settings.cloneBrushAlignment === 'aligned' ? x - sourceBounds.x : x - context.bounds.x;
          const localY =
            settings.cloneBrushAlignment === 'aligned' ? y - sourceBounds.y : y - context.bounds.y;
          const centeredX = localX / scale - sourceBounds.width / 2;
          const centeredY = localY / scale - sourceBounds.height / 2;
          const rotatedX = centeredX * Math.cos(angle) - centeredY * Math.sin(angle);
          const rotatedY = centeredX * Math.sin(angle) + centeredY * Math.cos(angle);
          let sourceX =
            sourceBounds.x +
            ((((rotatedX + sourceBounds.width / 2 + drift) % sourceBounds.width) +
              sourceBounds.width) %
              sourceBounds.width);
          let sourceY =
            sourceBounds.y +
            ((((rotatedY + sourceBounds.height / 2 + drift * 0.35) % sourceBounds.height) +
              sourceBounds.height) %
              sourceBounds.height);
          if (mode === 'slice') {
            const sliceHeight = Math.max(2, Math.round(block / 3));
            const slice = Math.floor((y - bounds.y) / sliceHeight);
            const sliceShift = (scalarNoise(slice, sourceBounds.y, 431) - 0.5) * block * 5;
            sourceX =
              sourceBounds.x +
              ((((sourceX - sourceBounds.x + sliceShift) % sourceBounds.width) +
                sourceBounds.width) %
                sourceBounds.width);
          } else if (mode === 'packet') {
            const packetShift = (Math.floor(tileNoise * 5) - 2) * block;
            sourceX =
              sourceBounds.x +
              ((((sourceX - sourceBounds.x + packetShift) % sourceBounds.width) +
                sourceBounds.width) %
                sourceBounds.width);
            if (tileNoise > 0.72) {
              sourceY =
                sourceBounds.y +
                ((((Math.floor((sourceY - sourceBounds.y) / block) * block) % sourceBounds.height) +
                  sourceBounds.height) %
                  sourceBounds.height);
            }
          }
          const destination = pixelToByteOffset(x, y, width);
          for (let channel = 0; channel < 3; channel += 1) {
            const splitAmount =
              mode === 'rgb'
                ? Math.max(12, settings.cloneBrushChannelSplit)
                : mode === 'clean' || mode === 'slice'
                  ? 0
                  : settings.cloneBrushChannelSplit;
            const split = (channel - 1) * splitAmount;
            const sampled = sampleNearest(
              source,
              width,
              height,
              sourceX + split,
              sourceY,
              channel,
              'clamp',
            );
            context.pixels[destination + channel] = blendChannel(
              context.pixels[destination + channel]!,
              sampled,
              clamp(influence * repetitionBlend, 0, 1),
            );
          }
          touched += 1;
        }
      }
    }
    return result(bounds, touched);
  },
};

const lineFreezeBrush: GlitchAlgorithm = {
  id: 'line-freeze-brush',
  name: 'Line Freeze Brush',
  family: 'advanced-brush',
  apply(context) {
    const { settings, width, height } = context;
    const source = context.pixels.slice();
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    const movement = context.movement ?? { x: 1, y: 0 };
    const horizontal =
      settings.lineBrushOrientation === 'horizontal' ||
      (settings.lineBrushOrientation === 'stroke' && Math.abs(movement.x) >= Math.abs(movement.y));
    const sourceCoordinate =
      settings.lineBrushSource === 'leading'
        ? horizontal
          ? context.bounds.y
          : context.bounds.x
        : settings.lineBrushSource === 'trailing'
          ? horizontal
            ? context.bounds.y + context.bounds.height - 1
            : context.bounds.x + context.bounds.width - 1
          : horizontal
            ? context.bounds.y + Math.floor(context.bounds.height / 2)
            : context.bounds.x + Math.floor(context.bounds.width / 2);
    const random = createSeededRandom(`${context.seed}:line-freeze`);
    const thickness = Math.max(1, Math.round(settings.lineBrushThickness));
    let touched = 0;
    const lineCount = horizontal ? bounds.height : bounds.width;
    for (let line = 0; line < lineCount; line += thickness) {
      if (random.next() < settings.lineBrushDropout) continue;
      const repeatIndex = Math.floor(line / thickness) % Math.max(1, settings.lineBrushRepeatCount);
      const stretchOffset = Math.floor(
        (repeatIndex * thickness) / Math.max(0.1, settings.lineBrushStretch),
      );
      const jitter = random.int(
        -Math.round(settings.lineBrushJitter),
        Math.round(settings.lineBrushJitter),
      );
      for (let sub = 0; sub < thickness && line + sub < lineCount; sub += 1) {
        const fixedCoordinate = sourceCoordinate + stretchOffset + jitter;
        const axisLength = horizontal ? bounds.width : bounds.height;
        for (let axis = 0; axis < axisLength; axis += 1) {
          const x = horizontal ? bounds.x + axis : bounds.x + line + sub;
          const y = horizontal ? bounds.y + line + sub : bounds.y + axis;
          const influence = influenceAt(context, x, y, settings.lineBrushSpill);
          if (influence <= 0.01) continue;
          const destinationLine = horizontal ? y : x;
          const sampleLine =
            Math.round(fixedCoordinate) === destinationLine
              ? fixedCoordinate +
                (destinationLine + thickness < (horizontal ? height : width)
                  ? thickness
                  : -thickness)
              : fixedCoordinate;
          const sourceX = horizontal ? x : sampleLine;
          const sourceY = horizontal ? sampleLine : y;
          const destination = pixelToByteOffset(x, y, width);
          for (let channel = 0; channel < 3; channel += 1) {
            const split = (channel - 1) * settings.lineBrushRgbSplit;
            const sampled = sampleNearest(
              source,
              width,
              height,
              horizontal ? sourceX + split : sourceX,
              horizontal ? sourceY : sourceY + split,
              channel,
              'clamp',
            );
            context.pixels[destination + channel] = blendChannel(
              source[destination + channel]!,
              sampled,
              influence,
            );
          }
          touched += 1;
        }
      }
    }
    return result(bounds, touched);
  },
};

const mirrorFoldBrush: GlitchAlgorithm = {
  id: 'mirror-fold-brush',
  name: 'Mirror Fold',
  family: 'advanced-brush',
  experimental: true,
  apply(context) {
    const { settings, width, height } = context;
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    if (!bounds.width || !bounds.height) return result(bounds, 0);
    const snapshot = extractRegion(context.pixels, width, height, bounds);
    const frame = strokeFrame(context, settings.mirrorFoldFallbackAngle);
    const axisTangentX = settings.mirrorFoldAxis === 'stroke' ? frame.tangentX : frame.normalX;
    const axisTangentY = settings.mirrorFoldAxis === 'stroke' ? frame.tangentY : frame.normalY;
    const axisNormalX = -axisTangentY;
    const axisNormalY = axisTangentX;
    const centerX = context.bounds.x + context.bounds.width / 2;
    const centerY = context.bounds.y + context.bounds.height / 2;
    const repetitions = clamp(Math.round(settings.mirrorFoldRepetitions), 1, 3);
    const random = createSeededRandom(`${context.seed}:mirror-fold`);
    const slipDirection = random.next() < 0.5 ? -1 : 1;
    const maximumDistance = Math.max(1, Math.hypot(bounds.width, bounds.height) * 0.5);
    let touched = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const influence = influenceAt(context, x, y);
        if (influence <= 0.01) continue;
        const relativeX = x - centerX;
        const relativeY = y - centerY;
        const along = relativeX * axisTangentX + relativeY * axisTangentY;
        const normal =
          relativeX * axisNormalX + relativeY * axisNormalY - settings.mirrorFoldOffset;
        if (settings.mirrorFoldSide === 'left' && normal > 0) continue;
        if (settings.mirrorFoldSide === 'right' && normal < 0) continue;
        const destination = pixelToByteOffset(x, y, width);
        const falloff =
          1 - settings.mirrorFoldFalloff * clamp(Math.abs(normal) / maximumDistance, 0, 1);
        const amount = clamp(influence * settings.mirrorFoldMix * falloff, 0, 1);
        for (let channel = 0; channel < 3; channel += 1) {
          let accumulated = 0;
          for (let repetition = 0; repetition < repetitions; repetition += 1) {
            const repeatOffset =
              (repetition - (repetitions - 1) / 2) * settings.mirrorFoldOffset * 0.75;
            const reflectedNormal = -normal + repeatOffset;
            const channelSlip = (channel - 1) * settings.mirrorFoldRgbSlip * slipDirection;
            const sourceX =
              centerX +
              axisTangentX * (along + channelSlip) +
              axisNormalX * (reflectedNormal + settings.mirrorFoldOffset);
            const sourceY =
              centerY +
              axisTangentY * (along + channelSlip) +
              axisNormalY * (reflectedNormal + settings.mirrorFoldOffset);
            accumulated += sampleSnapshot(
              snapshot,
              sourceX,
              sourceY,
              channel,
              settings.mirrorFoldEdgeMode,
            );
          }
          context.pixels[destination + channel] = blendChannel(
            snapshot.data[
              ((y - snapshot.bounds.y) * snapshot.bounds.width + x - snapshot.bounds.x) * 4 +
                channel
            ]!,
            accumulated / repetitions,
            amount,
          );
        }
        touched += 1;
      }
    }
    return result(bounds, touched);
  },
};

const rasterLoomBrush: GlitchAlgorithm = {
  id: 'raster-loom-brush',
  name: 'Raster Loom',
  family: 'advanced-brush',
  experimental: true,
  apply(context) {
    const { settings, width, height } = context;
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    if (!bounds.width || !bounds.height) return result(bounds, 0);
    const snapshot = extractRegion(context.pixels, width, height, bounds);
    const frame = strokeFrame(context, settings.rasterLoomFallbackAngle);
    const stripCoordinateX =
      settings.rasterLoomDirection === 'stroke' ? frame.normalX : frame.tangentX;
    const stripCoordinateY =
      settings.rasterLoomDirection === 'stroke' ? frame.normalY : frame.tangentY;
    const centerX = context.bounds.x + context.bounds.width / 2;
    const centerY = context.bounds.y + context.bounds.height / 2;
    const stripWidth = clamp(Math.round(settings.rasterLoomStripWidth), 2, 64);
    const gap = clamp(Math.round(settings.rasterLoomGap), 0, stripWidth - 1);
    const period = stripWidth + gap;
    const alternation = clamp(Math.round(settings.rasterLoomAlternation), 1, 6);
    const phase = createSeededRandom(`${context.seed}:raster-loom`).next() * period;
    let touched = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const influence = influenceAt(context, x, y);
        if (influence <= 0.01) continue;
        const coordinate =
          (x - centerX) * stripCoordinateX + (y - centerY) * stripCoordinateY + phase;
        const wrapped = ((coordinate % period) + period) % period;
        if (wrapped >= stripWidth) continue;
        const band = Math.floor(coordinate / period);
        const direction = Math.floor(Math.abs(band) / alternation) % 2 === 0 ? 1 : -1;
        const edgeDistance = Math.min(wrapped, stripWidth - wrapped);
        const edgeBlend = clamp(
          edgeDistance / Math.max(0.5, settings.rasterLoomEdgeSoftness * stripWidth),
          0,
          1,
        );
        const shift = direction * settings.rasterLoomSourceOffset;
        const destination = pixelToByteOffset(x, y, width);
        const amount = clamp(influence * settings.rasterLoomMix * edgeBlend, 0, 1);
        for (let channel = 0; channel < 3; channel += 1) {
          const slip = (channel - 1) * settings.rasterLoomRgbSlip * direction;
          const sampled = sampleSnapshot(
            snapshot,
            x + frame.tangentX * shift + stripCoordinateX * slip,
            y + frame.tangentY * shift + stripCoordinateY * slip,
            channel,
            'mirror',
          );
          const woven = clamp(
            sampled * (1 + direction * settings.rasterLoomWeaveDepth * 0.12),
            0,
            255,
          );
          context.pixels[destination + channel] = blendChannel(
            snapshot.data[((y - bounds.y) * bounds.width + x - bounds.x) * 4 + channel]!,
            woven,
            amount,
          );
        }
        touched += 1;
      }
    }
    return result(bounds, touched);
  },
};

const contourCrawlBrush: GlitchAlgorithm = {
  id: 'contour-crawl-brush',
  name: 'Contour Crawl',
  family: 'advanced-brush',
  experimental: true,
  apply(context) {
    const { settings, width, height } = context;
    const bounds = clipRectangle(context.writeBounds ?? context.bounds, width, height);
    if (!bounds.width || !bounds.height) return result(bounds, 0);
    const snapshot = extractRegion(context.pixels, width, height, bounds);
    const frame = strokeFrame(context, settings.contourCrawlFallbackAngle);
    const edge = new Float32Array(bounds.width * bounds.height);
    for (let localY = 0; localY < bounds.height; localY += 1) {
      const y = bounds.y + localY;
      for (let localX = 0; localX < bounds.width; localX += 1) {
        const x = bounds.x + localX;
        const gx =
          -snapshotLuma(snapshot, x - 1, y - 1) +
          snapshotLuma(snapshot, x + 1, y - 1) -
          snapshotLuma(snapshot, x - 1, y) * 2 +
          snapshotLuma(snapshot, x + 1, y) * 2 -
          snapshotLuma(snapshot, x - 1, y + 1) +
          snapshotLuma(snapshot, x + 1, y + 1);
        const gy =
          -snapshotLuma(snapshot, x - 1, y - 1) -
          snapshotLuma(snapshot, x, y - 1) * 2 -
          snapshotLuma(snapshot, x + 1, y - 1) +
          snapshotLuma(snapshot, x - 1, y + 1) +
          snapshotLuma(snapshot, x, y + 1) * 2 +
          snapshotLuma(snapshot, x + 1, y + 1);
        edge[localY * bounds.width + localX] = Math.min(255, Math.hypot(gx, gy) / 4);
      }
    }
    const edgeAt = (x: number, y: number) => {
      const localX = clamp(Math.round(x) - bounds.x, 0, bounds.width - 1);
      const localY = clamp(Math.round(y) - bounds.y, 0, bounds.height - 1);
      return edge[localY * bounds.width + localX]!;
    };
    const repeats = clamp(Math.round(settings.contourCrawlRepeatCount), 1, 8);
    const lineWidth = clamp(Math.round(settings.contourCrawlLineWidth), 1, 8);
    const seedValue = createSeededRandom(`${context.seed}:contour-crawl`).int(1, 0x7fffffff);
    let touched = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const influence = influenceAt(context, x, y);
        if (influence <= 0.01) continue;
        const destination = pixelToByteOffset(x, y, width);
        let changed = false;
        for (let repetition = 1; repetition <= repeats; repetition += 1) {
          const progress = repetition / repeats;
          const distance = progress * settings.contourCrawlLength;
          const signedDrift =
            (scalarNoise(repetition, Math.floor((x + y) / 8), seedValue) - 0.5) *
            2 *
            settings.contourCrawlSideDrift *
            progress;
          const sourceX = x - frame.tangentX * distance - frame.normalX * signedDrift;
          const sourceY = y - frame.tangentY * distance - frame.normalY * signedDrift;
          let magnitude = 0;
          for (let line = -lineWidth; line <= lineWidth; line += 1) {
            magnitude = Math.max(
              magnitude,
              edgeAt(sourceX + frame.normalX * line, sourceY + frame.normalY * line),
            );
          }
          if (magnitude < settings.contourCrawlEdgeThreshold) continue;
          const edgeAmount = clamp(
            (magnitude - settings.contourCrawlEdgeThreshold) /
              Math.max(1, 255 - settings.contourCrawlEdgeThreshold),
            0,
            1,
          );
          const decay = Math.pow(clamp(settings.contourCrawlDecay, 0, 1), repetition - 1);
          const amount = clamp(influence * settings.contourCrawlMix * edgeAmount * decay, 0, 1);
          for (let channel = 0; channel < 3; channel += 1) {
            const split = (channel - 1) * settings.contourCrawlRgbSplit;
            let sampled = sampleSnapshot(
              snapshot,
              sourceX + frame.normalX * split,
              sourceY + frame.normalY * split,
              channel,
              'mirror',
            );
            if (settings.contourCrawlEdgePolarity === 'dark') sampled *= 0.35;
            else if (settings.contourCrawlEdgePolarity === 'light') {
              sampled = 255 - (255 - sampled) * 0.35;
            }
            context.pixels[destination + channel] = blendChannel(
              context.pixels[destination + channel]!,
              sampled,
              amount,
            );
          }
          changed = true;
        }
        if (changed) touched += 1;
      }
    }
    return result(bounds, touched);
  },
};

export const advancedBrushAlgorithms: GlitchAlgorithm[] = [
  pixelSortBrush,
  feedbackBrush,
  displacementBrush,
  flowMoshBrush,
  cloneCorruptionBrush,
  lineFreezeBrush,
  mirrorFoldBrush,
  rasterLoomBrush,
  contourCrawlBrush,
];

export const advancedBrushEffectIds = advancedBrushAlgorithms.map(
  (algorithm) => algorithm.id,
) as Array<
  | 'pixel-sort-brush'
  | 'feedback-brush'
  | 'displacement-brush'
  | 'flow-mosh-brush'
  | 'clone-corruption-brush'
  | 'line-freeze-brush'
  | 'mirror-fold-brush'
  | 'raster-loom-brush'
  | 'contour-crawl-brush'
>;
