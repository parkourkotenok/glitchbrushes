import { describe, expect, it } from 'vitest';
import { measureEffectControl, measureImageBrushControl } from './controlSensitivity';
import { createImageBrushFx } from './imageBrush/types';

function expectRgbaChange(result: ReturnType<typeof measureEffectControl>): void {
  expect(result.minimumToMaximum.changedPixels).toBeGreaterThan(0);
  expect(result.minimumToMaximum.meanAbsoluteRgbaDifference).toBeGreaterThan(0);
  expect(result.minimumToMaximum.changedBounds).not.toBeNull();
}

describe('deterministic Effect control sensitivity', () => {
  it('classifies micro intensity as pixel-family only', () => {
    const pixel = measureEffectControl({
      algorithm: 'palette-collapse',
      key: 'microIntensity',
      minimum: 0.05,
      maximum: 1,
      fixture: 'gradient',
      mask: 'soft',
    });
    const advanced = measureEffectControl({
      algorithm: 'displacement-brush',
      key: 'microIntensity',
      minimum: 0.05,
      maximum: 1,
      activate: {
        displacementBrushSource: 'waves',
        displacementBrushStrengthX: 1,
        displacementBrushStrengthY: 1,
      },
      fixture: 'gradient',
      mask: 'soft',
    });
    expectRgbaChange(pixel);
    expect(advanced.minimumToMaximum.changedPixels).toBe(0);
  });

  it('classifies structural intensity as structural-family only', () => {
    const structural = measureEffectControl({
      algorithm: 'slice-displacement',
      key: 'structuralIntensity',
      minimum: 0.05,
      maximum: 1,
      fixture: 'photographic',
      stroke: 'long',
    });
    const advanced = measureEffectControl({
      algorithm: 'pixel-sort-brush',
      key: 'structuralIntensity',
      minimum: 0.05,
      maximum: 1,
      activate: { sortBrushThresholdLow: 0, sortBrushThresholdHigh: 255 },
    });
    expectRgbaChange(structural);
    expect(advanced.minimumToMaximum.changedPixels).toBe(0);
  });

  it('separates structural spill from advanced bounds-only spill fields', () => {
    const structural = measureEffectControl({
      algorithm: 'slice-displacement',
      key: 'spill',
      minimum: 'local',
      maximum: 'strong',
      fixture: 'photographic',
      mask: 'hard',
    });
    const sort = measureEffectControl({
      algorithm: 'pixel-sort-brush',
      key: 'sortBrushSpill',
      minimum: 0,
      maximum: 30,
      activate: {
        sortBrushThresholdLow: 0,
        sortBrushThresholdHigh: 255,
        sortBrushIntervalMin: 3,
        sortBrushIntervalMax: 32,
      },
    });
    const displacement = measureEffectControl({
      algorithm: 'displacement-brush',
      key: 'displacementBrushSpill',
      minimum: 0,
      maximum: 30,
      activate: {
        displacementBrushSource: 'waves',
        displacementBrushStrengthX: 1,
        displacementBrushStrengthY: 1,
      },
    });
    expect(structural.minimumWriteBounds).not.toEqual(structural.maximumWriteBounds);
    expect(sort.minimumToMaximum.changedPixels).toBe(0);
    expect(sort.minimumWriteBounds).not.toEqual(sort.maximumWriteBounds);
    expect(displacement.minimumToMaximum.changedPixels).toBe(0);
    expect(displacement.minimumWriteBounds).not.toEqual(displacement.maximumWriteBounds);
  });

  it('verifies representative primary controls across all three fixtures', () => {
    const cases = [
      measureEffectControl({
        algorithm: 'pixel-sort-brush',
        key: 'sortBrushDisorder',
        minimum: 0,
        maximum: 1,
        activate: { sortBrushThresholdLow: 0, sortBrushThresholdHigh: 255 },
        fixture: 'gradient',
      }),
      measureEffectControl({
        algorithm: 'feedback-brush',
        key: 'feedbackBrushEchoCount',
        minimum: 1,
        maximum: 8,
        fixture: 'alpha-art',
        mask: 'soft',
      }),
      measureEffectControl({
        algorithm: 'mirror-fold-brush',
        key: 'mirrorFoldOffset',
        minimum: -24,
        maximum: 24,
        fixture: 'photographic',
        stroke: 'long',
      }),
    ];
    for (const result of cases) expectRgbaChange(result);
  });
});

describe('deterministic Image Brush control sensitivity', () => {
  it('activates scatter controls only in scatter-like modes', () => {
    const repeat = measureImageBrushControl({
      key: 'scatterX',
      minimum: 0,
      maximum: 1.8,
      activate: { mode: 'trail', mutationMode: 'clean' },
    });
    const scatter = measureImageBrushControl({
      key: 'scatterX',
      minimum: 0,
      maximum: 1.8,
      activate: { mode: 'scatter', mutationMode: 'clean' },
    });
    expect(repeat.minimumToMaximum.changedPixels).toBe(0);
    expect(scatter.minimumToMaximum.changedPixels).toBeGreaterThan(0);
  });

  it('activates bleed amount only in Bleed alpha mode', () => {
    const preserve = measureImageBrushControl({
      key: 'bleedAmount',
      minimum: 0,
      maximum: 12,
      activate: { mutationMode: 'fixed', alphaMode: 'preserve' },
    });
    const bleed = measureImageBrushControl({
      key: 'bleedAmount',
      minimum: 0,
      maximum: 12,
      activate: { mutationMode: 'fixed', alphaMode: 'bleed' },
    });
    expect(preserve.minimumToMaximum.changedPixels).toBe(0);
    expect(bleed.minimumToMaximum.changedPixels).toBeGreaterThan(0);
  });

  it('keeps reset-each-stroke and live preview iterations out of output semantics', () => {
    const reset = measureImageBrushControl({
      key: 'resetEachStroke',
      minimum: false,
      maximum: true,
      activate: { mutationMode: 'evolving', continueBetweenStrokes: false },
    });
    const previewIterations = measureImageBrushControl({
      key: 'maxLiveFxIterations',
      minimum: 1,
      maximum: 5,
      activate: { mutationMode: 'fixed' },
    });
    expect(reset.minimumToMaximum.changedPixels).toBe(0);
    expect(previewIterations.minimumToMaximum.changedPixels).toBe(0);
  });

  it('measures both experimental Image Brush FX on alpha artwork', () => {
    const embroidery = measureImageBrushControl({
      key: 'mutationAmount',
      minimum: 0.1,
      maximum: 1,
      activate: { mutationMode: 'fixed' },
      rack: [createImageBrushFx('pixel-embroidery')],
      fixture: 'alpha-art',
    });
    const xerox = measureImageBrushControl({
      key: 'mutationAmount',
      minimum: 0.1,
      maximum: 1,
      activate: { mutationMode: 'fixed' },
      rack: [createImageBrushFx('xerox-decay')],
      fixture: 'alpha-art',
    });
    expect(embroidery.minimumToMaximum.changedPixels).toBeGreaterThan(0);
    expect(xerox.minimumToMaximum.changedPixels).toBeGreaterThan(0);
  });
});
