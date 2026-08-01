import { clamp } from '../utils/geometry';
import { createSeededRandom, type RandomSource } from '../utils/prng';
import {
  defaultMoshSettings,
  moshEffectDefinitions,
  type MoshEffectCard,
  type MoshEffectId,
  type MoshEffectSettings,
} from './types';

export type MoshRandomizeMode = 'balanced' | 'wild';
export type MoshGlobalRandomizeScope =
  'parameters' | 'effects' | 'effects-and-parameters' | 'shuffle-order' | 'everything';

export interface RandomizableParameter {
  key: keyof MoshEffectSettings;
  min: number;
  max: number;
  balancedMin?: number;
  balancedMax?: number;
  step?: number;
  distribution?: 'uniform' | 'centered' | 'weighted-low' | 'weighted-high';
}

const p = (
  key: keyof MoshEffectSettings,
  min: number,
  max: number,
  balancedMin = min,
  balancedMax = max,
  step = 0.01,
  distribution: RandomizableParameter['distribution'] = 'uniform',
): RandomizableParameter => ({
  key,
  min,
  max,
  balancedMin,
  balancedMax,
  step,
  distribution,
});

export const moshRandomizerSchemas: Record<MoshEffectId, RandomizableParameter[]> = {
  'pixel-sort': [
    p('lowerThreshold', 0, 220, 28, 140, 1, 'centered'),
    p('upperThreshold', 40, 255, 150, 248, 1, 'centered'),
    p('intervalMin', 2, 180, 8, 64, 1, 'weighted-low'),
    p('intervalMax', 32, 1600, 180, 720, 1, 'weighted-low'),
    p('disorder', 0, 0.75, 0.03, 0.24, 0.01, 'weighted-low'),
  ],
  feedback: [
    p('feedbackIterations', 2, 20, 3, 10, 1, 'weighted-low'),
    p('translateX', -120, 120, -42, 42, 1, 'centered'),
    p('translateY', -120, 120, -30, 30, 1, 'centered'),
    p('feedbackScale', 0.94, 1.08, 0.985, 1.035, 0.001, 'centered'),
    p('feedbackRotation', -8, 8, -2.5, 2.5, 0.1, 'centered'),
    p('opacityDecay', 0.05, 1, 0.5, 0.88, 0.01, 'centered'),
    p('brightnessDecay', 0.5, 1.2, 0.82, 1.08, 0.01, 'centered'),
    p('saturationDecay', 0, 1.2, 0.62, 1.08, 0.01, 'centered'),
    p('feedbackChannelOffset', 0, 48, 0, 14, 1, 'weighted-low'),
    p('feedbackReset', 0, 0.8, 0, 0.24, 0.01, 'weighted-low'),
  ],
  'motion-field': [
    p('motionBlockSize', 4, 96, 8, 48, 1, 'weighted-low'),
    p('propagationLength', 20, 600, 20, 180, 1, 'weighted-low'),
    p('motionIterations', 2, 20, 2, 8, 1, 'weighted-low'),
    p('vectorStrength', 0.2, 4, 0.4, 1.8, 0.01, 'centered'),
    p('vectorJitter', 0, 1, 0, 0.35, 0.01, 'weighted-low'),
    p('motionPersistence', 0.1, 1.2, 0.45, 0.95, 0.01, 'centered'),
    p('motionDecay', 0, 1, 0.05, 0.45, 0.01, 'weighted-low'),
    p('motionLumaLock', 0, 1, 0, 0.55, 0.01, 'weighted-low'),
    p('motionChromaDrift', 0, 80, 0, 18, 1, 'weighted-low'),
    p('motionSpill', 0, 1, 0, 0.5, 0.01, 'weighted-low'),
  ],
  'motion-transfer': [
    p('transferDirection', -180, 180, -80, 80, 1, 'centered'),
    p('transferRepetitions', 1, 12, 2, 7, 1, 'weighted-low'),
    p('transferScale', 0.5, 1.8, 0.82, 1.2, 0.01, 'centered'),
    p('transferRotation', -30, 30, -8, 8, 0.1, 'centered'),
    p('transferDecay', 0.05, 1, 0.4, 0.9, 0.01, 'centered'),
    p('transferBlend', 0.05, 1, 0.48, 1, 0.01, 'weighted-high'),
  ],
  'chroma-drift': [
    p('lumaOffset', -64, 64, -14, 14, 1, 'centered'),
    p('chromaX', -96, 96, -34, 34, 1, 'centered'),
    p('chromaY', -96, 96, -22, 22, 1, 'centered'),
    p('chromaBlur', 0, 16, 0, 7, 1, 'weighted-low'),
    p('chromaBlockSize', 1, 32, 2, 16, 1, 'weighted-low'),
    p('chromaSubsampling', 0, 1, 0.18, 0.78, 0.01, 'centered'),
    p('colorBleed', 0, 1, 0.35, 0.9, 0.01, 'weighted-high'),
    p('lumaHold', 0, 1, 0.5, 1, 0.01, 'weighted-high'),
    p('channelDelay', 0, 48, 0, 18, 1, 'weighted-low'),
    p('chromaEdgeSoftness', 0, 16, 0, 7, 1, 'weighted-low'),
  ],
  'dct-damage': [
    p('dctQuantization', 0, 1, 0.28, 0.78, 0.01, 'centered'),
    p('highFrequencyRemoval', 0, 1, 0.28, 0.82, 0.01, 'centered'),
    p('lowFrequencyBoost', 0, 1, 0.05, 0.42, 0.01, 'weighted-low'),
    p('coefficientDropout', 0, 1, 0.05, 0.45, 0.01, 'weighted-low'),
    p('ringingStrength', 0, 1, 0.08, 0.56, 0.01, 'weighted-low'),
    p('blockBoundaryStrength', 0, 1, 0.08, 0.58, 0.01, 'weighted-low'),
    p('chromaQuality', 0, 1, 0.28, 0.82, 0.01, 'centered'),
    p('randomBlockReplacement', 0, 1, 0.02, 0.24, 0.01, 'weighted-low'),
    p('neighborInheritance', 0, 1, 0.04, 0.42, 0.01, 'weighted-low'),
  ],
  'edge-melt': [
    p('edgeThreshold', 1, 255, 24, 112, 1, 'weighted-low'),
    p('edgeSensitivity', 0.1, 3, 0.65, 1.8, 0.01, 'centered'),
    p('meltLength', 4, 420, 30, 190, 1, 'weighted-low'),
    p('meltSpread', 0, 80, 0, 26, 1, 'weighted-low'),
    p('meltBlur', 0, 2, 0, 0.65, 0.01, 'weighted-low'),
    p('colorCarry', 0, 1, 0.52, 1, 0.01, 'weighted-high'),
  ],
  'flow-field': [
    p('flowScale', 4, 320, 24, 150, 1, 'weighted-low'),
    p('flowStrength', 1, 160, 8, 58, 1, 'weighted-low'),
    p('flowOctaves', 1, 6, 2, 4, 1, 'weighted-low'),
    p('flowPersistence', 0.05, 1, 0.28, 0.78, 0.01, 'centered'),
    p('flowIterations', 1, 12, 2, 6, 1, 'weighted-low'),
    p('flowDirection', -180, 180, -180, 180, 1, 'uniform'),
  ],
};

