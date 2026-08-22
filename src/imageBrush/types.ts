import type { Point, Rectangle } from '../types';
import {
  imageBrushFxDefinitions as sharedImageBrushFxDefinitions,
  supportsImageBrushStages,
  type SharedImageBrushStage,
} from '../effects/sharedRegistry';

export type ImageBrushMode = 'stamp' | 'trail' | 'scatter' | 'sequence' | 'random-hose';
/** Source selection is project state, deliberately separate from placement mode. */
export type ImageBrushAssetMode = 'selected' | 'all';
export type ImageBrushAssetOrder = 'cycle' | 'random';
export type StampRotationMode =
  'fixed' | 'follow' | 'perpendicular' | 'random' | 'alternate' | 'spin';
export type StampAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'custom';
export type StampBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'difference'
  | 'lighten'
  | 'darken'
  | 'hard-light'
  | 'color-dodge'
  | 'exclusion';
export type StampMutationMode =
  | 'clean'
  | 'fixed'
  | 'progressive'
  | 'per-stamp'
  | 'evolving'
  | 'random-stack'
  | 'alternating'
  | 'stroke-gradient'
  | 'whole-trail';
export type StampEvolutionCurve =
  'constant' | 'linear' | 'ease-in' | 'ease-out' | 'exponential' | 'pulse' | 'random-walk';
export type StampOpacityEvolutionMode = 'constant' | 'fade';
export type StampAlphaMode = 'preserve' | 'inside' | 'bleed' | 'corrupt';
export type StampFxStage = 'before' | 'each' | 'after' | 'before-after';
export type StampSpacingUnit = 'percent' | 'pixels';
export type ImageBrushRenderingQuality = 'realtime' | 'balanced' | 'high' | 'auto';
export type ImageBrushPreviewQuality = 'draft' | 'full';
export type ImageBrushFxLevel = 'subtle' | 'medium' | 'strong' | 'broken' | 'extreme';
export type ImageBrushGlitchAmount =
  'clean' | 'subtle' | 'medium' | 'strong' | 'broken' | 'extreme' | 'custom';

export type ImageBrushFxId =
  | 'slice'
  | 'macroblock'
  | 'block-corruption'
  | 'datamosh'
  | 'rgb-split'
  | 'scanline'
  | 'packet-loss'
  | 'compression'
  | 'codec-block-damage'
  | 'tile-scramble'
  | 'row-repeat'
  | 'pixel-noise'
  | 'bit-flip'
  | 'palette'
  | 'pixel-sort'
  | 'feedback'
  | 'motion-field'
  | 'chroma-drift'
  | 'dct-damage'
  | 'edge-melt'
  | 'flow-field'
  | 'motion-transfer'
  | 'pixel-embroidery'
  | 'xerox-decay'
  | 'jpeg-resample';

export interface ImageBrushFxItem {
  id: string;
  effectId: ImageBrushFxId;
  enabled: boolean;
  amount: number;
  mix: number;
  embroideryGridSize?: number;
  embroideryStitchType?: 'cross-stitch' | 'diagonal-stitch' | 'bead' | 'square';
  embroideryPaletteLevels?: number;
  embroideryThreadAngle?: number;
  embroideryMissingStitches?: number;
  embroideryThreadJitter?: number;
  embroideryBackgroundTransparency?: number;
  xeroxThreshold?: number;
  xeroxTonerLoss?: number;
  xeroxSpeckle?: number;
  xeroxEdgeErosion?: number;
  xeroxBanding?: number;
  xeroxBlackCrush?: number;
  xeroxColorMode?: 'mono' | 'duotone';
  jpegTargetLongEdge?: number;
  jpegQuality?: number;
  jpegPasses?: number;
  jpegNoise?: boolean;
  jpegNoiseAmount?: number;
  jpegNoiseType?: 'luma' | 'rgb';
  jpegSharpen?: boolean;
  jpegSharpenAmount?: number;
  jpegUpscale?: 'smooth' | 'pixelated';
  jpegChromaBleed?: number;
}

