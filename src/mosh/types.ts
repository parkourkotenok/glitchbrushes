import type { EffectIconId, Point, Rectangle } from '../types';

export type MoshEffectId =
  | 'pixel-sort'
  | 'feedback'
  | 'motion-field'
  | 'motion-transfer'
  | 'chroma-drift'
  | 'dct-damage'
  | 'edge-melt'
  | 'flow-field';

export type MoshTarget = 'whole' | 'brush' | 'selection' | 'luminance' | 'edge';

export interface MoshEffectSettings {
  maskLower: number;
  maskUpper: number;
  pixelDirection: 'horizontal' | 'vertical' | 'diagonal-forward' | 'diagonal-backward' | 'radial';
  sortProperty: 'luminance' | 'hue' | 'saturation' | 'red' | 'green' | 'blue' | 'rgb-sum';
  intervalMode: 'threshold' | 'random' | 'edges' | 'waves' | 'full-row';
  lowerThreshold: number;
  upperThreshold: number;
  reverse: boolean;
  intervalMin: number;
  intervalMax: number;
  disorder: number;
  preserveAlpha: boolean;
  feedbackIterations: number;
  translateX: number;
  translateY: number;
  feedbackScale: number;
  feedbackRotation: number;
  opacityDecay: number;
  brightnessDecay: number;
  saturationDecay: number;
  feedbackBlendMode: 'normal' | 'screen' | 'multiply' | 'difference' | 'lighten' | 'darken';
  feedbackChannelOffset: number;
  feedbackEdge: 'clamp' | 'wrap' | 'mirror';
  feedbackReset: number;
  motionFieldSource:
    'brush-direction' | 'radial' | 'vortex' | 'directional' | 'noise-flow' | 'image-edges';
  motionBlockSize: number;
  propagationLength: number;
  motionIterations: number;
  vectorStrength: number;
  vectorJitter: number;
  motionPersistence: number;
  motionDecay: number;
  motionOverwrite: boolean;
  motionLumaLock: number;
  motionChromaDrift: number;
  motionSpill: number;
  transferMode: 'copy-motion' | 'copy-texture' | 'copy-luma' | 'copy-chroma' | 'swap';
  transferDirection: number;
  transferRepetitions: number;
  transferScale: number;
  transferRotation: number;
  transferDecay: number;
  transferBlend: number;
  lumaOffset: number;
  chromaX: number;
  chromaY: number;
  chromaBlur: number;
  chromaBlockSize: number;
  chromaSubsampling: number;
  colorBleed: number;
  lumaHold: number;
  channelDelay: number;
  chromaEdgeSoftness: number;
  dctBlockSize: 8 | 16;
  dctQuantization: number;
  highFrequencyRemoval: number;
  lowFrequencyBoost: number;
  coefficientDropout: number;
  ringingStrength: number;
  blockBoundaryStrength: number;
  chromaQuality: number;
  randomBlockReplacement: number;
  neighborInheritance: number;
  edgeThreshold: number;
  edgeSensitivity: number;
  edgeDirection: 'away' | 'toward' | 'tangent' | 'down' | 'up';
  meltLength: number;
  meltSpread: number;
  meltBlur: number;
  colorCarry: number;
  preserveStrongEdges: boolean;
  invertEdgeMask: boolean;
  flowType:
    | 'curl-noise'
    | 'waves'
    | 'vortex'
    | 'radial-explosion'
    | 'radial-implosion'
    | 'turbulence'
    | 'image-luminance';
  flowScale: number;
  flowStrength: number;
  flowOctaves: number;
  flowPersistence: number;
  flowIterations: number;
  flowDirection: number;
  flowWrapping: boolean;
  flowInterpolation: 'nearest' | 'bilinear';
}

export interface MoshEffectCard {
  instanceId: string;
  effectId: MoshEffectId;
  enabled: boolean;
  mix: number;
  expanded: boolean;
  target: MoshTarget;
  settings: MoshEffectSettings;
  sourceRegion: Rectangle | null;
  destinationRegion: Rectangle | null;
  activePresetId: string;
}

export interface MoshEffectDefinition {
  id: MoshEffectId;
  name: string;
  description: string;
  icon: EffectIconId;
  passes(settings: MoshEffectSettings): number;
  targets: readonly MoshTarget[];
}

export interface MoshProcessRequest {
  jobId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  rack: MoshEffectCard[];
  seed: string;
  selectionMask?: ArrayBuffer;
  brushMask?: ArrayBuffer;
  brushMaskBounds?: Rectangle;
  brushDirection?: Point;
}

