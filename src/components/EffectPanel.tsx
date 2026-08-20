import type { RefObject } from 'react';
import type { ChangeEvent } from 'react';
import type { InterfaceMode } from './InterfaceModeSwitch';
import {
  Brush,
  Clipboard,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  Layers3,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { EffectPicker } from './EffectPicker';
import { AlgorithmControls } from './AlgorithmControls';
import { SliderField } from './SliderField';
import { PanelSection, Toggle } from './ui/controls';
import { EffectIcon, algorithmIconIds } from '../icons/effects';
import {
  activeLayer,
  addLayer,
  clearActiveLayer,
  deleteActiveLayer,
  duplicateActiveLayer,
  layerTileCount,
  mergeActiveLayerDown,
  moveActiveLayer,
  toggleSoloActiveLayer,
  type LayerStack,
} from '../layers/sparseLayers';
import { isAdvancedBrushId } from '../glitchAlgorithms/advancedBrushConfig';
import { formatBytes } from '../utils/geometry';
import { createSeed } from '../utils/prng';
import type {
  AlgorithmId,
  AlgorithmSettings,
  BrushSettings,
  GlitchAlgorithm,
  LayerBlendMode,
  Point,
  Preset,
  Rectangle,
} from '../types';

interface EffectPanelProps {
  interfaceMode: InterfaceMode;
  algorithm: AlgorithmId;
  algorithms: Record<AlgorithmId, GlitchAlgorithm>;
  algorithmList: GlitchAlgorithm[];
  legacyAlgorithmList: GlitchAlgorithm[];
  algorithmDescriptions: Record<string, string>;
  settings: AlgorithmSettings;
  seed: string;
  brush: BrushSettings;
  onChangeAlgorithm: (next: AlgorithmId) => void;
  onUpdateBrush: <K extends keyof BrushSettings>(key: K, value: BrushSettings[K]) => void;
  onUpdateSetting: <K extends keyof AlgorithmSettings>(key: K, value: AlgorithmSettings[K]) => void;
  onSeedChange: (seed: string) => void;
  onQuickLevel: (level: 'subtle' | 'medium' | 'aggressive' | 'broken' | 'extreme') => void;
  onRandomizeAdvancedBrush: (mode: 'balanced' | 'wild') => void;
  onResetAdvancedBrush: () => void;
  onNotice: (message: string) => void;
  cloneSource: Rectangle | null;
  cloneSourcePickMode: boolean;
  feedbackMemoryReady: boolean;
  onPickCloneSource: () => void;
  onClearCloneSource: () => void;
  onResetFeedback: () => void;
  metaRecipeLocked: boolean;
  onMetaRecipeLockChange: (locked: boolean) => void;
  onNewMetaRecipe: () => void;
  builtInPresets: Preset[];
  customPresets: Preset[];
  onApplyPreset: (preset: Preset) => void;
  onDeletePreset: (id: string) => void;
  onSavePreset: () => void;
  onExportPresets: () => void;
  onImportPresets: (file: File) => void;
  presetInputRef: RefObject<HTMLInputElement | null>;
  layerStack: LayerStack;
  layerVersion: number;
  currentLayer: { id: string; name: string; opacity: number; blendMode: LayerBlendMode };
  onFlattenLayers: () => void;
  onSelectLayer: (id: string, name: string) => void;
  onRunLayerOperation: (label: string, mutate: (stack: LayerStack) => boolean | void) => void;
}

export function EffectPanel({
  interfaceMode,
  algorithm,
  algorithms,
  algorithmList,
  legacyAlgorithmList,
  algorithmDescriptions,
  settings,
  seed,
  brush,
  onChangeAlgorithm,
  onUpdateBrush,
  onUpdateSetting,
  onSeedChange,
  onQuickLevel,
  onRandomizeAdvancedBrush,
  onResetAdvancedBrush,
  onNotice,
  cloneSource,
  cloneSourcePickMode,
  feedbackMemoryReady,
  onPickCloneSource,
  onClearCloneSource,
  onResetFeedback,
  metaRecipeLocked,
  onMetaRecipeLockChange,
  onNewMetaRecipe,
  builtInPresets,
  customPresets,
  onApplyPreset,
  onDeletePreset,
  onSavePreset,
  onExportPresets,
  onImportPresets,
  presetInputRef,
  layerStack,
  layerVersion,
  currentLayer,
  onFlattenLayers,
  onSelectLayer,
  onRunLayerOperation,
}: EffectPanelProps) {
  return (
    <>
      <section className="panel-section algorithm-card">
        <span className="eyebrow">ACTIVE ALGORITHM</span>
        <EffectPicker
          value={algorithms[algorithm]}
          items={algorithmList}
          legacyItems={legacyAlgorithmList}
          descriptions={algorithmDescriptions}
          onChange={onChangeAlgorithm}
        />
        <div className="selected-effect-summary">
          <EffectIcon id={algorithmIconIds[algorithm]} size={17} />
          <span>
            <strong>{algorithms[algorithm].name}</strong>
            <small>{algorithmDescriptions[algorithm]}</small>
          </span>
        </div>
        <div className="effect-family-row">
          <span>{algorithms[algorithm].family.toUpperCase()} ENGINE</span>
          <span>
            {algorithms[algorithm].family === 'pixel'
              ? 'MICRO'
              : algorithms[algorithm].family === 'advanced-brush'
                ? 'DIRECT PAINT'
                : 'STRUCTURAL'}
          </span>
        </div>
        <div className="effect-levels" aria-label="Effect strength presets">
          {(['subtle', 'medium', 'aggressive', 'broken', 'extreme'] as const).map((level) => (
            <button key={level} onClick={() => onQuickLevel(level)}>
              {level}
            </button>
          ))}
        </div>
        {isAdvancedBrushId(algorithm) && (
          <div className="advanced-randomize-row" aria-label="Advanced brush randomization">
            <button onClick={() => onRandomizeAdvancedBrush('balanced')}>
              <Shuffle size={13} /> Balanced
            </button>
            <button onClick={() => onRandomizeAdvancedBrush('wild')}>
              <Zap size={13} /> Wild
            </button>
            <button onClick={onResetAdvancedBrush}>
              <RotateCcw size={13} /> Defaults
            </button>
          </div>
        )}
      </section>

      <PanelSection title="Brush dynamics" icon={<Brush size={15} />}>
        <SliderField
          label="Size"
          value={brush.size}
          min={2}
          max={600}
          suffix=" px"
          onChange={(value) => onUpdateBrush('size', value)}
        />
        {interfaceMode === 'advanced' && <div className="interface-advanced-only">
          <SliderField
            label="Hardness"
            value={brush.hardness}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onUpdateBrush('hardness', value)}
          />
        </div>}
        <SliderField
          label="Opacity"
          value={brush.opacity}
          min={0.01}
          max={1}
          step={0.01}
          onChange={(value) => onUpdateBrush('opacity', value)}
        />
        <SliderField
          label="Damage"
          value={brush.strength}
          min={0.01}
          max={1}
          step={0.01}
          onChange={(value) => onUpdateBrush('strength', value)}
        />
        {interfaceMode === 'advanced' && <div className="interface-advanced-only">
          <SliderField
            label="Structural corruption"
            value={settings.structuralIntensity}
            min={0.2}
            max={1.5}
            step={0.01}
            onChange={(value) => onUpdateSetting('structuralIntensity', value)}
          />
          <SliderField
            label="Micro corruption"
            value={settings.microIntensity}
            min={0.05}
            max={1}
            step={0.01}
            onChange={(value) => onUpdateSetting('microIntensity', value)}
          />
          <SliderField
            label="Density"
            value={brush.density}
            min={0.01}
            max={1}
            step={0.01}
            onChange={(value) => onUpdateBrush('density', value)}
          />
          <SliderField
            label="Scatter"
            value={brush.scatter}
            min={0}
            max={1.5}
            step={0.01}
            onChange={(value) => onUpdateBrush('scatter', value)}
          />
          <SliderField
            label="Spacing"
            value={brush.spacing}
            min={2}
            max={100}
            suffix="%"
            onChange={(value) => onUpdateBrush('spacing', value)}
          />
          <label className="inline-select">
            <span>Effect spill</span>
            <select
              value={settings.spill}
              onChange={(event) =>
                onUpdateSetting('spill', event.target.value as AlgorithmSettings['spill'])
              }
            >
              <option value="local">Local only</option>
              <option value="small">Small bleed</option>
              <option value="medium">Medium bleed</option>
              <option value="strong">Strong bleed</option>
            </select>
          </label>
          <div className="switch-row">
            <Toggle
              label="Build up overlapping stamps"
              checked={brush.accumulate}
              onChange={(value) => onUpdateBrush('accumulate', value)}
            />
            <Toggle
              label="Pen pressure"
              checked={brush.pressure}
              onChange={(value) => onUpdateBrush('pressure', value)}
            />
          </div>
          <p className="fine-print">
            Build up overlapping stamps adds mask strength only where stamps overlap inside the
            current stroke. It does not persist feedback or mutation between strokes.
          </p>
          {brush.pressure && (
            <>
              <SliderField
                label="Min pressure size"
                value={brush.minPressureSize}
                min={0.05}
                max={1}
                step={0.01}
                onChange={(value) => onUpdateBrush('minPressureSize', value)}
              />
              <SliderField
                label="Min pressure force"
                value={brush.minPressureStrength}
                min={0.05}
                max={1}
                step={0.01}
                onChange={(value) => onUpdateBrush('minPressureStrength', value)}
              />
            </>
          )}
        </div>}
      </PanelSection>

      {interfaceMode === 'advanced' && <PanelSection
        title="Algorithm parameters"
        icon={<SlidersHorizontal size={15} />}
        className="interface-advanced-only"
      >
        <AlgorithmControls
          algorithm={algorithm}
          settings={settings}
          update={onUpdateSetting}
          cloneSource={cloneSource}
          cloneSourcePickMode={cloneSourcePickMode}
          feedbackMemoryReady={feedbackMemoryReady}
          onPickCloneSource={onPickCloneSource}
          onClearCloneSource={onClearCloneSource}
          onResetFeedback={onResetFeedback}
          metaSeed={seed}
          metaRecipeLocked={metaRecipeLocked}
          onMetaRecipeLockChange={onMetaRecipeLockChange}
          onNewMetaRecipe={onNewMetaRecipe}
        />
      </PanelSection>}

      {interfaceMode === 'advanced' && <PanelSection
        title="Seed & repeatability"
        icon={<RefreshCcw size={15} />}
        className="interface-advanced-only"
      >
        <div className="seed-row">
          <input value={seed} onChange={(event) => onSeedChange(event.target.value)} />
          <button
            className="icon-button"
            onClick={() => onSeedChange(createSeed())}
            title="Generate seed"
          >
            <Shuffle size={15} />
          </button>
          <button
            className="icon-button"
            onClick={() =>
              navigator.clipboard
                .writeText(seed)
                .then(() => onNotice('Seed copied.'))
                .catch(() => onNotice('Clipboard API is unavailable.'))
            }
            title="Copy seed"
          >
            <Clipboard size={15} />
          </button>
        </div>
      </PanelSection>}

      {interfaceMode === 'advanced' && <PanelSection title="Presets" icon={<Save size={15} />} className="interface-advanced-only">
        <div className="preset-grid">
          {[...builtInPresets, ...customPresets]
            .sort(
              (left, right) =>
                Number(right.algorithm === algorithm) - Number(left.algorithm === algorithm),
            )
            .map((preset) => (
              <div className="preset-item" key={preset.id}>
                <button onClick={() => onApplyPreset(preset)}>{preset.name}</button>
                {preset.custom && (
                  <button
                    className="preset-delete"
                    onClick={() => onDeletePreset(preset.id)}
                    title="Delete preset"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
        </div>
        <div className="button-row">
          <button onClick={onSavePreset}>
            <Plus size={14} /> Save current
          </button>
          <button onClick={onExportPresets}>
            <FileDown size={14} /> JSON
          </button>
          <button onClick={() => presetInputRef.current?.click()}>
            <FileUp size={14} /> Import
          </button>
          <input
            ref={presetInputRef}
            hidden
            type="file"
            accept="application/json"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              if (file) void onImportPresets(file);
              event.target.value = '';
            }}
          />
        </div>
      </PanelSection>}

      {false && (
        <PanelSection
          title="Glitch layers"
          icon={<Layers3 size={15} />}
          className="interface-advanced-only"
        >
          <div className="layer-stack" data-layer-version={layerVersion}>
            {[...layerStack.layers].reverse().map((item) => {
              const selected = item.id === layerStack.activeLayerId;
              return (
                <div className={`layer-stack-row ${selected ? 'active' : ''}`} key={item.id}>
                  <button
                    className="icon-button"
                    title={item.visible ? 'Hide layer' : 'Show layer'}
                    onClick={() =>
                      onRunLayerOperation('Toggle layer visibility', (stack) => {
                        const target = stack.layers.find((candidate) => candidate.id === item.id);
                        if (!target) return false;
                        target.visible = !target.visible;
                      })
                    }
                  >
                    {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    className="layer-select-button"
                    onClick={() => onSelectLayer(item.id, item.name)}
                  >
                    <strong>{item.name}</strong>
                    <span>
                      {layerTileCount(item)} tile{layerTileCount(item) === 1 ? '' : 's'} ·{' '}
                      {formatBytes(
                        [...item.tiles.values()].reduce(
                          (total, tile) => total + tile.pixels.byteLength,
                          0,
                        ),
                      )}
                    </span>
                  </button>
                  <button
                    className="icon-button layer-lock-button"
                    title={item.locked ? 'Unlock layer' : 'Lock layer'}
                    onClick={() =>
                      onRunLayerOperation(item.locked ? 'Unlock layer' : 'Lock layer', (stack) => {
                        const target = stack.layers.find((candidate) => candidate.id === item.id);
                        if (!target) return false;
                        target.locked = !target.locked;
                      })
                    }
                  >
                    {item.locked ? 'L' : '·'}
                  </button>
                </div>
              );
            })}
            <div className="layer-row original-layer">
              <Eye size={14} />
              <div>
                <strong>Original</strong>
                <span>immutable source</span>
              </div>
              <span>LOCKED</span>
            </div>
          </div>
          <div className="layer-operation-grid">
            <button
              onClick={() =>
                onRunLayerOperation('Add glitch layer', (stack) => {
                  addLayer(stack);
                })
              }
            >
              <Plus size={13} /> Add
            </button>
            <button
              onClick={() =>
                onRunLayerOperation('Duplicate layer', (stack) => {
                  duplicateActiveLayer(stack);
                })
              }
            >
              Duplicate
            </button>
            <button
              onClick={() =>
                onRunLayerOperation('Move layer up', (stack) => moveActiveLayer(stack, 1))
              }
            >
              Move up
            </button>
            <button
              onClick={() =>
                onRunLayerOperation('Move layer down', (stack) => moveActiveLayer(stack, -1))
              }
            >
              Move down
            </button>
            <button onClick={() => onRunLayerOperation('Merge layer down', mergeActiveLayerDown)}>
              Merge down
            </button>
            <button onClick={() => onRunLayerOperation('Clear active layer', clearActiveLayer)}>
              Clear
            </button>
            <button
              onClick={() =>
                onRunLayerOperation('Solo active layer', (stack) => {
                  toggleSoloActiveLayer(stack);
                })
              }
            >
              {layerStack.soloLayerId ? 'Unsolo' : 'Solo'}
            </button>
            <button
              disabled={layerStack.layers.length <= 1}
              onClick={() => onRunLayerOperation('Delete active layer', deleteActiveLayer)}
            >
              <Trash2 size={13} /> Delete
            </button>
            <button className="layer-flatten-button" onClick={onFlattenLayers}>
              Flatten visible result
            </button>
          </div>
          <label className="inline-select">
            <span>Active layer name</span>
            <input
              key={currentLayer.id}
              defaultValue={currentLayer.name}
              onBlur={(event) => {
                const name = event.target.value;
                if (name !== currentLayer.name) {
                  onRunLayerOperation('Rename layer', (stack) => {
                    activeLayer(stack).name = name;
                  });
                }
              }}
            />
          </label>
          <SliderField
            label="Layer opacity"
            value={currentLayer.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(opacity) =>
              onRunLayerOperation('Change layer opacity', (stack) => {
                activeLayer(stack).opacity = opacity;
              })
            }
          />
          <label className="inline-select">
            <span>Blend mode</span>
            <select
              value={currentLayer.blendMode}
              onChange={(event) => {
                const blendMode = event.target.value as LayerBlendMode;
                onRunLayerOperation('Change layer blend mode', (stack) => {
                  activeLayer(stack).blendMode = blendMode;
                });
              }}
            >
              <option value="source-over">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="difference">Difference</option>
            </select>
          </label>
          <p className="fine-print">
            The Original is immutable. Every glitch layer stores only touched 256×256 RGBA tiles;
            painting, MOSH LAB and IMAGE BRUSH write to the selected layer and remain independently
            composited.
          </p>
        </PanelSection>
      )}
    </>
  );
}
