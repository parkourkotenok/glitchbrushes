import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Dices,
  Download,
  Eye,
  GripVertical,
  MapPin,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { EffectIcon } from '../icons/effects';
import {
  dragActivationReached,
  isCardDragBlockedTarget,
  isMoshRackReady,
} from '../mosh/interactions';
import {
  createMoshCard,
  moshEffectDefinitions,
  moshPresetParameterKeys,
  moshPresets,
  type MoshEffectCard,
  type MoshEffectId,
  type MoshEffectSettings,
  type MoshProgress,
  type MoshTarget,
} from '../mosh/types';
import {
  loadMoshUserPresets,
  parseMoshPresetJson,
  saveMoshUserPresets,
  type MoshUserPreset,
} from '../mosh/presets';
import {
  randomizeMoshCard,
  randomizeMoshRack,
  type MoshGlobalRandomizeScope,
  type MoshRandomizeMode,
} from '../mosh/randomize';
import { imageBrushStageLabel, sharedEffectForMosh } from '../effects/sharedRegistry';
import { SliderField } from './SliderField';
import { HelpButton } from './HelpButton';
import { helpSlug } from '../help/registry';
import type { InterfaceMode } from './InterfaceModeSwitch';

interface MoshLabProps {
  interfaceMode: InterfaceMode;
  rack: MoshEffectCard[];
  seed: string;
  previewEnabled: boolean;
  processing: boolean;
  progress: MoshProgress | null;
  hasSelection: boolean;
  hasBrushMask: boolean;
  hasPreview: boolean;
  previewStale: boolean;
  onRackChange(rack: MoshEffectCard[]): void;
  onSeedChange(seed: string): void;
  onPreviewChange(enabled: boolean): void;
  onApply(): void;
  onCancel(): void;
  onReset(): void;
  onPickRegion(ownerEffectInstanceId: string, mode: 'source' | 'destination'): void;
  onClearRegion(ownerEffectInstanceId: string, mode: 'source' | 'destination' | 'both'): void;
  onRemoveAppliedResult(): void;
}

