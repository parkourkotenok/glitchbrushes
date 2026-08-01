export type AlgorithmId =
  | 'pixel-sort-brush'
  | 'feedback-brush'
  | 'displacement-brush'
  | 'flow-mosh-brush'
  | 'clone-corruption-brush'
  | 'line-freeze-brush'
  | 'slice-displacement'
  | 'macroblock-shift'
  | 'datamosh-smear'
  | 'packet-loss'
  | 'rgb-chunk-split'
  | 'compression-block-damage'
  | 'codec-block-damage'
  | 'scanline-tear-pro'
  | 'tile-scramble'
  | 'row-column-repeat'
  | 'structural-mixed'
  | 'byte-noise'
  | 'channel-shift'
  | 'byte-swap'
  | 'bit-flip'
  | 'block-corruption'
  | 'data-smear'
  | 'scanline'
  | 'compression'
  | 'palette-collapse'
  | 'mixed';

export type AlgorithmFamily =
  'pixel' | 'block' | 'line' | 'region' | 'datamosh' | 'mixed' | 'advanced-brush';
export type ApplyMode = 'continuous' | 'stroke' | 'preview';
export type MaskView = 'red' | 'mono' | 'hidden';
export type Tool = 'brush' | 'hand' | 'smudge' | 'blur' | 'sharpen' | 'restore' | 'eraser';
export type SpillMode = 'local' | 'small' | 'medium' | 'strong';
export type Orientation = 'horizontal' | 'vertical' | 'mixed';
export type EdgeMode = 'wrap' | 'clamp' | 'neighbor';
export type EffectIconId =
  | 'pixel-sort-brush'
  | 'feedback-brush'
  | 'displacement-brush'
  | 'flow-mosh-brush'
  | 'clone-corruption-brush'
  | 'line-freeze-brush'
  | 'slice'
  | 'macroblock'
  | 'datamosh'
  | 'rgb-split'
  | 'scanline'
  | 'packet-loss'
  | 'compression'
  | 'tile-scramble'
  | 'row-repeat'
  | 'mixed'
  | 'pixel-noise'
  | 'bit-flip'
  | 'palette'
  | 'channel-shift'
  | 'byte-swap'
  | 'pixel-sort'
  | 'feedback'
  | 'motion-field'
  | 'motion-transfer'
  | 'chroma-drift'
  | 'dct-damage'
  | 'edge-melt'
  | 'flow-field'
  | 'image-brush'
  | 'smudge'
  | 'blur'
  | 'sharpen'
  | 'eraser'
  | 'restore'
  | 'hex';

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasOverlayState {
  ownerEffectInstanceId: string;
  type:
    | 'source-region'
    | 'destination-region'
    | 'clone-source'
    | 'brush-preview'
    | 'selection'
    | 'motion-field';
  bounds?: Rectangle;
  mask?: Uint8Array;
  active: boolean;
}

export interface BrushSettings {
  size: number;
  hardness: number;
  opacity: number;
  strength: number;
  density: number;
  scatter: number;
  spacing: number;
  accumulate: boolean;
  pressure: boolean;
  minPressureSize: number;
  minPressureStrength: number;
}

