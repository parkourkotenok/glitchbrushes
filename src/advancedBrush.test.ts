import { describe, expect, it } from 'vitest';
import {
  advancedBrushIds,
  advancedBrushRandomizerSchemas,
  deriveAdvancedBrushOverlays,
  randomizeAdvancedBrush,
} from './glitchAlgorithms/advancedBrushConfig';
import { algorithms, defaultAlgorithmSettings } from './glitchAlgorithms';
import { algorithmIconIds, effectIconIds } from './icons/effects';
import { builtInPresets } from './presets';
import type {
  AlgorithmId,
  AlgorithmSettings,
  BrushSettings,
  GlitchContext,
  Point,
  Rectangle,
} from './types';

const experimentalBrushIds = [
  'mirror-fold-brush',
  'raster-loom-brush',
  'contour-crawl-brush',
] as const satisfies readonly AlgorithmId[];

const testBrush: BrushSettings = {
  size: 120,
  hardness: 0.5,
  opacity: 1,
  strength: 1,
  density: 1,
  scatter: 0,
  spacing: 12,
  accumulate: true,
  pressure: false,
  minPressureSize: 0.2,
  minPressureStrength: 0.2,
};

function patternedPixels(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 29 + y * 11 + ((x * y) % 47)) & 0xff;
      pixels[offset + 1] = (x * 7 + y * 31 + ((x + y) % 23) * 5) & 0xff;
      pixels[offset + 2] = (x * 19 + y * 3 + ((x ^ y) % 31) * 4) & 0xff;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function advancedContext(
  settings: Partial<AlgorithmSettings> = {},
  movement: Point = { x: 22, y: 5 },
): GlitchContext {
  const width = 72;
  const height = 64;
  const pixels = patternedPixels(width, height);
  const mask = new Float32Array(width * height);
  for (let y = 16; y < 48; y += 1) {
    for (let x = 18; x < 54; x += 1) mask[y * width + x] = 1;
  }
  return {
    pixels,
    originalPixels: pixels.slice(),
    width,
    height,
    mask,
    bounds: { x: 18, y: 16, width: 36, height: 32 },
    writeBounds: { x: 4, y: 4, width: 64, height: 56 },
    strength: 1,
    pressure: 1,
    seed: 'advanced-brush-fixed',
    movement,
    settings: {
      ...defaultAlgorithmSettings,
      sortBrushThresholdLow: 0,
      sortBrushThresholdHigh: 255,
      sortBrushIntervalMin: 3,
      sortBrushIntervalMax: 40,
      ...settings,
    },
  };
}

