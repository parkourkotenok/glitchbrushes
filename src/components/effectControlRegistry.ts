import { defaultAlgorithmSettings } from '../glitchAlgorithms';
import type { AlgorithmId, AlgorithmSettings } from '../types';
import { createSeededRandom } from '../utils/prng';

type NumericKey = {
  [K in keyof AlgorithmSettings]: AlgorithmSettings[K] extends number ? K : never;
}[keyof AlgorithmSettings];
type BooleanKey = {
  [K in keyof AlgorithmSettings]: AlgorithmSettings[K] extends boolean ? K : never;
}[keyof AlgorithmSettings];
type SelectKey = {
  [K in keyof AlgorithmSettings]: AlgorithmSettings[K] extends string | number ? K : never;
}[keyof AlgorithmSettings];

export type EffectControlGroup = 'primary' | 'fine';
export interface EffectControlOption {
  value: string | number;
  label: string;
}
interface ControlBase {
  label: string;
  description?: string;
  group: EffectControlGroup;
  condition?: (settings: AlgorithmSettings) => boolean;
}
export interface SliderEffectControl extends ControlBase {
  kind: 'slider';
  key: NumericKey;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  resetValue: number;
}
export interface RangeEffectControl extends ControlBase {
  kind: 'range';
  keys: readonly [NumericKey, NumericKey];
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  resetValue: readonly [number, number];
}
export interface AxisEffectControl extends ControlBase {
  kind: 'axis';
  keys: readonly [NumericKey, NumericKey];
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  resetValue: readonly [number, number];
}
export interface SelectEffectControl extends ControlBase {
  kind: 'select' | 'segmented';
  key: SelectKey;
  options: readonly EffectControlOption[];
  resetValue: string | number;
}
export interface ToggleEffectControl extends ControlBase {
  kind: 'toggle';
  key: BooleanKey;
  resetValue: boolean;
}
export interface CustomEffectControl extends ControlBase {
  kind: 'custom';
  component:
    'clone-source' | 'feedback-memory' | 'meta-recipe' | 'channel-shift' | 'jpeg-resample-presets';
}
export type EffectControl =
  | SliderEffectControl
  | RangeEffectControl
  | AxisEffectControl
  | SelectEffectControl
  | ToggleEffectControl
  | CustomEffectControl;

const defaults: AlgorithmSettings = defaultAlgorithmSettings;
const option = (value: string | number, label: string): EffectControlOption => ({ value, label });
const slider = (
  key: NumericKey,
  label: string,
  group: EffectControlGroup,
  min: number,
  max: number,
  step = 1,
  suffix = '',
  condition?: (settings: AlgorithmSettings) => boolean,
): SliderEffectControl => ({
  kind: 'slider',
  key,
  label,
  group,
  min,
  max,
  step,
  suffix,
  resetValue: defaults[key],
  condition,
});
const range = (
  keys: readonly [NumericKey, NumericKey],
  label: string,
  group: EffectControlGroup,
  min: number,
  max: number,
  step = 1,
  suffix = '',
): RangeEffectControl => ({
  kind: 'range',
  keys,
  label,
  group,
  min,
  max,
  step,
  suffix,
  resetValue: [defaults[keys[0]], defaults[keys[1]]],
});
const axis = (
  keys: readonly [NumericKey, NumericKey],
  label: string,
  group: EffectControlGroup,
  min: number,
  max: number,
  step = 1,
  suffix = '',
): AxisEffectControl => ({
  kind: 'axis',
  keys,
  label,
  group,
  min,
  max,
  step,
  suffix,
  resetValue: [defaults[keys[0]], defaults[keys[1]]],
});
const select = (
  key: SelectKey,
  label: string,
  group: EffectControlGroup,
  options: readonly EffectControlOption[],
  condition?: (settings: AlgorithmSettings) => boolean,
): SelectEffectControl => ({
  kind: 'select',
  key,
  label,
  group,
  options,
  resetValue: defaults[key],
  condition,
});
const segmented = (
  key: SelectKey,
  label: string,
  group: EffectControlGroup,
  options: readonly EffectControlOption[],
): SelectEffectControl => ({ ...select(key, label, group, options), kind: 'segmented' });
const toggle = (
  key: BooleanKey,
  label: string,
  group: EffectControlGroup,
  condition?: (settings: AlgorithmSettings) => boolean,
): ToggleEffectControl => ({
  kind: 'toggle',
  key,
  label,
  group,
  resetValue: defaults[key],
  condition,
});
const custom = (
  component: CustomEffectControl['component'],
  group: EffectControlGroup,
): CustomEffectControl => ({ kind: 'custom', component, group, label: component });