export interface MoshProgress {
  jobId: string;
  effectId: MoshEffectId;
  effectName: string;
  effectIndex: number;
  effectCount: number;
  pass: number;
  passes: number;
  percent: number;
}

export interface MoshProcessResult {
  jobId: string;
  pixels: Uint8ClampedArray;
  affectedPixels: number;
  completedEffects: number;
}

export const defaultMoshSettings: MoshEffectSettings = {
  maskLower: 72,
  maskUpper: 235,
  pixelDirection: 'horizontal',
  sortProperty: 'luminance',
  intervalMode: 'threshold',
  lowerThreshold: 74,
  upperThreshold: 232,
  reverse: false,
  intervalMin: 18,
  intervalMax: 420,
  disorder: 0.08,
  preserveAlpha: true,
  feedbackIterations: 5,
  translateX: 18,
  translateY: 7,
  feedbackScale: 1.012,
  feedbackRotation: 0.5,
  opacityDecay: 0.72,
  brightnessDecay: 0.99,
  saturationDecay: 0.98,
  feedbackBlendMode: 'normal',
  feedbackChannelOffset: 3,
  feedbackEdge: 'clamp',
  feedbackReset: 0,
  motionFieldSource: 'directional',
  motionBlockSize: 16,
  propagationLength: 110,
  motionIterations: 5,
  vectorStrength: 1,
  vectorJitter: 0.28,
  motionPersistence: 0.86,
  motionDecay: 0.22,
  motionOverwrite: false,
  motionLumaLock: 0.2,
  motionChromaDrift: 7,
  motionSpill: 0.25,
  transferMode: 'copy-texture',
  transferDirection: 0,
  transferRepetitions: 3,
  transferScale: 1,
  transferRotation: 0,
  transferDecay: 0.72,
  transferBlend: 0.88,
  lumaOffset: 0,
  chromaX: 14,
  chromaY: 3,
  chromaBlur: 3,
  chromaBlockSize: 8,
  chromaSubsampling: 0.55,
  colorBleed: 0.72,
  lumaHold: 0.86,
  channelDelay: 5,
  chromaEdgeSoftness: 2,
  dctBlockSize: 8,
  dctQuantization: 0.62,
  highFrequencyRemoval: 0.66,
  lowFrequencyBoost: 0.18,
  coefficientDropout: 0.22,
  ringingStrength: 0.34,
  blockBoundaryStrength: 0.28,
  chromaQuality: 0.48,
  randomBlockReplacement: 0.12,
  neighborInheritance: 0.2,
  edgeThreshold: 54,
  edgeSensitivity: 1.15,
  edgeDirection: 'down',
  meltLength: 72,
  meltSpread: 10,
  meltBlur: 0.2,
  colorCarry: 0.88,
  preserveStrongEdges: true,
  invertEdgeMask: false,
  flowType: 'curl-noise',
  flowScale: 72,
  flowStrength: 22,
  flowOctaves: 3,
  flowPersistence: 0.58,
  flowIterations: 3,
  flowDirection: 0,
  flowWrapping: false,
  flowInterpolation: 'bilinear',
};

export const moshEffectDefinitions: MoshEffectDefinition[] = [
  {
    id: 'pixel-sort',
    name: 'Pixel Sorter',
    description: 'Coherent interval sorting and long signal streaks.',
    icon: 'pixel-sort',
    passes: () => 1,
    targets: ['whole', 'brush', 'selection', 'luminance', 'edge'],
  },
  {
    id: 'feedback',
    name: 'Feedback Echo',
    description: 'Iterative frame memory, ghosts and nested trails.',
    icon: 'feedback',
    passes: (settings) => settings.feedbackIterations,
    targets: ['whole', 'brush', 'selection', 'luminance', 'edge'],
  },
  {
    id: 'motion-field',
    name: 'Motion Field Mosh',
    description: 'Pseudo-datamosh block propagation through a vector field.',
    icon: 'motion-field',
    passes: (settings) => settings.motionIterations,
    targets: ['whole', 'brush', 'selection', 'luminance', 'edge'],
  },
  {
    id: 'motion-transfer',
    name: 'Motion Transfer',
    description: 'Transfer texture, luma or chroma between marked regions.',
    icon: 'motion-transfer',
    passes: (settings) => settings.transferRepetitions,
    targets: ['whole', 'brush', 'selection'],
  },
  {
    id: 'chroma-drift',
    name: 'Luma / Chroma Drift',
    description: 'Sharp luma with delayed low-bandwidth color.',
    icon: 'chroma-drift',
    passes: () => 1,
    targets: ['whole', 'brush', 'selection', 'luminance', 'edge'],
  },
  {
    id: 'dct-damage',
    name: 'DCT Block Damage',
    description: 'Decoded-image simulation of coefficient and block damage.',
    icon: 'dct-damage',
    passes: () => 1,
    targets: ['whole', 'brush', 'selection', 'luminance', 'edge'],
  },
  {
    id: 'edge-melt',
    name: 'Edge Melt',
    description: 'Carry silhouettes and boundaries into coherent streaks.',
    icon: 'edge-melt',
    passes: () => 1,
    targets: ['whole', 'brush', 'selection', 'luminance', 'edge'],
  },
  {
    id: 'flow-field',
    name: 'Flow Field Displace',
    description: 'Iterative displacement through generated vector fields.',
    icon: 'flow-field',
    passes: (settings) => settings.flowIterations,
    targets: ['whole', 'brush', 'selection', 'luminance', 'edge'],
  },
];

