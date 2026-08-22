import { MousePointer2, RotateCcw, X } from 'lucide-react';
import {
  jpegResamplePresetIds,
  resolveJpegResamplePreset,
  type JpegResamplePresetId,
} from '../effects/jpegResamplePresets';
import type { AlgorithmId, AlgorithmSettings, Rectangle } from '../types';
import { SliderField } from './SliderField';
import { AxisPair, Toggle } from './ui/controls';
import {
  effectControls,
  type EffectControl,
  type EffectControlGroup,
} from './effectControlRegistry';

interface AlgorithmControlsProps {
  algorithm: AlgorithmId;
  settings: AlgorithmSettings;
  group: EffectControlGroup;
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
  jpegReferenceLongEdge?: number;
}

function RangePair({
  control,
  settings,
  update,
}: Pick<AlgorithmControlsProps, 'settings' | 'update'> & {
  control: Extract<EffectControl, { kind: 'range' }>;
}) {
  const [minimumKey, maximumKey] = control.keys;
  const minimum = settings[minimumKey];
  const maximum = settings[maximumKey];
  return (
    <fieldset className="effect-range-control">
      <legend>{control.label}</legend>
      <SliderField
        label="Minimum"
        value={minimum}
        min={control.min}
        max={control.max}
        step={control.step}
        suffix={control.suffix}
        defaultValue={control.resetValue[0]}
        onChange={(value) => {
          update(minimumKey, value);
          if (value > maximum) update(maximumKey, value);
        }}
      />
      <SliderField
        label="Maximum"
        value={maximum}
        min={control.min}
        max={control.max}
        step={control.step}
        suffix={control.suffix}
        defaultValue={control.resetValue[1]}
        onChange={(value) => {
          update(maximumKey, value);
          if (value < minimum) update(minimumKey, value);
        }}
      />
    </fieldset>
  );
}

function AxisControl({
  control,
  settings,
  update,
}: Pick<AlgorithmControlsProps, 'settings' | 'update'> & {
  control: Extract<EffectControl, { kind: 'axis' }>;
}) {
  return (
    <fieldset className="effect-axis-control">
      <legend>{control.label}</legend>
      {control.keys.map((key, index) => (
        <SliderField
          key={key}
          label={index === 0 ? 'X' : 'Y'}
          value={settings[key]}
          min={control.min}
          max={control.max}
          step={control.step}
          suffix={control.suffix}
          defaultValue={control.resetValue[index]}
          onChange={(value) => update(key, value)}
        />
      ))}
    </fieldset>
  );
}

function MetaRecipeControl(props: AlgorithmControlsProps) {
  const poolOptions: Array<[AlgorithmId, string]> = [
    ['slice-displacement', 'Slice'],
    ['block-corruption', 'Block Corruption'],
    ['datamosh-smear', 'Datamosh'],
    ['rgb-chunk-split', 'RGB Split'],
    ['scanline-tear-pro', 'Scanline Tear'],
    ['codec-block-damage', 'Codec Damage'],
    ['row-column-repeat', 'Row / Column'],
    ['pixel-sort-brush', 'Pixel Sort'],
    ['feedback-brush', 'Feedback'],
    ['displacement-brush', 'Displacement'],
    ['flow-mosh-brush', 'Flow Mosh'],
    ['clone-corruption-brush', 'Clone'],
    ['line-freeze-brush', 'Line Freeze'],
  ];
  if (props.group === 'primary') {
    return (
      <div className="meta-effect-controls">
        <div className="button-row">
          <button onClick={props.onNewMetaRecipe}>New recipe</button>
          <Toggle
            label="Lock recipe"
            checked={props.metaRecipeLocked}
            onChange={props.onMetaRecipeLockChange}
          />
        </div>
        <code>{props.metaSeed}</code>
      </div>
    );
  }
  return (
    <div className="meta-effect-pool">
      <span>Effect pool</span>
      {poolOptions.map(([id, label]) => (
        <Toggle
          key={id}
          label={label}
          checked={props.settings.structuralMixPool.includes(id)}
          onChange={(checked) => {
            const next = checked
              ? [...new Set([...props.settings.structuralMixPool, id])]
              : props.settings.structuralMixPool.filter((item) => item !== id);
            if (next.length >= 2) props.update('structuralMixPool', next);
          }}
        />
      ))}
    </div>
  );
}