const orientation = [
  option('horizontal', 'Horizontal'),
  option('vertical', 'Vertical'),
  option('mixed', 'Mixed'),
];
const strokeOrientation = [
  option('horizontal', 'Horizontal'),
  option('vertical', 'Vertical'),
  option('stroke', 'Along stroke'),
  option('perpendicular', 'Across stroke'),
];

export const effectControlRegistry: Partial<Record<AlgorithmId, readonly EffectControl[]>> = {
  'pixel-sort-brush': [
    select('sortBrushDirection', 'Direction', 'primary', strokeOrientation),
    select('sortBrushProperty', 'Sort by', 'primary', [
      option('luminance', 'Brightness'),
      option('hue', 'Hue'),
      option('saturation', 'Saturation'),
      option('rgb-sum', 'RGB total'),
    ]),
    range(['sortBrushThresholdLow', 'sortBrushThresholdHigh'], 'Tones', 'primary', 0, 255),
    range(
      ['sortBrushIntervalMin', 'sortBrushIntervalMax'],
      'Run length',
      'primary',
      2,
      640,
      1,
      ' px',
    ),
    slider('sortBrushDisorder', 'Disorder', 'primary', 0, 0.8, 0.01),
    slider('sortBrushLength', 'Sort distance', 'fine', 24, 600, 1, ' px'),
    slider('sortBrushEdgeSoftness', 'Edge fade', 'fine', 0, 32, 1, ' px'),
    toggle('sortBrushReverse', 'Reverse order', 'fine'),
  ],
  'feedback-brush': [
    slider('feedbackBrushEchoCount', 'Echoes', 'primary', 2, 18),
    axis(
      ['feedbackBrushOffsetX', 'feedbackBrushOffsetY'],
      'Echo offset',
      'primary',
      -100,
      100,
      1,
      ' px',
    ),
    slider('feedbackBrushScale', 'Scale', 'primary', 0.92, 1.1, 0.001),
    slider('feedbackBrushOpacityDecay', 'Fade', 'primary', 0.1, 0.98, 0.01),
    slider('feedbackBrushRgbDelay', 'RGB delay', 'primary', 0, 40, 1, ' px'),
    custom('feedback-memory', 'fine'),
    slider('feedbackBrushRotation', 'Rotation', 'fine', -12, 12, 0.1, '°'),
    slider('feedbackBrushBrightnessDecay', 'Brightness fade', 'fine', 0.55, 1.2, 0.01),
    select('feedbackBrushBlendMode', 'Blend', 'fine', [
      option('normal', 'Normal'),
      option('screen', 'Screen'),
      option('multiply', 'Multiply'),
      option('difference', 'Difference'),
      option('lighten', 'Lighten'),
    ]),
    slider('feedbackBrushPersistence', 'Memory persistence', 'fine', 0.1, 1, 0.01),
  ],
  'displacement-brush': [
    select('displacementBrushSource', 'Field', 'primary', [
      option('noise', 'Noise'),
      option('waves', 'Waves'),
      option('pressure', 'Pressure'),
      option('luminance', 'Brightness'),
      option('edges', 'Edges'),
      option('radial', 'Radial'),
      option('vortex', 'Vortex'),
    ]),
    axis(
      ['displacementBrushStrengthX', 'displacementBrushStrengthY'],
      'Strength',
      'primary',
      -160,
      160,
      1,
      ' px',
    ),
    slider('displacementBrushScale', 'Field scale', 'primary', 4, 300, 1, ' px'),
    select('displacementBrushInterpolation', 'Texture', 'primary', [
      option('nearest', 'Hard pixels'),
      option('bilinear', 'Smooth'),
    ]),
    slider('displacementBrushRoughness', 'Roughness', 'primary', 0.05, 1, 0.01),
    slider('displacementBrushIterations', 'Passes', 'fine', 1, 8),
    select('displacementBrushEdgeMode', 'Edge treatment', 'fine', [
      option('clamp', 'Clamp'),
      option('wrap', 'Wrap'),
      option('mirror', 'Mirror'),
    ]),
    slider('displacementBrushOctaves', 'Noise detail', 'fine', 1, 6, 1, '', (s) =>
      ['noise', 'radial', 'vortex'].includes(s.displacementBrushSource),
    ),
  ],
  'flow-mosh-brush': [
    slider('flowBrushBlockSize', 'Block size', 'primary', 4, 72, 1, ' px'),
    slider('flowBrushPropagation', 'Trail length', 'primary', 20, 600, 1, ' px'),
    slider('flowBrushDirectionInfluence', 'Follow stroke', 'primary', 0, 1, 0.01),
    slider('flowBrushDecay', 'Decay', 'primary', 0, 0.9, 0.01),
    slider('flowBrushChromaLag', 'Chroma lag', 'primary', 0, 64, 1, ' px'),
    slider('flowBrushIterations', 'Passes', 'fine', 2, 16),
    slider('flowBrushVectorPersistence', 'Flow persistence', 'fine', 0.1, 1, 0.01),
    slider('flowBrushJitter', 'Jitter', 'fine', 0, 1, 0.01),
    slider('flowBrushLumaLock', 'Preserve brightness', 'fine', 0, 1, 0.01),
    toggle('flowBrushOverwrite', 'Overwrite blocks', 'fine'),
  ],
  'clone-corruption-brush': [
    custom('clone-source', 'primary'),
    select('cloneBrushMode', 'Clone style', 'primary', [
      option('clean', 'Clean Clone'),
      option('fragment', 'Fragment Clone'),
      option('slice', 'Slice Clone'),
      option('packet', 'Packet Clone'),
      option('rgb', 'RGB Clone'),
      option('evolving', 'Evolving Clone'),
    ]),
    slider('cloneBrushBlockSize', 'Fragment size', 'primary', 4, 80, 1, ' px'),
    slider('cloneBrushRepetition', 'Repeats', 'primary', 1, 10),
    slider('cloneBrushBlend', 'Mix', 'primary', 0.1, 1, 0.01),
    select('cloneBrushAlignment', 'Alignment', 'fine', [
      option('aligned', 'Aligned'),
      option('non-aligned', 'Reuse source'),
    ]),
    slider('cloneBrushTileFragmentation', 'Fragmentation', 'fine', 0, 1, 0.01),
    slider('cloneBrushDecay', 'Decay', 'fine', 0.1, 1, 0.01),
    slider('cloneBrushScaleJitter', 'Scale variation', 'fine', 0, 0.8, 0.01),
    slider('cloneBrushRotationJitter', 'Rotation variation', 'fine', 0, 45, 0.1, '°'),
  ],
  'line-freeze-brush': [
    select('lineBrushOrientation', 'Orientation', 'primary', strokeOrientation.slice(0, 3)),
    select('lineBrushSource', 'Source edge', 'primary', [
      option('leading', 'Leading'),
      option('center', 'Centre'),
      option('trailing', 'Trailing'),
    ]),
    slider('lineBrushRepeatCount', 'Repeats', 'primary', 1, 24),
    slider('lineBrushStretch', 'Stretch', 'primary', 0.25, 8, 0.01),
    slider('lineBrushThickness', 'Thickness', 'primary', 1, 24, 1, ' px'),
    slider('lineBrushRgbSplit', 'RGB split', 'fine', 0, 40, 1, ' px'),
    slider('lineBrushJitter', 'Jitter', 'fine', 0, 40, 1, ' px'),
    slider('lineBrushDropout', 'Dropout', 'fine', 0, 0.85, 0.01),
  ],
  'mirror-fold-brush': [
    segmented('mirrorFoldSide', 'Fold side', 'primary', [
      option('left', 'Left'),
      option('right', 'Right'),
      option('both', 'Both'),
    ]),
    segmented('mirrorFoldAxis', 'Axis', 'primary', [
      option('stroke', 'Along stroke'),
      option('perpendicular', 'Across stroke'),
    ]),
    slider('mirrorFoldOffset', 'Offset', 'primary', 0, 96, 1, ' px'),
    slider('mirrorFoldMix', 'Mix', 'primary', 0, 1, 0.01),
    slider('mirrorFoldRepetitions', 'Repetitions', 'fine', 1, 3),
    slider('mirrorFoldRgbSlip', 'RGB slip', 'fine', 0, 20, 1, ' px'),
    select('mirrorFoldEdgeMode', 'Edge treatment', 'fine', [
      option('clamp', 'Clamp'),
      option('mirror', 'Mirror'),
      option('wrap', 'Wrap'),
    ]),
    slider('mirrorFoldFalloff', 'Falloff', 'fine', 0, 1, 0.01),
    slider('mirrorFoldFallbackAngle', 'Still-stroke angle', 'fine', -180, 180, 1, '°'),
  ],
  'raster-loom-brush': [
    slider('rasterLoomStripWidth', 'Strip width', 'primary', 2, 64, 1, ' px'),
    slider('rasterLoomSourceOffset', 'Source offset', 'primary', 1, 120, 1, ' px'),
    slider('rasterLoomWeaveDepth', 'Weave depth', 'primary', 0, 1, 0.01),
    segmented('rasterLoomDirection', 'Direction', 'primary', [
      option('stroke', 'Along stroke'),
      option('perpendicular', 'Across stroke'),
    ]),
    slider('rasterLoomMix', 'Mix', 'primary', 0, 1, 0.01),
    slider('rasterLoomGap', 'Gap', 'fine', 0, 12, 1, ' px'),
    slider('rasterLoomRgbSlip', 'RGB slip', 'fine', 0, 16, 1, ' px'),
    slider('rasterLoomAlternation', 'Alternation', 'fine', 1, 6),
    slider('rasterLoomEdgeSoftness', 'Edge fade', 'fine', 0, 1, 0.01),
    slider('rasterLoomFallbackAngle', 'Still-stroke angle', 'fine', -180, 180, 1, '°'),
  ],
  'contour-crawl-brush': [
    slider('contourCrawlEdgeThreshold', 'Edge sensitivity', 'primary', 0, 255),
    slider('contourCrawlLength', 'Trail length', 'primary', 1, 160, 1, ' px'),
    slider('contourCrawlRepeatCount', 'Repeats', 'primary', 1, 8),
    slider('contourCrawlDecay', 'Decay', 'primary', 0, 1, 0.01),
    slider('contourCrawlMix', 'Mix', 'primary', 0, 1, 0.01),
    slider('contourCrawlLineWidth', 'Line width', 'fine', 1, 8, 1, ' px'),
    slider('contourCrawlRgbSplit', 'RGB split', 'fine', 0, 12, 1, ' px'),
    slider('contourCrawlSideDrift', 'Side drift', 'fine', 0, 20, 1, ' px'),
    segmented('contourCrawlEdgePolarity', 'Edge polarity', 'fine', [
      option('dark', 'Dark'),
      option('light', 'Light'),
      option('both', 'Both'),
    ]),
    slider('contourCrawlFallbackAngle', 'Still-stroke angle', 'fine', -180, 180, 1, '°'),
  ],
  'jpeg-resample-brush': [
    custom('jpeg-resample-presets', 'primary'),
    slider('jpegResampleQuality', 'JPEG quality', 'primary', 1, 100, 1),
    slider('jpegResampleTargetLongEdge', 'Codec resolution', 'primary', 28, 2048, 1, ' px'),
    slider('jpegResampleMix', 'Mix', 'primary', 0, 1, 0.01),
    toggle('jpegResampleNoise', 'Apply noise', 'primary'),
    toggle('jpegResampleSharpen', 'Apply sharpen', 'primary'),
    slider('jpegResamplePasses', 'Recompression passes', 'fine', 1, 4, 1),
    slider(
      'jpegResampleNoiseAmount',
      'Noise amount',
      'fine',
      0,
      1,
      0.01,
      '',
      (s) => s.jpegResampleNoise,
    ),
    select(
      'jpegResampleNoiseType',
      'Noise colour',
      'fine',
      [option('luma', 'Luma'), option('rgb', 'RGB')],
      (s) => s.jpegResampleNoise,
    ),
    slider(
      'jpegResampleSharpenAmount',
      'Sharpen amount',
      'fine',
      0,
      1,
      0.01,
      '',
      (s) => s.jpegResampleSharpen,
    ),
    segmented('jpegResampleUpscale', 'Upscale', 'fine', [
      option('smooth', 'Smooth'),
      option('pixelated', 'Pixelated'),
    ]),
    slider('jpegResampleChromaBleed', 'Chroma bleed', 'fine', 0, 1, 0.01),
  ],
  'slice-displacement': [
    segmented('sliceOrientation', 'Orientation', 'primary', orientation),
    slider('sliceCount', 'Slices', 'primary', 1, 12),
    range(['sliceMinThickness', 'sliceMaxThickness'], 'Thickness', 'primary', 1, 96, 1, ' px'),
    range(['sliceMinOffset', 'sliceMaxOffset'], 'Distance', 'primary', 1, 320, 1, ' px'),
    select('sliceEdgeMode', 'Edge treatment', 'primary', [
      option('clamp', 'Clamp'),
      option('wrap', 'Wrap'),
      option('neighbor', 'Neighbour'),
    ]),
  ],
  'block-corruption': [
    select('blockCorruptionMode', 'Failure style', 'primary', [
      option('shift', 'Shift'),
      option('repeat', 'Repeat'),
      option('dropout', 'Dropout'),
      option('neighbor-inherit', 'Neighbour'),
      option('swap', 'Swap'),
      option('stretch', 'Stretch'),
      option('mixed-packet-loss', 'Mixed packet loss'),
    ]),
    slider('packetBlockSize', 'Block size', 'primary', 4, 96, 1, ' px'),
    slider('packetLossDensity', 'Coverage', 'primary', 0.05, 1, 0.01),
    slider('packetRepeatRadius', 'Offset', 'primary', 4, 260, 1, ' px'),
    slider('blockCorruptionMix', 'Mix', 'primary', 0.05, 1, 0.01),
    select('blockCorruptionDirection', 'Direction', 'fine', orientation),
    slider('macroblockDuplicateChance', 'Repeat chance', 'fine', 0, 1, 0.01, '', (s) =>
      ['repeat', 'mixed-packet-loss'].includes(s.blockCorruptionMode),
    ),
    slider('packetFlatChance', 'Dropout chance', 'fine', 0, 1, 0.01, '', (s) =>
      ['dropout', 'mixed-packet-loss'].includes(s.blockCorruptionMode),
    ),
    slider('macroblockNeighborChance', 'Neighbour inheritance', 'fine', 0, 1, 0.01, '', (s) =>
      ['neighbor-inherit', 'mixed-packet-loss'].includes(s.blockCorruptionMode),
    ),
    slider('macroblockStretchChance', 'Stretch chance', 'fine', 0, 1, 0.01, '', (s) =>
      ['stretch', 'mixed-packet-loss'].includes(s.blockCorruptionMode),
    ),
  ],
  'datamosh-smear': [
    select('datamoshDirection', 'Direction', 'primary', [
      option('stroke', 'Stroke'),
      option('fixed', 'Fixed'),
      option('random', 'Random'),
    ]),
    slider('datamoshLength', 'Trail length', 'primary', 12, 480, 1, ' px'),
    axis(['datamoshBlockWidth', 'datamoshBlockHeight'], 'Block shape', 'primary', 2, 128, 1, ' px'),
    slider('datamoshDecay', 'Decay', 'primary', 0, 0.95, 0.01),
    slider('datamoshChroma', 'Chroma drift', 'primary', 0, 48, 1, ' px'),
    slider('datamoshPersistence', 'Persistence', 'fine', 0.1, 1.5, 0.01),
    slider('datamoshBlend', 'Mix', 'fine', 0.1, 1, 0.01),
    slider('datamoshJitter', 'Jitter', 'fine', 0, 80, 1, ' px'),
    slider('datamoshLumaHold', 'Preserve brightness', 'fine', 0, 1, 0.01),
  ],
  'rgb-chunk-split': [
    slider('rgbRegionSize', 'Region size', 'primary', 12, 320, 1, ' px'),
    slider('rgbChunkOffset', 'RGB separation', 'primary', 1, 96, 1, ' px'),
    slider('rgbChunkBlend', 'Mix', 'primary', 0.1, 1, 0.01),
    slider('rgbEdgeSoftness', 'Edge fade', 'primary', 1, 32, 1, ' px'),
    toggle('rgbRandomOffset', 'Randomize offset', 'primary'),
  ],
  'scanline-tear-pro': [
    slider('tearBandCount', 'Bands', 'primary', 1, 20),
    range(['tearMinThickness', 'tearMaxThickness'], 'Band thickness', 'primary', 1, 80, 1, ' px'),
    slider('tearShift', 'Shift', 'primary', 2, 320, 1, ' px'),
    slider('tearColorSplit', 'RGB split', 'primary', 0, 48, 1, ' px'),
    slider('structuralDensity', 'Damage mix', 'primary', 0.1, 1, 0.01),
    slider('tearDuplication', 'Duplication', 'fine', 0, 1, 0.01),
    slider('tearDropout', 'Dropout', 'fine', 0, 1, 0.01),
    slider('tearJitter', 'Jitter', 'fine', 0, 80, 1, ' px'),
  ],
  'codec-block-damage': [
    select('codecBlockDamageMode', 'Failure style', 'primary', [
      option('compression-loss', 'Compression loss'),
      option('tile-scramble', 'Tile scramble'),
      option('coefficient-dropout', 'Coefficient dropout'),
      option('block-repeat', 'Block repeat'),
      option('recompressed', 'Recompressed'),
      option('mixed-codec-failure', 'Mixed failure'),
    ]),
    select('compressionTileSize', 'Tile size', 'primary', [
      option(8, '8 × 8'),
      option(16, '16 × 16'),
    ]),
    slider('compressionQuantization', 'Compression', 'primary', 0.05, 1, 0.01),
    slider('codecHighFrequencyLoss', 'Detail loss', 'primary', 0, 1, 0.01),
    slider('codecMix', 'Mix', 'primary', 0.05, 1, 0.01),
    slider('codecCoefficientDropout', 'Coefficient loss', 'fine', 0, 1, 0.01, '', (s) =>
      ['coefficient-dropout', 'mixed-codec-failure'].includes(s.codecBlockDamageMode),
    ),
    slider('tileShuffle', 'Tile shuffle', 'fine', 0, 1, 0.01, '', (s) =>
      ['tile-scramble', 'mixed-codec-failure'].includes(s.codecBlockDamageMode),
    ),
    slider('compressionTileOffset', 'Neighbour copy', 'fine', 0, 1, 0.01),
    slider('codecBoundaryStrength', 'Block edges', 'fine', 0, 1, 0.01),
    slider('codecRinging', 'Ringing', 'fine', 0, 1, 0.01, '', (s) =>
      ['recompressed', 'mixed-codec-failure'].includes(s.codecBlockDamageMode),
    ),
  ],
  'row-column-repeat': [
    segmented('repeatOrientation', 'Orientation', 'primary', [
      option('horizontal', 'Rows'),
      option('vertical', 'Columns'),
      option('mixed', 'Mixed'),
    ]),
    slider('repeatLength', 'Band thickness', 'primary', 1, 48, 1, ' px'),
    slider('repeatCount', 'Repeats', 'primary', 1, 24),
    slider('repeatJitter', 'Jitter', 'primary', 0, 40, 1, ' px'),
    slider('repeatFade', 'Fade', 'primary', 0, 2, 0.01),
  ],
  'structural-mixed': [
    custom('meta-recipe', 'primary'),
    range(['structuralMixMinEffects', 'structuralMixMaxEffects'], 'Effect count', 'primary', 2, 3),
    slider('structuralDensity', 'Coverage', 'primary', 0.1, 1, 0.01),
    custom('meta-recipe', 'fine'),
  ],
  'palette-collapse': [
    slider('paletteLevels', 'Colour levels', 'primary', 2, 32),
    toggle('dither', 'Ordered dither', 'primary'),
  ],
  'channel-shift': [custom('channel-shift', 'primary')],
  'byte-swap': [
    select('swapMode', 'Swap pattern', 'primary', [
      option('bgr', 'RGB → BGR'),
      option('grb', 'RGB → GRB'),
      option('cycle', 'Cycle'),
      option('random', 'Random'),
      option('neighbor', 'Swap neighbour'),
    ]),
  ],
};