export interface ImageBrushSettings {
  glitchAmount: ImageBrushGlitchAmount;
  mode: ImageBrushMode;
  size: number;
  spacing: number;
  spacingUnit: StampSpacingUnit;
  opacity: number;
  opacityEvolutionMode: StampOpacityEvolutionMode;
  opacityFadeStart: number;
  opacityFadeEnd: number;
  opacityFadeCurve: StampEvolutionCurve;
  flow: number;
  angle: number;
  rotationMode: StampRotationMode;
  followDirection: boolean;
  randomRotation: number;
  rotationJitter: number;
  scaleJitter: number;
  scatterX: number;
  scatterY: number;
  opacityJitter: number;
  flipXChance: number;
  flipYChance: number;
  stampsPerStep: number;
  edgeSoftness: number;
  blendMode: StampBlendMode;
  pressureSize: boolean;
  pressureOpacity: boolean;
  pressureSpacing: boolean;
  minPressureSize: number;
  minPressureOpacity: number;
  smoothing: number;
  anchor: StampAnchor;
  customAnchor: Point;
  showOutline: boolean;
  trimTransparent: boolean;
  trimThreshold: number;
  mutationMode: StampMutationMode;
  mutationAmount: number;
  progressiveStart: number;
  progressiveEnd: number;
  evolutionSpeed: number;
  maxCorruption: number;
  resetEachStroke: boolean;
  continueBetweenStrokes: boolean;
  effectVariation: number;
  seedEvolution: number;
  minimumEffects: number;
  maximumEffects: number;
  lockEffectPool: boolean;
  allowRepeatedCombinations: boolean;
  effectPool: ImageBrushFxId[];
  accumulation: number;
  recovery: number;
  alphaStability: number;
  stackMinimumEffects: number;
  stackMaximumEffects: number;
  stackRandomOrder: boolean;
  stackMinimumStrength: number;
  stackMaximumStrength: number;
  visualCoherence: number;
  recipeA: ImageBrushFxId | 'clean' | 'mixed';
  recipeB: ImageBrushFxId | 'clean' | 'mixed';
  alternatingInterval: number;
  randomAlternation: boolean;
  transitionBlend: number;
  gradientStart: ImageBrushFxId | 'clean' | 'mixed';
  gradientEnd: ImageBrushFxId | 'clean' | 'mixed';
  feedbackAmount: number;
  underlyingSampling: number;
  decay: number;
  chromaDrift: number;
  structuralDrift: number;
  evolutionCurve: StampEvolutionCurve;
  alphaMode: StampAlphaMode;
  bleedAmount: number;
  fxStage: StampFxStage;
  fallbackAngle: number;
  previewStroke: boolean;
  renderingQuality: ImageBrushRenderingQuality;
  maxLiveStampsPerFrame: number;
  maxGeneratedStamps: number;
  maxCachedVariants: number;
  maxLiveFxIterations: number;
  variantCount: number;
}

export interface ImageBrushAsset {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  originalPixels: Uint8ClampedArray;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  trimBounds: Rectangle;
  embeddedDataUrl?: string;
  defaultSize: number;
  anchor: StampAnchor;
  customAnchor: Point;
  fxPresetId?: string;
  demo?: boolean;
}

export interface StampPoint {
  position: Point;
  previousPosition: Point;
  direction: Point;
  speed: number;
  pressure: number;
  distance: number;
  index: number;
}

export interface StampStrokeContext {
  strokeId: string;
  stampIndex: number;
  position: Point;
  previousPosition: Point;
  direction: Point;
  speed: number;
  pressure: number;
  rotation: number;
  seed: string;
}

export interface StampPathState {
  lastInput: Point;
  lastStamp: Point;
  lastDirection: Point;
  remainder: number;
  totalDistance: number;
  nextIndex: number;
  lastPressure: number;
}

export interface ImageBrushPreset {
  id: string;
  name: string;
  settings: ImageBrushSettings;
  rack: ImageBrushFxItem[];
  /** Presentation metadata is catalog-only; it never becomes part of a project recipe. */
  category?: 'BASIC' | 'MOTION' | 'BREAKDOWN' | 'COLOR' | 'PRINT / TEXTURE' | 'MORE';
  catalog?: 'core' | 'more' | 'legacy';
  badge?: 'NEW';
  custom?: boolean;
}

export interface SerializedImageBrushAsset {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  embeddedDataUrl: string;
  defaultSize: number;
  anchor: StampAnchor;
  customAnchor: Point;
  fxPresetId?: string;
  demo?: boolean;
}

export interface ImageBrushProjectData {
  version: 1;
  settings: ImageBrushSettings;
  seed: string;
  /**
   * The displayed Style is intentionally independent from its current essential overrides.
   * `activePresetId` remains in exported projects for readers written before Style-first UI.
   */
  activeStyleId?: string;
  activePresetId: string;
  activeAssetId: string | null;
  /** Optional so v1 projects and older exported style JSON remain readable. */
  assetMode?: ImageBrushAssetMode;
  assetOrder?: ImageBrushAssetOrder;
  enabledAssetIds?: string[];
  evolutionOffset: number;
  rack: ImageBrushFxItem[];
  library: SerializedImageBrushAsset[];
}