export function createMoshCard(effectId: MoshEffectId, expanded = true): MoshEffectCard {
  return {
    instanceId: `${effectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    effectId,
    enabled: true,
    mix: 1,
    expanded,
    target: 'whole',
    settings: { ...defaultMoshSettings },
    sourceRegion: null,
    destinationRegion: null,
    activePresetId: 'custom',
  };
}

export interface MoshPreset {
  name: string;
  effectId: MoshEffectId;
  settings: Partial<MoshEffectSettings>;
}

export const moshPresetParameterKeys: Record<MoshEffectId, Array<keyof MoshEffectSettings>> = {
  'pixel-sort': [
    'pixelDirection',
    'sortProperty',
    'intervalMode',
    'lowerThreshold',
    'upperThreshold',
    'reverse',
    'intervalMin',
    'intervalMax',
    'disorder',
    'preserveAlpha',
  ],
  feedback: [
    'feedbackIterations',
    'translateX',
    'translateY',
    'feedbackScale',
    'feedbackRotation',
    'opacityDecay',
    'brightnessDecay',
    'saturationDecay',
    'feedbackBlendMode',
    'feedbackChannelOffset',
    'feedbackEdge',
    'feedbackReset',
  ],
  'motion-field': [
    'motionFieldSource',
    'motionBlockSize',
    'propagationLength',
    'motionIterations',
    'vectorStrength',
    'vectorJitter',
    'motionPersistence',
    'motionDecay',
    'motionOverwrite',
    'motionLumaLock',
    'motionChromaDrift',
    'motionSpill',
  ],
  'motion-transfer': [
    'transferMode',
    'transferDirection',
    'transferRepetitions',
    'transferScale',
    'transferRotation',
    'transferDecay',
    'transferBlend',
  ],
  'chroma-drift': [
    'lumaOffset',
    'chromaX',
    'chromaY',
    'chromaBlur',
    'chromaBlockSize',
    'chromaSubsampling',
    'colorBleed',
    'lumaHold',
    'channelDelay',
    'chromaEdgeSoftness',
  ],
  'dct-damage': [
    'dctBlockSize',
    'dctQuantization',
    'highFrequencyRemoval',
    'lowFrequencyBoost',
    'coefficientDropout',
    'ringingStrength',
    'blockBoundaryStrength',
    'chromaQuality',
    'randomBlockReplacement',
    'neighborInheritance',
  ],
  'edge-melt': [
    'edgeThreshold',
    'edgeSensitivity',
    'edgeDirection',
    'meltLength',
    'meltSpread',
    'meltBlur',
    'colorCarry',
    'preserveStrongEdges',
    'invertEdgeMask',
  ],
  'flow-field': [
    'flowType',
    'flowScale',
    'flowStrength',
    'flowOctaves',
    'flowPersistence',
    'flowIterations',
    'flowDirection',
    'flowWrapping',
    'flowInterpolation',
  ],
};

function completePreset(preset: MoshPreset): MoshPreset {
  const settings: Partial<MoshEffectSettings> = {};
  for (const key of moshPresetParameterKeys[preset.effectId]) {
    (settings as Record<keyof MoshEffectSettings, MoshEffectSettings[keyof MoshEffectSettings]>)[
      key
    ] = defaultMoshSettings[key];
  }
  return { ...preset, settings: { ...settings, ...preset.settings } };
}

const rawMoshPresets: MoshPreset[] = [
  {
    name: 'Bright Melt',
    effectId: 'pixel-sort',
    settings: {
      intervalMode: 'threshold',
      lowerThreshold: 142,
      upperThreshold: 255,
      pixelDirection: 'horizontal',
    },
  },
  {
    name: 'Shadow Drag',
    effectId: 'pixel-sort',
    settings: { lowerThreshold: 0, upperThreshold: 112, reverse: true },
  },
  {
    name: 'Hue Rivers',
    effectId: 'pixel-sort',
    settings: { sortProperty: 'hue', pixelDirection: 'diagonal-forward', intervalMode: 'waves' },
  },
  {
    name: 'Vertical Bleed',
    effectId: 'pixel-sort',
    settings: { pixelDirection: 'vertical', intervalMax: 680 },
  },
  {
    name: 'Edge Sort',
    effectId: 'pixel-sort',
    settings: { intervalMode: 'edges', lowerThreshold: 22 },
  },
  {
    name: 'Full Destruction',
    effectId: 'pixel-sort',
    settings: { intervalMode: 'full-row', disorder: 0.25, reverse: true },
  },
  {
    name: 'Memory Leak',
    effectId: 'feedback',
    settings: { feedbackIterations: 8, translateX: 13, translateY: 5, feedbackBlendMode: 'screen' },
  },
  {
    name: 'Infinite Hall',
    effectId: 'feedback',
    settings: { feedbackIterations: 12, feedbackScale: 1.025, feedbackRotation: 0.8 },
  },
  {
    name: 'Signal Echo',
    effectId: 'feedback',
    settings: { feedbackIterations: 5, translateX: 26, feedbackBlendMode: 'lighten' },
  },
  {
    name: 'Falling Frame',
    effectId: 'feedback',
    settings: { feedbackIterations: 8, translateX: 2, translateY: 18 },
  },
  {
    name: 'Difference Ghost',
    effectId: 'feedback',
    settings: { feedbackBlendMode: 'difference', feedbackIterations: 6 },
  },
  {
    name: 'Soft Decay',
    effectId: 'feedback',
    settings: { opacityDecay: 0.68, feedbackScale: 1.006, saturationDecay: 0.86 },
  },
  {
    name: 'Forward Mosh',
    effectId: 'motion-field',
    settings: { motionFieldSource: 'directional', propagationLength: 150 },
  },
  {
    name: 'Vortex Mosh',
    effectId: 'motion-field',
    settings: { motionFieldSource: 'vortex', motionIterations: 7 },
  },
  {
    name: 'Liquid Motion',
    effectId: 'motion-field',
    settings: { motionFieldSource: 'noise-flow', motionBlockSize: 8, motionIterations: 8 },
  },
  {
    name: 'Broken Prediction',
    effectId: 'motion-field',
    settings: { motionOverwrite: true, vectorJitter: 0.72 },
  },
  {
    name: 'Directional Melt',
    effectId: 'motion-field',
    settings: { motionFieldSource: 'directional', propagationLength: 240, motionPersistence: 1 },
  },
  {
    name: 'Chaotic Flow',
    effectId: 'motion-field',
    settings: { motionFieldSource: 'noise-flow', vectorJitter: 1, motionIterations: 10 },
  },
  {
    name: 'Texture Repeat',
    effectId: 'motion-transfer',
    settings: { transferMode: 'copy-texture', transferRepetitions: 4, transferDecay: 0.82 },
  },
  {
    name: 'Luma Theft',
    effectId: 'motion-transfer',
    settings: { transferMode: 'copy-luma', transferBlend: 0.92, transferRepetitions: 2 },
  },
  {
    name: 'Chroma Theft',
    effectId: 'motion-transfer',
    settings: { transferMode: 'copy-chroma', transferBlend: 1, transferRepetitions: 3 },
  },
  {
    name: 'Recursive Stamp',
    effectId: 'motion-transfer',
    settings: {
      transferMode: 'copy-motion',
      transferScale: 1.08,
      transferRotation: 3.5,
      transferRepetitions: 7,
    },
  },
  {
    name: 'Region Swap',
    effectId: 'motion-transfer',
    settings: { transferMode: 'swap', transferRepetitions: 1, transferBlend: 1 },
  },
  {
    name: 'Fading Clone',
    effectId: 'motion-transfer',
    settings: {
      transferMode: 'copy-texture',
      transferDirection: 18,
      transferRepetitions: 6,
      transferDecay: 0.55,
    },
  },
  {
    name: 'VHS Color Bleed',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 0.72,
      chromaX: 20,
      chromaY: 1,
      chromaBlur: 6,
      chromaBlockSize: 4,
      chromaSubsampling: 0.42,
      colorBleed: 0.92,
      channelDelay: 5,
    },
  },
  {
    name: 'Frozen Luma',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 1,
      lumaOffset: 0,
      chromaX: 4,
      chromaY: 0,
      chromaBlur: 1,
      chromaBlockSize: 8,
      chromaSubsampling: 0.7,
      colorBleed: 0.48,
      channelDelay: 0,
    },
  },
  {
    name: 'Chroma Delay',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 0.88,
      chromaX: 8,
      chromaY: 0,
      chromaBlur: 2,
      chromaBlockSize: 2,
      chromaSubsampling: 0.25,
      colorBleed: 0.64,
      channelDelay: 30,
    },
  },
  {
    name: 'Low-Bandwidth Color',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 0.96,
      chromaX: 2,
      chromaY: 2,
      chromaBlur: 4,
      chromaBlockSize: 24,
      chromaSubsampling: 0.96,
      colorBleed: 0.72,
      channelDelay: 2,
    },
  },
  {
    name: 'Analog Misalignment',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 0.76,
      lumaOffset: -5,
      chromaX: 13,
      chromaY: -6,
      chromaBlur: 1,
      chromaBlockSize: 3,
      chromaSubsampling: 0.34,
      colorBleed: 0.68,
      channelDelay: 9,
      chromaEdgeSoftness: 5,
    },
  },
  {
    name: 'Dirty Broadcast',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 0.5,
      lumaOffset: 3,
      chromaX: 28,
      chromaY: 10,
      chromaBlur: 9,
      chromaBlockSize: 12,
      chromaSubsampling: 0.82,
      colorBleed: 1,
      channelDelay: 17,
    },
  },
  {
    name: 'Color Ghost',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 0.82,
      chromaX: 42,
      chromaY: -3,
      chromaBlur: 3,
      chromaBlockSize: 5,
      chromaSubsampling: 0.38,
      colorBleed: 0.78,
      channelDelay: 22,
    },
  },
  {
    name: 'Crushed Chroma',
    effectId: 'chroma-drift',
    settings: {
      lumaHold: 0.98,
      chromaX: 0,
      chromaY: 0,
      chromaBlur: 8,
      chromaBlockSize: 32,
      chromaSubsampling: 1,
      colorBleed: 0.35,
      channelDelay: 0,
    },
  },
  {
    name: 'JPEG Collapse',
    effectId: 'dct-damage',
    settings: { dctQuantization: 0.86, highFrequencyRemoval: 0.86 },
  },
  {
    name: 'Coefficient Loss',
    effectId: 'dct-damage',
    settings: { coefficientDropout: 0.62, randomBlockReplacement: 0.2 },
  },
  {
    name: 'Block Ringing',
    effectId: 'dct-damage',
    settings: { ringingStrength: 0.85, blockBoundaryStrength: 0.56 },
  },
  {
    name: 'Thumbnail Hell',
    effectId: 'dct-damage',
    settings: { dctBlockSize: 16, highFrequencyRemoval: 0.96, chromaQuality: 0.2 },
  },
  {
    name: 'Recompressed 50 Times',
    effectId: 'dct-damage',
    settings: { dctQuantization: 0.96, blockBoundaryStrength: 0.8, chromaQuality: 0.1 },
  },
  {
    name: 'Broken Preview Cache',
    effectId: 'dct-damage',
    settings: {
      dctBlockSize: 16,
      coefficientDropout: 0.48,
      randomBlockReplacement: 0.38,
      neighborInheritance: 0.62,
    },
  },
  {
    name: 'Downward Melt',
    effectId: 'edge-melt',
    settings: {
      edgeDirection: 'down',
      edgeThreshold: 42,
      edgeSensitivity: 1.35,
      meltLength: 180,
      meltSpread: 7,
      meltBlur: 0.15,
      colorCarry: 0.94,
      preserveStrongEdges: true,
      invertEdgeMask: false,
    },
  },
  {
    name: 'Tangent Drag',
    effectId: 'edge-melt',
    settings: {
      edgeDirection: 'tangent',
      edgeThreshold: 48,
      edgeSensitivity: 1.2,
      meltLength: 126,
      meltSpread: 12,
      meltBlur: 0.08,
      colorCarry: 0.9,
      preserveStrongEdges: true,
      invertEdgeMask: false,
    },
  },
  {
    name: 'Edge Trails',
    effectId: 'edge-melt',
    settings: {
      edgeDirection: 'away',
      edgeThreshold: 58,
      edgeSensitivity: 1.5,
      meltLength: 210,
      meltSpread: 5,
      meltBlur: 0.25,
      colorCarry: 0.78,
      preserveStrongEdges: true,
      invertEdgeMask: false,
    },
  },
  {
    name: 'Text Bleed',
    effectId: 'edge-melt',
    settings: {
      edgeDirection: 'down',
      edgeThreshold: 24,
      edgeSensitivity: 1.8,
      meltLength: 72,
      meltSpread: 2,
      meltBlur: 0.05,
      colorCarry: 1,
      preserveStrongEdges: true,
      invertEdgeMask: false,
    },
  },
  {
    name: 'Outline Collapse',
    effectId: 'edge-melt',
    settings: {
      edgeDirection: 'toward',
      edgeThreshold: 36,
      edgeSensitivity: 1.6,
      meltLength: 96,
      meltSpread: 18,
      meltBlur: 0.3,
      colorCarry: 0.88,
      preserveStrongEdges: false,
      invertEdgeMask: false,
    },
  },
  {
    name: 'Liquid Data',
    effectId: 'flow-field',
    settings: {
      flowType: 'curl-noise',
      flowInterpolation: 'bilinear',
      flowScale: 92,
      flowStrength: 31,
      flowIterations: 4,
      flowOctaves: 3,
      flowPersistence: 0.64,
      flowDirection: 0,
      flowWrapping: false,
    },
  },
  {
    name: 'Directional Current',
    effectId: 'flow-field',
    settings: {
      flowType: 'image-luminance',
      flowInterpolation: 'bilinear',
      flowScale: 140,
      flowStrength: 34,
      flowIterations: 3,
      flowOctaves: 2,
      flowPersistence: 0.5,
      flowDirection: 28,
      flowWrapping: false,
    },
  },
  {
    name: 'Digital Vortex',
    effectId: 'flow-field',
    settings: {
      flowType: 'vortex',
      flowInterpolation: 'nearest',
      flowScale: 70,
      flowStrength: 58,
      flowIterations: 4,
      flowOctaves: 2,
      flowPersistence: 0.58,
      flowDirection: -12,
      flowWrapping: true,
    },
  },
  {
    name: 'Magnetic Pull',
    effectId: 'flow-field',
    settings: {
      flowType: 'radial-implosion',
      flowInterpolation: 'bilinear',
      flowScale: 100,
      flowStrength: 48,
      flowIterations: 5,
      flowOctaves: 2,
      flowPersistence: 0.78,
      flowDirection: 0,
      flowWrapping: false,
    },
  },
  {
    name: 'Wave Fold',
    effectId: 'flow-field',
    settings: {
      flowType: 'waves',
      flowInterpolation: 'bilinear',
      flowScale: 44,
      flowStrength: 40,
      flowIterations: 4,
      flowOctaves: 2,
      flowPersistence: 0.5,
      flowDirection: 52,
      flowWrapping: true,
    },
  },
  {
    name: 'Turbulence',
    effectId: 'flow-field',
    settings: {
      flowType: 'turbulence',
      flowInterpolation: 'bilinear',
      flowScale: 36,
      flowStrength: 46,
      flowIterations: 6,
      flowOctaves: 5,
      flowPersistence: 0.72,
      flowDirection: -35,
      flowWrapping: true,
    },
  },
  {
    name: 'Signal River',
    effectId: 'flow-field',
    settings: {
      flowType: 'image-luminance',
      flowInterpolation: 'bilinear',
      flowScale: 210,
      flowStrength: 62,
      flowIterations: 7,
      flowOctaves: 1,
      flowPersistence: 0.4,
      flowDirection: 90,
      flowWrapping: false,
    },
  },
  {
    name: 'Hard Nearest Flow',
    effectId: 'flow-field',
    settings: {
      flowType: 'curl-noise',
      flowInterpolation: 'nearest',
      flowScale: 18,
      flowStrength: 78,
      flowIterations: 3,
      flowOctaves: 4,
      flowPersistence: 0.84,
      flowDirection: 0,
      flowWrapping: false,
    },
  },
];

export const moshPresets: MoshPreset[] = rawMoshPresets.map(completePreset);