export interface AlgorithmSettings {
  microIntensity: number;
  structuralIntensity: number;
  spill: SpillMode;
  byteProbability: number;
  minDelta: number;
  maxDelta: number;
  affectAlpha: boolean;
  fullRandom: boolean;
  shiftR: [number, number];
  shiftG: [number, number];
  shiftB: [number, number];
  randomShift: boolean;
  mirrorEdges: boolean;
  swapMode: 'bgr' | 'grb' | 'cycle' | 'random' | 'neighbor';
  bitCount: number;
  bitProbability: number;
  bitMin: number;
  bitMax: number;
  blockMin: number;
  blockMax: number;
  smearLength: number;
  smearAngle: number;
  scanThickness: number;
  scanGap: number;
  blockSize: 8 | 16;
  paletteLevels: number;
  dither: boolean;
  mixedEffects: number;
  sliceOrientation: Orientation;
  sliceMinThickness: number;
  sliceMaxThickness: number;
  sliceMinOffset: number;
  sliceMaxOffset: number;
  sliceCount: number;
  sliceEdgeMode: EdgeMode;
  macroblockMinSize: number;
  macroblockMaxSize: number;
  macroblockOffset: number;
  macroblockDuplicateChance: number;
  macroblockNeighborChance: number;
  macroblockSwapChance: number;
  macroblockStretchChance: number;
  blockCorruptionMode:
    'shift' | 'repeat' | 'dropout' | 'neighbor-inherit' | 'swap' | 'stretch' | 'mixed-packet-loss';
  blockCorruptionDirection: Orientation;
  blockCorruptionMix: number;
  structuralDensity: number;
  datamoshLength: number;
  datamoshDirection: 'stroke' | 'fixed' | 'random';
  datamoshBlockHeight: number;
  datamoshBlockWidth: number;
  datamoshPersistence: number;
  datamoshDecay: number;
  datamoshBlend: number;
  datamoshJitter: number;
  datamoshChroma: number;
  datamoshLumaHold: number;
  packetBlockSize: number;
  packetLossDensity: number;
  packetRepeatRadius: number;
  packetFlatChance: number;
  packetAlignment: number;
  packetEdgeTear: number;
  rgbRegionSize: number;
  rgbChunkOffset: number;
  rgbChunkBlend: number;
  rgbRandomOffset: boolean;
  rgbEdgeSoftness: number;
  compressionTileSize: 8 | 16;
  compressionQuantization: number;
  compressionReplication: number;
  compressionScramble: number;
  compressionTileOffset: number;
  compressionContrast: number;
  compressionChromaLoss: number;
  codecBlockDamageMode:
    | 'compression-loss'
    | 'tile-scramble'
    | 'coefficient-dropout'
    | 'block-repeat'
    | 'recompressed'
    | 'mixed-codec-failure';
  codecHighFrequencyLoss: number;
  codecCoefficientDropout: number;
  codecBoundaryStrength: number;
  codecRinging: number;
  codecMix: number;
  tearBandCount: number;
  tearMinThickness: number;
  tearMaxThickness: number;
  tearShift: number;
  tearDuplication: number;
  tearDropout: number;
  tearColorSplit: number;
  tearJitter: number;
  tileGridSize: number;
  tileShuffle: number;
  tilePreserveBorder: boolean;
  tileRepeat: number;
  tileDrop: number;
  repeatOrientation: Orientation;
  repeatLength: number;
  repeatCount: number;
  repeatJitter: number;
  repeatFade: number;
  structuralMixCount: number;
  structuralMixMinEffects: number;
  structuralMixMaxEffects: number;
  structuralMixPool: AlgorithmId[];
  sortBrushDirection: 'horizontal' | 'vertical' | 'stroke' | 'perpendicular';
  sortBrushProperty: 'luminance' | 'hue' | 'saturation' | 'rgb-sum';
  sortBrushThresholdLow: number;
  sortBrushThresholdHigh: number;
  sortBrushIntervalMin: number;
  sortBrushIntervalMax: number;
  sortBrushReverse: boolean;
  sortBrushDisorder: number;
  sortBrushEdgeSoftness: number;
  sortBrushLength: number;
  sortBrushSpill: number;
  feedbackBrushEchoCount: number;
  feedbackBrushOffsetX: number;
  feedbackBrushOffsetY: number;
  feedbackBrushScale: number;
  feedbackBrushRotation: number;
  feedbackBrushOpacityDecay: number;
  feedbackBrushBrightnessDecay: number;
  feedbackBrushBlendMode: 'normal' | 'screen' | 'multiply' | 'difference' | 'lighten';
  feedbackBrushRgbDelay: number;
  feedbackBrushPersistence: number;
  displacementBrushSource:
    'noise' | 'waves' | 'pressure' | 'luminance' | 'edges' | 'radial' | 'vortex';
  displacementBrushStrengthX: number;
  displacementBrushStrengthY: number;
  displacementBrushScale: number;
  displacementBrushRoughness: number;
  displacementBrushOctaves: number;
  displacementBrushInterpolation: 'nearest' | 'bilinear';
  displacementBrushEdgeMode: 'clamp' | 'wrap' | 'mirror';
  displacementBrushIterations: number;
  displacementBrushSpill: number;
  flowBrushBlockSize: number;
  flowBrushPropagation: number;
  flowBrushIterations: number;
  flowBrushDirectionInfluence: number;
  flowBrushVectorPersistence: number;
  flowBrushJitter: number;
  flowBrushDecay: number;
  flowBrushOverwrite: boolean;
  flowBrushLumaLock: number;
  flowBrushChromaLag: number;
  flowBrushTrailWidth: number;
  flowBrushFallbackAngle: number;
  cloneBrushMode: 'clean' | 'fragment' | 'slice' | 'packet' | 'rgb' | 'evolving';
  cloneBrushAlignment: 'aligned' | 'non-aligned';
  cloneBrushScaleJitter: number;
  cloneBrushRotationJitter: number;
  cloneBrushChannelSplit: number;
  cloneBrushTileFragmentation: number;
  cloneBrushRepetition: number;
  cloneBrushDecay: number;
  cloneBrushBlockSize: number;
  cloneBrushBlend: number;
  lineBrushOrientation: 'horizontal' | 'vertical' | 'stroke';
  lineBrushSource: 'leading' | 'center' | 'trailing';
  lineBrushRepeatCount: number;
  lineBrushStretch: number;
  lineBrushJitter: number;
  lineBrushRgbSplit: number;
  lineBrushDropout: number;
  lineBrushThickness: number;
  lineBrushSpill: number;
}

