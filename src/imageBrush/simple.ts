import { spacingInPixels } from './path';
import {
  type ImageBrushAsset,
  type ImageBrushFxId,
  type ImageBrushFxItem,
  type ImageBrushGlitchAmount,
  type ImageBrushPreset,
  type ImageBrushSettings,
} from './types';

export const imageBrushSimplePresetIds = [
  'clean-repeat',
  'glitched-repeat',
  'progressive-decay',
  'random-glitch-chain',
  'datamosh-trail',
  'rgb-separation-trail',
  'pixel-sort-trail',
  'chroma-feedback',
  'compression-breakdown',
  'packet-loss-stream',
  'broken-interface',
  'scatter-fragments',
] as const;

export const imageBrushPresetPresentation: Readonly<
  Record<
    string,
    {
      description: string;
      cost: 'Low' | 'Medium' | 'High' | 'Very High';
    }
  >
> = {
  'clean-repeat': {
    description: 'Places clear, readable copies without running Stamp FX.',
    cost: 'Low',
  },
  'glitched-repeat': {
    description: 'Repeats one identical sliced and RGB-separated result.',
    cost: 'Medium',
  },
  'progressive-decay': {
    description: 'Moves through bounded key variants from light to severe damage.',
    cost: 'High',
  },
  'random-glitch-chain': {
    description: 'Cycles a seeded pool of different structural effect recipes.',
    cost: 'Medium',
  },
  'datamosh-trail': {
    description: 'Accumulates directional datamosh and feedback from copy to copy.',
    cost: 'High',
  },
  'rgb-separation-trail': {
    description: 'Generates varied coherent RGB and chroma separation stacks.',
    cost: 'Medium',
  },
  'pixel-sort-trail': {
    description: 'Processes the complete trail into connected sorted streaks.',
    cost: 'High',
  },
  'chroma-feedback': {
    description: 'Accumulates colored feedback memories across the trail.',
    cost: 'High',
  },
  'compression-breakdown': {
    description: 'Gradually changes from clean copies into compression damage.',
    cost: 'High',
  },
  'packet-loss-stream': {
    description: 'Builds randomized missing, repeated and scrambled packet stacks.',
    cost: 'High',
  },
  'scatter-fragments': {
    description: 'Throws rotated packet-damaged fragments around the path.',
    cost: 'Medium',
  },
  'broken-interface': {
    description: 'Creates hard macroblock and packet-loss UI fragments.',
    cost: 'Medium',
  },
};

