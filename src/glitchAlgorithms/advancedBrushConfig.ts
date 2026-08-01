import type {
  AlgorithmId,
  AlgorithmSettings,
  BrushSettings,
  CanvasOverlayState,
  Rectangle,
} from '../types';
import { clamp } from '../utils/geometry';
import { createSeededRandom, type RandomSource } from '../utils/prng';

export type AdvancedBrushId =
  | 'pixel-sort-brush'
  | 'feedback-brush'
  | 'displacement-brush'
  | 'flow-mosh-brush'
  | 'clone-corruption-brush'
  | 'line-freeze-brush';

export type AdvancedBrushRandomizeMode = 'balanced' | 'wild';

export interface AdvancedBrushRandomizableParameter {
  key: keyof AlgorithmSettings;
  min: number;
  max: number;
  balancedMin: number;
  balancedMax: number;
  step?: number;
}

const p = (
  key: keyof AlgorithmSettings,
  min: number,
  max: number,
  balancedMin: number,
  balancedMax: number,
  step = 0.01,
): AdvancedBrushRandomizableParameter => ({
  key,
  min,
  max,
  balancedMin,
  balancedMax,
  step,
});

export const advancedBrushIds: AdvancedBrushId[] = [
  'pixel-sort-brush',
  'feedback-brush',
  'displacement-brush',
  'flow-mosh-brush',
  'clone-corruption-brush',
  'line-freeze-brush',
];

export function isAdvancedBrushId(id: AlgorithmId): id is AdvancedBrushId {
  return advancedBrushIds.includes(id as AdvancedBrushId);
}

export function deriveAdvancedBrushOverlays(
  activeAlgorithm: AlgorithmId,
  cloneSource: Rectangle | null,
): CanvasOverlayState[] {
  if (activeAlgorithm !== 'clone-corruption-brush' || !cloneSource) return [];
  return [
    {
      ownerEffectInstanceId: 'advanced-brush:clone-corruption-brush',
      type: 'clone-source',
      bounds: { ...cloneSource },
      active: true,
    },
  ];
}

export const advancedBrushRandomizerSchemas: Record<
  AdvancedBrushId,
  AdvancedBrushRandomizableParameter[]
> = {
  'pixel-sort-brush': [
    p('sortBrushThresholdLow', 0, 210, 20, 120, 1),
    p('sortBrushThresholdHigh', 45, 255, 155, 250, 1),
    p('sortBrushIntervalMin', 2, 80, 6, 30, 1),
    p('sortBrushIntervalMax', 20, 640, 120, 360, 1),
    p('sortBrushDisorder', 0, 0.8, 0, 0.24),
    p('sortBrushEdgeSoftness', 0, 32, 2, 12, 1),
    p('sortBrushLength', 24, 600, 90, 300, 1),
    p('sortBrushSpill', 0, 120, 0, 36, 1),
  ],
  'feedback-brush': [
    p('feedbackBrushEchoCount', 2, 18, 3, 9, 1),
    p('feedbackBrushOffsetX', -100, 100, -34, 34, 1),
    p('feedbackBrushOffsetY', -100, 100, -24, 24, 1),
    p('feedbackBrushScale', 0.92, 1.1, 0.98, 1.04, 0.001),
    p('feedbackBrushRotation', -12, 12, -3, 3, 0.1),
    p('feedbackBrushOpacityDecay', 0.1, 0.98, 0.5, 0.86),
    p('feedbackBrushBrightnessDecay', 0.55, 1.2, 0.82, 1.06),
    p('feedbackBrushRgbDelay', 0, 40, 0, 14, 1),
    p('feedbackBrushPersistence', 0.1, 1, 0.48, 0.92),
  ],
  'displacement-brush': [
    p('displacementBrushStrengthX', -160, 160, -55, 55, 1),
    p('displacementBrushStrengthY', -160, 160, -55, 55, 1),
    p('displacementBrushScale', 4, 300, 24, 140, 1),
    p('displacementBrushRoughness', 0.05, 1, 0.28, 0.72),
    p('displacementBrushOctaves', 1, 6, 2, 4, 1),
    p('displacementBrushIterations', 1, 8, 1, 4, 1),
    p('displacementBrushSpill', 0, 120, 0, 40, 1),
  ],
  'flow-mosh-brush': [
    p('flowBrushBlockSize', 4, 72, 8, 32, 1),
    p('flowBrushPropagation', 20, 600, 60, 240, 1),
    p('flowBrushIterations', 2, 16, 3, 8, 1),
    p('flowBrushDirectionInfluence', 0, 1, 0.55, 1),
    p('flowBrushVectorPersistence', 0.1, 1, 0.48, 0.94),
    p('flowBrushJitter', 0, 1, 0, 0.32),
    p('flowBrushDecay', 0, 0.9, 0.05, 0.42),
    p('flowBrushLumaLock', 0, 1, 0, 0.48),
    p('flowBrushChromaLag', 0, 64, 0, 18, 1),
    p('flowBrushTrailWidth', 8, 220, 24, 96, 1),
    p('flowBrushFallbackAngle', -180, 180, -180, 180, 1),
  ],
  'clone-corruption-brush': [
    p('cloneBrushScaleJitter', 0, 0.8, 0, 0.24),
    p('cloneBrushRotationJitter', 0, 45, 0, 12, 0.1),
    p('cloneBrushChannelSplit', 0, 48, 0, 14, 1),
    p('cloneBrushTileFragmentation', 0, 1, 0.08, 0.5),
    p('cloneBrushRepetition', 1, 10, 2, 5, 1),
    p('cloneBrushDecay', 0.1, 1, 0.45, 0.9),
    p('cloneBrushBlockSize', 4, 80, 10, 36, 1),
    p('cloneBrushBlend', 0.1, 1, 0.55, 1),
  ],
  'line-freeze-brush': [
    p('lineBrushRepeatCount', 1, 24, 4, 12, 1),
    p('lineBrushStretch', 0.25, 8, 0.8, 3.5),
    p('lineBrushJitter', 0, 40, 0, 12, 1),
    p('lineBrushRgbSplit', 0, 40, 0, 12, 1),
    p('lineBrushDropout', 0, 0.85, 0, 0.28),
    p('lineBrushThickness', 1, 24, 2, 10, 1),
    p('lineBrushSpill', 0, 120, 0, 40, 1),
  ],
};