function SelectControl({
  label,
  value,
  onChange,
  children,
  helpId,
}: {
  label: string;
  value: string | number;
  onChange(value: string): void;
  children: ReactNode;
  helpId?: string;
}) {
  const resolvedHelpId = helpId ?? `mosh.${helpSlug(label)}`;
  return (
    <label className="inline-select mosh-select">
      <span>
        {label}
        <HelpButton helpId={resolvedHelpId} label={label} value={String(value)} />
      </span>
      <select
        data-help-id={resolvedHelpId}
        data-help-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function CheckControl({
  label,
  checked,
  onChange,
  helpId,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  helpId?: string;
}) {
  const resolvedHelpId = helpId ?? `mosh.${helpSlug(label)}`;
  return (
    <label className="mosh-check">
      <input
        data-tooltip-id={resolvedHelpId}
        data-tooltip-label={label}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
      <span>{label}</span>
    </label>
  );
}

function SettingsControls({
  card,
  update,
  onPickRegion,
  onClearRegion,
}: {
  card: MoshEffectCard;
  update<K extends keyof MoshEffectSettings>(key: K, value: MoshEffectSettings[K]): void;
  onPickRegion(ownerEffectInstanceId: string, mode: 'source' | 'destination'): void;
  onClearRegion(ownerEffectInstanceId: string, mode: 'source' | 'destination' | 'both'): void;
}) {
  const settings = card.settings;
  if (card.effectId === 'pixel-sort') {
    return (
      <>
        <SelectControl
          label="Direction"
          value={settings.pixelDirection}
          onChange={(value) =>
            update('pixelDirection', value as MoshEffectSettings['pixelDirection'])
          }
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
          <option value="diagonal-forward">Diagonal forward</option>
          <option value="diagonal-backward">Diagonal backward</option>
          <option value="radial">Radial</option>
        </SelectControl>
        <SelectControl
          label="Sort property"
          value={settings.sortProperty}
          onChange={(value) => update('sortProperty', value as MoshEffectSettings['sortProperty'])}
        >
          <option value="luminance">Luminance</option>
          <option value="hue">Hue</option>
          <option value="saturation">Saturation</option>
          <option value="red">Red</option>
          <option value="green">Green</option>
          <option value="blue">Blue</option>
          <option value="rgb-sum">RGB sum</option>
        </SelectControl>
        <SelectControl
          label="Interval mode"
          value={settings.intervalMode}
          onChange={(value) => update('intervalMode', value as MoshEffectSettings['intervalMode'])}
        >
          <option value="threshold">Threshold</option>
          <option value="random">Random</option>
          <option value="edges">Edges</option>
          <option value="waves">Waves</option>
          <option value="full-row">Full row</option>
        </SelectControl>
        <SliderField
          label="Lower threshold"
          value={settings.lowerThreshold}
          min={0}
          max={255}
          onChange={(value) => update('lowerThreshold', value)}
        />
        <SliderField
          label="Upper threshold"
          value={settings.upperThreshold}
          min={0}
          max={255}
          onChange={(value) => update('upperThreshold', value)}
        />
        <SliderField
          label="Minimum interval"
          value={settings.intervalMin}
          min={2}
          max={256}
          suffix=" px"
          onChange={(value) => update('intervalMin', value)}
        />
        <SliderField
          label="Maximum interval"
          value={settings.intervalMax}
          min={16}
          max={1600}
          suffix=" px"
          onChange={(value) => update('intervalMax', value)}
        />
        <SliderField
          label="Disorder"
          value={settings.disorder}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('disorder', value)}
        />
        <div className="mosh-check-row">
          <CheckControl
            label="Reverse"
            checked={settings.reverse}
            onChange={(value) => update('reverse', value)}
          />
          <CheckControl
            label="Preserve alpha"
            checked={settings.preserveAlpha}
            onChange={(value) => update('preserveAlpha', value)}
          />
        </div>
      </>
    );
  }
  if (card.effectId === 'feedback') {
    return (
      <>
        <SliderField
          label="Iterations"
          value={settings.feedbackIterations}
          min={1}
          max={20}
          onChange={(value) => update('feedbackIterations', value)}
        />
        <SliderField
          label="X translation"
          value={settings.translateX}
          min={-120}
          max={120}
          suffix=" px"
          onChange={(value) => update('translateX', value)}
        />
        <SliderField
          label="Y translation"
          value={settings.translateY}
          min={-120}
          max={120}
          suffix=" px"
          onChange={(value) => update('translateY', value)}
        />
        <SliderField
          label="Scale / iteration"
          value={settings.feedbackScale}
          min={0.94}
          max={1.08}
          step={0.001}
          onChange={(value) => update('feedbackScale', value)}
        />
        <SliderField
          label="Rotation / iteration"
          value={settings.feedbackRotation}
          min={-8}
          max={8}
          step={0.1}
          suffix="°"
          onChange={(value) => update('feedbackRotation', value)}
        />
        <SliderField
          label="Opacity decay"
          value={settings.opacityDecay}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('opacityDecay', value)}
        />
        <SliderField
          label="Brightness decay"
          value={settings.brightnessDecay}
          min={0.5}
          max={1.2}
          step={0.01}
          onChange={(value) => update('brightnessDecay', value)}
        />
        <SliderField
          label="Saturation decay"
          value={settings.saturationDecay}
          min={0}
          max={1.2}
          step={0.01}
          onChange={(value) => update('saturationDecay', value)}
        />
        <SelectControl
          label="Blend mode"
          value={settings.feedbackBlendMode}
          onChange={(value) =>
            update('feedbackBlendMode', value as MoshEffectSettings['feedbackBlendMode'])
          }
        >
          <option value="normal">Normal</option>
          <option value="screen">Screen</option>
          <option value="multiply">Multiply</option>
          <option value="difference">Difference</option>
          <option value="lighten">Lighten</option>
          <option value="darken">Darken</option>
        </SelectControl>
        <SliderField
          label="Channel offset"
          value={settings.feedbackChannelOffset}
          min={0}
          max={48}
          suffix=" px"
          onChange={(value) => update('feedbackChannelOffset', value)}
        />
        <SelectControl
          label="Edge handling"
          value={settings.feedbackEdge}
          onChange={(value) => update('feedbackEdge', value as MoshEffectSettings['feedbackEdge'])}
        >
          <option value="clamp">Clamp</option>
          <option value="wrap">Wrap</option>
          <option value="mirror">Mirror</option>
        </SelectControl>
        <SliderField
          label="Feedback reset"
          value={settings.feedbackReset}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('feedbackReset', value)}
        />
      </>
    );
  }
  if (card.effectId === 'motion-field') {
    return (
      <>
        <SelectControl
          label="Field source"
          value={settings.motionFieldSource}
          onChange={(value) =>
            update('motionFieldSource', value as MoshEffectSettings['motionFieldSource'])
          }
        >
          <option value="brush-direction">Brush direction</option>
          <option value="radial">Radial</option>
          <option value="vortex">Vortex</option>
          <option value="directional">Directional</option>
          <option value="noise-flow">Noise flow</option>
          <option value="image-edges">Image edges</option>
        </SelectControl>
        <SliderField
          label="Block size"
          value={settings.motionBlockSize}
          min={4}
          max={64}
          suffix=" px"
          onChange={(value) => update('motionBlockSize', value)}
        />
        <SliderField
          label="Propagation length"
          value={settings.propagationLength}
          min={8}
          max={480}
          suffix=" px"
          onChange={(value) => update('propagationLength', value)}
        />
        <SliderField
          label="Iterations"
          value={settings.motionIterations}
          min={1}
          max={16}
          onChange={(value) => update('motionIterations', value)}
        />
        <SliderField
          label="Vector strength"
          value={settings.vectorStrength}
          min={0.1}
          max={3}
          step={0.01}
          onChange={(value) => update('vectorStrength', value)}
        />
        <SliderField
          label="Vector jitter"
          value={settings.vectorJitter}
          min={0}
          max={1.5}
          step={0.01}
          onChange={(value) => update('vectorJitter', value)}
        />
        <SliderField
          label="Persistence"
          value={settings.motionPersistence}
          min={0.1}
          max={1.2}
          step={0.01}
          onChange={(value) => update('motionPersistence', value)}
        />
        <SliderField
          label="Decay"
          value={settings.motionDecay}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('motionDecay', value)}
        />
        <SliderField
          label="Luma lock"
          value={settings.motionLumaLock}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('motionLumaLock', value)}
        />
        <SliderField
          label="Chroma drift"
          value={settings.motionChromaDrift}
          min={0}
          max={48}
          suffix=" px"
          onChange={(value) => update('motionChromaDrift', value)}
        />
        <SliderField
          label="Spill amount"
          value={settings.motionSpill}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('motionSpill', value)}
        />
        <CheckControl
          label="Overwrite blocks"
          checked={settings.motionOverwrite}
          onChange={(value) => update('motionOverwrite', value)}
        />
      </>
    );
  }
  if (card.effectId === 'motion-transfer') {
    const sourceRegion = card.sourceRegion;
    const destinationRegion = card.destinationRegion;
    return (
      <>
        <div className="region-pick-row">
          <button
            className={sourceRegion ? 'defined' : ''}
            onClick={() => onPickRegion(card.instanceId, 'source')}
          >
            <MapPin size={13} /> Pick Source
          </button>
          <button
            className={destinationRegion ? 'defined' : ''}
            onClick={() => onPickRegion(card.instanceId, 'destination')}
          >
            <MapPin size={13} /> Paint Destination
          </button>
        </div>
        <div className="region-clear-row">
          <button disabled={!sourceRegion} onClick={() => onClearRegion(card.instanceId, 'source')}>
            Clear Source
          </button>
          <button
            disabled={!destinationRegion}
            onClick={() => onClearRegion(card.instanceId, 'destination')}
          >
            Clear Destination
          </button>
          <button
            disabled={!sourceRegion && !destinationRegion}
            onClick={() => onClearRegion(card.instanceId, 'both')}
          >
            Clear Both
          </button>
        </div>
        <div className="mosh-region-status">
          <span>
            Source: {sourceRegion ? `${sourceRegion.width} × ${sourceRegion.height}` : 'cleared'}
          </span>
          <span>
            Destination:{' '}
            {destinationRegion
              ? `${destinationRegion.width} × ${destinationRegion.height}`
              : 'not set'}
          </span>
        </div>
        <SelectControl
          label="Transfer mode"
          value={settings.transferMode}
          onChange={(value) => update('transferMode', value as MoshEffectSettings['transferMode'])}
        >
          <option value="copy-motion">Copy motion</option>
          <option value="copy-texture">Copy texture</option>
          <option value="copy-luma">Copy luma</option>
          <option value="copy-chroma">Copy chroma</option>
          <option value="swap">Swap</option>
        </SelectControl>
        <SliderField
          label="Direction"
          value={settings.transferDirection}
          min={-180}
          max={180}
          suffix="°"
          onChange={(value) => update('transferDirection', value)}
        />
        <SliderField
          label="Repetitions"
          value={settings.transferRepetitions}
          min={1}
          max={12}
          onChange={(value) => update('transferRepetitions', value)}
        />
        <SliderField
          label="Scale"
          value={settings.transferScale}
          min={0.5}
          max={1.8}
          step={0.01}
          onChange={(value) => update('transferScale', value)}
        />
        <SliderField
          label="Rotation"
          value={settings.transferRotation}
          min={-30}
          max={30}
          step={0.1}
          suffix="°"
          onChange={(value) => update('transferRotation', value)}
        />
        <SliderField
          label="Decay"
          value={settings.transferDecay}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('transferDecay', value)}
        />
        <SliderField
          label="Blend"
          value={settings.transferBlend}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => update('transferBlend', value)}
        />
      </>
    );
  }
  if (card.effectId === 'chroma-drift') {
    return (
      <>
        <SliderField
          label="Luminance offset"
          value={settings.lumaOffset}
          min={-64}
          max={64}
          suffix=" px"
          onChange={(value) => update('lumaOffset', value)}
        />
        <SliderField
          label="Chroma X offset"
          value={settings.chromaX}
          min={-96}
          max={96}
          suffix=" px"
          onChange={(value) => update('chromaX', value)}
        />
        <SliderField
          label="Chroma Y offset"
          value={settings.chromaY}
          min={-96}
          max={96}
          suffix=" px"
          onChange={(value) => update('chromaY', value)}
        />
        <SliderField
          label="Chroma blur"
          value={settings.chromaBlur}
          min={0}
          max={16}
          suffix=" px"
          onChange={(value) => update('chromaBlur', value)}
        />
        <SliderField
          label="Chroma block size"
          value={settings.chromaBlockSize}
          min={1}
          max={32}
          suffix=" px"
          onChange={(value) => update('chromaBlockSize', value)}
        />
        <SliderField
          label="Subsampling"
          value={settings.chromaSubsampling}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('chromaSubsampling', value)}
        />
        <SliderField
          label="Color bleed"
          value={settings.colorBleed}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('colorBleed', value)}
        />
        <SliderField
          label="Luma hold"
          value={settings.lumaHold}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('lumaHold', value)}
        />
        <SliderField
          label="Channel delay"
          value={settings.channelDelay}
          min={0}
          max={48}
          suffix=" px"
          onChange={(value) => update('channelDelay', value)}
        />
        <SliderField
          label="Edge softness"
          value={settings.chromaEdgeSoftness}
          min={0}
          max={16}
          suffix=" px"
          onChange={(value) => update('chromaEdgeSoftness', value)}
        />
      </>
    );
  }
  if (card.effectId === 'dct-damage') {
    return (
      <>
        <SelectControl
          label="Block size"
          value={settings.dctBlockSize}
          onChange={(value) => update('dctBlockSize', Number(value) as 8 | 16)}
        >
          <option value={8}>8×8</option>
          <option value={16}>16×16</option>
        </SelectControl>
        <SliderField
          label="Quantization"
          value={settings.dctQuantization}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('dctQuantization', value)}
        />
        <SliderField
          label="High-frequency removal"
          value={settings.highFrequencyRemoval}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('highFrequencyRemoval', value)}
        />
        <SliderField
          label="Low-frequency boost"
          value={settings.lowFrequencyBoost}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('lowFrequencyBoost', value)}
        />
        <SliderField
          label="Coefficient dropout"
          value={settings.coefficientDropout}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('coefficientDropout', value)}
        />
        <SliderField
          label="Ringing strength"
          value={settings.ringingStrength}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('ringingStrength', value)}
        />
        <SliderField
          label="Block boundary"
          value={settings.blockBoundaryStrength}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('blockBoundaryStrength', value)}
        />
        <SliderField
          label="Chroma quality"
          value={settings.chromaQuality}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('chromaQuality', value)}
        />
        <SliderField
          label="Random replacement"
          value={settings.randomBlockReplacement}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('randomBlockReplacement', value)}
        />
        <SliderField
          label="Neighbor inheritance"
          value={settings.neighborInheritance}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('neighborInheritance', value)}
        />
        <p className="mosh-mini-note">
          Decoded-image visual simulation — the source file stays untouched.
        </p>
      </>
    );
  }
  if (card.effectId === 'edge-melt') {
    return (
      <>
        <SliderField
          label="Edge threshold"
          value={settings.edgeThreshold}
          min={1}
          max={255}
          onChange={(value) => update('edgeThreshold', value)}
        />
        <SliderField
          label="Edge sensitivity"
          value={settings.edgeSensitivity}
          min={0.1}
          max={3}
          step={0.01}
          onChange={(value) => update('edgeSensitivity', value)}
        />
        <SelectControl
          label="Direction"
          value={settings.edgeDirection}
          onChange={(value) =>
            update('edgeDirection', value as MoshEffectSettings['edgeDirection'])
          }
        >
          <option value="away">Away from edges</option>
          <option value="toward">Toward edges</option>
          <option value="tangent">Tangent</option>
          <option value="down">Downward gravity</option>
          <option value="up">Upward</option>
        </SelectControl>
        <SliderField
          label="Melt length"
          value={settings.meltLength}
          min={4}
          max={420}
          suffix=" px"
          onChange={(value) => update('meltLength', value)}
        />
        <SliderField
          label="Spread"
          value={settings.meltSpread}
          min={0}
          max={80}
          suffix=" px"
          onChange={(value) => update('meltSpread', value)}
        />
        <SliderField
          label="Blur"
          value={settings.meltBlur}
          min={0}
          max={2}
          step={0.01}
          onChange={(value) => update('meltBlur', value)}
        />
        <SliderField
          label="Color carry"
          value={settings.colorCarry}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update('colorCarry', value)}
        />
        <div className="mosh-check-row">
          <CheckControl
            label="Preserve strong edges"
            checked={settings.preserveStrongEdges}
            onChange={(value) => update('preserveStrongEdges', value)}
          />
          <CheckControl
            label="Invert edge mask"
            checked={settings.invertEdgeMask}
            onChange={(value) => update('invertEdgeMask', value)}
          />
        </div>
      </>
    );
  }
  return (
    <>
      <SelectControl
        label="Field type"
        value={settings.flowType}
        onChange={(value) => update('flowType', value as MoshEffectSettings['flowType'])}
      >
        <option value="curl-noise">Curl noise</option>
        <option value="waves">Waves</option>
        <option value="vortex">Vortex</option>
        <option value="radial-explosion">Radial explosion</option>
        <option value="radial-implosion">Radial implosion</option>
        <option value="turbulence">Turbulence</option>
        <option value="image-luminance">Image luminance</option>
      </SelectControl>
      <SliderField
        label="Scale"
        value={settings.flowScale}
        min={4}
        max={320}
        suffix=" px"
        onChange={(value) => update('flowScale', value)}
      />
      <SliderField
        label="Strength"
        value={settings.flowStrength}
        min={1}
        max={160}
        suffix=" px"
        onChange={(value) => update('flowStrength', value)}
      />
      <SliderField
        label="Octaves"
        value={settings.flowOctaves}
        min={1}
        max={6}
        onChange={(value) => update('flowOctaves', value)}
      />
      <SliderField
        label="Persistence"
        value={settings.flowPersistence}
        min={0.05}
        max={1}
        step={0.01}
        onChange={(value) => update('flowPersistence', value)}
      />
      <SliderField
        label="Iterations"
        value={settings.flowIterations}
        min={1}
        max={12}
        onChange={(value) => update('flowIterations', value)}
      />
      <SliderField
        label="Direction"
        value={settings.flowDirection}
        min={-180}
        max={180}
        suffix="°"
        onChange={(value) => update('flowDirection', value)}
      />
      <SelectControl
        label="Interpolation"
        value={settings.flowInterpolation}
        onChange={(value) =>
          update('flowInterpolation', value as MoshEffectSettings['flowInterpolation'])
        }
      >
        <option value="nearest">Nearest / digital</option>
        <option value="bilinear">Bilinear / fluid</option>
      </SelectControl>
      <CheckControl
        label="Wrap field edges"
        checked={settings.flowWrapping}
        onChange={(value) => update('flowWrapping', value)}
      />
    </>
  );
}

