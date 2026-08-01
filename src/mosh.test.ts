import { describe, expect, it } from 'vitest';
import { algorithmList, defaultAlgorithmSettings } from './glitchAlgorithms';
import { BrushCancelledError, processBrushEffect, type BrushProcessRequest } from './brush/engine';
import { algorithmIconIds, effectIconIds } from './icons/effects';
import { calculateRangeProgress } from './components/SliderField';
import { alignedBlockOrigins, detectSortIntervals, processMoshStack } from './mosh/engine';
import { MoshJobGate } from './mosh/transaction';
import {
  clearMoshRegions,
  deriveMoshOverlays,
  dragActivationReached,
  isCardDragBlockedTarget,
  setMoshRegion,
} from './mosh/interactions';
import {
  createMoshCard,
  moshEffectDefinitions,
  moshPresetParameterKeys,
  moshPresets,
  type MoshEffectCard,
  type MoshEffectId,
} from './mosh/types';
import { moshRandomizerSchemas, randomizeMoshCard, randomizeMoshRack } from './mosh/randomize';
import {
  loadMoshUserPresets,
  parseMoshPresetJson,
  saveMoshUserPresets,
  MOSH_USER_PRESETS_STORAGE_KEY,
} from './mosh/presets';
import { PatchHistory, createPatch } from './history/PatchHistory';
import type { HistoryAction } from './types';
import { isTypingTarget, resolveEditorShortcut } from './utils/shortcuts';

function image(width = 48, height = 32): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 9 + y * 3) & 255;
      pixels[offset + 1] = (y * 13 + x * 2) & 255;
      pixels[offset + 2] = ((x - y) * 11) & 255;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function pixelHash(bytes: Uint8ClampedArray): number {
  let value = 2166136261;
  for (let index = 0; index < bytes.length; index += 7) {
    value = Math.imul(value ^ bytes[index]!, 16777619) >>> 0;
  }
  return value;
}

function changedMask(before: Uint8ClampedArray, after: Uint8ClampedArray): Uint8Array {
  const mask = new Uint8Array(before.length / 4);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    if (
      before[offset] !== after[offset] ||
      before[offset + 1] !== after[offset + 1] ||
      before[offset + 2] !== after[offset + 2]
    )
      mask[index] = 1;
  }
  return mask;
}

