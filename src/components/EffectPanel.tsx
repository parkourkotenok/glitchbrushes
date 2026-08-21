import { useEffect, useRef, useState } from 'react';
import { Clipboard, MoreHorizontal, RefreshCcw, Shuffle, Sparkles } from 'lucide-react';
import { AlgorithmControls } from './AlgorithmControls';
import { EffectPicker } from './EffectPicker';
import { SliderField } from './SliderField';
import { Toggle } from './ui/controls';
import { createSeed } from '../utils/prng';
import type {
  AlgorithmId,
  AlgorithmSettings,
  BrushSettings,
  GlitchAlgorithm,
  Rectangle,
} from '../types';

interface EffectPanelProps {
  algorithm: AlgorithmId;
  algorithms: Record<AlgorithmId, GlitchAlgorithm>;
  algorithmList: GlitchAlgorithm[];
  legacyAlgorithmList: GlitchAlgorithm[];
  algorithmDescriptions: Record<string, string>;
  settings: AlgorithmSettings;
  seed: string;
  brush: BrushSettings;
  onChangeAlgorithm(next: AlgorithmId): void;
  onUpdateBrush: <K extends keyof BrushSettings>(key: K, value: BrushSettings[K]) => void;
  onUpdateSetting: <K extends keyof AlgorithmSettings>(key: K, value: AlgorithmSettings[K]) => void;
  onSeedChange(seed: string): void;
  onRandomizeEffect(mode: 'balanced' | 'wild'): void;
  onResetEffect(): void;
  onNotice(message: string): void;
  cloneSource: Rectangle | null;
  cloneSourcePickMode: boolean;
  feedbackMemoryReady: boolean;
  onPickCloneSource(): void;
  onClearCloneSource(): void;
  onResetFeedback(): void;
  metaRecipeLocked: boolean;
  onMetaRecipeLockChange(locked: boolean): void;
  onNewMetaRecipe(): void;
}