function sampleUnit(
  random: RandomSource,
  distribution: RandomizableParameter['distribution'],
): number {
  const first = random.next();
  if (distribution === 'centered') return (first + random.next()) / 2;
  if (distribution === 'weighted-low') return first * first;
  if (distribution === 'weighted-high') return 1 - (1 - first) * (1 - first);
  return first;
}

function sampledValue(
  random: RandomSource,
  parameter: RandomizableParameter,
  mode: MoshRandomizeMode,
): number {
  const min = mode === 'balanced' ? (parameter.balancedMin ?? parameter.min) : parameter.min;
  const max = mode === 'balanced' ? (parameter.balancedMax ?? parameter.max) : parameter.max;
  const step = parameter.step ?? 1;
  const raw = min + sampleUnit(random, parameter.distribution) * (max - min);
  const stepped = Math.round(raw / step) * step;
  const decimals = Math.max(0, (String(step).split('.')[1] ?? '').length);
  return Number(clamp(stepped, parameter.min, parameter.max).toFixed(decimals));
}

function choice<T>(random: RandomSource, values: readonly T[]): T {
  return values[random.int(0, values.length - 1)]!;
}

function randomizeChoices(
  effectId: MoshEffectId,
  settings: MoshEffectSettings,
  random: RandomSource,
): void {
  if (effectId === 'pixel-sort') {
    settings.pixelDirection = choice(random, [
      'horizontal',
      'vertical',
      'diagonal-forward',
      'diagonal-backward',
      'radial',
    ] as const);
    settings.sortProperty = choice(random, [
      'luminance',
      'hue',
      'saturation',
      'red',
      'green',
      'blue',
      'rgb-sum',
    ] as const);
    settings.intervalMode = choice(random, [
      'threshold',
      'random',
      'edges',
      'waves',
      'full-row',
    ] as const);
    settings.reverse = random.next() < 0.35;
  } else if (effectId === 'feedback') {
    settings.feedbackBlendMode = choice(random, [
      'normal',
      'screen',
      'multiply',
      'difference',
      'lighten',
      'darken',
    ] as const);
    settings.feedbackEdge = choice(random, ['clamp', 'wrap', 'mirror'] as const);
  } else if (effectId === 'motion-field') {
    settings.motionFieldSource = choice(random, [
      'brush-direction',
      'radial',
      'vortex',
      'directional',
      'noise-flow',
      'image-edges',
    ] as const);
    settings.motionOverwrite = random.next() < 0.32;
  } else if (effectId === 'motion-transfer') {
    settings.transferMode = choice(random, [
      'copy-motion',
      'copy-texture',
      'copy-luma',
      'copy-chroma',
      'swap',
    ] as const);
  } else if (effectId === 'dct-damage') {
    settings.dctBlockSize = choice(random, [8, 16] as const);
  } else if (effectId === 'edge-melt') {
    settings.edgeDirection = choice(random, ['away', 'toward', 'tangent', 'down', 'up'] as const);
    settings.preserveStrongEdges = random.next() < 0.7;
    settings.invertEdgeMask = random.next() < 0.16;
  } else if (effectId === 'flow-field') {
    settings.flowType = choice(random, [
      'curl-noise',
      'waves',
      'vortex',
      'radial-explosion',
      'radial-implosion',
      'turbulence',
      'image-luminance',
    ] as const);
    settings.flowWrapping = random.next() < 0.35;
    settings.flowInterpolation = choice(random, ['nearest', 'bilinear'] as const);
  }
}