export interface ImageBrushProcessRequest {
  jobId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  sourceBounds: Rectangle;
  assets: Array<{
    id: string;
    width: number;
    height: number;
    pixels: ArrayBuffer;
  }>;
  activeAssetId: string;
  assetMode?: ImageBrushAssetMode;
  assetOrder?: ImageBrushAssetOrder;
  stamps: StampPoint[];
  settings: ImageBrushSettings;
  rack: ImageBrushFxItem[];
  seed: string;
  strokeId: string;
  presetName: string;
  evolutionOffset: number;
}

export interface ImageBrushProcessResult {
  jobId: string;
  pixels: Uint8ClampedArray;
  bounds: Rectangle;
  regionOnly: true;
  stampCount: number;
  affectedPixels: number;
  nextEvolutionOffset: number;
  metrics: ImageBrushPerformanceMetrics;
  previewVariants?: Array<{
    assetId?: string;
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
  }>;
}

export interface ImageBrushProgress {
  jobId: string;
  phase: 'variants' | 'stamping' | 'post-fx';
  percent: number;
  detail?: string;
  current?: number;
  total?: number;
}

export interface ImageBrushPerformanceMetrics {
  pathInterpolationMs: number;
  variantGenerationMs: number;
  fxProcessingMs: number;
  compositingMs: number;
  bufferCopyMs: number;
  totalRenderMs: number;
  renderedStamps: number;
  changedPixels: number;
  cacheVariants: number;
  cacheBytes: number;
  fullDocumentCopies: number;
  localBufferBytes: number;
}

export interface ImageBrushPerformanceSnapshot extends ImageBrushPerformanceMetrics {
  pointerEvents: number;
  pointerEventsPerSecond: number;
  stampsGenerated: number;
  stampsPerSecond: number;
  firstFeedbackMs: number;
  pointerUpToResultMs: number;
  resultAdoptionMs: number;
  layerCommitMs: number;
  canvasUploadMs: number;
  workerPostMs: number;
  workerTransferOutBytes: number;
  workerTransferInBytes: number;
  workerJobsStarted: number;
  workerJobsCancelled: number;
  obsoleteJobsIgnored: number;
  reactRenders: number;
  liveFrames: number;
  delayedFrames: number;
  maxLiveFrameMs: number;
  quality: ImageBrushRenderingQuality;
}

export interface ImageBrushPreviewDiagnostics {
  quality: ImageBrushPreviewQuality;
  changedPixels: number;
  differencePercent: number;
  changedBounds: Rectangle | null;
  cacheVariants: number;
  cacheBytes: number;
  processingMs: number;
  noVisibleChange: boolean;
}

export interface ImageBrushPreviewResult {
  jobId: string;
  generation: number;
  quality: ImageBrushPreviewQuality;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  variants: Array<{
    assetId?: string;
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    contentWidth: number;
    contentHeight: number;
  }>;
  stroke: {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    stampCount: number;
    processingMs: number;
  };
  diagnostics: ImageBrushPreviewDiagnostics;
}

export interface ImageBrushPreviewRequest {
  jobId: string;
  generation: number;
  quality: ImageBrushPreviewQuality;
  assetId: string;
  /** Only the assets the current source selection can place are transferred. */
  assets: Array<{ id: string; pixels: ArrayBuffer; width: number; height: number }>;
  assetMode?: ImageBrushAssetMode;
  assetOrder?: ImageBrushAssetOrder;
  backgroundPixels: ArrayBuffer;
  backgroundWidth: number;
  backgroundHeight: number;
  documentWidth: number;
  documentHeight: number;
  rack: ImageBrushFxItem[];
  settings: ImageBrushSettings;
  seed: string;
  strokeId: string;
  evolutionOffset: number;
}

const defaultImageBrushEffectPool: ImageBrushFxId[] = sharedImageBrushFxDefinitions
  .filter(
    (definition) =>
      !definition.legacy &&
      !definition.experimental &&
      definition.imageBrushStages.includes('tip'),
  )
  .map((definition) => definition.id);