export function EffectPanel(props: EffectPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const active = props.algorithms[props.algorithm];
  const isPixel = active.family === 'pixel';
  const isAdvancedBrush = active.family === 'advanced-brush';

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuTriggerRef.current?.focus();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const algorithmControls = (
    <AlgorithmControls
      algorithm={props.algorithm}
      settings={props.settings}
      update={props.onUpdateSetting}
      cloneSource={props.cloneSource}
      cloneSourcePickMode={props.cloneSourcePickMode}
      feedbackMemoryReady={props.feedbackMemoryReady}
      onPickCloneSource={props.onPickCloneSource}
      onClearCloneSource={props.onClearCloneSource}
      onResetFeedback={props.onResetFeedback}
      metaSeed={props.seed}
      metaRecipeLocked={props.metaRecipeLocked}
      onMetaRecipeLockChange={props.onMetaRecipeLockChange}
      onNewMetaRecipe={props.onNewMetaRecipe}
      group="primary"
    />
  );

  return (
    <div className="effect-inspector">
      <section className="inspector-section effect-choice-section">
        <div className="inspector-section-heading">
          <h2>Effect</h2>
          <div className="compact-menu" ref={menuRootRef}>
            <button
              ref={menuTriggerRef}
              className="icon-button compact-menu-trigger"
              aria-label="Effect actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal size={17} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="compact-menu-popover" role="menu" aria-label="Effect actions">
                <button
                  role="menuitem"
                  onClick={() => {
                    props.onRandomizeEffect('balanced');
                    setMenuOpen(false);
                    menuTriggerRef.current?.focus();
                  }}
                >
                  <Shuffle size={14} aria-hidden="true" /> Randomize effect
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    props.onRandomizeEffect('wild');
                    setMenuOpen(false);
                    menuTriggerRef.current?.focus();
                  }}
                >
                  <Sparkles size={14} aria-hidden="true" /> Randomize wildly
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    props.onResetEffect();
                    setMenuOpen(false);
                    menuTriggerRef.current?.focus();
                  }}
                >
                  <RefreshCcw size={14} aria-hidden="true" /> Reset effect
                </button>
                <div className="compact-menu-separator" role="separator" />
                <label className="compact-menu-field">
                  <span>Repeatable seed</span>
                  <input
                    value={props.seed}
                    onChange={(event) => props.onSeedChange(event.target.value)}
                  />
                </label>
                <div className="compact-menu-actions">
                  <button
                    aria-label="Generate a new effect seed"
                    onClick={() => props.onSeedChange(createSeed())}
                  >
                    <RefreshCcw size={14} aria-hidden="true" /> New seed
                  </button>
                  <button
                    aria-label="Copy effect seed"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(props.seed)
                        .then(() => props.onNotice('Seed copied.'))
                        .catch(() => props.onNotice('Clipboard API is unavailable.'))
                    }
                  >
                    <Clipboard size={14} aria-hidden="true" /> Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <EffectPicker
          value={active}
          items={props.algorithmList}
          legacyItems={props.legacyAlgorithmList}
          descriptions={props.algorithmDescriptions}
          onChange={props.onChangeAlgorithm}
        />
      </section>

      <section className="inspector-section effect-brush-section">
        <div className="inspector-section-heading">
          <h2>Brush</h2>
        </div>
        <SliderField
          label="Size"
          value={props.brush.size}
          min={2}
          max={600}
          suffix=" px"
          onChange={(value) => props.onUpdateBrush('size', value)}
        />
        <SliderField
          label="Amount"
          value={props.brush.strength}
          min={0.01}
          max={1}
          step={0.01}
          onChange={(value) => props.onUpdateBrush('strength', value)}
        />
        <SliderField
          label="Edge softness"
          value={1 - props.brush.hardness}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => props.onUpdateBrush('hardness', 1 - value)}
        />
      </section>

      <section className="inspector-section effect-controls-section">
        <div className="inspector-section-heading">
          <h2>Effect controls</h2>
          {active.experimental && <span className="new-effect-badge">NEW</span>}
        </div>
        {algorithmControls}
      </section>

      <details className="inspector-details effect-fine-tuning">
        <summary>Fine tuning</summary>
        <div className="inspector-details-content">
          <AlgorithmControls
            algorithm={props.algorithm}
            settings={props.settings}
            update={props.onUpdateSetting}
            cloneSource={props.cloneSource}
            cloneSourcePickMode={props.cloneSourcePickMode}
            feedbackMemoryReady={props.feedbackMemoryReady}
            onPickCloneSource={props.onPickCloneSource}
            onClearCloneSource={props.onClearCloneSource}
            onResetFeedback={props.onResetFeedback}
            metaSeed={props.seed}
            metaRecipeLocked={props.metaRecipeLocked}
            onMetaRecipeLockChange={props.onMetaRecipeLockChange}
            onNewMetaRecipe={props.onNewMetaRecipe}
            group="fine"
          />
          <details className="nested-inspector-details">
            <summary>Brush details</summary>
            <div className="inspector-details-content">
              <SliderField
                label="Opacity"
                value={props.brush.opacity}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(value) => props.onUpdateBrush('opacity', value)}
              />
              <SliderField
                label="Spacing"
                value={props.brush.spacing}
                min={2}
                max={100}
                suffix="%"
                onChange={(value) => props.onUpdateBrush('spacing', value)}
              />
              <SliderField
                label="Scatter"
                value={props.brush.scatter}
                min={0}
                max={1.5}
                step={0.01}
                onChange={(value) => props.onUpdateBrush('scatter', value)}
              />
              {isPixel && (
                <>
                  <SliderField
                    label="Pixel intensity"
                    value={props.settings.microIntensity}
                    min={0.05}
                    max={1}
                    step={0.01}
                    onChange={(value) => props.onUpdateSetting('microIntensity', value)}
                  />
                  <SliderField
                    label="Pixel density"
                    value={props.brush.density}
                    min={0.01}
                    max={1}
                    step={0.01}
                    onChange={(value) => props.onUpdateBrush('density', value)}
                  />
                </>
              )}
              {!isPixel && !isAdvancedBrush && (
                <>
                  <SliderField
                    label="Structural amount"
                    value={props.settings.structuralIntensity}
                    min={0.2}
                    max={1.5}
                    step={0.01}
                    onChange={(value) => props.onUpdateSetting('structuralIntensity', value)}
                  />
                  <label className="inline-select">
                    <span>Edge reach</span>
                    <select
                      value={props.settings.spill}
                      onChange={(event) =>
                        props.onUpdateSetting(
                          'spill',
                          event.target.value as AlgorithmSettings['spill'],
                        )
                      }
                    >
                      <option value="local">Local only</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="strong">Strong</option>
                    </select>
                  </label>
                </>
              )}
              <Toggle
                label="Build up overlapping stamps"
                checked={props.brush.accumulate}
                onChange={(value) => props.onUpdateBrush('accumulate', value)}
              />
              <Toggle
                label="Pen pressure"
                checked={props.brush.pressure}
                onChange={(value) => props.onUpdateBrush('pressure', value)}
              />
              {props.brush.pressure && (
                <>
                  <SliderField
                    label="Minimum pressure size"
                    value={props.brush.minPressureSize}
                    min={0.05}
                    max={1}
                    step={0.01}
                    onChange={(value) => props.onUpdateBrush('minPressureSize', value)}
                  />
                  <SliderField
                    label="Minimum pressure amount"
                    value={props.brush.minPressureStrength}
                    min={0.05}
                    max={1}
                    step={0.01}
                    onChange={(value) => props.onUpdateBrush('minPressureStrength', value)}
                  />
                </>
              )}
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