export interface GlitchContext {
  pixels: Uint8ClampedArray;
  originalPixels: Uint8ClampedArray;
  width: number;
  height: number;
  mask: Float32Array;
  bounds: Rectangle;
  writeBounds?: Rectangle;
  strength: number;
  pressure: number;
  seed: string;
  settings: AlgorithmSettings;
  movement?: Point;
  cloneSource?: Rectangle;
  feedbackMemory?: Uint8ClampedArray;
}

export interface GlitchResult {
  bounds: Rectangle;
  touchedPixels: number;
}

export interface GlitchAlgorithm {
  id: AlgorithmId;
  name: string;
  family: AlgorithmFamily;
  apply(context: GlitchContext): GlitchResult;
}

export interface BytePatch {
  start: number;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}

export interface HistoryAction {
  id: string;
  label: string;
  patches: BytePatch[];
  bounds?: Rectangle;
  timestamp: number;
  icon?: EffectIconId;
  affectedPixels?: number;
  affectedBytes?: number;
  detail?: string;
  imageBrush?: {
    assetName: string;
    stampCount: number;
    mutationMode: string;
    presetName: string;
    changedPixels: number;
  };
  layerBefore?: LayerStackSnapshot;
  layerAfter?: LayerStackSnapshot;
}

export interface EditorDocument {
  width: number;
  height: number;
  original: Uint8ClampedArray;
  pixels: Uint8ClampedArray;
  fileName: string;
  mimeType: string;
  rawOriginal: Uint8Array | null;
  rawMutated: Uint8Array | null;
  dirty: boolean;
}

export interface Preset {
  id: string;
  name: string;
  algorithm: AlgorithmId;
  brush: Partial<BrushSettings>;
  settings: Partial<AlgorithmSettings>;
  custom?: boolean;
}

export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  locked: boolean;
}

export type LayerBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'difference';

export interface SparseLayerTileSnapshot {
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface SparseLayerSnapshot extends Omit<LayerInfo, 'blendMode'> {
  blendMode: LayerBlendMode;
  tiles: SparseLayerTileSnapshot[];
}

export interface LayerStackSnapshot {
  version: 1;
  width: number;
  height: number;
  activeLayerId: string;
  soloLayerId: string | null;
  layers: SparseLayerSnapshot[];
}