export const defaultImageBrushSettings: ImageBrushSettings = {
  glitchAmount: 'clean',
  mode: 'trail',
  size: 96,
  spacing: 48,
  spacingUnit: 'percent',
  opacity: 1,
  opacityEvolutionMode: 'constant',
  opacityFadeStart: 1,
  opacityFadeEnd: 0.05,
  opacityFadeCurve: 'linear',
  flow: 1,
  angle: 0,
  rotationMode: 'follow',
  followDirection: true,
  randomRotation: 0,
  rotationJitter: 0,
  scaleJitter: 0,
  scatterX: 0,
  scatterY: 0,
  opacityJitter: 0,
  flipXChance: 0,
  flipYChance: 0,
  stampsPerStep: 1,
  edgeSoftness: 0,
  blendMode: 'normal',
  pressureSize: true,
  pressureOpacity: false,
  pressureSpacing: false,
  minPressureSize: 0.2,
  minPressureOpacity: 0.2,
  smoothing: 0.25,
  anchor: 'center',
  customAnchor: { x: 0.5, y: 0.5 },
  showOutline: true,
  trimTransparent: true,
  trimThreshold: 2,
  mutationMode: 'clean',
  mutationAmount: 0.45,
  progressiveStart: 0.08,
  progressiveEnd: 0.92,
  evolutionSpeed: 0.45,
  maxCorruption: 0.82,
  resetEachStroke: true,
  continueBetweenStrokes: false,
  effectVariation: 0.35,
  seedEvolution: 0.5,
  minimumEffects: 1,
  maximumEffects: 3,
  lockEffectPool: false,
  allowRepeatedCombinations: false,
  effectPool: [...defaultImageBrushEffectPool],
  accumulation: 0.68,
  recovery: 0.08,
  alphaStability: 0.88,
  stackMinimumEffects: 2,
  stackMaximumEffects: 4,
  stackRandomOrder: true,
  stackMinimumStrength: 0.22,
  stackMaximumStrength: 0.86,
  visualCoherence: 0.52,
  recipeA: 'slice',
  recipeB: 'rgb-split',
  alternatingInterval: 1,
  randomAlternation: false,
  transitionBlend: 0,
  gradientStart: 'clean',
  gradientEnd: 'mixed',
  feedbackAmount: 0.42,
  underlyingSampling: 0.28,
  decay: 0.08,
  chromaDrift: 0.18,
  structuralDrift: 0.24,
  evolutionCurve: 'linear',
  alphaMode: 'preserve',
  bleedAmount: 4,
  fxStage: 'before',
  fallbackAngle: 0,
  previewStroke: false,
  renderingQuality: 'balanced',
  maxLiveStampsPerFrame: 24,
  maxGeneratedStamps: 5000,
  maxCachedVariants: 16,
  maxLiveFxIterations: 3,
  variantCount: 8,
};

export const imageBrushFxDefinitions = sharedImageBrushFxDefinitions;

export function supportsImageBrushFxStages(
  effectId: ImageBrushFxId,
  required: readonly SharedImageBrushStage[],
): boolean {
  return supportsImageBrushStages(effectId, required);
}

export function createImageBrushFx(effectId: ImageBrushFxId): ImageBrushFxItem {
  const base: ImageBrushFxItem = {
    id: `${effectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    effectId,
    enabled: true,
    amount: 0.5,
    mix: 1,
  };
  if (effectId === 'pixel-embroidery') {
    return {
      ...base,
      embroideryGridSize: 7,
      embroideryStitchType: 'cross-stitch',
      embroideryPaletteLevels: 8,
      embroideryThreadAngle: 0,
      embroideryMissingStitches: 0.08,
      embroideryThreadJitter: 0.12,
      embroideryBackgroundTransparency: 0.9,
    };
  }
  if (effectId === 'xerox-decay') {
    return {
      ...base,
      xeroxThreshold: 0.54,
      xeroxTonerLoss: 0.28,
      xeroxSpeckle: 0.22,
      xeroxEdgeErosion: 0.2,
      xeroxBanding: 0.14,
      xeroxBlackCrush: 0.36,
      xeroxColorMode: 'mono',
    };
  }
  if (effectId === 'jpeg-resample') {
    return {
      ...base,
      jpegTargetLongEdge: 96,
      jpegQuality: 34,
      jpegPasses: 2,
      jpegNoise: false,
      jpegNoiseAmount: 0.08,
      jpegNoiseType: 'luma',
      jpegSharpen: false,
      jpegSharpenAmount: 0.25,
      jpegUpscale: 'smooth',
      jpegChromaBleed: 0.08,
    };
  }
  return base;
}
