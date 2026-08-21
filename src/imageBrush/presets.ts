import { createSeededRandom } from '../utils/prng';
import { normalizeImageBrushSettings } from './performance';
import {
  defaultImageBrushSettings,
  type ImageBrushFxId,
  type ImageBrushFxItem,
  type ImageBrushPreset,
  type ImageBrushSettings,
} from './types';
import {
  effectiveImageBrushStages,
  imageBrushFxDefinitions,
  supportsImageBrushStages,
} from '../effects/sharedRegistry';

function fx(effectId: ImageBrushFxId, amount: number, mix = 1, suffix = ''): ImageBrushFxItem {
  return { id: `preset-${effectId}${suffix}`, effectId, enabled: true, amount, mix };
}

function preset(
  id: string,
  name: string,
  settings: Partial<ImageBrushSettings>,
  rack: ImageBrushFxItem[],
  presentation: Pick<ImageBrushPreset, 'category' | 'catalog' | 'badge'> = {},
): ImageBrushPreset {
  return {
    id,
    name,
    ...presentation,
    settings: {
      ...defaultImageBrushSettings,
      ...settings,
      customAnchor: settings.customAnchor
        ? { ...settings.customAnchor }
        : { ...defaultImageBrushSettings.customAnchor },
    },
    rack,
  };
}

function embroideryFx(amount: number, suffix = ''): ImageBrushFxItem {
  return {
    ...fx('pixel-embroidery', amount, 1, suffix),
    embroideryGridSize: 7,
    embroideryStitchType: 'cross-stitch',
    embroideryPaletteLevels: 8,
    embroideryThreadAngle: 0,
    embroideryMissingStitches: 0.05,
    embroideryThreadJitter: 0.08,
    embroideryBackgroundTransparency: 1,
  };
}

function xeroxFx(amount: number, suffix = ''): ImageBrushFxItem {
  return {
    ...fx('xerox-decay', amount, 1, suffix),
    xeroxThreshold: 0.54,
    xeroxTonerLoss: 0.24,
    xeroxSpeckle: 0.18,
    xeroxEdgeErosion: 0.16,
    xeroxBanding: 0.1,
    xeroxBlackCrush: 0.32,
    xeroxColorMode: 'mono',
  };
}