export function MoshLab({
  interfaceMode,
  rack,
  seed,
  previewEnabled,
  processing,
  progress,
  hasSelection,
  hasBrushMask,
  hasPreview,
  previewStale,
  onRackChange,
  onSeedChange,
  onPreviewChange,
  onApply,
  onCancel,
  onReset,
  onPickRegion,
  onClearRegion,
  onRemoveAppliedResult,
}: MoshLabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [globalRandomizeMode, setGlobalRandomizeMode] = useState<MoshRandomizeMode>('balanced');
  const [lastRandomizeScope, setLastRandomizeScope] =
    useState<MoshGlobalRandomizeScope>('parameters');
  const [randomizeNonce, setRandomizeNonce] = useState(0);
  const [randomizeSeedLocked, setRandomizeSeedLocked] = useState(false);
  const [randomizeSummary, setRandomizeSummary] = useState('No randomized changes yet.');
  const [userPresets, setUserPresets] = useState<MoshUserPreset[]>(() => loadMoshUserPresets());
  const presetImportRef = useRef<HTMLInputElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{
    instanceId: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const lockedRandomizationRef = useRef<{ key: string; rack: MoshEffectCard[] } | null>(null);

  const updateCard = (instanceId: string, transform: (card: MoshEffectCard) => MoshEffectCard) =>
    onRackChange(rack.map((card) => (card.instanceId === instanceId ? transform(card) : card)));

  const nextRandomizeNonce = () => {
    const next = randomizeSeedLocked ? randomizeNonce : randomizeNonce + 1;
    if (!randomizeSeedLocked) setRandomizeNonce(next);
    return next;
  };

  const randomizeGlobal = (scope: MoshGlobalRandomizeScope) => {
    const nonce = nextRandomizeNonce();
    const replayKey = `${seed}:${scope}:${globalRandomizeMode}:${nonce}`;
    if (randomizeSeedLocked && lockedRandomizationRef.current?.key === replayKey) {
      const replay = lockedRandomizationRef.current.rack.map((card) => ({
        ...card,
        settings: { ...card.settings },
      }));
      onRackChange(replay);
      setLastRandomizeScope(scope);
      setRandomizeSummary(
        `Reproduced locked recipe / ${globalRandomizeMode} / variation ${nonce}. Recipe: ${replay.map((card) => moshEffectDefinitions.find((item) => item.id === card.effectId)?.name).join(' -> ') || 'empty rack'}.`,
      );
      if (!previewEnabled) onPreviewChange(true);
      return;
    }
    const next = randomizeMoshRack(rack, seed, scope, globalRandomizeMode, nonce);
    const effectChanges = next.reduce(
      (count, card, index) => count + (card.effectId !== rack[index]?.effectId ? 1 : 0),
      0,
    );
    const parameterChanges = next.reduce((count, card) => {
      const previous = rack.find((item) => item.instanceId === card.instanceId);
      if (!previous) return count + Object.keys(card.settings).length + 1;
      return (
        count +
        Object.keys(card.settings).reduce(
          (subtotal, key) =>
            subtotal +
            (card.settings[key as keyof MoshEffectSettings] !==
            previous.settings[key as keyof MoshEffectSettings]
              ? 1
              : 0),
          card.mix !== previous.mix ? 1 : 0,
        )
      );
    }, 0);
    const orderChanged = next.some((card, index) => card.instanceId !== rack[index]?.instanceId);
    onRackChange(next);
    if (randomizeSeedLocked) {
      lockedRandomizationRef.current = {
        key: replayKey,
        rack: next.map((card) => ({ ...card, settings: { ...card.settings } })),
      };
    }
    setLastRandomizeScope(scope);
    setRandomizeSummary(
      `${scope.replaceAll('-', ' ')} · ${globalRandomizeMode} · variation ${nonce} · ${next.length} card${next.length === 1 ? '' : 's'}`,
    );
    setRandomizeSummary(
      `Changed ${effectChanges} effect${effectChanges === 1 ? '' : 's'}, ${parameterChanges} parameter${parameterChanges === 1 ? '' : 's'}${orderChanged ? ' and rack order' : ''}. ${globalRandomizeMode} / variation ${nonce}. Recipe: ${next.map((card) => moshEffectDefinitions.find((item) => item.id === card.effectId)?.name).join(' -> ') || 'empty rack'}.`,
    );
    if (!previewEnabled) onPreviewChange(true);
  };

  const moveCard = (fromId: string, toId: string) => {
    const from = rack.findIndex((card) => card.instanceId === fromId);
    const to = rack.findIndex((card) => card.instanceId === toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...rack];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onRackChange(next);
  };

  const finishCardDrag = (pointerId?: number) => {
    if (pointerId !== undefined && dragRef.current?.pointerId !== pointerId) return;
    dragRef.current = null;
    setDraggingId(null);
  };

  const persistUserPresets = (presets: MoshUserPreset[]) => {
    setUserPresets(presets);
    saveMoshUserPresets(presets);
  };

  const selectedUserPreset = (card: MoshEffectCard) => {
    if (!card.activePresetId.startsWith('user:')) return null;
    const id = card.activePresetId.slice(5);
    return userPresets.find((preset) => preset.id === id) ?? null;
  };

  const currentPresetSettings = (card: MoshEffectCard): Partial<MoshEffectSettings> => {
    const settings: Partial<MoshEffectSettings> = {};
    for (const key of moshPresetParameterKeys[card.effectId]) {
      (settings as Record<string, unknown>)[key] = card.settings[key];
    }
    return settings;
  };

  const saveCurrentPreset = (card: MoshEffectCard) => {
    const name = window.prompt(
      'MOSH preset name',
      `Custom ${moshEffectDefinitions.find((item) => item.id === card.effectId)!.name}`,
    );
    if (!name?.trim()) return;
    const preset: MoshUserPreset = {
      id: `mosh-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      effectId: card.effectId,
      settings: currentPresetSettings(card),
      custom: true,
    };
    persistUserPresets([...userPresets, preset]);
    updateCard(card.instanceId, (current) => ({ ...current, activePresetId: `user:${preset.id}` }));
  };

  const renameCurrentPreset = (card: MoshEffectCard) => {
    const preset = selectedUserPreset(card);
    if (!preset) return;
    const name = window.prompt('Rename MOSH preset', preset.name);
    if (!name?.trim()) return;
    persistUserPresets(
      userPresets.map((item) => (item.id === preset.id ? { ...item, name: name.trim() } : item)),
    );
  };

  const deleteCurrentPreset = (card: MoshEffectCard) => {
    const preset = selectedUserPreset(card);
    if (!preset || !window.confirm(`Delete user preset "${preset.name}"?`)) return;
    persistUserPresets(userPresets.filter((item) => item.id !== preset.id));
    onRackChange(
      rack.map((item) =>
        item.activePresetId === `user:${preset.id}` ? { ...item, activePresetId: 'custom' } : item,
      ),
    );
  };

  const exportCurrentPreset = (card: MoshEffectCard) => {
    const userPreset = selectedUserPreset(card);
    const builtInName = card.activePresetId.startsWith('builtin:')
      ? card.activePresetId.slice(8)
      : null;
    const builtIn = builtInName
      ? moshPresets.find(
          (preset) => preset.effectId === card.effectId && preset.name === builtInName,
        )
      : null;
    const value = userPreset ??
      builtIn ?? {
        name: `Custom ${moshEffectDefinitions.find((item) => item.id === card.effectId)!.name}`,
        effectId: card.effectId,
        settings: currentPresetSettings(card),
      };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mosh-preset'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importPresetFile = async (file: File) => {
    try {
      const imported = parseMoshPresetJson(await file.text());
      if (!imported.length) throw new Error('No valid MOSH presets were found.');
      persistUserPresets([...userPresets, ...imported]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Invalid MOSH preset JSON.');
    }
  };

  return (
    <section className="mosh-lab">
      <div className="mosh-lab-head">
        <div>
          <span className="eyebrow">ADVANCED MULTI-PASS WORKSPACE</span>
          <strong>Mosh</strong>
          <p>Static-image Motion Mosh and signal processing rack.</p>
        </div>
        <EffectIcon id="motion-field" size={25} />
      </div>

      <p className="mosh-simple-hint interface-simple-only">
        Build a rack, enable Preview, then Apply. Switch to Advanced for seeds, effect parameters,
        targets & presets.
      </p>

      <div className="mosh-rack-toolbar">
        <div className="mosh-add-wrap">
          <button className="primary" onClick={() => setAddOpen((value) => !value)}>
            <Plus size={14} /> Add Effect
          </button>
          {addOpen && (
            <div className="mosh-add-menu">
              {moshEffectDefinitions.map((definition) => {
                const shared = sharedEffectForMosh(definition.id);
                return (
                  <button
                    key={definition.id}
                    onClick={() => {
                      onRackChange([...rack, createMoshCard(definition.id)]);
                      setAddOpen(false);
                    }}
                  >
                    <EffectIcon id={definition.icon} size={17} />
                    <span>
                      <strong>{definition.name}</strong>
                      <small>
                        {definition.description}
                        {shared
                          ? ` Image Brush: ${imageBrushStageLabel(shared.imageBrushStages)}.`
                          : ''}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          className={previewEnabled ? 'active' : ''}
          onClick={() => onPreviewChange(!previewEnabled)}
          title="Auto-preview changes"
        >
          <Eye size={14} /> Preview
        </button>
        <button
          className="primary"
          disabled={processing || (!isMoshRackReady(rack) && !hasPreview)}
          onClick={onApply}
        >
          <Play size={14} /> {previewStale ? 'Apply Last Preview' : 'Apply'}
        </button>
        <button disabled={!processing && !hasPreview} onClick={onCancel}>
          <X size={14} /> {previewStale ? 'Cancel Preview' : 'Cancel'}
        </button>
        <span className="interface-advanced-actions">
          <button onClick={onRemoveAppliedResult}>
            <Trash2 size={13} /> Remove Applied Result
          </button>
          <button onClick={onReset}>
            <RefreshCcw size={14} /> Reset Rack
          </button>
        </span>
      </div>

      {previewStale && (
        <div className="mosh-stale-preview" role="status">
          The last preview is still visible, but its Motion Transfer selections were cleared. Apply
          Last Preview or Cancel Preview; recalculation is disabled until valid selections exist
          again.
        </div>
      )}

      {interfaceMode === 'advanced' && (
        <div className="mosh-seed-row">
          <label>
            <span>SEED</span>
            <input value={seed} onChange={(event) => onSeedChange(event.target.value)} />
          </label>
          <label>
            <span>MODE</span>
            <select
              value={globalRandomizeMode}
              onChange={(event) => setGlobalRandomizeMode(event.target.value as MoshRandomizeMode)}
            >
              <option value="balanced">Balanced</option>
              <option value="wild">Wild</option>
            </select>
          </label>
          <label className="mosh-random-lock">
            <span>LOCK SEED</span>
            <input
              type="checkbox"
              checked={randomizeSeedLocked}
              onChange={(event) => {
                lockedRandomizationRef.current = null;
                setRandomizeSeedLocked(event.target.checked);
              }}
            />
          </label>
          <div className="mosh-randomize-actions">
            <button onClick={() => randomizeGlobal('parameters')}>
              <Dices size={12} /> Randomize Parameters
            </button>
            <button onClick={() => randomizeGlobal('effects')}>
              <Dices size={12} /> Randomize Effects
            </button>
            <button disabled={rack.length < 2} onClick={() => randomizeGlobal('shuffle-order')}>
              <Dices size={12} /> Shuffle Order
            </button>
            <button onClick={() => randomizeGlobal('everything')}>
              <Dices size={12} /> Randomize Everything
            </button>
            <button className="primary" onClick={() => randomizeGlobal(lastRandomizeScope)}>
              <RefreshCcw size={12} /> New Result
            </button>
          </div>
          <output className="mosh-randomize-summary">{randomizeSummary}</output>
        </div>
      )}

      {processing && progress && (
        <div className="mosh-progress">
          <div>
            <EffectIcon
              id={moshEffectDefinitions.find((item) => item.id === progress.effectId)!.icon}
              size={16}
            />
            <span>
              <strong>Processing {progress.effectName}</strong>
              <small>
                Pass {progress.pass} / {progress.passes}
              </small>
            </span>
            <output>{progress.percent}%</output>
          </div>
          <i>
            <span style={{ width: `${progress.percent}%` }} />
          </i>
          <button onClick={onCancel}>
            <Square size={12} /> Cancel Worker
          </button>
        </div>
      )}

      <div className="mosh-rack">
        {rack.length === 0 && (
          <div className="mosh-empty">
            <EffectIcon id="flow-field" size={28} />
            <strong>THE RACK IS EMPTY</strong>
            <span>Add an effect to begin a non-destructive chain.</span>
          </div>
        )}
        {rack.map((card, index) => {
          const definition = moshEffectDefinitions.find((item) => item.id === card.effectId)!;
          const presets = moshPresets.filter((preset) => preset.effectId === card.effectId);
          const effectUserPresets = userPresets.filter(
            (preset) => preset.effectId === card.effectId,
          );
          const activePresetExists =
            card.activePresetId === 'custom' ||
            (card.activePresetId.startsWith('builtin:') &&
              presets.some((preset) => `builtin:${preset.name}` === card.activePresetId)) ||
            (card.activePresetId.startsWith('user:') &&
              effectUserPresets.some((preset) => `user:${preset.id}` === card.activePresetId));
          const selectedUser = selectedUserPreset(card);
          return (
            <article
              className={`mosh-card ${card.enabled ? '' : 'bypassed'} ${draggingId === card.instanceId ? 'dragging' : ''}`}
              data-mosh-card-id={card.instanceId}
              key={card.instanceId}
            >
              <header
                className="mosh-card-drag-header"
                onPointerDown={(event) => {
                  if (event.button !== 0 || isCardDragBlockedTarget(event.target)) return;
                  dragRef.current = {
                    instanceId: card.instanceId,
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    active: false,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  if (
                    !drag.active &&
                    dragActivationReached(drag.startX, drag.startY, event.clientX, event.clientY)
                  ) {
                    drag.active = true;
                    setDraggingId(drag.instanceId);
                  }
                  if (!drag.active) return;
                  event.preventDefault();
                  const target = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>('[data-mosh-card-id]');
                  const targetId = target?.dataset.moshCardId;
                  if (targetId && targetId !== drag.instanceId) moveCard(drag.instanceId, targetId);
                }}
                onPointerUp={(event) => finishCardDrag(event.pointerId)}
                onPointerCancel={(event) => finishCardDrag(event.pointerId)}
                onLostPointerCapture={() => finishCardDrag()}
              >
                <span className="mosh-drag" title="Drag to reorder">
                  <GripVertical size={15} />
                </span>
                <span className="mosh-order">{String(index + 1).padStart(2, '0')}</span>
                <EffectIcon id={definition.icon} size={19} />
                <div>
                  <strong>{definition.name}</strong>
                  <small>{definition.description}</small>
                </div>
                <label
                  className="mosh-bypass"
                  title={card.enabled ? 'Bypass effect' : 'Enable effect'}
                >
                  <input
                    type="checkbox"
                    checked={card.enabled}
                    onChange={(event) =>
                      updateCard(card.instanceId, (current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  <i />
                </label>
                {interfaceMode === 'advanced' && (
                  <button
                    className="icon-button"
                    aria-label={
                      card.expanded ? `Collapse ${definition.name}` : `Expand ${definition.name}`
                    }
                    onClick={() =>
                      updateCard(card.instanceId, (current) => ({
                        ...current,
                        expanded: !current.expanded,
                      }))
                    }
                  >
                    {card.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </header>
              {interfaceMode === 'advanced' && card.expanded && (
                <div className="mosh-card-body" onPointerDown={(event) => event.stopPropagation()}>
                  <SliderField
                    helpId={card.effectId === 'motion-field' ? 'motion-field.mix' : undefined}
                    label="Mix"
                    value={card.mix}
                    min={0}
                    max={1}
                    step={0.01}
                    defaultValue={1}
                    onChange={(mix) =>
                      updateCard(card.instanceId, (current) => ({
                        ...current,
                        mix,
                        activePresetId: 'custom',
                      }))
                    }
                  />
                  <SelectControl
                    label="Application target"
                    value={card.target}
                    onChange={(target) =>
                      updateCard(card.instanceId, (current) => ({
                        ...current,
                        target: target as MoshTarget,
                      }))
                    }
                  >
                    <option value="whole">Whole Image</option>
                    <option
                      value="brush"
                      disabled={!hasBrushMask || !definition.targets.includes('brush')}
                    >
                      Current Brush Mask{!hasBrushMask ? ' — draw a stroke first' : ''}
                    </option>
                    <option
                      value="selection"
                      disabled={!hasSelection || !definition.targets.includes('selection')}
                    >
                      Current Selection{!hasSelection ? ' — empty' : ''}
                    </option>
                    <option value="luminance" disabled={!definition.targets.includes('luminance')}>
                      Luminance Mask
                    </option>
                    <option value="edge" disabled={!definition.targets.includes('edge')}>
                      Edge Mask
                    </option>
                  </SelectControl>
                  {(card.target === 'luminance' || card.target === 'edge') && (
                    <div className="mosh-mask-controls">
                      {card.target === 'luminance' && (
                        <>
                          <SliderField
                            label="Mask lower"
                            value={card.settings.maskLower}
                            min={0}
                            max={255}
                            onChange={(value) =>
                              updateCard(card.instanceId, (current) => ({
                                ...current,
                                settings: { ...current.settings, maskLower: value },
                              }))
                            }
                          />
                          <SliderField
                            label="Mask upper"
                            value={card.settings.maskUpper}
                            min={0}
                            max={255}
                            onChange={(value) =>
                              updateCard(card.instanceId, (current) => ({
                                ...current,
                                settings: { ...current.settings, maskUpper: value },
                              }))
                            }
                          />
                        </>
                      )}
                      {card.target === 'edge' && (
                        <SliderField
                          label="Mask edge threshold"
                          value={card.settings.edgeThreshold}
                          min={1}
                          max={255}
                          onChange={(value) =>
                            updateCard(card.instanceId, (current) => ({
                              ...current,
                              settings: { ...current.settings, edgeThreshold: value },
                            }))
                          }
                        />
                      )}
                    </div>
                  )}
                  <SelectControl
                    label="Effect preset"
                    value={activePresetExists ? card.activePresetId : 'custom'}
                    onChange={(presetId) => {
                      if (presetId === 'custom') {
                        updateCard(card.instanceId, (current) => ({
                          ...current,
                          activePresetId: 'custom',
                        }));
                        return;
                      }
                      const preset = presetId.startsWith('builtin:')
                        ? presets.find((item) => `builtin:${item.name}` === presetId)
                        : effectUserPresets.find((item) => `user:${item.id}` === presetId);
                      if (preset) {
                        updateCard(card.instanceId, (current) => ({
                          ...current,
                          activePresetId: presetId,
                          settings: { ...current.settings, ...preset.settings },
                        }));
                      }
                    }}
                  >
                    <option value="custom">Custom</option>
                    <optgroup label="Built-in presets">
                      {presets.map((preset) => (
                        <option key={preset.name} value={`builtin:${preset.name}`}>
                          {preset.name}
                        </option>
                      ))}
                    </optgroup>
                    {effectUserPresets.length > 0 && (
                      <optgroup label="User presets">
                        {effectUserPresets.map((preset) => (
                          <option key={preset.id} value={`user:${preset.id}`}>
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </SelectControl>
                  {card.effectId === 'motion-transfer' &&
                    !card.sourceRegion &&
                    card.activePresetId !== 'custom' && (
                      <p className="mosh-preset-requirement">
                        Select a source region to use this preset.
                      </p>
                    )}
                  <div className="mosh-randomize-row">
                    <span>RANDOMIZE</span>
                    <button
                      onClick={() => {
                        const nonce = nextRandomizeNonce();
                        updateCard(card.instanceId, (current) =>
                          randomizeMoshCard(current, seed, 'balanced', nonce),
                        );
                        setRandomizeSummary(
                          `${definition.name} parameters · balanced · variation ${nonce}`,
                        );
                        if (!previewEnabled) onPreviewChange(true);
                      }}
                    >
                      <Dices size={12} /> Balanced
                    </button>
                    <button
                      onClick={() => {
                        const nonce = nextRandomizeNonce();
                        updateCard(card.instanceId, (current) =>
                          randomizeMoshCard(current, seed, 'wild', nonce),
                        );
                        setRandomizeSummary(
                          `${definition.name} parameters · wild · variation ${nonce}`,
                        );
                        if (!previewEnabled) onPreviewChange(true);
                      }}
                    >
                      <Dices size={12} /> Wild
                    </button>
                  </div>
                  <div className="mosh-preset-actions">
                    <button onClick={() => saveCurrentPreset(card)}>
                      <Save size={12} /> Save Current
                    </button>
                    <button disabled={!selectedUser} onClick={() => renameCurrentPreset(card)}>
                      Rename
                    </button>
                    <button disabled={!selectedUser} onClick={() => deleteCurrentPreset(card)}>
                      Delete
                    </button>
                    <button onClick={() => exportCurrentPreset(card)}>
                      <Download size={12} /> Export
                    </button>
                    <button onClick={() => presetImportRef.current?.click()}>
                      <Upload size={12} /> Import
                    </button>
                  </div>
                  <SettingsControls
                    card={card}
                    update={(key, value) =>
                      updateCard(card.instanceId, (current) => ({
                        ...current,
                        activePresetId: 'custom',
                        settings: { ...current.settings, [key]: value },
                      }))
                    }
                    onPickRegion={onPickRegion}
                    onClearRegion={onClearRegion}
                  />
                  <div className="mosh-card-actions">
                    <button
                      onClick={() =>
                        updateCard(card.instanceId, (current) => ({
                          ...current,
                          enabled: !current.enabled,
                        }))
                      }
                    >
                      {card.enabled ? 'Bypass' : 'Enable'}
                    </button>
                    <button
                      onClick={() =>
                        onRackChange([
                          ...rack.slice(0, index + 1),
                          {
                            ...card,
                            instanceId: `${card.effectId}-${Date.now()}-copy`,
                            settings: { ...card.settings },
                          },
                          ...rack.slice(index + 1),
                        ])
                      }
                    >
                      <Copy size={13} /> Duplicate
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        onRackChange(rack.filter((item) => item.instanceId !== card.instanceId))
                      }
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <input
        ref={presetImportRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importPresetFile(file);
          event.target.value = '';
        }}
      />
    </section>
  );
}
