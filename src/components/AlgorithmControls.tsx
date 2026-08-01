import { MousePointer2, RotateCcw, X } from 'lucide-react';
import type { AlgorithmId, AlgorithmSettings, Rectangle } from '../types';
import { SliderField } from './SliderField';
import { Toggle, AxisPair } from './ui/controls';

/** Per-algorithm EFFECT controls, extracted from the App monolith. */
export function AlgorithmControls({
  algorithm,
  settings,
  update,
  cloneSource,
  cloneSourcePickMode,
  feedbackMemoryReady,
  onPickCloneSource,
  onClearCloneSource,
  onResetFeedback,
  metaSeed,
  metaRecipeLocked,
  onMetaRecipeLockChange,
  onNewMetaRecipe,
}: {
  algorithm: AlgorithmId;
  settings: AlgorithmSettings;
  update: <K extends keyof AlgorithmSettings>(key: K, value: AlgorithmSettings[K]) => void;
  cloneSource: Rectangle | null;
  cloneSourcePickMode: boolean;
  feedbackMemoryReady: boolean;
  onPickCloneSource(): void;
  onClearCloneSource(): void;
  onResetFeedback(): void;
  metaSeed: string;
  metaRecipeLocked: boolean;
  onMetaRecipeLockChange(value: boolean): void;
  onNewMetaRecipe(): void;
}) {
  if (algorithm === 'pixel-sort-brush') {
    return (
      <>
        <label className="inline-select">
          <span>Direction</span>
          <select
            value={settings.sortBrushDirection}
            onChange={(event) =>
              update(
                'sortBrushDirection',
                event.target.value as AlgorithmSettings['sortBrushDirection'],
              )
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="stroke">Along stroke</option>
            <option value="perpendicular">Perpendicular</option>
          </select>
        </label>
        <label className="inline-select">
          <span>Sort property</span>
          <select
            value={settings.sortBrushProperty}
            onChange={(event) =>
              update(
                'sortBrushProperty',
                event.target.value as AlgorithmSettings['sortBrushProperty'],
              )
            }
          >
            <option value="luminance">Luminance</option>
            <option value="hue">Hue</option>
            <option value="saturation">Saturation</option>
            <option value="rgb-sum">RGB sum</option>
          </select>
        </label>
        <SliderField
          label="Threshold low"
          value={settings.sortBrushThresholdLow}
          min={0}
          max={255}
          onChange={(value) => update('sortBrushThresholdLow', value)}
        />
        <SliderField
          label="Threshold high"
          value={settings.sortBrushThresholdHigh}
          min={0}
          max={255}
          onChange={(value) => update('sortBrushThresholdHigh', value)}
        />
        <SliderField
          label="Interval minimum"
          value={settings.sortBrushIntervalMin}
          min={2}
          max={80}
          suffix=" px"
          onChange={(value) => update('sortBrushIntervalMin', value)}
        />
        <SliderField
          label="Interval maximum"
          value={settings.sortBrushIntervalMax}
          min={20}
          max={640}
          suffix=" px"
          onChange={(value) => update('sortBrushIntervalMax', value)}
        />
        <SliderField
          label="Sort length"
          value={settings.sortBrushLength}
          min={24}
          max={600}
          suffix=" px"
          onChange={(value) => update('sortBrushLength', value)}
        />
        <SliderField
          label="Disorder"
          value={settings.sortBrushDisorder}
          min={0}
          max={0.8}
          step={0.01}
          onChange={(value) => update('sortBrushDisorder', value)}
        />
        <SliderField
          label="Edge softness"
          value={settings.sortBrushEdgeSoftness}
          min={0}
          max={32}
          suffix=" px"
          onChange={(value) => update('sortBrushEdgeSoftness', value)}
        />
        <SliderField
          label="Spill"
          value={settings.sortBrushSpill}
          min={0}
          max={120}
          suffix=" px"
          onChange={(value) => update('sortBrushSpill', value)}
        />
        <Toggle
          label="Reverse order"
          checked={settings.sortBrushReverse}
          onChange={(value) => update('sortBrushReverse', value)}
        />
      </>
    );
  }
  if (algorithm === 'feedback-brush') {
    return (
      <>
        <div className={`advanced-state-row ${feedbackMemoryReady ? 'ready' : ''}`}>
          <span>Feedback memory</span>
          <strong>{feedbackMemoryReady ? 'READY' : 'EMPTY'}</strong>
          <button onClick={onResetFeedback}>
            <RotateCcw size={13} /> Reset Feedback
          </button>
        </div>
        <SliderField
          label="Echo count"
          value={settings.feedbackBrushEchoCount}
          min={2}
          max={18}
          onChange={(value) => update('feedbackBrushEchoCount', value)}
        />
        <SliderField
          label="Offset X"
          value={settings.feedbackBrushOffsetX}
          min={-100}
          max={100}
          suffix=" px"
          onChange={(value) => update('feedbackBrushOffsetX', value)}
        />
        <SliderField
          label="Offset Y"
          value={settings.feedbackBrushOffsetY}
          min={-100}
          max={100}
          suffix=" px"
          onChange={(value) => update('feedbackBrushOffsetY', value)}
        />
        <SliderField
          label="Echo scale"
          value={settings.feedbackBrushScale}
          min={0.92}
          max={1.1}
          step={0.001}
          onChange={(value) => update('feedbackBrushScale', value)}
        />
        <SliderField
          label="Rotation"
          value={settings.feedbackBrushRotation}
          min={-12}
          max={12}
          step={0.1}
          suffix="°"
          onChange={(value) => update('feedbackBrushRotation', value)}
        />
        <SliderField
          label="Opacity decay"
          value={settings.feedbackBrushOpacityDecay}
          min={0.1}
          max={0.98}
          step={0.01}
          onChange={(value) => update('feedbackBrushOpacityDecay', value)}
        />
        <SliderField
          label="Brightness decay"
          value={settings.feedbackBrushBrightnessDecay}
          min={0.55}
          max={1.2}
          step={0.01}
          onChange={(value) => update('feedbackBrushBrightnessDecay', value)}
        />
        <label className="inline-select">
          <span>Blend mode</span>
          <select
            value={settings.feedbackBrushBlendMode}
            onChange={(event) =>
              update(
                'feedbackBrushBlendMode',
                event.target.value as AlgorithmSettings['feedbackBrushBlendMode'],
              )
            }
          >
            <option value="normal">Normal</option>
            <option value="screen">Screen</option>
            <option value="multiply">Multiply</option>
            <option value="difference">Difference</option>
            <option value="lighten">Lighten</option>
          </select>
        </label>
        <SliderField
          label="RGB delay"
          value={settings.feedbackBrushRgbDelay}
          min={0}
          max={40}
          suffix=" px"
          onChange={(value) => update('feedbackBrushRgbDelay', value)}
        />
        <SliderField
          label="Memory persistence"
          value={settings.feedbackBrushPersistence}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('feedbackBrushPersistence', value)}
        />
      </>
    );
  }
  if (algorithm === 'displacement-brush') {
    return (
      <>
        <label className="inline-select">
          <span>Displacement source</span>
          <select
            value={settings.displacementBrushSource}
            onChange={(event) =>
              update(
                'displacementBrushSource',
                event.target.value as AlgorithmSettings['displacementBrushSource'],
              )
            }
          >
            <option value="noise">Noise</option>
            <option value="waves">Waves</option>
            <option value="pressure">Pressure</option>
            <option value="luminance">Luminance</option>
            <option value="edges">Edges</option>
            <option value="radial">Radial</option>
            <option value="vortex">Vortex</option>
          </select>
        </label>
        <SliderField
          label="Strength X"
          value={settings.displacementBrushStrengthX}
          min={-160}
          max={160}
          suffix=" px"
          onChange={(value) => update('displacementBrushStrengthX', value)}
        />
        <SliderField
          label="Strength Y"
          value={settings.displacementBrushStrengthY}
          min={-160}
          max={160}
          suffix=" px"
          onChange={(value) => update('displacementBrushStrengthY', value)}
        />
        <SliderField
          label="Field scale"
          value={settings.displacementBrushScale}
          min={4}
          max={300}
          suffix=" px"
          onChange={(value) => update('displacementBrushScale', value)}
        />
        <SliderField
          label="Roughness"
          value={settings.displacementBrushRoughness}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('displacementBrushRoughness', value)}
        />
        <SliderField
          label="Octaves"
          value={settings.displacementBrushOctaves}
          min={1}
          max={6}
          onChange={(value) => update('displacementBrushOctaves', value)}
        />
        <label className="inline-select">
          <span>Interpolation</span>
          <select
            value={settings.displacementBrushInterpolation}
            onChange={(event) =>
              update(
                'displacementBrushInterpolation',
                event.target.value as AlgorithmSettings['displacementBrushInterpolation'],
              )
            }
          >
            <option value="nearest">Nearest</option>
            <option value="bilinear">Bilinear</option>
          </select>
        </label>
        <label className="inline-select">
          <span>Edge mode</span>
          <select
            value={settings.displacementBrushEdgeMode}
            onChange={(event) =>
              update(
                'displacementBrushEdgeMode',
                event.target.value as AlgorithmSettings['displacementBrushEdgeMode'],
              )
            }
          >
            <option value="clamp">Clamp</option>
            <option value="wrap">Wrap</option>
            <option value="mirror">Mirror</option>
          </select>
        </label>
        <SliderField
          label="Iterations"
          value={settings.displacementBrushIterations}
          min={1}
          max={8}
          onChange={(value) => update('displacementBrushIterations', value)}
        />
        <SliderField
          label="Spill"
          value={settings.displacementBrushSpill}
          min={0}
          max={120}
          suffix=" px"
          onChange={(value) => update('displacementBrushSpill', value)}
        />
      </>
    );
  }
  if (algorithm === 'flow-mosh-brush') {
    return (
      <>
        <SliderField
          label="Block size"
          value={settings.flowBrushBlockSize}
          min={4}
          max={72}
          suffix=" px"
          onChange={(value) => update('flowBrushBlockSize', value)}
        />
        <SliderField
          label="Propagation"
          value={settings.flowBrushPropagation}
          min={20}
          max={600}
          suffix=" px"
          onChange={(value) => update('flowBrushPropagation', value)}
        />
        <SliderField
          label="Iterations"
          value={settings.flowBrushIterations}
          min={2}
          max={16}
          onChange={(value) => update('flowBrushIterations', value)}
        />
        <SliderField
          label="Stroke direction"
          value={settings.flowBrushDirectionInfluence}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('flowBrushDirectionInfluence', value)}
        />
        <SliderField
          label="Vector persistence"
          value={settings.flowBrushVectorPersistence}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('flowBrushVectorPersistence', value)}
        />
        <SliderField
          label="Jitter"
          value={settings.flowBrushJitter}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('flowBrushJitter', value)}
        />
        <SliderField
          label="Decay"
          value={settings.flowBrushDecay}
          min={0}
          max={0.9}
          step={0.01}
          onChange={(value) => update('flowBrushDecay', value)}
        />
        <SliderField
          label="Luma lock"
          value={settings.flowBrushLumaLock}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('flowBrushLumaLock', value)}
        />
        <SliderField
          label="Chroma lag"
          value={settings.flowBrushChromaLag}
          min={0}
          max={64}
          suffix=" px"
          onChange={(value) => update('flowBrushChromaLag', value)}
        />
        <SliderField
          label="Trail width"
          value={settings.flowBrushTrailWidth}
          min={8}
          max={220}
          suffix=" px"
          onChange={(value) => update('flowBrushTrailWidth', value)}
        />
        <SliderField
          label="Fallback angle"
          value={settings.flowBrushFallbackAngle}
          min={-180}
          max={180}
          suffix="°"
          onChange={(value) => update('flowBrushFallbackAngle', value)}
        />
        <Toggle
          label="Overwrite blocks"
          checked={settings.flowBrushOverwrite}
          onChange={(value) => update('flowBrushOverwrite', value)}
        />
      </>
    );
  }
  if (algorithm === 'clone-corruption-brush') {
    return (
      <>
        <div className={`advanced-state-row ${cloneSource ? 'ready' : ''}`}>
          <span>Owned source</span>
          <strong>
            {cloneSource
              ? `${cloneSource.width}×${cloneSource.height}`
              : cloneSourcePickMode
                ? 'PICKING…'
                : 'NOT SET'}
          </strong>
          <button onClick={onPickCloneSource}>
            <MousePointer2 size={13} /> {cloneSource ? 'Replace' : 'Pick source'}
          </button>
          <button onClick={onClearCloneSource} disabled={!cloneSource && !cloneSourcePickMode}>
            <X size={13} /> Clear
          </button>
        </div>
        <p className="fine-print">
          Alt + click on the image also captures the source. Selecting or clearing it never changes
          pixels or History.
        </p>
        <label className="inline-select">
          <span>Clone mode</span>
          <select
            value={settings.cloneBrushMode}
            onChange={(event) =>
              update('cloneBrushMode', event.target.value as AlgorithmSettings['cloneBrushMode'])
            }
          >
            <option value="clean">Clean Clone</option>
            <option value="fragment">Fragment Clone</option>
            <option value="slice">Slice Clone</option>
            <option value="packet">Packet Clone</option>
            <option value="rgb">RGB Clone</option>
            <option value="evolving">Evolving Clone</option>
          </select>
        </label>
        <label className="inline-select">
          <span>Source alignment</span>
          <select
            value={settings.cloneBrushAlignment}
            onChange={(event) =>
              update(
                'cloneBrushAlignment',
                event.target.value as AlgorithmSettings['cloneBrushAlignment'],
              )
            }
          >
            <option value="aligned">Aligned — source and destination move together</option>
            <option value="non-aligned">Non-aligned — reuse the picked source</option>
          </select>
        </label>
        <p className="fine-print">
          Aligned follows source and destination together like a conventional clone stamp.
          Non-aligned starts every stroke from the captured source region.
        </p>
        <SliderField
          label="Scale jitter"
          value={settings.cloneBrushScaleJitter}
          min={0}
          max={0.8}
          step={0.01}
          onChange={(value) => update('cloneBrushScaleJitter', value)}
        />
        <SliderField
          label="Rotation jitter"
          value={settings.cloneBrushRotationJitter}
          min={0}
          max={45}
          step={0.1}
          suffix="°"
          onChange={(value) => update('cloneBrushRotationJitter', value)}
        />
        <SliderField
          label="Channel split"
          value={settings.cloneBrushChannelSplit}
          min={0}
          max={48}
          suffix=" px"
          onChange={(value) => update('cloneBrushChannelSplit', value)}
        />
        <SliderField
          label="Tile fragmentation"
          value={settings.cloneBrushTileFragmentation}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('cloneBrushTileFragmentation', value)}
        />
        <SliderField
          label="Repetition"
          value={settings.cloneBrushRepetition}
          min={1}
          max={10}
          onChange={(value) => update('cloneBrushRepetition', value)}
        />
        <SliderField
          label="Decay"
          value={settings.cloneBrushDecay}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('cloneBrushDecay', value)}
        />
        <SliderField
          label="Block size"
          value={settings.cloneBrushBlockSize}
          min={4}
          max={80}
          suffix=" px"
          onChange={(value) => update('cloneBrushBlockSize', value)}
        />
        <SliderField
          label="Blend"
          value={settings.cloneBrushBlend}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('cloneBrushBlend', value)}
        />
      </>
    );
  }
  if (algorithm === 'line-freeze-brush') {
    return (
      <>
        <label className="inline-select">
          <span>Orientation</span>
          <select
            value={settings.lineBrushOrientation}
            onChange={(event) =>
              update(
                'lineBrushOrientation',
                event.target.value as AlgorithmSettings['lineBrushOrientation'],
              )
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="stroke">From stroke</option>
          </select>
        </label>
        <label className="inline-select">
          <span>Source line</span>
          <select
            value={settings.lineBrushSource}
            onChange={(event) =>
              update('lineBrushSource', event.target.value as AlgorithmSettings['lineBrushSource'])
            }
          >
            <option value="leading">Leading edge</option>
            <option value="center">Center</option>
            <option value="trailing">Trailing edge</option>
          </select>
        </label>
        <SliderField
          label="Repeat count"
          value={settings.lineBrushRepeatCount}
          min={1}
          max={24}
          onChange={(value) => update('lineBrushRepeatCount', value)}
        />
        <SliderField
          label="Stretch"
          value={settings.lineBrushStretch}
          min={0.25}
          max={8}
          step={0.01}
          onChange={(value) => update('lineBrushStretch', value)}
        />
        <SliderField
          label="Jitter"
          value={settings.lineBrushJitter}
          min={0}
          max={40}
          suffix=" px"
          onChange={(value) => update('lineBrushJitter', value)}
        />
        <SliderField
          label="RGB split"
          value={settings.lineBrushRgbSplit}
          min={0}
          max={40}
          suffix=" px"
          onChange={(value) => update('lineBrushRgbSplit', value)}
        />
        <SliderField
          label="Dropout"
          value={settings.lineBrushDropout}
          min={0}
          max={0.85}
          step={0.01}
          onChange={(value) => update('lineBrushDropout', value)}
        />
        <SliderField
          label="Thickness"
          value={settings.lineBrushThickness}
          min={1}
          max={24}
          suffix=" px"
          onChange={(value) => update('lineBrushThickness', value)}
        />
        <SliderField
          label="Spill"
          value={settings.lineBrushSpill}
          min={0}
          max={120}
          suffix=" px"
          onChange={(value) => update('lineBrushSpill', value)}
        />
      </>
    );
  }
  if (algorithm === 'slice-displacement') {
    return (
      <>
        <label className="inline-select">
          <span>Orientation</span>
          <select
            value={settings.sliceOrientation}
            onChange={(event) =>
              update(
                'sliceOrientation',
                event.target.value as AlgorithmSettings['sliceOrientation'],
              )
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <SliderField
          label="Slices per stamp"
          value={settings.sliceCount}
          min={1}
          max={12}
          onChange={(value) => update('sliceCount', value)}
        />
        <SliderField
          label="Min thickness"
          value={settings.sliceMinThickness}
          min={1}
          max={48}
          suffix=" px"
          onChange={(value) => update('sliceMinThickness', value)}
        />
        <SliderField
          label="Max thickness"
          value={settings.sliceMaxThickness}
          min={2}
          max={96}
          suffix=" px"
          onChange={(value) => update('sliceMaxThickness', value)}
        />
        <SliderField
          label="Min offset"
          value={settings.sliceMinOffset}
          min={1}
          max={160}
          suffix=" px"
          onChange={(value) => update('sliceMinOffset', value)}
        />
        <SliderField
          label="Max offset"
          value={settings.sliceMaxOffset}
          min={2}
          max={320}
          suffix=" px"
          onChange={(value) => update('sliceMaxOffset', value)}
        />
        <label className="inline-select">
          <span>Edge handling</span>
          <select
            value={settings.sliceEdgeMode}
            onChange={(event) =>
              update('sliceEdgeMode', event.target.value as AlgorithmSettings['sliceEdgeMode'])
            }
          >
            <option value="clamp">Clamp</option>
            <option value="wrap">Wrap</option>
            <option value="neighbor">Neighbor fill</option>
          </select>
        </label>
      </>
    );
  }
  if (algorithm === 'block-corruption') {
    return (
      <>
        <label className="inline-select">
          <span>Mode</span>
          <select
            value={settings.blockCorruptionMode}
            onChange={(event) =>
              update(
                'blockCorruptionMode',
                event.target.value as AlgorithmSettings['blockCorruptionMode'],
              )
            }
          >
            <option value="shift">Shift</option>
            <option value="repeat">Repeat</option>
            <option value="dropout">Dropout</option>
            <option value="neighbor-inherit">Neighbor Inherit</option>
            <option value="swap">Swap</option>
            <option value="stretch">Stretch</option>
            <option value="mixed-packet-loss">Mixed Packet Loss</option>
          </select>
        </label>
        <SliderField
          label="Block size"
          value={settings.packetBlockSize}
          min={4}
          max={96}
          suffix=" px"
          onChange={(value) => {
            update('packetBlockSize', value);
            update('macroblockMaxSize', value * 1.5);
          }}
        />
        <SliderField
          label="Block density"
          value={settings.packetLossDensity}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => {
            update('packetLossDensity', value);
            update('structuralDensity', value);
          }}
        />
        <SliderField
          label="Displacement"
          value={settings.packetRepeatRadius}
          min={4}
          max={260}
          suffix=" px"
          onChange={(value) => {
            update('packetRepeatRadius', value);
            update('macroblockOffset', value);
          }}
        />
        <SliderField
          label="Repeat chance"
          value={settings.macroblockDuplicateChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('macroblockDuplicateChance', value)}
        />
        <SliderField
          label="Dropout chance"
          value={settings.packetFlatChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('packetFlatChance', value)}
        />
        <SliderField
          label="Neighbor inheritance"
          value={settings.macroblockNeighborChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('macroblockNeighborChance', value)}
        />
        <SliderField
          label="Stretch"
          value={settings.macroblockStretchChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('macroblockStretchChance', value)}
        />
        <SliderField
          label="Alignment"
          value={settings.packetAlignment}
          min={1}
          max={32}
          suffix=" px"
          onChange={(value) => update('packetAlignment', value)}
        />
        <label className="inline-select">
          <span>Direction</span>
          <select
            value={settings.blockCorruptionDirection}
            onChange={(event) =>
              update(
                'blockCorruptionDirection',
                event.target.value as AlgorithmSettings['blockCorruptionDirection'],
              )
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <SliderField
          label="Mix"
          value={settings.blockCorruptionMix}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('blockCorruptionMix', value)}
        />
        <p className="fine-print">
          Mixed Packet Loss is the default artistic identity. The other modes isolate one
          block-failure behavior for predictable painting.
        </p>
      </>
    );
  }
  if (algorithm === 'macroblock-shift') {
    return (
      <>
        <SliderField
          label="Minimum block"
          value={settings.macroblockMinSize}
          min={4}
          max={64}
          suffix=" px"
          onChange={(value) => update('macroblockMinSize', value)}
        />
        <SliderField
          label="Maximum block"
          value={settings.macroblockMaxSize}
          min={8}
          max={160}
          suffix=" px"
          onChange={(value) => update('macroblockMaxSize', value)}
        />
        <SliderField
          label="Offset strength"
          value={settings.macroblockOffset}
          min={4}
          max={260}
          suffix=" px"
          onChange={(value) => update('macroblockOffset', value)}
        />
        <SliderField
          label="Block density"
          value={settings.structuralDensity}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('structuralDensity', value)}
        />
        <SliderField
          label="Duplicate chance"
          value={settings.macroblockDuplicateChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('macroblockDuplicateChance', value)}
        />
        <SliderField
          label="Neighbor copy"
          value={settings.macroblockNeighborChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('macroblockNeighborChance', value)}
        />
        <SliderField
          label="Swap chance"
          value={settings.macroblockSwapChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('macroblockSwapChance', value)}
        />
        <SliderField
          label="Stretch chance"
          value={settings.macroblockStretchChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('macroblockStretchChance', value)}
        />
      </>
    );
  }
  if (algorithm === 'datamosh-smear') {
    return (
      <>
        <label className="inline-select">
          <span>Direction</span>
          <select
            value={settings.datamoshDirection}
            onChange={(event) =>
              update(
                'datamoshDirection',
                event.target.value as AlgorithmSettings['datamoshDirection'],
              )
            }
          >
            <option value="stroke">Stroke vector</option>
            <option value="fixed">Fixed angle</option>
            <option value="random">Random</option>
          </select>
        </label>
        <SliderField
          label="Smear length"
          value={settings.datamoshLength}
          min={12}
          max={480}
          suffix=" px"
          onChange={(value) => update('datamoshLength', value)}
        />
        <SliderField
          label="Block width"
          value={settings.datamoshBlockWidth}
          min={4}
          max={128}
          suffix=" px"
          onChange={(value) => update('datamoshBlockWidth', value)}
        />
        <SliderField
          label="Block height"
          value={settings.datamoshBlockHeight}
          min={2}
          max={64}
          suffix=" px"
          onChange={(value) => update('datamoshBlockHeight', value)}
        />
        <SliderField
          label="Persistence"
          value={settings.datamoshPersistence}
          min={0.1}
          max={1.5}
          step={0.01}
          onChange={(value) => update('datamoshPersistence', value)}
        />
        <SliderField
          label="Decay"
          value={settings.datamoshDecay}
          min={0}
          max={0.95}
          step={0.01}
          onChange={(value) => update('datamoshDecay', value)}
        />
        <SliderField
          label="Blend"
          value={settings.datamoshBlend}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('datamoshBlend', value)}
        />
        <SliderField
          label="Direction jitter"
          value={settings.datamoshJitter}
          min={0}
          max={80}
          suffix=" px"
          onChange={(value) => update('datamoshJitter', value)}
        />
        <SliderField
          label="Chroma separation"
          value={settings.datamoshChroma}
          min={0}
          max={48}
          suffix=" px"
          onChange={(value) => update('datamoshChroma', value)}
        />
        <SliderField
          label="Luma hold"
          value={settings.datamoshLumaHold}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('datamoshLumaHold', value)}
        />
      </>
    );
  }
  if (algorithm === 'packet-loss') {
    return (
      <>
        <SliderField
          label="Block size"
          value={settings.packetBlockSize}
          min={4}
          max={96}
          suffix=" px"
          onChange={(value) => update('packetBlockSize', value)}
        />
        <SliderField
          label="Loss density"
          value={settings.packetLossDensity}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('packetLossDensity', value)}
        />
        <SliderField
          label="Repeat radius"
          value={settings.packetRepeatRadius}
          min={4}
          max={220}
          suffix=" px"
          onChange={(value) => update('packetRepeatRadius', value)}
        />
        <SliderField
          label="Flat fill chance"
          value={settings.packetFlatChance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('packetFlatChance', value)}
        />
        <SliderField
          label="Alignment"
          value={settings.packetAlignment}
          min={1}
          max={32}
          suffix=" px"
          onChange={(value) => update('packetAlignment', value)}
        />
        <SliderField
          label="Edge tearing"
          value={settings.packetEdgeTear}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('packetEdgeTear', value)}
        />
      </>
    );
  }
  if (algorithm === 'rgb-chunk-split') {
    return (
      <>
        <SliderField
          label="Region size"
          value={settings.rgbRegionSize}
          min={12}
          max={320}
          suffix=" px"
          onChange={(value) => update('rgbRegionSize', value)}
        />
        <SliderField
          label="Channel offset"
          value={settings.rgbChunkOffset}
          min={1}
          max={96}
          suffix=" px"
          onChange={(value) => update('rgbChunkOffset', value)}
        />
        <SliderField
          label="Blend strength"
          value={settings.rgbChunkBlend}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('rgbChunkBlend', value)}
        />
        <SliderField
          label="Edge softness"
          value={settings.rgbEdgeSoftness}
          min={1}
          max={32}
          suffix=" px"
          onChange={(value) => update('rgbEdgeSoftness', value)}
        />
        <Toggle
          label="Random offset"
          checked={settings.rgbRandomOffset}
          onChange={(value) => update('rgbRandomOffset', value)}
        />
      </>
    );
  }
  if (algorithm === 'compression-block-damage') {
    return (
      <>
        <label className="inline-select">
          <span>Aligned tile</span>
          <select
            value={settings.compressionTileSize}
            onChange={(event) =>
              update('compressionTileSize', Number(event.target.value) as 8 | 16)
            }
          >
            <option value={8}>8 × 8</option>
            <option value={16}>16 × 16</option>
          </select>
        </label>
        <SliderField
          label="Quantization"
          value={settings.compressionQuantization}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionQuantization', value)}
        />
        <SliderField
          label="Replication"
          value={settings.compressionReplication}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionReplication', value)}
        />
        <SliderField
          label="Scramble"
          value={settings.compressionScramble}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionScramble', value)}
        />
        <SliderField
          label="Tile offset"
          value={settings.compressionTileOffset}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionTileOffset', value)}
        />
        <SliderField
          label="Contrast boost"
          value={settings.compressionContrast}
          min={0.5}
          max={2.5}
          step={0.01}
          onChange={(value) => update('compressionContrast', value)}
        />
        <SliderField
          label="Chroma loss"
          value={settings.compressionChromaLoss}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionChromaLoss', value)}
        />
      </>
    );
  }
  if (algorithm === 'codec-block-damage') {
    return (
      <>
        <label className="inline-select">
          <span>Mode</span>
          <select
            value={settings.codecBlockDamageMode}
            onChange={(event) =>
              update(
                'codecBlockDamageMode',
                event.target.value as AlgorithmSettings['codecBlockDamageMode'],
              )
            }
          >
            <option value="compression-loss">Compression Loss</option>
            <option value="tile-scramble">Tile Scramble</option>
            <option value="coefficient-dropout">Coefficient Dropout</option>
            <option value="block-repeat">Block Repeat</option>
            <option value="recompressed">Recompressed</option>
            <option value="mixed-codec-failure">Mixed Codec Failure</option>
          </select>
        </label>
        <label className="inline-select">
          <span>Tile size</span>
          <select
            value={settings.compressionTileSize}
            onChange={(event) =>
              update('compressionTileSize', Number(event.target.value) as 8 | 16)
            }
          >
            <option value={8}>8 × 8</option>
            <option value={16}>16 × 16</option>
          </select>
        </label>
        <SliderField
          label="Quantization"
          value={settings.compressionQuantization}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionQuantization', value)}
        />
        <SliderField
          label="High-frequency loss"
          value={settings.codecHighFrequencyLoss}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('codecHighFrequencyLoss', value)}
        />
        <SliderField
          label="Coefficient dropout"
          value={settings.codecCoefficientDropout}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('codecCoefficientDropout', value)}
        />
        <SliderField
          label="Tile shuffle"
          value={settings.tileShuffle}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('tileShuffle', value)}
        />
        <SliderField
          label="Neighboring tile inheritance"
          value={settings.compressionTileOffset}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionTileOffset', value)}
        />
        <SliderField
          label="Block boundary strength"
          value={settings.codecBoundaryStrength}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('codecBoundaryStrength', value)}
        />
        <SliderField
          label="Chroma quality"
          value={1 - settings.compressionChromaLoss}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionChromaLoss', 1 - value)}
        />
        <SliderField
          label="Ringing"
          value={settings.codecRinging}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('codecRinging', value)}
        />
        <SliderField
          label="Repetition"
          value={settings.compressionReplication}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('compressionReplication', value)}
        />
        <SliderField
          label="Mix"
          value={settings.codecMix}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('codecMix', value)}
        />
      </>
    );
  }
  if (algorithm === 'scanline-tear-pro') {
    return (
      <>
        <SliderField
          label="Band count"
          value={settings.tearBandCount}
          min={1}
          max={20}
          onChange={(value) => update('tearBandCount', value)}
        />
        <SliderField
          label="Minimum thickness"
          value={settings.tearMinThickness}
          min={1}
          max={40}
          suffix=" px"
          onChange={(value) => update('tearMinThickness', value)}
        />
        <SliderField
          label="Maximum thickness"
          value={settings.tearMaxThickness}
          min={2}
          max={80}
          suffix=" px"
          onChange={(value) => update('tearMaxThickness', value)}
        />
        <SliderField
          label="Shift amount"
          value={settings.tearShift}
          min={2}
          max={320}
          suffix=" px"
          onChange={(value) => update('tearShift', value)}
        />
        <SliderField
          label="Duplication"
          value={settings.tearDuplication}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('tearDuplication', value)}
        />
        <SliderField
          label="Dropout"
          value={settings.tearDropout}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('tearDropout', value)}
        />
        <SliderField
          label="RGB split"
          value={settings.tearColorSplit}
          min={0}
          max={48}
          suffix=" px"
          onChange={(value) => update('tearColorSplit', value)}
        />
        <SliderField
          label="Direction jitter"
          value={settings.tearJitter}
          min={0}
          max={80}
          suffix=" px"
          onChange={(value) => update('tearJitter', value)}
        />
      </>
    );
  }
  if (algorithm === 'tile-scramble') {
    return (
      <>
        <SliderField
          label="Tile size"
          value={settings.tileGridSize}
          min={4}
          max={96}
          suffix=" px"
          onChange={(value) => update('tileGridSize', value)}
        />
        <SliderField
          label="Shuffle strength"
          value={settings.tileShuffle}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('tileShuffle', value)}
        />
        <SliderField
          label="Repeat chance"
          value={settings.tileRepeat}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('tileRepeat', value)}
        />
        <SliderField
          label="Drop chance"
          value={settings.tileDrop}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('tileDrop', value)}
        />
        <Toggle
          label="Preserve outer border"
          checked={settings.tilePreserveBorder}
          onChange={(value) => update('tilePreserveBorder', value)}
        />
      </>
    );
  }
  if (algorithm === 'row-column-repeat') {
    return (
      <>
        <label className="inline-select">
          <span>Orientation</span>
          <select
            value={settings.repeatOrientation}
            onChange={(event) =>
              update(
                'repeatOrientation',
                event.target.value as AlgorithmSettings['repeatOrientation'],
              )
            }
          >
            <option value="horizontal">Rows</option>
            <option value="vertical">Columns</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <SliderField
          label="Repeat thickness"
          value={settings.repeatLength}
          min={1}
          max={48}
          suffix=" px"
          onChange={(value) => update('repeatLength', value)}
        />
        <SliderField
          label="Duplicate count"
          value={settings.repeatCount}
          min={1}
          max={24}
          onChange={(value) => update('repeatCount', value)}
        />
        <SliderField
          label="Jitter"
          value={settings.repeatJitter}
          min={0}
          max={40}
          suffix=" px"
          onChange={(value) => update('repeatJitter', value)}
        />
        <SliderField
          label="Fade"
          value={settings.repeatFade}
          min={0}
          max={2}
          step={0.01}
          onChange={(value) => update('repeatFade', value)}
        />
      </>
    );
  }
  if (algorithm === 'structural-mixed') {
    const poolOptions: Array<[AlgorithmId, string]> = [
      ['slice-displacement', 'Slice'],
      ['block-corruption', 'Block Corruption'],
      ['datamosh-smear', 'Datamosh'],
      ['rgb-chunk-split', 'RGB Split'],
      ['scanline-tear-pro', 'Scanline Tear'],
      ['codec-block-damage', 'Codec Block Damage'],
      ['row-column-repeat', 'Row / Column Repeat'],
    ];
    return (
      <>
        <div className="meta-effect-controls">
          <span className="meta-effect-label">META / COMBINATION RECIPE</span>
          <div className="button-row">
            <button onClick={onNewMetaRecipe}>New Recipe</button>
            <Toggle
              label="Lock recipe"
              checked={metaRecipeLocked}
              onChange={onMetaRecipeLockChange}
            />
          </div>
          <code>{metaSeed}</code>
        </div>
        <SliderField
          label="Minimum effects"
          value={settings.structuralMixMinEffects}
          min={1}
          max={5}
          onChange={(value) => {
            update('structuralMixMinEffects', value);
            if (value > settings.structuralMixMaxEffects) update('structuralMixMaxEffects', value);
          }}
        />
        <SliderField
          label="Maximum effects"
          value={settings.structuralMixMaxEffects}
          min={1}
          max={5}
          onChange={(value) => {
            update('structuralMixMaxEffects', value);
            if (value < settings.structuralMixMinEffects) update('structuralMixMinEffects', value);
          }}
        />
        <SliderField
          label="Structural density"
          value={settings.structuralDensity}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(value) => update('structuralDensity', value)}
        />
        <div className="meta-effect-pool">
          <span>Effect pool</span>
          {poolOptions.map(([id, label]) => (
            <Toggle
              key={id}
              label={label}
              checked={settings.structuralMixPool.includes(id)}
              onChange={(checked) => {
                const next = checked
                  ? [...new Set([...settings.structuralMixPool, id])]
                  : settings.structuralMixPool.filter((item) => item !== id);
                if (next.length) update('structuralMixPool', next);
              }}
            />
          ))}
        </div>
        <p className="meta-effect-summary">
          <strong>META EFFECT</strong> Uses {settings.structuralMixMinEffects}–
          {settings.structuralMixMaxEffects} effects per stamp from{' '}
          {poolOptions
            .filter(([id]) => settings.structuralMixPool.includes(id))
            .map(([, label]) => label)
            .join(', ')}
          .
        </p>
      </>
    );
  }
  if (algorithm === 'byte-noise') {
    return (
      <>
        <SliderField
          label="Byte probability"
          value={settings.byteProbability}
          min={0.01}
          max={1}
          step={0.01}
          onChange={(value) => update('byteProbability', value)}
        />
        <SliderField
          label="Minimum delta"
          value={settings.minDelta}
          min={1}
          max={255}
          onChange={(value) => update('minDelta', value)}
        />
        <SliderField
          label="Maximum delta"
          value={settings.maxDelta}
          min={1}
          max={255}
          onChange={(value) => update('maxDelta', value)}
        />
        <div className="switch-row">
          <Toggle
            label="Full random"
            checked={settings.fullRandom}
            onChange={(value) => update('fullRandom', value)}
          />
          <Toggle
            label="Affect alpha"
            checked={settings.affectAlpha}
            onChange={(value) => update('affectAlpha', value)}
          />
        </div>
      </>
    );
  }
  if (algorithm === 'channel-shift') {
    return (
      <>
        <AxisPair
          label="Red offset"
          value={settings.shiftR}
          onChange={(value) => update('shiftR', value)}
        />
        <AxisPair
          label="Green offset"
          value={settings.shiftG}
          onChange={(value) => update('shiftG', value)}
        />
        <AxisPair
          label="Blue offset"
          value={settings.shiftB}
          onChange={(value) => update('shiftB', value)}
        />
        <div className="switch-row">
          <Toggle
            label="Random offset"
            checked={settings.randomShift}
            onChange={(value) => update('randomShift', value)}
          />
          <Toggle
            label="Mirror edges"
            checked={settings.mirrorEdges}
            onChange={(value) => update('mirrorEdges', value)}
          />
        </div>
      </>
    );
  }
  if (algorithm === 'byte-swap') {
    return (
      <label className="inline-select">
        <span>Swap pattern</span>
        <select
          value={settings.swapMode}
          onChange={(event) =>
            update('swapMode', event.target.value as AlgorithmSettings['swapMode'])
          }
        >
          <option value="bgr">RGB → BGR</option>
          <option value="grb">RGB → GRB</option>
          <option value="cycle">Cyclic shift</option>
          <option value="random">Random permutation</option>
          <option value="neighbor">Swap neighbor</option>
        </select>
      </label>
    );
  }
  if (algorithm === 'bit-flip') {
    return (
      <>
        <SliderField
          label="Bit probability"
          value={settings.bitProbability}
          min={0.01}
          max={1}
          step={0.01}
          onChange={(value) => update('bitProbability', value)}
        />
        <SliderField
          label="Bits per byte"
          value={settings.bitCount}
          min={1}
          max={8}
          onChange={(value) => update('bitCount', value)}
        />
        <div className="axis-pair">
          <span>Bit range</span>
          <input
            type="number"
            min={0}
            max={7}
            value={settings.bitMin}
            onChange={(event) => update('bitMin', Number(event.target.value))}
          />
          <input
            type="number"
            min={0}
            max={7}
            value={settings.bitMax}
            onChange={(event) => update('bitMax', Number(event.target.value))}
          />
        </div>
        <Toggle
          label="Affect alpha"
          checked={settings.affectAlpha}
          onChange={(value) => update('affectAlpha', value)}
        />
      </>
    );
  }
  if (algorithm === 'data-smear') {
    return (
      <>
        <SliderField
          label="Smear length"
          value={settings.smearLength}
          min={1}
          max={240}
          suffix=" px"
          onChange={(value) => update('smearLength', value)}
        />
        <SliderField
          label="Fallback angle"
          value={settings.smearAngle}
          min={-180}
          max={180}
          suffix="°"
          onChange={(value) => update('smearAngle', value)}
        />
      </>
    );
  }
  if (algorithm === 'scanline') {
    return (
      <>
        <SliderField
          label="Line thickness"
          value={settings.scanThickness}
          min={1}
          max={24}
          suffix=" px"
          onChange={(value) => update('scanThickness', value)}
        />
        <SliderField
          label="Line spacing"
          value={settings.scanGap}
          min={0}
          max={40}
          suffix=" px"
          onChange={(value) => update('scanGap', value)}
        />
        <SliderField
          label="Displacement"
          value={settings.maxDelta}
          min={1}
          max={255}
          onChange={(value) => update('maxDelta', value)}
        />
      </>
    );
  }
  if (algorithm === 'compression') {
    return (
      <label className="inline-select">
        <span>Block size</span>
        <select
          value={settings.blockSize}
          onChange={(event) => update('blockSize', Number(event.target.value) as 8 | 16)}
        >
          <option value={8}>8 × 8</option>
          <option value={16}>16 × 16</option>
        </select>
      </label>
    );
  }
  if (algorithm === 'palette-collapse') {
    return (
      <>
        <SliderField
          label="Color levels"
          value={settings.paletteLevels}
          min={2}
          max={32}
          onChange={(value) => update('paletteLevels', value)}
        />
        <Toggle
          label="Ordered dither"
          checked={settings.dither}
          onChange={(value) => update('dither', value)}
        />
      </>
    );
  }
  return (
    <SliderField
      label="Effects per stamp"
      value={settings.mixedEffects}
      min={1}
      max={4}
      onChange={(value) => update('mixedEffects', value)}
    />
  );
}