export const builtInImageBrushPresets: ImageBrushPreset[] = [
  preset(
    'clean-repeat',
    'Clean Repeat',
    {
      glitchAmount: 'clean',
      mode: 'trail',
      spacing: 78,
      rotationMode: 'follow',
      mutationMode: 'clean',
      alphaMode: 'preserve',
      renderingQuality: 'high',
    },
    [],
  ),
  preset(
    'glitched-repeat',
    'Glitched Repeat',
    {
      glitchAmount: 'broken',
      mode: 'trail',
      spacing: 70,
      mutationMode: 'fixed',
      fxStage: 'before',
      effectVariation: 0,
      renderingQuality: 'balanced',
    },
    [fx('slice', 0.92), fx('block-corruption', 0.62), fx('rgb-split', 0.68)],
  ),
  preset(
    'progressive-decay',
    'Progressive Decay',
    {
      glitchAmount: 'broken',
      mode: 'trail',
      spacing: 66,
      mutationMode: 'progressive',
      fxStage: 'each',
      progressiveStart: 0.04,
      progressiveEnd: 0.96,
      evolutionCurve: 'exponential',
      evolutionSpeed: 0.72,
      maxCorruption: 1,
      variantCount: 12,
      effectVariation: 0.34,
      renderingQuality: 'balanced',
    },
    [fx('slice', 0.42), fx('block-corruption', 0.68)],
  ),
  preset(
    'random-glitch-chain',
    'Random Glitch Chain',
    {
      glitchAmount: 'strong',
      mode: 'trail',
      spacing: 62,
      mutationMode: 'per-stamp',
      fxStage: 'each',
      minimumEffects: 1,
      maximumEffects: 4,
      variantCount: 10,
      effectVariation: 0.86,
      allowRepeatedCombinations: false,
      renderingQuality: 'balanced',
    },
    [fx('slice', 0.62), fx('block-corruption', 0.55), fx('rgb-split', 0.66), fx('scanline', 0.52)],
  ),
  preset(
    'datamosh-trail',
    'Datamosh Trail',
    {
      glitchAmount: 'strong',
      mode: 'trail',
      spacing: 28,
      mutationMode: 'evolving',
      fxStage: 'each',
      evolutionSpeed: 0.44,
      accumulation: 0.72,
      recovery: 0.18,
      maxCorruption: 0.9,
      structuralDrift: 0.48,
      alphaMode: 'preserve',
      alphaStability: 1,
      renderingQuality: 'balanced',
    },
    [fx('datamosh', 0.76), fx('motion-field', 0.38), fx('rgb-split', 0.32)],
  ),
  preset(
    'rgb-separation-trail',
    'RGB Separation Trail',
    {
      glitchAmount: 'extreme',
      mode: 'trail',
      spacing: 58,
      mutationMode: 'random-stack',
      fxStage: 'each',
      effectPool: ['rgb-split', 'chroma-drift', 'scanline'],
      stackMinimumEffects: 2,
      stackMaximumEffects: 3,
      stackMinimumStrength: 0.68,
      stackMaximumStrength: 1,
      effectVariation: 0.88,
      visualCoherence: 0.4,
      renderingQuality: 'balanced',
    },
    [fx('rgb-split', 1), fx('chroma-drift', 0.95), fx('scanline', 0.52)],
  ),
  preset(
    'pixel-sort-trail',
    'Pixel Sort Trail',
    {
      glitchAmount: 'broken',
      mode: 'trail',
      spacing: 24,
      mutationMode: 'whole-trail',
      fxStage: 'after',
      mutationAmount: 0.78,
      structuralDrift: 0.5,
      alphaMode: 'bleed',
      bleedAmount: 5,
      renderingQuality: 'balanced',
    },
    [fx('pixel-sort', 0.86), fx('scanline', 0.4)],
  ),
  preset(
    'whole-trail',
    'Whole Trail',
    {
      glitchAmount: 'strong',
      mode: 'trail',
      spacing: 34,
      mutationMode: 'whole-trail',
      fxStage: 'after',
      mutationAmount: 0.74,
      structuralDrift: 0.44,
      alphaMode: 'bleed',
      bleedAmount: 6,
      renderingQuality: 'balanced',
    },
    [fx('feedback', 0.58), fx('scanline', 0.48), fx('rgb-split', 0.34)],
  ),
  preset(
    'mosh-flow-trail',
    'MOSH Flow Trail',
    {
      glitchAmount: 'broken',
      mode: 'trail',
      spacing: 26,
      mutationMode: 'whole-trail',
      fxStage: 'after',
      mutationAmount: 0.86,
      structuralDrift: 0.72,
      alphaMode: 'bleed',
      bleedAmount: 8,
      renderingQuality: 'balanced',
    },
    [fx('flow-field', 0.88), fx('chroma-drift', 0.42)],
  ),
  preset(
    'codec-damage-trail',
    'Codec Damage Trail',
    {
      glitchAmount: 'extreme',
      mode: 'trail',
      spacing: 44,
      mutationMode: 'whole-trail',
      fxStage: 'after',
      mutationAmount: 0.9,
      structuralDrift: 0.68,
      alphaMode: 'bleed',
      bleedAmount: 5,
      renderingQuality: 'balanced',
    },
    [fx('codec-block-damage', 0.92), fx('block-corruption', 0.56), fx('row-repeat', 0.38)],
  ),
  preset(
    'chroma-feedback',
    'Chroma Feedback',
    {
      glitchAmount: 'broken',
      mode: 'trail',
      spacing: 34,
      mutationMode: 'evolving',
      fxStage: 'before-after',
      accumulation: 0.8,
      recovery: 0.18,
      chromaDrift: 0.92,
      blendMode: 'screen',
      alphaMode: 'bleed',
      bleedAmount: 9,
      renderingQuality: 'realtime',
    },
    [fx('chroma-drift', 0.94), fx('feedback', 0.34), fx('rgb-split', 0.72)],
  ),
  preset(
    'compression-breakdown',
    'Codec Breakdown',
    {
      glitchAmount: 'broken',
      mode: 'trail',
      spacing: 62,
      mutationMode: 'stroke-gradient',
      gradientStart: 'clean',
      gradientEnd: 'codec-block-damage',
      evolutionCurve: 'ease-in',
      mutationAmount: 0.92,
      effectVariation: 0.3,
      fxStage: 'each',
      renderingQuality: 'balanced',
    },
    [fx('codec-block-damage', 0.84), fx('dct-damage', 0.72), fx('block-corruption', 0.46)],
  ),
  preset(
    'packet-loss-stream',
    'Packet Loss Stream',
    {
      glitchAmount: 'extreme',
      mode: 'trail',
      spacing: 48,
      mutationMode: 'random-stack',
      fxStage: 'each',
      effectPool: ['block-corruption', 'row-repeat', 'codec-block-damage'],
      stackMinimumEffects: 2,
      stackMaximumEffects: 3,
      stackMinimumStrength: 0.62,
      stackMaximumStrength: 1,
      effectVariation: 0.9,
      visualCoherence: 0.34,
      renderingQuality: 'balanced',
    },
    [fx('block-corruption', 0.88), fx('row-repeat', 0.72), fx('codec-block-damage', 0.64)],
  ),
  preset(
    'broken-interface',
    'Broken Interface',
    {
      glitchAmount: 'broken',
      mode: 'trail',
      spacing: 78,
      mutationMode: 'alternating',
      recipeA: 'block-corruption',
      recipeB: 'rgb-split',
      alternatingInterval: 1,
      transitionBlend: 0.08,
      rotationMode: 'alternate',
      scaleJitter: 0.1,
      fxStage: 'each',
      renderingQuality: 'high',
    },
    [fx('block-corruption', 0.78), fx('rgb-split', 0.8), fx('codec-block-damage', 0.5)],
  ),
  preset(
    'scatter-fragments',
    'Scatter Fragments',
    {
      glitchAmount: 'strong',
      mode: 'scatter',
      spacing: 84,
      mutationMode: 'per-stamp',
      rotationMode: 'random',
      scatterX: 1.6,
      scatterY: 1.2,
      scaleJitter: 0.55,
      opacityJitter: 0.35,
      flipXChance: 0.3,
      flipYChance: 0.16,
      minimumEffects: 1,
      maximumEffects: 3,
      effectVariation: 0.86,
      variantCount: 10,
      fxStage: 'each',
      renderingQuality: 'balanced',
    },
    [fx('block-corruption', 0.66), fx('slice', 0.58), fx('codec-block-damage', 0.62)],
  ),
  preset(
    'pixel-embroidery',
    'Pixel Embroidery',
    {
      glitchAmount: 'medium',
      mode: 'trail',
      spacing: 70,
      mutationMode: 'fixed',
      fxStage: 'before',
      alphaMode: 'preserve',
      effectVariation: 0.04,
      renderingQuality: 'high',
    },
    [embroideryFx(0.84)],
    { category: 'PRINT / TEXTURE', catalog: 'core', badge: 'NEW' },
  ),
  preset(
    'xerox-decay',
    'Xerox Decay',
    {
      glitchAmount: 'strong',
      mode: 'trail',
      spacing: 62,
      mutationMode: 'progressive',
      fxStage: 'each',
      progressiveStart: 0.04,
      progressiveEnd: 0.88,
      evolutionCurve: 'ease-in',
      effectVariation: 0.12,
      alphaMode: 'preserve',
      renderingQuality: 'balanced',
    },
    [xeroxFx(0.82)],
    { category: 'PRINT / TEXTURE', catalog: 'core', badge: 'NEW' },
  ),
  preset(
    'zine-stitch',
    'Zine Stitch',
    {
      glitchAmount: 'strong',
      mode: 'trail',
      spacing: 68,
      mutationMode: 'fixed',
      fxStage: 'before',
      alphaMode: 'preserve',
      effectVariation: 0.06,
      renderingQuality: 'high',
    },
    [
      { ...embroideryFx(0.78, '-zine'), embroideryGridSize: 6, embroideryMissingStitches: 0.03 },
      { ...xeroxFx(0.46, '-zine'), xeroxTonerLoss: 0.16, xeroxSpeckle: 0.12 },
    ],
    { category: 'PRINT / TEXTURE', catalog: 'core', badge: 'NEW' },
  ),
];