export function randomizeMoshCard(
  card: MoshEffectCard,
  rackSeed: string,
  mode: MoshRandomizeMode,
  variationNonce = 0,
): MoshEffectCard {
  const random = createSeededRandom(
    `${rackSeed}:${card.instanceId}:${mode}:variation:${variationNonce}`,
  );
  const settings = { ...card.settings };
  for (const parameter of moshRandomizerSchemas[card.effectId]) {
    (settings as unknown as Record<string, number>)[parameter.key] = sampledValue(
      random,
      parameter,
      mode,
    );
  }
  randomizeChoices(card.effectId, settings, random);
  if (card.effectId === 'pixel-sort') {
    if (settings.lowerThreshold >= settings.upperThreshold) {
      [settings.lowerThreshold, settings.upperThreshold] = [
        Math.max(0, settings.upperThreshold - 24),
        Math.min(255, settings.lowerThreshold + 24),
      ];
    }
    if (settings.intervalMin >= settings.intervalMax) {
      settings.intervalMax = Math.min(1600, settings.intervalMin + 48);
    }
  }
  return {
    ...card,
    mix: Number(
      (mode === 'balanced' ? 0.68 + random.next() * 0.3 : 0.45 + random.next() * 0.55).toFixed(2),
    ),
    settings,
    activePresetId: 'custom',
  };
}

export function randomizeMoshRack(
  rack: MoshEffectCard[],
  rackSeed: string,
  scope: MoshGlobalRandomizeScope,
  mode: MoshRandomizeMode,
  variationNonce = 0,
): MoshEffectCard[] {
  if (scope === 'shuffle-order') {
    const random = createSeededRandom(`${rackSeed}:rack-order:${mode}:variation:${variationNonce}`);
    const shuffled = [...rack];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = random.int(0, index);
      [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
    }
    if (
      shuffled.length > 1 &&
      shuffled.every((card, index) => card.instanceId === rack[index]!.instanceId)
    )
      shuffled.push(shuffled.shift()!);
    return shuffled;
  }
  if (scope === 'effects' || scope === 'effects-and-parameters' || scope === 'everything') {
    const ids = moshEffectDefinitions.map((definition) => definition.id);
    const randomized = rack.map((card, index) => {
      const random = createSeededRandom(
        `${rackSeed}:rack-effect:${index}:${mode}:variation:${variationNonce}`,
      );
      const effectId = choice(random, ids);
      const changed = {
        ...card,
        effectId,
        settings: { ...defaultMoshSettings },
        sourceRegion: effectId === 'motion-transfer' ? card.sourceRegion : null,
        destinationRegion: effectId === 'motion-transfer' ? card.destinationRegion : null,
        activePresetId: 'custom',
      };
      return scope === 'effects'
        ? changed
        : randomizeMoshCard(changed, rackSeed, mode, variationNonce);
    });
    if (scope !== 'everything') return randomized;
    const orderRandom = createSeededRandom(
      `${rackSeed}:everything-order:${mode}:variation:${variationNonce}`,
    );
    for (let index = randomized.length - 1; index > 0; index -= 1) {
      const other = orderRandom.int(0, index);
      [randomized[index], randomized[other]] = [randomized[other]!, randomized[index]!];
    }
    if (
      randomized.length > 1 &&
      randomized.every((card, index) => card.instanceId === rack[index]!.instanceId)
    )
      randomized.push(randomized.shift()!);
    return randomized;
  }
  return rack.map((card) => randomizeMoshCard(card, rackSeed, mode, variationNonce));
}