export function effectControls(
  algorithm: AlgorithmId,
  group: EffectControlGroup,
  settings: AlgorithmSettings,
): readonly EffectControl[] {
  return (effectControlRegistry[algorithm] ?? []).filter(
    (control) => control.group === group && (!control.condition || control.condition(settings)),
  );
}

function assignControlValue(
  target: AlgorithmSettings,
  key: keyof AlgorithmSettings,
  value: string | number | boolean,
): void {
  Object.assign(target, { [key]: value });
}

export function randomizeEffectSettings(
  algorithm: AlgorithmId,
  current: AlgorithmSettings,
  seed: string,
  mode: 'balanced' | 'wild',
): AlgorithmSettings {
  const random = createSeededRandom(`effect-ui:${algorithm}:${seed}:${mode}`);
  const next = { ...current };
  for (const control of effectControlRegistry[algorithm] ?? []) {
    if (control.kind === 'custom' || (control.condition && !control.condition(next))) continue;
    if (control.kind === 'slider') {
      const inset = mode === 'balanced' ? (control.max - control.min) * 0.18 : 0;
      const raw = control.min + inset + random.next() * (control.max - control.min - inset * 2);
      const value = Math.round(raw / (control.step ?? 1)) * (control.step ?? 1);
      assignControlValue(next, control.key, Number(value.toFixed(4)));
    } else if (control.kind === 'range' || control.kind === 'axis') {
      const first = control.min + random.next() * (control.max - control.min);
      const second = control.min + random.next() * (control.max - control.min);
      const low = control.kind === 'range' ? Math.min(first, second) : first;
      const high = control.kind === 'range' ? Math.max(first, second) : second;
      assignControlValue(
        next,
        control.keys[0],
        Math.round(low / (control.step ?? 1)) * (control.step ?? 1),
      );
      assignControlValue(
        next,
        control.keys[1],
        Math.round(high / (control.step ?? 1)) * (control.step ?? 1),
      );
    } else if (control.kind === 'toggle') {
      assignControlValue(next, control.key, random.next() > 0.5);
    } else {
      assignControlValue(
        next,
        control.key,
        control.options[Math.floor(random.next() * control.options.length)]!.value,
      );
    }
  }
  return next;
}

export function resetEffectSettings(
  algorithm: AlgorithmId,
  current: AlgorithmSettings,
): AlgorithmSettings {
  const next = { ...current };
  for (const control of effectControlRegistry[algorithm] ?? []) {
    if (control.kind === 'custom') continue;
    if (control.kind === 'range' || control.kind === 'axis') {
      assignControlValue(next, control.keys[0], control.resetValue[0]);
      assignControlValue(next, control.keys[1], control.resetValue[1]);
    } else {
      assignControlValue(next, control.key, control.resetValue);
    }
  }
  return next;
}