function edgePattern(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const bar =
        (x > 12 && x < 27 && y > 8 && y < 54) ||
        (x > 38 && x < 82 && y > 14 && y < 25) ||
        (x > 48 && x < 70 && y > 34 && y < 50);
      const value = bar ? 238 : 18;
      pixels[offset] = value;
      pixels[offset + 1] = bar ? 62 : 24;
      pixels[offset + 2] = bar ? 170 : 38;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function card(
  effectId: MoshEffectId,
  overrides: Partial<MoshEffectCard['settings']> = {},
): MoshEffectCard {
  const result = createMoshCard(effectId);
  return {
    ...result,
    instanceId: `test-${effectId}`,
    settings: { ...result.settings, ...overrides },
  };
}

function action(id: string, before: number, after: number): HistoryAction {
  return {
    id,
    label: id,
    timestamp: 1,
    patches: [
      {
        start: 0,
        before: new Uint8ClampedArray([before]),
        after: new Uint8ClampedArray([after]),
      },
    ],
  };
}

describe('effect icon registry', () => {
  it('contains a local icon for every brush and MOSH effect', () => {
    const registered = new Set(effectIconIds);
    for (const effect of algorithmList)
      expect(registered.has(algorithmIconIds[effect.id])).toBe(true);
    for (const effect of moshEffectDefinitions) expect(registered.has(effect.icon)).toBe(true);
  });

  it('keeps all visible brush and MOSH effect IDs unique', () => {
    const ids = [
      ...algorithmList.map((effect) => effect.id),
      ...moshEffectDefinitions.map((effect) => effect.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('visible history behavior', () => {
  it('drives Undo/Redo disabled state and clears Redo after a new edit', () => {
    const history = new PatchHistory();
    const buffer = new Uint8ClampedArray([1]);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    buffer[0] = 2;
    history.push(action('first', 1, 2));
    expect(history.canUndo).toBe(true);
    history.undo(buffer);
    expect(history.canRedo).toBe(true);
    buffer[0] = 3;
    history.push(action('branch', 1, 3));
    expect(history.canRedo).toBe(false);
    expect(history.undoEntries.map((entry) => entry.id)).toEqual(['branch']);
  });

  it('safely undoes newer entries to a selected applied action', () => {
    const history = new PatchHistory();
    const buffer = new Uint8ClampedArray([3]);
    history.push(action('one', 0, 1));
    history.push(action('two', 1, 2));
    history.push(action('three', 2, 3));
    expect(history.undoTo(buffer, 'one').map((entry) => entry.id)).toEqual(['three', 'two']);
    expect(buffer[0]).toBe(1);
    expect(history.undoEntries.map((entry) => entry.id)).toEqual(['one']);
  });

  it('ignores shortcuts while typing in inputs, selects and contenteditable fields', () => {
    const element = (tagName: string, editable = false) =>
      ({
        tagName,
        isContentEditable: editable,
        closest: () => null,
      }) as unknown as EventTarget;
    expect(isTypingTarget(element('INPUT'))).toBe(true);
    expect(isTypingTarget(element('SELECT'))).toBe(true);
    expect(isTypingTarget(element('DIV', true))).toBe(true);
    expect(isTypingTarget(element('BUTTON'))).toBe(false);
  });
});

describe('layout-independent editor interactions', () => {
  it('resolves Undo and Brush from physical codes with Cyrillic event.key values', () => {
    expect(
      resolveEditorShortcut({
        key: 'я',
        code: 'KeyZ',
        ctrlKey: true,
      } as KeyboardEvent),
    ).toBe('undo');
    expect(
      resolveEditorShortcut({
        key: 'и',
        code: 'KeyB',
      } as KeyboardEvent),
    ).toBe('brush');
  });

  it('resolves every physical letter shortcut independently of event.key', () => {
    expect(
      [
        ['KeyB', 'brush'],
        ['KeyH', 'hand'],
        ['KeyE', 'restore'],
        ['KeyG', 'glitch'],
        ['KeyF', 'fit'],
      ].map(([code]) => resolveEditorShortcut({ code, key: 'ж' } as KeyboardEvent)),
    ).toEqual(['brush', 'hand', 'restore', 'glitch', 'fit']);
    expect(
      resolveEditorShortcut({
        code: 'KeyZ',
        key: 'я',
        ctrlKey: true,
        shiftKey: true,
      } as KeyboardEvent),
    ).toBe('redo');
    expect(resolveEditorShortcut({ code: 'KeyY', key: 'н', ctrlKey: true } as KeyboardEvent)).toBe(
      'redo',
    );
  });

  it('ignores editor commands while typing and suppresses repeated keydown actions', () => {
    expect(resolveEditorShortcut({ code: 'KeyB' }, true)).toBeNull();
    expect(resolveEditorShortcut({ code: 'Escape' }, true)).toBe('escape');
    expect(resolveEditorShortcut({ code: 'KeyG', repeat: true })).toBeNull();
  });

  it('activates card drag only after the header threshold and blocks controls', () => {
    expect(dragActivationReached(10, 10, 14, 13)).toBe(false);
    expect(dragActivationReached(10, 10, 16, 10)).toBe(true);
    const target = (matched: boolean) =>
      ({
        closest: () => (matched ? {} : null),
      }) as unknown as EventTarget;
    expect(isCardDragBlockedTarget(target(true))).toBe(true);
    expect(isCardDragBlockedTarget(target(false))).toBe(false);
  });

  it('calculates clamped slider progress for Chromium track fill', () => {
    expect(calculateRangeProgress(25, 0, 100)).toBe(25);
    expect(calculateRangeProgress(-10, 0, 100)).toBe(0);
    expect(calculateRangeProgress(110, 0, 100)).toBe(100);
    expect(calculateRangeProgress(1, 1, 1)).toBe(0);
  });
});

describe('owned Motion Transfer overlays', () => {
  const bounds = { x: 3, y: 5, width: 12, height: 9 };

  function motionRack(): MoshEffectCard[] {
    const motion = card('motion-transfer');
    return [
      {
        ...motion,
        sourceRegion: { ...bounds },
        destinationRegion: { x: 20, y: 8, width: 10, height: 7 },
      },
      card('feedback'),
    ];
  }

  it('clears source, destination and both without mutating unrelated cards', () => {
    const rack = motionRack();
    const owner = rack[0]!.instanceId;
    const noSource = clearMoshRegions(rack, owner, 'source');
    expect(noSource[0]!.sourceRegion).toBeNull();
    expect(noSource[0]!.destinationRegion).not.toBeNull();
    const noDestination = clearMoshRegions(rack, owner, 'destination');
    expect(noDestination[0]!.sourceRegion).not.toBeNull();
    expect(noDestination[0]!.destinationRegion).toBeNull();
    const neither = clearMoshRegions(rack, owner, 'both');
    expect(neither[0]!.sourceRegion).toBeNull();
    expect(neither[0]!.destinationRegion).toBeNull();
    expect(neither[1]).toBe(rack[1]);
  });

  it('stores selected regions on the owning effect instance', () => {
    const rack = motionRack();
    const owner = rack[0]!.instanceId;
    const next = setMoshRegion(rack, owner, 'source', { x: 1, y: 2, width: 4, height: 6 });
    expect(next[0]!.sourceRegion).toEqual({ x: 1, y: 2, width: 4, height: 6 });
    expect(next[1]).toBe(rack[1]);
  });

  it('removes overlays immediately when the owning card is removed or disabled', () => {
    const rack = motionRack();
    expect(deriveMoshOverlays(rack)).toHaveLength(2);
    expect(deriveMoshOverlays(rack.slice(1))).toHaveLength(0);
    expect(deriveMoshOverlays([{ ...rack[0]!, enabled: false }])).toHaveLength(0);
  });

  it('clears all image-dependent overlays for rack reset or image replacement', () => {
    const cleared = clearMoshRegions(motionRack());
    expect(deriveMoshOverlays(cleared)).toEqual([]);
    expect(cleared[0]!.sourceRegion).toBeNull();
    expect(cleared[0]!.destinationRegion).toBeNull();
  });
});

describe('MOSH presets and deterministic randomization', () => {
  it('gives every MOSH effect a complete built-in preset family', () => {
    for (const effect of moshEffectDefinitions) {
      const presets = moshPresets.filter((preset) => preset.effectId === effect.id);
      expect(presets.length).toBeGreaterThanOrEqual(effect.id === 'edge-melt' ? 5 : 6);
      for (const preset of presets) {
        for (const key of moshPresetParameterKeys[effect.id]) {
          expect(preset.settings[key]).not.toBeUndefined();
        }
      }
    }
  });

  it('gives every MOSH effect an effect-specific randomizer schema', () => {
    for (const effect of moshEffectDefinitions) {
      expect(moshRandomizerSchemas[effect.id].length).toBeGreaterThan(0);
      expect(new Set(moshRandomizerSchemas[effect.id].map((item) => item.key)).size).toBe(
        moshRandomizerSchemas[effect.id].length,
      );
    }
  });

  it('returns identical settings for identical seed, instance and mode', () => {
    for (const effect of moshEffectDefinitions) {
      const input = card(effect.id);
      expect(randomizeMoshCard(input, 'repeatable', 'balanced')).toEqual(
        randomizeMoshCard(input, 'repeatable', 'balanced'),
      );
      expect(randomizeMoshCard(input, 'repeatable', 'wild')).toEqual(
        randomizeMoshCard(input, 'repeatable', 'wild'),
      );
    }
  });

  it('keeps a variation exact for the same nonce and produces a new variation for a new nonce', () => {
    for (const effect of moshEffectDefinitions) {
      const input = card(effect.id);
      const first = randomizeMoshCard(input, 'repeatable', 'balanced', 11);
      expect(first).toEqual(randomizeMoshCard(input, 'repeatable', 'balanced', 11));
      expect(first).not.toEqual(randomizeMoshCard(input, 'repeatable', 'balanced', 12));
    }
  });

  it('keeps Balanced values in balanced ranges and Wild values in valid ranges', () => {
    for (const effect of moshEffectDefinitions) {
      const input = card(effect.id);
      const balanced = randomizeMoshCard(input, 'ranges', 'balanced');
      const wild = randomizeMoshCard(input, 'ranges', 'wild');
      for (const parameter of moshRandomizerSchemas[effect.id]) {
        const balancedValue = balanced.settings[parameter.key] as number;
        const wildValue = wild.settings[parameter.key] as number;
        expect(balancedValue).toBeGreaterThanOrEqual(parameter.balancedMin ?? parameter.min);
        expect(balancedValue).toBeLessThanOrEqual(parameter.balancedMax ?? parameter.max);
        expect(wildValue).toBeGreaterThanOrEqual(parameter.min);
        expect(wildValue).toBeLessThanOrEqual(parameter.max);
      }
      expect(balanced.enabled).toBe(input.enabled);
      expect(balanced.target).toBe(input.target);
      expect(balanced.activePresetId).toBe('custom');
    }
  });

  it('keeps every global randomization scope deterministic and preserves rack membership', () => {
    const rack = [card('pixel-sort'), card('feedback'), card('flow-field')];
    const parameters = randomizeMoshRack(rack, 'global', 'parameters', 'balanced', 4);
    const shuffled = randomizeMoshRack(rack, 'global', 'shuffle-order', 'wild', 4);
    const effects = randomizeMoshRack(rack, 'global', 'effects', 'wild', 4);
    const everything = randomizeMoshRack(rack, 'global', 'everything', 'wild', 4);
    expect(parameters).toHaveLength(rack.length);
    expect(parameters.map((item) => item.effectId)).toEqual(rack.map((item) => item.effectId));
    expect(shuffled.map((item) => item.instanceId).sort()).toEqual(
      rack.map((item) => item.instanceId).sort(),
    );
    expect(effects).toHaveLength(rack.length);
    expect(effects.map((item) => item.instanceId)).toEqual(rack.map((item) => item.instanceId));
    expect(effects.some((item, index) => item.effectId !== rack[index]!.effectId)).toBe(true);
    expect(everything.map((item) => item.instanceId).sort()).toEqual(
      rack.map((item) => item.instanceId).sort(),
    );
    expect(randomizeMoshRack(rack, 'global', 'shuffle-order', 'wild', 4)).toEqual(shuffled);
    expect(randomizeMoshRack(rack, 'global', 'everything', 'wild', 4)).toEqual(everything);
    expect(randomizeMoshRack(rack, 'global', 'everything', 'wild', 5)).not.toEqual(everything);
  });

  it('exposes the requested named Chroma, Edge and Flow preset families exactly', () => {
    const namesFor = (effectId: MoshEffectId) =>
      moshPresets.filter((preset) => preset.effectId === effectId).map((preset) => preset.name);
    expect(namesFor('chroma-drift')).toEqual([
      'VHS Color Bleed',
      'Frozen Luma',
      'Chroma Delay',
      'Low-Bandwidth Color',
      'Analog Misalignment',
      'Dirty Broadcast',
      'Color Ghost',
      'Crushed Chroma',
    ]);
    expect(namesFor('edge-melt')).toEqual([
      'Downward Melt',
      'Tangent Drag',
      'Edge Trails',
      'Text Bleed',
      'Outline Collapse',
    ]);
    expect(namesFor('flow-field')).toEqual([
      'Liquid Data',
      'Directional Current',
      'Digital Vortex',
      'Magnetic Pull',
      'Wave Fold',
      'Turbulence',
      'Signal River',
      'Hard Nearest Flow',
    ]);
  });

  it('renders every rebuilt Chroma, Edge and Flow preset as a distinct visible result', () => {
    const width = 96;
    const height = 64;
    const pixels = image(width, height);
    for (const effectId of ['chroma-drift', 'edge-melt', 'flow-field'] as const) {
      const outputs = moshPresets
        .filter((preset) => preset.effectId === effectId)
        .map(
          (preset, index) =>
            processMoshStack(
              pixels,
              width,
              height,
              [
                {
                  ...card(effectId),
                  instanceId: `${effectId}-${index}`,
                  settings: { ...card(effectId).settings, ...preset.settings },
                },
              ],
              `preset-family-${effectId}`,
            ).pixels,
        );
      expect(outputs.every((output) => pixelHash(output) !== pixelHash(pixels))).toBe(true);
      expect(new Set(outputs.map(pixelHash)).size).toBe(outputs.length);
    }
  });

  it('keeps rebuilt Edge Melt output connected instead of isolated pixel speckle', () => {
    const width = 96;
    const height = 64;
    const pixels = edgePattern(width, height);
    for (const preset of moshPresets.filter((item) => item.effectId === 'edge-melt')) {
      const output = processMoshStack(
        pixels,
        width,
        height,
        [{ ...card('edge-melt'), settings: { ...card('edge-melt').settings, ...preset.settings } }],
        `edge-connectivity-${preset.name}`,
      ).pixels;
      const mask = changedMask(pixels, output);
      let changed = 0;
      let isolated = 0;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = y * width + x;
          if (!mask[index]) continue;
          changed += 1;
          const neighbors =
            mask[index - 1]! + mask[index + 1]! + mask[index - width]! + mask[index + width]!;
          if (neighbors === 0) isolated += 1;
        }
      }
      expect(changed, preset.name).toBeGreaterThan(24);
      expect(isolated / changed, preset.name).toBeLessThan(0.08);
    }
  });

  it('persists, reloads and imports user MOSH presets', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const preset = {
      id: 'user-one',
      name: 'My Melt',
      effectId: 'edge-melt' as const,
      settings: { meltLength: 144 },
      custom: true as const,
    };
    saveMoshUserPresets([preset], storage);
    expect(values.has(MOSH_USER_PRESETS_STORAGE_KEY)).toBe(true);
    expect(loadMoshUserPresets(storage)).toEqual([preset]);
    const imported = parseMoshPresetJson(JSON.stringify(preset), 'import');
    expect(imported).toHaveLength(1);
    expect(imported[0]!.name).toBe('My Melt');
    expect(imported[0]!.effectId).toBe('edge-melt');
  });
});

describe('MOSH LAB algorithms', () => {
  it('detects coherent threshold intervals', () => {
    expect(
      detectSortIntervals([4, 90, 110, 130, 7, 100, 120, 5], 'threshold', 80, 140, 2, 10),
    ).toEqual([
      [1, 4],
      [5, 7],
    ]);
  });

  it('sorts a full interval by luminance instead of spraying noise', () => {
    const pixels = new Uint8ClampedArray([
      200, 200, 200, 255, 50, 50, 50, 255, 150, 150, 150, 255, 100, 100, 100, 255,
    ]);
    const sorted = processMoshStack(
      pixels,
      4,
      1,
      [card('pixel-sort', { intervalMode: 'full-row', intervalMin: 2 })],
      'sort',
    ).pixels;
    expect([sorted[0], sorted[4], sorted[8], sorted[12]]).toEqual([50, 100, 150, 200]);
  });

  it('feedback reads previous iterations and applies decay', () => {
    const pixels = image();
    const one = processMoshStack(
      pixels,
      48,
      32,
      [card('feedback', { feedbackIterations: 1, translateX: 4, opacityDecay: 0.8 })],
      'feedback',
    ).pixels;
    const four = processMoshStack(
      pixels,
      48,
      32,
      [card('feedback', { feedbackIterations: 4, translateX: 4, opacityDecay: 0.8 })],
      'feedback',
    ).pixels;
    expect(one).not.toEqual(pixels);
    expect(four).not.toEqual(one);
  });

  it('generates deterministic motion fields from the seed', () => {
    const pixels = image();
    const rack = [card('motion-field', { motionFieldSource: 'noise-flow', motionIterations: 3 })];
    const first = processMoshStack(pixels, 48, 32, rack, 'fixed-motion').pixels;
    const second = processMoshStack(pixels, 48, 32, rack, 'fixed-motion').pixels;
    expect(first).toEqual(second);
  });

  it('uses the persisted brush mask as a real application target', () => {
    const width = 48;
    const height = 32;
    const pixels = image(width, height);
    const brushMask = new Uint8Array(width * height);
    for (let y = 9; y < 20; y += 1) {
      for (let x = 14; x < 31; x += 1) brushMask[y * width + x] = 255;
    }
    const masked = {
      ...card('chroma-drift', { chromaX: 14, chromaY: 6, colorBleed: 1 }),
      target: 'brush' as const,
    };
    const output = processMoshStack(pixels, width, height, [masked], 'brush-mask', {
      brushMask,
    }).pixels;
    let insideChanges = 0;
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      const changed =
        output[offset] !== pixels[offset] ||
        output[offset + 1] !== pixels[offset + 1] ||
        output[offset + 2] !== pixels[offset + 2];
      if (brushMask[index]) {
        if (changed) insideChanges += 1;
      } else {
        expect(changed).toBe(false);
      }
    }
    expect(insideChanges).toBeGreaterThan(0);
  });

  it('uses the captured brush direction for Motion Field Mosh', () => {
    const pixels = image();
    const rack = [
      card('motion-field', {
        motionFieldSource: 'brush-direction',
        motionIterations: 2,
        vectorJitter: 0,
        propagationLength: 72,
      }),
    ];
    const horizontal = processMoshStack(pixels, 48, 32, rack, 'brush-vector', {
      brushDirection: { x: 1, y: 0 },
    }).pixels;
    const vertical = processMoshStack(pixels, 48, 32, rack, 'brush-vector', {
      brushDirection: { x: 0, y: 1 },
    }).pixels;
    expect(horizontal).not.toEqual(vertical);
  });

  it('aligns DCT simulation blocks to the selected grid', () => {
    const origins = alignedBlockOrigins(25, 18, 8);
    expect(origins.length).toBe(12);
    expect(origins.every(([x, y]) => x % 8 === 0 && y % 8 === 0)).toBe(true);
    expect(origins.at(-1)).toEqual([24, 16]);
  });

  it('changes output when the rack order changes', () => {
    const pixels = image();
    const sort = card('pixel-sort', { intervalMode: 'full-row', sortProperty: 'red' });
    const drift = card('chroma-drift', { chromaX: 9, colorBleed: 1 });
    const first = processMoshStack(pixels, 48, 32, [sort, drift], 'order').pixels;
    const second = processMoshStack(pixels, 48, 32, [drift, sort], 'order').pixels;
    expect(first).not.toEqual(second);
  });

  it('does not change output for a disabled effect', () => {
    const pixels = image();
    const disabled = { ...card('edge-melt'), enabled: false };
    expect(processMoshStack(pixels, 48, 32, [disabled], 'disabled').pixels).toEqual(pixels);
  });

  it('produces at least six distinct advanced visual signatures', () => {
    const pixels = image();
    const effects: MoshEffectId[] = [
      'pixel-sort',
      'feedback',
      'motion-field',
      'chroma-drift',
      'dct-damage',
      'edge-melt',
      'flow-field',
    ];
    const signatures = effects.map((effectId) => {
      const output = processMoshStack(pixels, 48, 32, [card(effectId)], 'distinct').pixels;
      let hash = 2166136261;
      for (const value of output) {
        hash ^= value;
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    });
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(6);
  });
});

describe('direct brush Worker engine', () => {
  function brushRequest(): BrushProcessRequest {
    const width = 64;
    const height = 40;
    const pixels = image(width, height);
    const mask = new Uint8Array(34 * 20);
    mask.fill(255);
    return {
      jobId: 'brush-job',
      width,
      height,
      pixels: pixels.slice().buffer,
      originalPixels: pixels.slice().buffer,
      mask: mask.buffer,
      maskBounds: { x: 15, y: 10, width: 34, height: 20 },
      bounds: { x: 15, y: 10, width: 34, height: 20 },
      algorithm: 'slice-displacement',
      settings: { ...defaultAlgorithmSettings, sliceCount: 3, sliceMinOffset: 8 },
      brush: {
        size: 80,
        hardness: 0.5,
        opacity: 1,
        strength: 1,
        density: 1,
        scatter: 0,
        spacing: 12,
        accumulate: true,
        pressure: false,
        minPressureSize: 1,
        minPressureStrength: 1,
      },
      pressure: 1,
      seed: 'worker-brush',
      movement: { x: 18, y: 3 },
      tool: 'brush',
    };
  }

  it('processes a structural stroke in isolation with progress', () => {
    const request = brushRequest();
    const source = new Uint8ClampedArray(request.pixels).slice();
    const progress: number[] = [];
    const result = processBrushEffect(request, {
      onProgress: (update) => progress.push(update.percent),
    });
    expect(result.affectedPixels).toBeGreaterThan(0);
    expect(result.pixels).not.toEqual(source);
    expect(progress).toEqual([8, 92, 100]);
  });

  it('aborts before committing when the Worker job is cancelled', () => {
    expect(() => processBrushEffect(brushRequest(), { shouldCancel: () => true })).toThrow(
      BrushCancelledError,
    );
  });
});

describe('MOSH LAB transaction safety', () => {
  it('does not alter committed pixels after cancellation', () => {
    const gate = new MoshJobGate();
    const committed = new Uint8ClampedArray([1, 2, 3, 4]);
    gate.begin('cancelled');
    gate.cancel('cancelled');
    expect(gate.accept('cancelled', committed, new Uint8ClampedArray([9, 9, 9, 9]))).toBe(false);
    expect([...committed]).toEqual([1, 2, 3, 4]);
  });

  it('ignores a stale result after a newer job begins', () => {
    const gate = new MoshJobGate();
    const committed = new Uint8ClampedArray([1]);
    gate.begin('old');
    gate.begin('new');
    expect(gate.accept('old', committed, new Uint8ClampedArray([8]))).toBe(false);
    expect(committed[0]).toBe(1);
  });

  it('commits an entire rack as exactly one history entry', () => {
    const committed = image(12, 8);
    const before = committed.slice();
    const result = processMoshStack(
      committed,
      12,
      8,
      [card('pixel-sort', { intervalMode: 'full-row' }), card('chroma-drift')],
      'atomic',
    ).pixels;
    committed.set(result);
    const patch = createPatch(0, before, committed);
    const history = new PatchHistory();
    expect(patch).not.toBeNull();
    history.push({
      id: 'rack',
      label: 'MOSH LAB · 2 effects',
      icon: 'motion-field',
      timestamp: 1,
      patches: [patch!],
    });
    expect(history.undoCount).toBe(1);
  });
});