/**
 * Serialized recipe IDs remain stable. This alias only accepts the short catalog name that was
 * used by early style-first experiments; saved `compression-breakdown` projects stay untouched.
 */
export const imageBrushStyleAliases: Readonly<Record<string, string>> = {
  'codec-breakdown': 'compression-breakdown',
};

export function resolveImageBrushStyleId(styleId: string): string {
  return imageBrushStyleAliases[styleId] ?? styleId;
}

export function prepareImageBrushPresetForApplication(preset: ImageBrushPreset): {
  preset: ImageBrushPreset;
  legacyAssetMode: 'all' | null;
  legacyAssetOrder: 'cycle' | 'random' | null;
} {
  const legacyMode = preset.settings.mode;
  return {
    preset: {
      ...preset,
      settings: normalizeImageBrushSettings(preset.settings),
      rack: preset.rack.map((item) => ({ ...item })),
    },
    legacyAssetMode:
      legacyMode === 'sequence' || legacyMode === 'random-hose' ? 'all' : null,
    legacyAssetOrder:
      legacyMode === 'random-hose' ? 'random' : legacyMode === 'sequence' ? 'cycle' : null,
  };
}

const STORAGE_KEY = 'hex-redactor:image-brush-presets:v1';

export function loadImageBrushPresets(): ImageBrushPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ImageBrushPreset[];
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item?.custom && typeof item.name === 'string')
          .map((item) => {
            const legacyMode = item.settings?.mode;
            const settings = normalizeImageBrushSettings(item.settings);
            return {
              ...item,
              settings:
                legacyMode === 'sequence' || legacyMode === 'random-hose'
                  ? { ...settings, mode: legacyMode }
                  : settings,
            };
          })
      : [];
  } catch {
    return [];
  }
}

