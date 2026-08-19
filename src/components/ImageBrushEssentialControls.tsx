import { SliderField } from './SliderField';
import { imageBrushGlitchLevels } from '../imageBrush/simple';
import type { ImageBrushSettings } from '../imageBrush/types';

interface ImageBrushEssentialControlsProps {
  settings: ImageBrushSettings;
  glitchIndex: number;
  onUpdate<K extends keyof ImageBrushSettings>(key: K, value: ImageBrushSettings[K]): void;
  onOrientationChange(mode: 'fixed' | 'follow'): void;
  onGlitchAmountChange(index: number): void;
}

export function ImageBrushEssentialControls({
  settings,
  glitchIndex,
  onUpdate,
  onOrientationChange,
  onGlitchAmountChange,
}: ImageBrushEssentialControlsProps) {
  return (
    <section
      className="image-brush-compact-section image-brush-essential"
      data-testid="image-brush-essential"
    >
      <header>
        <strong>ESSENTIAL CONTROLS</strong>
        <span>PRIMARY · STYLE-SAFE</span>
      </header>
      <SliderField
        helpId="control.size"
        label="Size"
        value={settings.size}
        min={2}
        max={600}
        suffix=" px"
        defaultValue={96}
        onChange={(value) => onUpdate('size', value)}
      />
      <SliderField
        helpId="control.spacing"
        label="Spacing"
        value={settings.spacing}
        min={settings.spacingUnit === 'percent' ? 2 : 1}
        max={settings.spacingUnit === 'percent' ? 300 : 600}
        suffix={settings.spacingUnit === 'percent' ? '%' : ' px'}
        defaultValue={48}
        onChange={(value) => onUpdate('spacing', value)}
      />
      <div className="image-brush-orientation-control">
        <span>Stamp orientation</span>
        <div role="group" aria-label="Stamp orientation">
          <button
            className={settings.rotationMode === 'fixed' ? 'active' : ''}
            aria-pressed={settings.rotationMode === 'fixed'}
            data-tooltip="Keeps every image upright, so a vertical stroke forms a clean column."
            onClick={() => onOrientationChange('fixed')}
          >
            Upright column
          </button>
          <button
            className={settings.rotationMode === 'follow' ? 'active' : ''}
            aria-pressed={settings.rotationMode === 'follow'}
            data-tooltip="Turns each image along the stroke direction."
            onClick={() => onOrientationChange('follow')}
          >
            Follow stroke
          </button>
        </div>
      </div>
      <SliderField
        helpId="control.opacity"
        label="Opacity"
        value={settings.opacity}
        min={0.01}
        max={1}
        step={0.01}
        defaultValue={1}
        onChange={(value) => onUpdate('opacity', value)}
      />
      <SliderField
        helpId="image-brush.glitch-amount"
        label="Glitch Amount"
        value={glitchIndex}
        min={0}
        max={imageBrushGlitchLevels.length - 1}
        step={1}
        displayValue={
          settings.glitchAmount === 'custom'
            ? 'Custom'
            : (imageBrushGlitchLevels[glitchIndex]?.label ?? 'Clean')
        }
        defaultValue={0}
        onChange={onGlitchAmountChange}
      />
      <div className="interface-advanced-only">
        <SliderField
          helpId="control.variation"
          label="Variation"
          value={settings.effectVariation}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.35}
          onChange={(value) => onUpdate('effectVariation', value)}
        />
      </div>
    </section>
  );
}