function hash(pixels: Uint8ClampedArray): number {
  let value = 2166136261;
  for (const byte of pixels) {
    value ^= byte;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function changedPixels(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let count = 0;
  for (let offset = 0; offset < before.length; offset += 4) {
    if (
      before[offset] !== after[offset] ||
      before[offset + 1] !== after[offset + 1] ||
      before[offset + 2] !== after[offset + 2]
    )
      count += 1;
  }
  return count;
}

function curvedStrokeContext(settings: Partial<AlgorithmSettings> = {}): GlitchContext {
  const context = advancedContext({
    sortBrushIntervalMin: 2,
    sortBrushIntervalMax: 48,
    sortBrushLength: 48,
    sortBrushEdgeSoftness: 0,
    feedbackBrushBlendMode: 'screen',
    feedbackBrushBrightnessDecay: 0.82,
    feedbackBrushPersistence: 1,
    displacementBrushSource: 'waves',
    displacementBrushStrengthX: 42,
    displacementBrushStrengthY: 36,
    displacementBrushIterations: 1,
    flowBrushPropagation: 28,
    flowBrushIterations: 1,
    flowBrushDecay: 0,
    flowBrushVectorPersistence: 1,
    cloneBrushMode: 'clean',
    cloneBrushAlignment: 'non-aligned',
    cloneBrushTileFragmentation: 0,
    cloneBrushRepetition: 1,
    cloneBrushDecay: 1,
    cloneBrushBlend: 1,
    lineBrushOrientation: 'horizontal',
    lineBrushSource: 'leading',
    lineBrushDropout: 0,
    lineBrushJitter: 0,
    ...settings,
  });
  context.mask.fill(0);
  context.bounds = { x: 12, y: 10, width: 48, height: 44 };
  context.writeBounds = { x: 4, y: 4, width: 64, height: 56 };
  for (let x = 12; x < 60; x += 1) {
    const progress = (x - 12) / 47;
    const centerY = Math.round(18 + progress * 26 + Math.sin(progress * Math.PI * 2) * 7);
    for (let y = centerY - 4; y <= centerY + 4; y += 1) {
      context.mask[y * context.width + x] = 1;
    }
  }
  context.cloneSource = { x: 2, y: 2, width: 14, height: 14 };
  return context;
}

describe('advanced brush catalog', () => {
  it('registers six direct-paint algorithms with six distinct icons', () => {
    const iconIds = advancedBrushIds.map((id) => algorithmIconIds[id]);
    expect(advancedBrushIds).toHaveLength(6);
    expect(new Set(iconIds).size).toBe(6);
    for (const id of advancedBrushIds) {
      expect(algorithms[id].family).toBe('advanced-brush');
      expect(effectIconIds).toContain(algorithmIconIds[id]);
    }
  });

  it.each(advancedBrushIds)('%s has at least five built-in presets', (id) => {
    expect(
      builtInPresets.filter((preset) => preset.algorithm === id).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it('contains every specifically requested preset name', () => {
    const names = new Set(builtInPresets.map((preset) => preset.name));
    for (const name of [
      'Bright Drag',
      'Shadow Comb',
      'Rainbow Sort',
      'Vertical Melt',
      'Broken Scan',
      'Ghost Trail',
      'Memory Leak',
      'Falling Echo',
      'Difference Burn',
      'Infinite Smear',
      'Digital Ripple',
      'Torn Signal',
      'Hard Vortex',
      'Liquid Pull',
      'Noise Tear',
      'Glass Failure',
      'Forward Melt',
      'Sideways Prediction',
      'Block Current',
      'Chroma Wake',
      'Broken Motion',
      'Dirty Clone',
      'Fragment Copy',
      'RGB Clone',
      'Repeated Memory',
      'Broken Stamp',
      'Buffer Stall',
      'Frozen Rows',
      'Vertical Lock',
      'Broadcast Tear',
      'Repeated Scan',
    ])
      expect(names).toContain(name);
  });
});

describe('advanced brush deterministic randomizers', () => {
  it.each(advancedBrushIds)('%s has a non-generic schema and stable Balanced/Wild output', (id) => {
    expect(advancedBrushRandomizerSchemas[id].length).toBeGreaterThanOrEqual(7);
    const first = randomizeAdvancedBrush(
      id,
      defaultAlgorithmSettings,
      testBrush,
      'repeatable-seed',
      'balanced',
    );
    const second = randomizeAdvancedBrush(
      id,
      defaultAlgorithmSettings,
      testBrush,
      'repeatable-seed',
      'balanced',
    );
    const wild = randomizeAdvancedBrush(
      id,
      defaultAlgorithmSettings,
      testBrush,
      'repeatable-seed',
      'wild',
    );
    expect(first).toEqual(second);
    expect(wild).not.toEqual(first);
    for (const parameter of advancedBrushRandomizerSchemas[id]) {
      const value = first.settings[parameter.key];
      expect(typeof value).toBe('number');
      expect(value as number).toBeGreaterThanOrEqual(parameter.min);
      expect(value as number).toBeLessThanOrEqual(parameter.max);
    }
  });
});

describe('advanced brush image signatures', () => {
  it('Pixel Sort changes coherent runs and is deterministic', () => {
    const first = advancedContext({ sortBrushDirection: 'horizontal' });
    const second = advancedContext({ sortBrushDirection: 'horizontal' });
    const before = first.pixels.slice();
    algorithms['pixel-sort-brush'].apply(first);
    algorithms['pixel-sort-brush'].apply(second);
    expect(first.pixels).toEqual(second.pixels);
    expect(changedPixels(before, first.pixels)).toBeGreaterThan(150);
  });

  it.each(['luminance', 'hue', 'saturation', 'rgb-sum'] as const)(
    'Pixel Sort keeps %s thresholds on the shared 0–255 scale',
    (property) => {
      const context = advancedContext({
        sortBrushProperty: property,
        sortBrushThresholdLow: 0,
        sortBrushThresholdHigh: 255,
        sortBrushEdgeSoftness: 8,
      });
      const before = context.pixels.slice();
      algorithms['pixel-sort-brush'].apply(context);
      expect(changedPixels(before, context.pixels)).toBeGreaterThan(100);
    },
  );

  it('Feedback reads effect-owned memory instead of behaving like generic noise', () => {
    const withoutMemory = advancedContext({
      feedbackBrushOffsetX: 9,
      feedbackBrushOffsetY: 3,
    });
    const withMemory = advancedContext({
      feedbackBrushOffsetX: 9,
      feedbackBrushOffsetY: 3,
    });
    const memory = new Uint8ClampedArray(withMemory.pixels.length);
    for (let offset = 0; offset < memory.length; offset += 4) {
      memory[offset] = 248;
      memory[offset + 1] = 18;
      memory[offset + 2] = 94;
      memory[offset + 3] = 255;
    }
    withMemory.feedbackMemory = memory;
    algorithms['feedback-brush'].apply(withoutMemory);
    algorithms['feedback-brush'].apply(withMemory);
    expect(hash(withMemory.pixels)).not.toBe(hash(withoutMemory.pixels));
  });

  it('Feedback transforms the full mask even across flat pixels', () => {
    const context = advancedContext({
      feedbackBrushBlendMode: 'screen',
      feedbackBrushBrightnessDecay: 1,
      feedbackBrushRgbDelay: 0,
    });
    for (let offset = 0; offset < context.pixels.length; offset += 4) {
      context.pixels[offset] = 180;
      context.pixels[offset + 1] = 180;
      context.pixels[offset + 2] = 180;
      context.pixels[offset + 3] = 255;
    }
    context.originalPixels = context.pixels.slice();
    const before = context.pixels.slice();
    algorithms['feedback-brush'].apply(context);
    expect(changedPixels(before, context.pixels)).toBeGreaterThan(500);
  });

  it('Displacement performs coordinate warping', () => {
    const context = advancedContext({
      displacementBrushSource: 'vortex',
      displacementBrushStrengthX: 58,
      displacementBrushStrengthY: 58,
      displacementBrushIterations: 2,
    });
    const before = context.pixels.slice();
    algorithms['displacement-brush'].apply(context);
    expect(changedPixels(before, context.pixels)).toBeGreaterThan(250);
  });

  it('Flow Mosh follows the actual stroke direction', () => {
    const right = advancedContext({}, { x: 28, y: 2 });
    const down = advancedContext({}, { x: 2, y: 28 });
    algorithms['flow-mosh-brush'].apply(right);
    algorithms['flow-mosh-brush'].apply(down);
    expect(hash(right.pixels)).not.toBe(hash(down.pixels));
  });

  it('Clone Corruption requires and visibly samples its explicit source', () => {
    const width = 48;
    const height = 40;
    const sourceBounds: Rectangle = { x: 2, y: 2, width: 10, height: 10 };
    const targetBounds: Rectangle = { x: 24, y: 15, width: 16, height: 16 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    for (let y = sourceBounds.y; y < sourceBounds.y + sourceBounds.height; y += 1) {
      for (let x = sourceBounds.x; x < sourceBounds.x + sourceBounds.width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = 245;
        pixels[offset + 1] = 23;
        pixels[offset + 2] = 38;
      }
    }
    const mask = new Float32Array(width * height);
    for (let y = targetBounds.y; y < targetBounds.y + targetBounds.height; y += 1) {
      for (let x = targetBounds.x; x < targetBounds.x + targetBounds.width; x += 1) {
        mask[y * width + x] = 1;
      }
    }
    const base: GlitchContext = {
      pixels: pixels.slice(),
      originalPixels: pixels.slice(),
      width,
      height,
      mask,
      bounds: targetBounds,
      writeBounds: targetBounds,
      strength: 1,
      pressure: 1,
      seed: 'clone-source',
      settings: {
        ...defaultAlgorithmSettings,
        cloneBrushMode: 'clean',
        cloneBrushAlignment: 'non-aligned',
        cloneBrushScaleJitter: 0,
        cloneBrushRotationJitter: 0,
        cloneBrushChannelSplit: 0,
        cloneBrushTileFragmentation: 0,
        cloneBrushRepetition: 1,
        cloneBrushDecay: 1,
        cloneBrushBlend: 1,
      },
    };
    const noSource = { ...base, pixels: base.pixels.slice() };
    const withSource = { ...base, pixels: base.pixels.slice(), cloneSource: sourceBounds };
    const before = noSource.pixels.slice();
    algorithms['clone-corruption-brush'].apply(noSource);
    algorithms['clone-corruption-brush'].apply(withSource);
    expect(noSource.pixels).toEqual(before);
    expect(changedPixels(before, withSource.pixels)).toBeGreaterThan(100);
    expect(withSource.pixels.some((byte, index) => index % 4 === 0 && byte > 220)).toBe(true);
  });

  it('keeps all six Clone Corruption modes visually distinct and source-bound', () => {
    const modes = ['clean', 'fragment', 'slice', 'packet', 'rgb', 'evolving'] as const;
    const signatures = modes.map((cloneBrushMode) => {
      const context = advancedContext({
        cloneBrushMode,
        cloneBrushAlignment: 'non-aligned',
        cloneBrushTileFragmentation: 0.62,
        cloneBrushScaleJitter: 0.32,
        cloneBrushRotationJitter: 18,
        cloneBrushChannelSplit: 16,
        cloneBrushRepetition: 5,
        cloneBrushDecay: 0.7,
      });
      context.cloneSource = { x: 2, y: 2, width: 18, height: 18 };
      const before = context.pixels.slice();
      algorithms['clone-corruption-brush'].apply(context);
      expect(changedPixels(before, context.pixels), cloneBrushMode).toBeGreaterThan(100);
      return hash(context.pixels);
    });
    expect(new Set(signatures).size).toBe(modes.length);
  });

  it('Line Freeze creates a structured repeated-line signature', () => {
    const context = advancedContext({
      lineBrushOrientation: 'horizontal',
      lineBrushSource: 'center',
      lineBrushDropout: 0,
      lineBrushRgbSplit: 0,
      lineBrushJitter: 0,
    });
    const before = context.pixels.slice();
    algorithms['line-freeze-brush'].apply(context);
    expect(changedPixels(before, context.pixels)).toBeGreaterThan(250);
    const rowHashes = new Set<number>();
    for (let y = 18; y < 46; y += 1) {
      rowHashes.add(
        hash(context.pixels.slice((y * context.width + 18) * 4, (y * context.width + 54) * 4)),
      );
    }
    expect(rowHashes.size).toBeLessThan(20);
  });

  it('Line Freeze transforms its source line instead of leaving an unchanged center trail', () => {
    const context = advancedContext({
      lineBrushOrientation: 'horizontal',
      lineBrushSource: 'center',
      lineBrushRepeatCount: 1,
      lineBrushStretch: 1,
      lineBrushJitter: 0,
      lineBrushRgbSplit: 0,
      lineBrushDropout: 0,
      lineBrushThickness: 1,
      lineBrushSpill: 0,
    });
    const x = context.bounds.x + Math.floor(context.bounds.width / 2);
    const y = context.bounds.y + Math.floor(context.bounds.height / 2);
    const offset = (y * context.width + x) * 4;
    const before = context.pixels.slice(offset, offset + 3);
    algorithms['line-freeze-brush'].apply(context);
    expect(context.pixels.slice(offset, offset + 3)).not.toEqual(before);
  });

  it('all six effects have distinct visual signatures for the same gesture', () => {
    const signatures = advancedBrushIds.map((id) => {
      const context = advancedContext();
      if (id === 'clone-corruption-brush') {
        context.cloneSource = { x: 2, y: 2, width: 14, height: 14 };
      }
      algorithms[id].apply(context);
      return hash(context.pixels);
    });
    expect(new Set(signatures).size).toBe(advancedBrushIds.length);
  });

  it.each(advancedBrushIds)('%s never changes pixels outside the painted stroke mask', (id) => {
    const context = curvedStrokeContext();
    const before = context.pixels.slice();
    algorithms[id].apply(context);
    let changedInside = 0;
    let changedOutside = 0;
    for (let pixel = 0; pixel < context.mask.length; pixel += 1) {
      const offset = pixel * 4;
      const changed =
        before[offset] !== context.pixels[offset] ||
        before[offset + 1] !== context.pixels[offset + 1] ||
        before[offset + 2] !== context.pixels[offset + 2];
      if (!changed) continue;
      if (context.mask[pixel]! > 0) changedInside += 1;
      else changedOutside += 1;
    }
    expect(changedInside).toBeGreaterThan(0);
    expect(changedOutside).toBe(0);
  });
});

describe('advanced brush overlay ownership', () => {
  it('shows Clone source only while its owning effect is active', () => {
    const source = { x: 4, y: 5, width: 22, height: 19 };
    expect(deriveAdvancedBrushOverlays('clone-corruption-brush', source)).toEqual([
      {
        ownerEffectInstanceId: 'advanced-brush:clone-corruption-brush',
        type: 'clone-source',
        bounds: source,
        active: true,
      },
    ]);
    expect(deriveAdvancedBrushOverlays('feedback-brush', source)).toEqual([]);
    expect(deriveAdvancedBrushOverlays('clone-corruption-brush', null)).toEqual([]);
  });
});

describe('experimental directional brush effects', () => {
  it('registers four metadata-driven NEW brushes without adding them to default combinations', () => {
    for (const id of experimentalBrushIds) {
      expect(algorithms[id]).toMatchObject({ family: 'advanced-brush', experimental: true });
      expect(effectIconIds).toContain(algorithmIconIds[id]);
      expect(defaultAlgorithmSettings.structuralMixPool).not.toContain(id);
      expect(builtInPresets.some((preset) => preset.algorithm === id)).toBe(false);
    }
  });

  it.each(experimentalBrushIds)(
    '%s is deterministic, directional, alpha-safe, write-bounded and fallback-safe',
    (id) => {
      const first = advancedContext({}, { x: 24, y: 7 });
      const second = advancedContext({}, { x: 24, y: 7 });
      for (let pixel = 0; pixel < first.width * first.height; pixel += 1) {
        const alpha = 40 + (pixel % 211);
        first.pixels[pixel * 4 + 3] = alpha;
        second.pixels[pixel * 4 + 3] = alpha;
      }
      first.originalPixels = first.pixels.slice();
      second.originalPixels = second.pixels.slice();
      const before = first.pixels.slice();
      algorithms[id].apply(first);
      algorithms[id].apply(second);
      expect(first.pixels).toEqual(second.pixels);
      expect(changedPixels(before, first.pixels)).toBeGreaterThan(0);
      for (let pixel = 0; pixel < first.width * first.height; pixel += 1) {
        expect(first.pixels[pixel * 4 + 3]).toBe(before[pixel * 4 + 3]);
        const x = pixel % first.width;
        const y = Math.floor(pixel / first.width);
        const insideWrite =
          x >= first.writeBounds!.x &&
          y >= first.writeBounds!.y &&
          x < first.writeBounds!.x + first.writeBounds!.width &&
          y < first.writeBounds!.y + first.writeBounds!.height;
        if (!insideWrite) {
          expect(first.pixels.slice(pixel * 4, pixel * 4 + 4)).toEqual(
            before.slice(pixel * 4, pixel * 4 + 4),
          );
        }
      }
      const vertical = advancedContext({}, { x: 0, y: 28 });
      algorithms[id].apply(vertical);
      expect(hash(vertical.pixels)).not.toBe(hash(first.pixels));
      const fallback = advancedContext(
        {
          mirrorFoldFallbackAngle: 37,
          rasterLoomFallbackAngle: 37,
          contourCrawlFallbackAngle: 37,
        },
        { x: 0, y: 0 },
      );
      const fallbackBefore = fallback.pixels.slice();
      expect(() => algorithms[id].apply(fallback)).not.toThrow();
      expect(changedPixels(fallbackBefore, fallback.pixels)).toBeGreaterThan(0);
    },
  );

  it.each(experimentalBrushIds)('%s keeps seeded variation stable and meaningful', (id) => {
    const signatures = ['seed-a', 'seed-b', 'seed-c'].map((seed) => {
      const context = advancedContext({
        mirrorFoldRgbSlip: 9,
        rasterLoomStripWidth: 9,
        contourCrawlSideDrift: 12,
      });
      context.seed = seed;
      algorithms[id].apply(context);
      return hash(context.pixels);
    });
    expect(new Set(signatures).size).toBeGreaterThan(1);
  });

  it.each(experimentalBrushIds)(
    '%s remains bounded on tiny edge strokes and extreme settings',
    (id) => {
      const context = advancedContext({
        mirrorFoldRepetitions: 99,
        mirrorFoldOffset: 999,
        rasterLoomStripWidth: 999,
        rasterLoomSourceOffset: 999,
        contourCrawlRepeatCount: 99,
        contourCrawlLength: 999,
        contourCrawlLineWidth: 99,
      });
      context.bounds = { x: 0, y: 0, width: 3, height: 3 };
      context.writeBounds = { x: 0, y: 0, width: 5, height: 5 };
      context.mask.fill(0);
      for (let y = 0; y < 3; y += 1)
        for (let x = 0; x < 3; x += 1) context.mask[y * context.width + x] = 1;
      expect(() => algorithms[id].apply(context)).not.toThrow();
      expect(context.pixels).toHaveLength(context.width * context.height * 4);
    },
  );
});
