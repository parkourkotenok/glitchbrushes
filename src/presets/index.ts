import type { Preset } from '../types';
import { migratePreset } from '../glitchAlgorithms/migration';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '../brand/brand';

export const builtInPresets: Preset[] = [
  {
    id: 'vhs',
    name: 'VHS Damage',
    algorithm: 'scanline-tear-pro',
    brush: { strength: 0.68, size: 220, hardness: 0.24 },
    settings: {
      tearBandCount: 7,
      tearMinThickness: 2,
      tearMaxThickness: 10,
      tearShift: 74,
      tearColorSplit: 7,
    },
  },
  {
    id: 'broken-jpeg',
    name: 'Broken JPEG',
    algorithm: 'codec-block-damage',
    brush: { strength: 0.82, size: 180, hardness: 0.8 },
    settings: {
      codecBlockDamageMode: 'mixed-codec-failure',
      compressionTileSize: 16,
      compressionQuantization: 0.82,
      compressionReplication: 0.46,
      compressionScramble: 0.38,
    },
  },
  {
    id: 'rgb-split',
    name: 'RGB Split',
    algorithm: 'rgb-chunk-split',
    brush: { strength: 0.88, size: 150, hardness: 0.35 },
    settings: { rgbChunkOffset: 24, rgbRegionSize: 120, rgbChunkBlend: 1 },
  },
  {
    id: 'smear',
    name: 'Pixel Smear',
    algorithm: 'datamosh-smear',
    brush: { strength: 0.74, size: 130 },
    settings: { datamoshLength: 190, datamoshPersistence: 1, datamoshChroma: 12 },
  },
  {
    id: 'scanner',
    name: 'Scanner Error',
    algorithm: 'row-column-repeat',
    brush: { strength: 0.9, size: 260, hardness: 0.65 },
    settings: {
      repeatOrientation: 'horizontal',
      repeatLength: 4,
      repeatCount: 13,
      repeatJitter: 8,
    },
  },
  {
    id: 'memory',
    name: 'Corrupted Memory',
    algorithm: 'codec-block-damage',
    brush: { strength: 0.64, density: 0.76 },
    settings: {
      codecBlockDamageMode: 'tile-scramble',
      compressionTileSize: 16,
      tileGridSize: 20,
      tileShuffle: 0.78,
      tileRepeat: 0.32,
      spill: 'medium',
    },
  },
  {
    id: 'soft-decay',
    name: 'Soft Digital Decay',
    algorithm: 'palette-collapse',
    brush: { strength: 0.42, hardness: 0.12, opacity: 0.72 },
    settings: { paletteLevels: 10, dither: true },
  },
  {
    id: 'destruction',
    name: 'Aggressive Byte Destruction',
    algorithm: 'structural-mixed',
    brush: { strength: 1, density: 1, hardness: 0.82 },
    settings: {
      structuralMixCount: 5,
      structuralIntensity: 1.45,
      structuralDensity: 1,
      spill: 'strong',
    },
  },
  {
    id: 'sort-bright-drag',
    name: 'Bright Drag',
    algorithm: 'pixel-sort-brush',
    brush: { size: 190, strength: 0.88, hardness: 0.5 },
    settings: {
      sortBrushProperty: 'luminance',
      sortBrushThresholdLow: 145,
      sortBrushThresholdHigh: 255,
      sortBrushDirection: 'stroke',
      sortBrushLength: 280,
    },
  },
  {
    id: 'sort-shadow-comb',
    name: 'Shadow Comb',
    algorithm: 'pixel-sort-brush',
    brush: { size: 160, strength: 0.84 },
    settings: {
      sortBrushThresholdLow: 0,
      sortBrushThresholdHigh: 112,
      sortBrushReverse: true,
      sortBrushIntervalMin: 5,
    },
  },
  {
    id: 'sort-rainbow',
    name: 'Rainbow Sort',
    algorithm: 'pixel-sort-brush',
    brush: { size: 230, hardness: 0.35 },
    settings: {
      sortBrushProperty: 'hue',
      sortBrushDirection: 'perpendicular',
      sortBrushDisorder: 0.12,
    },
  },
  {
    id: 'sort-vertical-melt',
    name: 'Vertical Melt',
    algorithm: 'pixel-sort-brush',
    brush: { size: 210, strength: 0.92 },
    settings: { sortBrushDirection: 'vertical', sortBrushLength: 420, sortBrushSpill: 32 },
  },
  {
    id: 'sort-broken-scan',
    name: 'Broken Scan',
    algorithm: 'pixel-sort-brush',
    brush: { size: 280, hardness: 0.72 },
    settings: {
      sortBrushDirection: 'horizontal',
      sortBrushDisorder: 0.44,
      sortBrushIntervalMin: 3,
      sortBrushIntervalMax: 96,
    },
  },
  {
    id: 'feedback-ghost-trail',
    name: 'Ghost Trail',
    algorithm: 'feedback-brush',
    brush: { size: 180, strength: 0.78 },
    settings: {
      feedbackBrushEchoCount: 6,
      feedbackBrushOffsetX: 18,
      feedbackBrushOpacityDecay: 0.7,
      feedbackBrushBlendMode: 'screen',
    },
  },
  {
    id: 'feedback-memory-leak',
    name: 'Memory Leak',
    algorithm: 'feedback-brush',
    brush: { size: 210, strength: 0.92 },
    settings: {
      feedbackBrushEchoCount: 10,
      feedbackBrushScale: 1.02,
      feedbackBrushPersistence: 0.94,
    },
  },
  {
    id: 'feedback-falling-echo',
    name: 'Falling Echo',
    algorithm: 'feedback-brush',
    brush: { size: 170 },
    settings: { feedbackBrushOffsetX: 2, feedbackBrushOffsetY: 18, feedbackBrushEchoCount: 8 },
  },
  {
    id: 'feedback-difference-burn',
    name: 'Difference Burn',
    algorithm: 'feedback-brush',
    brush: { strength: 0.8, hardness: 0.68 },
    settings: {
      feedbackBrushBlendMode: 'difference',
      feedbackBrushEchoCount: 7,
      feedbackBrushRgbDelay: 9,
    },
  },
  {
    id: 'feedback-infinite-smear',
    name: 'Infinite Smear',
    algorithm: 'feedback-brush',
    brush: { size: 260, strength: 0.96 },
    settings: {
      feedbackBrushEchoCount: 14,
      feedbackBrushOpacityDecay: 0.88,
      feedbackBrushScale: 1.035,
      feedbackBrushRotation: 1.4,
    },
  },
  {
    id: 'displace-digital-ripple',
    name: 'Digital Ripple',
    algorithm: 'displacement-brush',
    brush: { size: 200, hardness: 0.28 },
    settings: {
      displacementBrushSource: 'waves',
      displacementBrushStrengthX: 34,
      displacementBrushStrengthY: 22,
      displacementBrushInterpolation: 'nearest',
    },
  },
  {
    id: 'displace-torn-signal',
    name: 'Torn Signal',
    algorithm: 'displacement-brush',
    brush: { size: 170, strength: 0.92 },
    settings: {
      displacementBrushSource: 'edges',
      displacementBrushStrengthX: 82,
      displacementBrushStrengthY: 12,
      displacementBrushIterations: 3,
    },
  },
  {
    id: 'displace-hard-vortex',
    name: 'Hard Vortex',
    algorithm: 'displacement-brush',
    brush: { size: 240, hardness: 0.75 },
    settings: {
      displacementBrushSource: 'vortex',
      displacementBrushStrengthX: 74,
      displacementBrushStrengthY: 74,
      displacementBrushInterpolation: 'nearest',
    },
  },
  {
    id: 'displace-liquid-pull',
    name: 'Liquid Pull',
    algorithm: 'displacement-brush',
    brush: { size: 280, hardness: 0.16 },
    settings: {
      displacementBrushSource: 'radial',
      displacementBrushInterpolation: 'bilinear',
      displacementBrushStrengthX: 48,
      displacementBrushStrengthY: 48,
    },
  },
  {
    id: 'displace-noise-tear',
    name: 'Noise Tear',
    algorithm: 'displacement-brush',
    brush: { size: 210, strength: 0.94 },
    settings: {
      displacementBrushSource: 'noise',
      displacementBrushOctaves: 4,
      displacementBrushRoughness: 0.72,
      displacementBrushStrengthX: 68,
    },
  },
  {
    id: 'displace-glass-failure',
    name: 'Glass Failure',
    algorithm: 'displacement-brush',
    brush: { size: 250, hardness: 0.42 },
    settings: {
      displacementBrushSource: 'luminance',
      displacementBrushInterpolation: 'bilinear',
      displacementBrushIterations: 4,
      displacementBrushSpill: 46,
    },
  },
  {
    id: 'flow-forward-melt',
    name: 'Forward Melt',
    algorithm: 'flow-mosh-brush',
    brush: { size: 190, strength: 0.9 },
    settings: { flowBrushPropagation: 190, flowBrushDirectionInfluence: 1, flowBrushIterations: 6 },
  },
  {
    id: 'flow-sideways-prediction',
    name: 'Sideways Prediction',
    algorithm: 'flow-mosh-brush',
    brush: { size: 220, hardness: 0.55 },
    settings: { flowBrushFallbackAngle: 90, flowBrushBlockSize: 18, flowBrushPropagation: 230 },
  },
  {
    id: 'flow-block-current',
    name: 'Block Current',
    algorithm: 'flow-mosh-brush',
    brush: { size: 260, strength: 0.92 },
    settings: { flowBrushBlockSize: 28, flowBrushPropagation: 160, flowBrushOverwrite: true },
  },
  {
    id: 'flow-chroma-wake',
    name: 'Chroma Wake',
    algorithm: 'flow-mosh-brush',
    brush: { size: 180 },
    settings: { flowBrushChromaLag: 22, flowBrushTrailWidth: 82, flowBrushDecay: 0.14 },
  },
  {
    id: 'flow-broken-motion',
    name: 'Broken Motion',
    algorithm: 'flow-mosh-brush',
    brush: { size: 300, hardness: 0.8, strength: 1 },
    settings: {
      flowBrushJitter: 0.72,
      flowBrushBlockSize: 9,
      flowBrushIterations: 11,
      flowBrushPropagation: 340,
    },
  },
  {
    id: 'clone-dirty',
    name: 'Dirty Clone',
    algorithm: 'clone-corruption-brush',
    brush: { size: 180, strength: 0.84 },
    settings: {
      cloneBrushMode: 'packet',
      cloneBrushTileFragmentation: 0.26,
      cloneBrushBlend: 0.9,
      cloneBrushChannelSplit: 3,
    },
  },
  {
    id: 'clone-fragment-copy',
    name: 'Fragment Copy',
    algorithm: 'clone-corruption-brush',
    brush: { size: 220, hardness: 0.66 },
    settings: {
      cloneBrushMode: 'fragment',
      cloneBrushTileFragmentation: 0.68,
      cloneBrushBlockSize: 12,
      cloneBrushRepetition: 4,
    },
  },
  {
    id: 'clone-rgb',
    name: 'RGB Clone',
    algorithm: 'clone-corruption-brush',
    brush: { size: 190 },
    settings: {
      cloneBrushMode: 'rgb',
      cloneBrushChannelSplit: 18,
      cloneBrushScaleJitter: 0.12,
      cloneBrushRotationJitter: 3,
    },
  },
  {
    id: 'clone-repeated-memory',
    name: 'Repeated Memory',
    algorithm: 'clone-corruption-brush',
    brush: { size: 260, strength: 0.9 },
    settings: {
      cloneBrushMode: 'evolving',
      cloneBrushRepetition: 7,
      cloneBrushDecay: 0.62,
      cloneBrushAlignment: 'aligned',
    },
  },
  {
    id: 'clone-broken-stamp',
    name: 'Broken Stamp',
    algorithm: 'clone-corruption-brush',
    brush: { size: 230, hardness: 0.75 },
    settings: {
      cloneBrushMode: 'slice',
      cloneBrushRotationJitter: 28,
      cloneBrushScaleJitter: 0.55,
      cloneBrushTileFragmentation: 0.52,
    },
  },
  {
    id: 'line-buffer-stall',
    name: 'Buffer Stall',
    algorithm: 'line-freeze-brush',
    brush: { size: 220, strength: 0.9 },
    settings: { lineBrushOrientation: 'stroke', lineBrushRepeatCount: 10, lineBrushStretch: 2.4 },
  },
  {
    id: 'line-frozen-rows',
    name: 'Frozen Rows',
    algorithm: 'line-freeze-brush',
    brush: { size: 210, hardness: 0.7 },
    settings: {
      lineBrushOrientation: 'horizontal',
      lineBrushSource: 'center',
      lineBrushThickness: 5,
    },
  },
  {
    id: 'line-vertical-lock',
    name: 'Vertical Lock',
    algorithm: 'line-freeze-brush',
    brush: { size: 180, strength: 0.88 },
    settings: { lineBrushOrientation: 'vertical', lineBrushRepeatCount: 12, lineBrushJitter: 2 },
  },
  {
    id: 'line-broadcast-tear',
    name: 'Broadcast Tear',
    algorithm: 'line-freeze-brush',
    brush: { size: 280, hardness: 0.46 },
    settings: {
      lineBrushOrientation: 'horizontal',
      lineBrushRgbSplit: 14,
      lineBrushDropout: 0.22,
      lineBrushSpill: 54,
    },
  },
  {
    id: 'line-repeated-scan',
    name: 'Repeated Scan',
    algorithm: 'line-freeze-brush',
    brush: { size: 250, strength: 0.94 },
    settings: {
      lineBrushRepeatCount: 18,
      lineBrushThickness: 2,
      lineBrushStretch: 4.2,
      lineBrushJitter: 7,
    },
  },
];

export const CUSTOM_PRESETS_STORAGE_KEY = STORAGE_KEYS.presets;
export const LEGACY_CUSTOM_PRESETS_STORAGE_KEY = LEGACY_STORAGE_KEYS.presets;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadCustomPresets(
  storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): Preset[] {
  if (!storage) return [];
  try {
    const source =
      storage.getItem(CUSTOM_PRESETS_STORAGE_KEY) ??
      storage.getItem(LEGACY_CUSTOM_PRESETS_STORAGE_KEY) ??
      '[]';
    const parsed = JSON.parse(source) as Preset[];
    const presets = parsed
      .filter((preset) => preset.custom && preset.id && preset.name)
      .map(migratePreset);
    storage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    return presets;
  } catch {
    return [];
  }
}

export function saveCustomPresets(
  presets: Preset[],
  storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): void {
  if (!storage) return;
  storage.setItem(
    CUSTOM_PRESETS_STORAGE_KEY,
    JSON.stringify(presets.filter((preset) => preset.custom)),
  );
}
