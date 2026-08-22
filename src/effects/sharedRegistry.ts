import type { MoshEffectId } from '../mosh/types';
import type { AlgorithmId } from '../types';
import type { ImageBrushFxId, StampFxStage, StampMutationMode } from '../imageBrush/types';

export type SharedImageBrushStage = 'tip' | 'stamp' | 'trail';

export interface SharedEffectRegistryItem {
  id: ImageBrushFxId;
  name: string;
  description: string;
  cost: 'low' | 'medium' | 'high' | 'very-high';
  minSize: number;
  algorithmId?: AlgorithmId;
  moshId?: MoshEffectId;
  imageBrushStages: readonly SharedImageBrushStage[];
  visibleInImageBrush: boolean;
  legacy?: boolean;
  experimental?: boolean;
}

const entry = (value: SharedEffectRegistryItem) => value;

export const sharedEffectRegistry: ReadonlyArray<SharedEffectRegistryItem> = [
  entry({
    id: 'jpeg-resample',
    name: 'JPEG Resample',
    minSize: 2,
    description: 'Re-encodes a bounded local buffer through deterministic JPEG codec passes.',
    cost: 'high',
    algorithmId: 'jpeg-resample-brush',
    moshId: 'jpeg-resample',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
    experimental: true,
  }),
  entry({
    id: 'pixel-embroidery',
    name: 'Pixel Embroidery',
    minSize: 6,
    description: 'Rebuilds the stamp as a quantized grid of stitches, beads, or square cells.',
    cost: 'medium',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
    experimental: true,
  }),
  entry({
    id: 'xerox-decay',
    name: 'Xerox Decay',
    minSize: 4,
    description: 'Crushes tones into eroded toner, speckle, and missing copy bands.',
    cost: 'medium',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
    experimental: true,
  }),
  entry({
    id: 'slice',
    name: 'Slice Displacement',
    minSize: 4,
    description: 'Cuts the tip into displaced horizontal or vertical slices.',
    cost: 'low',
    algorithmId: 'slice-displacement',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'block-corruption',
    name: 'Block Corruption',
    minSize: 8,
    description: 'Builds packet-loss, repeat, dropout and displaced block failures.',
    cost: 'medium',
    algorithmId: 'block-corruption',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'datamosh',
    name: 'Datamosh Smear',
    minSize: 6,
    description: 'Propagates colored blocks into directional prediction trails.',
    cost: 'medium',
    algorithmId: 'datamosh-smear',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'rgb-split',
    name: 'RGB Chunk Split',
    minSize: 4,
    description: 'Offsets color channels in visible regional chunks.',
    cost: 'low',
    algorithmId: 'rgb-chunk-split',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'scanline',
    name: 'Scanline Tear',
    minSize: 4,
    description: 'Shifts narrow signal bands across the tip.',
    cost: 'low',
    algorithmId: 'scanline-tear-pro',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'codec-block-damage',
    name: 'Codec Block Damage',
    minSize: 8,
    description: 'Combines quantization, ringing, coefficient loss and tile failures.',
    cost: 'medium',
    algorithmId: 'codec-block-damage',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'row-repeat',
    name: 'Row / Column Repeat',
    minSize: 4,
    description: 'Repeats selected rows or columns into frozen bands.',
    cost: 'low',
    algorithmId: 'row-column-repeat',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'pixel-sort',
    name: 'Pixel Sort',
    minSize: 6,
    description: 'Reorders connected pixel runs into directional streaks.',
    cost: 'high',
    moshId: 'pixel-sort',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'feedback',
    name: 'Feedback Echo',
    minSize: 8,
    description: 'Feeds transformed copies back into the tip as echoes.',
    cost: 'high',
    moshId: 'feedback',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'motion-field',
    name: 'Motion Field Mosh',
    minSize: 8,
    description: 'Moves image blocks through a generated direction field.',
    cost: 'high',
    moshId: 'motion-field',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'chroma-drift',
    name: 'Luma / Chroma Drift',
    minSize: 4,
    description: 'Separates color information from the brightness structure.',
    cost: 'medium',
    moshId: 'chroma-drift',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'flow-field',
    name: 'Flow Field Displace',
    minSize: 8,
    description: 'Warps the tip through a coherent fluid-like vector field.',
    cost: 'very-high',
    moshId: 'flow-field',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'motion-transfer',
    name: 'Motion Transfer',
    minSize: 12,
    description:
      'Transfers one half of a completed trail into the other along the stroke direction.',
    cost: 'high',
    moshId: 'motion-transfer',
    imageBrushStages: ['trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'edge-melt',
    name: 'Edge Melt',
    minSize: 6,
    description: 'Pulls visible edges into coherent trails after the complete stamp trail exists.',
    cost: 'high',
    moshId: 'edge-melt',
    imageBrushStages: ['trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'dct-damage',
    name: 'DCT Block Damage',
    minSize: 8,
    description: 'Simulates broken transform blocks and lost fine detail.',
    cost: 'high',
    moshId: 'dct-damage',
    imageBrushStages: ['trail'],
    visibleInImageBrush: true,
  }),
  entry({
    id: 'palette',
    name: 'Palette Collapse',
    minSize: 2,
    description: 'Legacy stepped palette reduction.',
    cost: 'low',
    algorithmId: 'palette-collapse',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: false,
    legacy: true,
  }),
  entry({
    id: 'macroblock',
    name: 'Macroblock Shift',
    minSize: 8,
    description: 'Migrated to Block Corruption.',
    cost: 'medium',
    algorithmId: 'macroblock-shift',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: false,
    legacy: true,
  }),
  entry({
    id: 'packet-loss',
    name: 'Packet Loss',
    minSize: 8,
    description: 'Migrated to Block Corruption.',
    cost: 'medium',
    algorithmId: 'packet-loss',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: false,
    legacy: true,
  }),
  entry({
    id: 'compression',
    name: 'Compression Damage',
    minSize: 8,
    description: 'Migrated to Codec Block Damage.',
    cost: 'medium',
    algorithmId: 'compression-block-damage',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: false,
    legacy: true,
  }),
  entry({
    id: 'tile-scramble',
    name: 'Tile Scramble',
    minSize: 8,
    description: 'Migrated to Codec Block Damage.',
    cost: 'medium',
    algorithmId: 'tile-scramble',
    imageBrushStages: ['tip', 'stamp', 'trail'],
    visibleInImageBrush: false,
    legacy: true,
  }),
  entry({
    id: 'pixel-noise',
    name: 'Pixel Noise',
    minSize: 2,
    description: 'Removed legacy effect.',
    cost: 'low',
    algorithmId: 'byte-noise',
    imageBrushStages: [],
    visibleInImageBrush: false,
    legacy: true,
  }),
  entry({
    id: 'bit-flip',
    name: 'Bit Flip',
    minSize: 2,
    description: 'Removed legacy effect.',
    cost: 'low',
    algorithmId: 'bit-flip',
    imageBrushStages: [],
    visibleInImageBrush: false,
    legacy: true,
  }),
];

export const imageBrushFxDefinitions = sharedEffectRegistry
  .filter((item) => item.visibleInImageBrush)
  .sort((left, right) => Number(Boolean(right.experimental)) - Number(Boolean(left.experimental)));

export function sharedEffectForImageBrush(
  id: ImageBrushFxId,
): SharedEffectRegistryItem | undefined {
  return sharedEffectRegistry.find((item) => item.id === id);
}

export function sharedEffectForAlgorithm(id: AlgorithmId): SharedEffectRegistryItem | undefined {
  return sharedEffectRegistry.find((item) => item.algorithmId === id);
}

export function sharedEffectForMosh(id: MoshEffectId): SharedEffectRegistryItem | undefined {
  return sharedEffectRegistry.find((item) => item.moshId === id);
}

export function effectiveImageBrushStages(
  fxStage: StampFxStage,
  mutationMode: StampMutationMode,
): readonly SharedImageBrushStage[] {
  if (mutationMode === 'whole-trail' || fxStage === 'after') return ['trail'];
  if (fxStage === 'each') return ['stamp'];
  if (fxStage === 'before-after') return ['tip', 'trail'];
  return ['tip'];
}

export function supportsImageBrushStages(
  effectId: ImageBrushFxId,
  required: readonly SharedImageBrushStage[],
): boolean {
  const item = sharedEffectForImageBrush(effectId);
  return Boolean(item && required.every((stage) => item.imageBrushStages.includes(stage)));
}

export function imageBrushStageLabel(stages: readonly SharedImageBrushStage[]): string {
  return stages
    .map((stage) =>
      stage === 'tip' ? 'Tip FX' : stage === 'stamp' ? 'Per Stamp FX' : 'Whole Trail FX',
    )
    .join(' / ');
}

export function buildImageBrushEvolutionRecipeOptions<T extends string>(
  definitions: ReadonlyArray<{
    id: T;
    name: string;
    imageBrushStages: readonly SharedImageBrushStage[];
    experimental?: boolean;
    legacy?: boolean;
  }>,
  requiredStages: readonly SharedImageBrushStage[],
): ReadonlyArray<readonly [T | 'clean' | 'mixed', string]> {
  return [
    ['clean', 'Clean'],
    ['mixed', 'Current FX stack'],
    ...definitions
      .filter(
        (definition) =>
          !definition.legacy &&
          requiredStages.every((stage) => definition.imageBrushStages.includes(stage)),
      )
      .sort(
        (left, right) =>
          Number(Boolean(left.experimental)) - Number(Boolean(right.experimental)),
      )
      .map(
        (definition) =>
          [
            definition.id,
            `${definition.experimental ? 'NEW · ' : ''}${definition.name}`,
          ] as const,
      ),
  ];
}