function choice<T>(random: RandomSource, values: readonly T[]): T {
  return values[random.int(0, values.length - 1)]!;
}

function applyChoices(
  id: AdvancedBrushId,
  settings: AlgorithmSettings,
  random: RandomSource,
): void {
  if (id === 'pixel-sort-brush') {
    settings.sortBrushDirection = choice(random, [
      'horizontal',
      'vertical',
      'stroke',
      'perpendicular',
    ] as const);
    settings.sortBrushProperty = choice(random, [
      'luminance',
      'hue',
      'saturation',
      'rgb-sum',
    ] as const);
    settings.sortBrushReverse = random.next() < 0.35;
  } else if (id === 'feedback-brush') {
    settings.feedbackBrushBlendMode = choice(random, [
      'normal',
      'screen',
      'multiply',
      'difference',
      'lighten',
    ] as const);
  } else if (id === 'displacement-brush') {
    settings.displacementBrushSource = choice(random, [
      'noise',
      'waves',
      'pressure',
      'luminance',
      'edges',
      'radial',
      'vortex',
    ] as const);
    settings.displacementBrushInterpolation = choice(random, ['nearest', 'bilinear'] as const);
    settings.displacementBrushEdgeMode = choice(random, ['clamp', 'wrap', 'mirror'] as const);
  } else if (id === 'flow-mosh-brush') {
    settings.flowBrushOverwrite = random.next() < 0.32;
  } else if (id === 'clone-corruption-brush') {
    settings.cloneBrushAlignment = choice(random, ['aligned', 'non-aligned'] as const);
  } else {
    settings.lineBrushOrientation = choice(random, ['horizontal', 'vertical', 'stroke'] as const);
    settings.lineBrushSource = choice(random, ['leading', 'center', 'trailing'] as const);
  }
}

export function randomizeAdvancedBrush(
  id: AdvancedBrushId,
  settings: AlgorithmSettings,
  brush: BrushSettings,
  seed: string,
  mode: AdvancedBrushRandomizeMode,
): { settings: AlgorithmSettings; brush: BrushSettings } {
  const random = createSeededRandom(`${seed}:${id}:${mode}`);
  const nextSettings = { ...settings };
  for (const parameter of advancedBrushRandomizerSchemas[id]) {
    const min = mode === 'balanced' ? parameter.balancedMin : parameter.min;
    const max = mode === 'balanced' ? parameter.balancedMax : parameter.max;
    const step = parameter.step ?? 1;
    const raw = min + random.next() * (max - min);
    const value = clamp(Math.round(raw / step) * step, parameter.min, parameter.max);
    const decimals = Math.max(0, (String(step).split('.')[1] ?? '').length);
    (nextSettings as unknown as Record<string, number>)[parameter.key] = Number(
      value.toFixed(decimals),
    );
  }
  applyChoices(id, nextSettings, random);
  if (
    id === 'pixel-sort-brush' &&
    nextSettings.sortBrushThresholdLow >= nextSettings.sortBrushThresholdHigh
  ) {
    nextSettings.sortBrushThresholdHigh = Math.min(255, nextSettings.sortBrushThresholdLow + 36);
  }
  const nextBrush = {
    ...brush,
    size: Math.round(mode === 'balanced' ? 90 + random.next() * 170 : 45 + random.next() * 360),
    hardness: Number(
      (mode === 'balanced' ? 0.22 + random.next() * 0.58 : random.next()).toFixed(2),
    ),
    strength: Number(
      (mode === 'balanced' ? 0.58 + random.next() * 0.38 : 0.35 + random.next() * 0.65).toFixed(2),
    ),
    spacing: Math.round(mode === 'balanced' ? 8 + random.next() * 22 : 4 + random.next() * 50),
    scatter: Number((mode === 'balanced' ? random.next() * 0.18 : random.next() * 0.7).toFixed(2)),
  };
  return { settings: nextSettings, brush: nextBrush };
}