function CustomControl({
  control,
  ...props
}: AlgorithmControlsProps & {
  control: Extract<EffectControl, { kind: 'custom' }>;
}) {
  if (control.component === 'jpeg-resample-presets') {
    const applyPreset = (preset: JpegResamplePresetId) => {
      const values = resolveJpegResamplePreset(preset, props.jpegReferenceLongEdge ?? 256);
      props.update('jpegResampleQuality', values.quality);
      props.update('jpegResamplePasses', values.passes);
      props.update('jpegResampleNoise', values.noise);
      props.update('jpegResampleNoiseAmount', values.noiseAmount);
      props.update('jpegResampleSharpen', values.sharpen);
      props.update('jpegResampleSharpenAmount', values.sharpenAmount);
      props.update('jpegResampleChromaBleed', values.chromaBleed);
      props.update('jpegResampleTargetLongEdge', values.targetLongEdge);
      if (values.noiseType) props.update('jpegResampleNoiseType', values.noiseType);
      if (values.upscale) props.update('jpegResampleUpscale', values.upscale);
      if (values.forceFullAmount) props.update('jpegResampleMix', 1);
    };
    return (
      <fieldset className="effect-segmented-control jpeg-resample-presets">
        <legend>Quality presets</legend>
        <div role="group" aria-label="JPEG Resample quality presets">
          {jpegResamplePresetIds.map((preset) => (
            <button key={preset} type="button" onClick={() => applyPreset(preset)}>
              {preset[0]!.toUpperCase() + preset.slice(1)}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  if (control.component === 'feedback-memory') {
    return (
      <div className={`advanced-state-row ${props.feedbackMemoryReady ? 'ready' : ''}`}>
        <span>Feedback memory</span>
        <strong>{props.feedbackMemoryReady ? 'READY' : 'EMPTY'}</strong>
        <button onClick={props.onResetFeedback}>
          <RotateCcw size={13} aria-hidden="true" /> Reset memory
        </button>
      </div>
    );
  }
  if (control.component === 'clone-source') {
    return (
      <div className="clone-source-control">
        <div className={`advanced-state-row ${props.cloneSource ? 'ready' : ''}`}>
          <span>Source</span>
          <strong>
            {props.cloneSource
              ? `${props.cloneSource.width}×${props.cloneSource.height}`
              : props.cloneSourcePickMode
                ? 'PICKING…'
                : 'NOT SET'}
          </strong>
          <button onClick={props.onPickCloneSource}>
            <MousePointer2 size={13} aria-hidden="true" />
            {props.cloneSource ? 'Replace' : 'Pick source'}
          </button>
          <button
            aria-label="Clear clone source"
            onClick={props.onClearCloneSource}
            disabled={!props.cloneSource && !props.cloneSourcePickMode}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
        <p className="fine-print">
          {
            'Aligned makes source and destination move together. Non-aligned modes reuse the picked source.'
          }
        </p>
      </div>
    );
  }
  if (control.component === 'channel-shift') {
    return (
      <>
        <AxisPair
          label="Red offset"
          value={props.settings.shiftR}
          onChange={(value) => props.update('shiftR', value)}
        />
        <AxisPair
          label="Green offset"
          value={props.settings.shiftG}
          onChange={(value) => props.update('shiftG', value)}
        />
        <AxisPair
          label="Blue offset"
          value={props.settings.shiftB}
          onChange={(value) => props.update('shiftB', value)}
        />
        <Toggle
          label="Random offset"
          checked={props.settings.randomShift}
          onChange={(value) => props.update('randomShift', value)}
        />
        <Toggle
          label="Mirror edges"
          checked={props.settings.mirrorEdges}
          onChange={(value) => props.update('mirrorEdges', value)}
        />
      </>
    );
  }
  return <MetaRecipeControl {...props} />;
}

function renderControl(control: EffectControl, props: AlgorithmControlsProps) {
  if (control.kind === 'slider') {
    const value =
      control.key === 'jpegResampleTargetLongEdge'
        ? Math.max(28, props.settings.jpegResampleTargetLongEdge)
        : props.settings[control.key];
    return (
      <SliderField
        key={control.key}
        label={control.label}
        value={value}
        min={control.min}
        max={control.max}
        step={control.step}
        suffix={control.suffix}
        numericInput={
          props.algorithm === 'jpeg-resample-brush' &&
          (control.key === 'jpegResampleTargetLongEdge' || control.key === 'jpegResampleQuality')
        }
        displayValue={
          control.key === 'jpegResampleMix'
            ? `${Math.round(props.settings.jpegResampleMix * 100)}%`
            : undefined
        }
        defaultValue={control.resetValue}
        onChange={(value) => props.update(control.key, value)}
      />
    );
  }
  if (control.kind === 'range') {
    return <RangePair key={control.keys.join(':')} control={control} {...props} />;
  }
  if (control.kind === 'axis') {
    return <AxisControl key={control.keys.join(':')} control={control} {...props} />;
  }
  if (control.kind === 'toggle') {
    return (
      <Toggle
        key={control.key}
        label={control.label}
        checked={props.settings[control.key]}
        onChange={(value) => props.update(control.key, value)}
      />
    );
  }
  if (control.kind === 'segmented') {
    const value = props.settings[control.key];
    return (
      <fieldset className="effect-segmented-control" key={control.key}>
        <legend>{control.label}</legend>
        <div role="group" aria-label={control.label}>
          {control.options.map((item) => (
            <button
              type="button"
              aria-pressed={value === item.value}
              className={value === item.value ? 'active' : ''}
              key={item.value}
              onClick={() =>
                props.update(control.key, item.value as AlgorithmSettings[typeof control.key])
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  if (control.kind === 'select') {
    return (
      <label className="inline-select" key={control.key}>
        <span>{control.label}</span>
        <select
          value={String(props.settings[control.key])}
          onChange={(event) => {
            const selected = control.options.find(
              (item) => String(item.value) === event.target.value,
            );
            if (selected) {
              props.update(control.key, selected.value as AlgorithmSettings[typeof control.key]);
            }
          }}
        >
          {control.options.map((item) => (
            <option key={item.value} value={String(item.value)}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (control.kind === 'custom') {
    return <CustomControl key={control.component} control={control} {...props} />;
  }
  return null;
}

export function AlgorithmControls(props: AlgorithmControlsProps) {
  const controls = effectControls(props.algorithm, props.group, props.settings);
  if (!controls.length) {
    return <p className="fine-print">This effect has no additional {props.group} controls.</p>;
  }
  return <>{controls.map((control) => renderControl(control, props))}</>;
}