export function saveImageBrushPresets(presets: ImageBrushPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.filter((item) => item.custom)));
  } catch {
    // localStorage can be unavailable in privacy mode; the current session still works.
  }
}

export type ImageBrushRandomizeScope =
  'balanced' | 'wild' | 'layout' | 'mutation' | 'fx' | 'everything';

export function randomizeImageBrush(
  settings: ImageBrushSettings,
  rack: ImageBrushFxItem[],
  seed: string,
  scope: ImageBrushRandomizeScope,
  variationNonce = 0,
): { settings: ImageBrushSettings; rack: ImageBrushFxItem[] } {
  const random = createSeededRandom(`image-brush:${scope}:${seed}:variation:${variationNonce}`);
  const output = {
    ...settings,
    customAnchor: { ...settings.customAnchor },
  };
  let nextRack = rack.map((item) => ({ ...item }));
  const layout =
    scope === 'balanced' || scope === 'wild' || scope === 'layout' || scope === 'everything';
  const mutation =
    scope === 'balanced' || scope === 'wild' || scope === 'mutation' || scope === 'everything';
  const effects =
    scope === 'balanced' || scope === 'wild' || scope === 'fx' || scope === 'everything';
  const wild = scope === 'wild';
  if (layout) {
    output.mode = random.pick(
      wild
        ? (['stamp', 'trail', 'scatter'] as const)
        : (['stamp', 'trail', 'scatter'] as const),
    );
    output.size = random.int(wild ? 22 : 54, wild ? 260 : 150);
    output.spacing = random.int(wild ? 8 : 32, wild ? 210 : 115);
    output.opacity = 0.35 + random.next() * 0.65;
    output.flow = 0.45 + random.next() * 0.55;
    output.rotationMode = random.pick([
      'fixed',
      'follow',
      'perpendicular',
      'random',
      'alternate',
      'spin',
    ] as const);
    output.rotationJitter = random.int(0, wild ? 180 : 28);
    output.scaleJitter = random.next() * (wild ? 0.75 : 0.25);
    output.scatterX = random.next() * (wild ? 2 : 0.65);
    output.scatterY = random.next() * (wild ? 2 : 0.65);
    output.opacityJitter = random.next() * (wild ? 0.7 : 0.22);
    output.flipXChance = random.next() * (wild ? 0.65 : 0.18);
    output.flipYChance = random.next() * (wild ? 0.45 : 0.12);
    output.stampsPerStep = random.int(1, wild ? 4 : 2);
    output.blendMode = random.pick(
      wild
        ? ([
            'normal',
            'multiply',
            'screen',
            'overlay',
            'difference',
            'lighten',
            'darken',
            'hard-light',
            'color-dodge',
            'exclusion',
          ] as const)
        : (['normal', 'screen', 'overlay', 'lighten'] as const),
    );
  }
  if (mutation) {
    output.mutationMode = random.pick(
      wild
        ? ([
            'fixed',
            'progressive',
            'per-stamp',
            'evolving',
            'random-stack',
            'alternating',
            'stroke-gradient',
            'whole-trail',
          ] as const)
        : (['clean', 'fixed', 'progressive', 'per-stamp', 'alternating'] as const),
    );
    output.mutationAmount = 0.18 + random.next() * (wild ? 0.82 : 0.48);
    output.maxCorruption = 0.48 + random.next() * 0.5;
    output.effectVariation = 0.12 + random.next() * (wild ? 0.88 : 0.36);
    output.structuralDrift = random.next() * (wild ? 1 : 0.45);
    output.alphaMode = random.pick(
      wild
        ? (['preserve', 'inside', 'bleed', 'corrupt'] as const)
        : (['preserve', 'inside', 'bleed'] as const),
    );
    output.fxStage = random.pick(
      wild ? (['before', 'each', 'after', 'before-after'] as const) : (['before', 'each'] as const),
    );
  }
  if (effects) {
    const requiredStages = effectiveImageBrushStages(output.fxStage, output.mutationMode);
    const effectIds: ImageBrushFxId[] = imageBrushFxDefinitions
      .filter(
        (definition) =>
          !definition.experimental && supportsImageBrushStages(definition.id, requiredStages),
      )
      .map((definition) => definition.id);
    const count = random.int(1, wild ? 4 : 2);
    nextRack = Array.from({ length: count }, (_, index) => {
      const effectId = random.pick(effectIds);
      return {
        id: `random-${effectId}-${index}`,
        effectId,
        enabled: true,
        amount: 0.18 + random.next() * (wild ? 0.82 : 0.5),
        mix: 0.55 + random.next() * 0.45,
      };
    });
  }
  output.opacity = Math.max(0.12, output.opacity);
  output.flow = Math.max(0.15, output.flow);
  output.size = Math.max(2, output.size);
  output.stampsPerStep = Math.max(1, output.stampsPerStep);
  return { settings: output, rack: nextRack };
}

export function applyImageBrushPreset(
  currentAssetId: string | null,
  preset: ImageBrushPreset,
): { assetId: string | null; settings: ImageBrushSettings; rack: ImageBrushFxItem[] } {
  return {
    assetId: currentAssetId,
    settings: {
      ...preset.settings,
      customAnchor: { ...preset.settings.customAnchor },
    },
    rack: preset.rack.map((item) => ({ ...item })),
  };
}