export const imageBrushGlitchLevels: ReadonlyArray<{
  id: Exclude<ImageBrushGlitchAmount, 'custom'>;
  label: string;
}> = [
  { id: 'clean', label: 'Clean' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
  { id: 'broken', label: 'Broken' },
  { id: 'extreme', label: 'Extreme' },
];

export function preserveImageBrushEssentialControls(
  current: ImageBrushSettings,
  styled: ImageBrushSettings,
): ImageBrushSettings {
  return {
    ...styled,
    size: current.size,
    spacing: current.spacing,
    spacingUnit: current.spacingUnit,
    opacity: current.opacity,
    flow: current.flow,
    glitchAmount: current.glitchAmount,
    effectVariation: current.effectVariation,
    angle: current.angle,
    rotationMode: current.rotationMode,
    followDirection: current.followDirection,
    randomRotation: current.randomRotation,
    rotationJitter: current.rotationJitter,
    flipXChance: current.flipXChance,
    flipYChance: current.flipYChance,
  };
}

const levelIndex: Record<Exclude<ImageBrushGlitchAmount, 'custom'>, number> = {
  clean: 0,
  subtle: 1,
  medium: 2,
  strong: 3,
  broken: 4,
  extreme: 5,
};

const effectCurves: Record<ImageBrushFxId, readonly number[]> = {
  slice: [0.01, 0.18, 0.36, 0.58, 0.79, 0.96],
  macroblock: [0.01, 0.14, 0.31, 0.52, 0.72, 0.9],
  'block-corruption': [0.01, 0.14, 0.33, 0.55, 0.76, 0.94],
  datamosh: [0.01, 0.12, 0.3, 0.56, 0.78, 0.94],
  'rgb-split': [0.01, 0.2, 0.42, 0.66, 0.84, 1],
  scanline: [0.01, 0.2, 0.4, 0.62, 0.8, 0.98],
  'packet-loss': [0.01, 0.1, 0.27, 0.48, 0.7, 0.9],
  compression: [0.01, 0.16, 0.34, 0.56, 0.76, 0.94],
  'codec-block-damage': [0.01, 0.16, 0.36, 0.58, 0.78, 0.96],
  'tile-scramble': [0.01, 0.08, 0.24, 0.46, 0.68, 0.88],
  'row-repeat': [0.01, 0.18, 0.38, 0.6, 0.8, 1],
  'pixel-noise': [0.01, 0.08, 0.2, 0.38, 0.6, 0.82],
  'bit-flip': [0.01, 0.05, 0.14, 0.28, 0.48, 0.72],
  palette: [0.01, 0.16, 0.34, 0.56, 0.78, 1],
  'pixel-sort': [0.01, 0.08, 0.24, 0.45, 0.66, 0.84],
  feedback: [0.01, 0.08, 0.22, 0.4, 0.61, 0.8],
  'motion-field': [0.01, 0.1, 0.26, 0.46, 0.68, 0.86],
  'chroma-drift': [0.01, 0.18, 0.38, 0.62, 0.82, 1],
  'dct-damage': [0.01, 0.08, 0.22, 0.42, 0.64, 0.84],
  'edge-melt': [0.01, 0.08, 0.24, 0.46, 0.68, 0.88],
  'flow-field': [0.01, 0.06, 0.18, 0.34, 0.54, 0.72],
  'motion-transfer': [0.01, 0.08, 0.22, 0.42, 0.64, 0.84],
};

export function applyImageBrushGlitchAmount(
  settings: ImageBrushSettings,
  rack: ImageBrushFxItem[],
  level: Exclude<ImageBrushGlitchAmount, 'custom'>,
  styleId: string,
): { settings: ImageBrushSettings; rack: ImageBrushFxItem[] } {
  const index = levelIndex[level];
  const fallbackRack: ImageBrushFxItem[] = [
    { id: `${styleId}-simple-slice`, effectId: 'slice', enabled: true, amount: 0.36, mix: 1 },
    { id: `${styleId}-simple-rgb`, effectId: 'rgb-split', enabled: true, amount: 0.3, mix: 0.8 },
  ];
  const baseRack = rack.length ? rack : fallbackRack;
  const clean = level === 'clean';
  const nextRack = baseRack.map((item, rackIndex) => ({
    ...item,
    enabled: clean ? false : true,
    amount: effectCurves[item.effectId][index] ?? 0.3,
    mix: clean ? 0 : Math.min(1, 0.58 + index * 0.085 - rackIndex * 0.025),
  }));
  const mutationAmount = [0, 0.16, 0.34, 0.52, 0.72, 0.9][index]!;
  return {
    settings: {
      ...settings,
      glitchAmount: level,
      mutationMode: clean
        ? 'clean'
        : settings.mutationMode === 'clean'
          ? 'fixed'
          : settings.mutationMode,
      mutationAmount,
      progressiveStart: [0, 0.03, 0.06, 0.1, 0.14, 0.2][index]!,
      progressiveEnd: [0, 0.32, 0.54, 0.74, 0.92, 1][index]!,
      effectVariation: [0, 0.08, 0.18, 0.32, 0.52, 0.72][index]!,
      evolutionSpeed: [0, 0.12, 0.28, 0.48, 0.7, 0.9][index]!,
      maxCorruption: [0.05, 0.32, 0.52, 0.72, 0.9, 1][index]!,
      minimumEffects: Math.max(1, Math.min(3, Math.ceil(index / 2))),
      maximumEffects: Math.max(1, Math.min(6, 1 + index)),
      accumulation: [0, 0.28, 0.44, 0.62, 0.78, 0.92][index]!,
      recovery: [1, 0.52, 0.34, 0.2, 0.1, 0.03][index]!,
      stackMinimumEffects: Math.max(1, Math.min(3, Math.ceil(index / 2))),
      stackMaximumEffects: Math.max(1, Math.min(7, 2 + index)),
      stackMinimumStrength: Math.max(0.01, mutationAmount * 0.35),
      stackMaximumStrength: Math.max(0.01, mutationAmount),
      structuralDrift: [0, 0.06, 0.16, 0.32, 0.56, 0.82][index]!,
      maxLiveFxIterations: Math.min(5, Math.max(1, 1 + index)),
    },
    rack: nextRack,
  };
}

export function applyImageBrushStyleKeepingEssentials(
  current: ImageBrushSettings,
  styledSettings: ImageBrushSettings,
  styledRack: ImageBrushFxItem[],
  styleId: string,
): { settings: ImageBrushSettings; rack: ImageBrushFxItem[] } {
  const preserved = preserveImageBrushEssentialControls(current, styledSettings);
  if (current.glitchAmount === 'custom') {
    return { settings: preserved, rack: styledRack.map((item) => ({ ...item })) };
  }
  const leveled = applyImageBrushGlitchAmount(
    preserved,
    styledRack.map((item) => ({ ...item })),
    current.glitchAmount,
    styleId,
  );
  return {
    settings: {
      ...leveled.settings,
      effectVariation: current.effectVariation,
    },
    rack: leveled.rack,
  };
}

export function describeCurrentImageBrush(
  asset: ImageBrushAsset | null,
  settings: ImageBrushSettings,
): string[] {
  const name = asset?.fileName || asset?.name || 'the selected image';
  const spacing = spacingInPixels(settings, 1);
  const placement =
    settings.mode === 'sequence'
      ? 'Images cycle through the library in order.'
      : settings.mode === 'random-hose'
        ? 'Images are selected from the library by the current seed.'
        : settings.mode === 'scatter'
          ? 'Copies are scattered around the sampled stroke path.'
          : `A copy of “${name}” is placed every ${Math.round(spacing)} px.`;
  const rotation =
    settings.rotationMode === 'follow'
      ? 'Each copy follows the direction of the stroke.'
      : settings.rotationMode === 'perpendicular'
        ? 'Each copy turns across the direction of the stroke.'
        : settings.rotationMode === 'random'
          ? 'Each copy receives a deterministic random rotation.'
          : 'Copies use the selected fixed rotation pattern.';
  const mutation: Record<ImageBrushSettings['mutationMode'], string> = {
    clean: 'The original decoded image is reused without Stamp FX.',
    fixed: 'The image is corrupted once and the same result is reused.',
    progressive: 'Each copy uses a progressively stronger bounded corruption variant.',
    'per-stamp': `The brush cycles through ${Math.min(settings.variantCount, settings.maxCachedVariants)} corrupted variants.`,
    evolving: 'Each new copy continues mutating from the previous copy.',
    'random-stack': 'Each copy receives a newly generated seeded effect stack.',
    alternating: 'Copies switch between Recipe A and Recipe B.',
    'stroke-gradient': 'The effect interpolates from the start recipe to the end recipe.',
    'whole-trail': 'The complete stamp trail is processed as one connected local image.',
  };
  const stage: Record<ImageBrushSettings['fxStage'], string> = {
    before: 'Stamp FX is applied to the brush tip before placement.',
    each: 'Stamp FX is applied while individual copies are generated.',
    after: 'The complete local trail is created first and processed as one region.',
    'before-after': 'Stamp FX processes both the copies and the completed local trail.',
  };
  return [placement, rotation, mutation[settings.mutationMode], stage[settings.fxStage]];
}

export function simplePresetCards(presets: ImageBrushPreset[]): ImageBrushPreset[] {
  const ids = new Set<string>(imageBrushSimplePresetIds);
  return presets.filter((preset) => ids.has(preset.id));
}
