import { Brush, Droplets, Eraser, Focus, RefreshCcw, WandSparkles } from 'lucide-react';
import { SliderField } from './SliderField';
import { PanelSection, Toggle } from './ui/controls';
import { EffectIcon } from '../icons/effects';
import type { BrushSettings } from '../types';
import type { RetouchSettings, RetouchTool } from '../retouch/types';

interface RetouchPanelProps {
  tool: RetouchTool;
  onToolChange: (tool: RetouchTool) => void;
  brush: BrushSettings;
  onUpdateBrush: <K extends keyof BrushSettings>(key: K, value: BrushSettings[K]) => void;
  retouchSettings: RetouchSettings;
  onRetouchSettingsChange: (updater: (current: RetouchSettings) => RetouchSettings) => void;
}

export function RetouchPanel({
  tool,
  onToolChange,
  brush,
  onUpdateBrush,
  retouchSettings,
  onRetouchSettingsChange,
}: RetouchPanelProps) {
  return (
    <section className="retouch-panel" data-retouch-tool={tool}>
      <header className="retouch-panel-header">
        <span className="eyebrow">RETOUCH / ACTIVE LAYER</span>
        <strong>
          {tool === 'smudge'
            ? 'Smudge'
            : tool === 'blur'
              ? 'Blur'
              : tool === 'sharpen'
                ? 'Sharpen'
                : tool === 'restore'
                  ? 'Restore'
                  : 'Eraser'}
        </strong>
        <p>
          {tool === 'smudge'
            ? 'Drag sampled color and recognizable structure along the stroke.'
            : tool === 'blur'
              ? 'Soften a local dirty rectangle without processing the whole document.'
              : tool === 'sharpen'
                ? 'Increase local edge contrast with threshold and noise protection.'
                : tool === 'restore'
                  ? 'Blend back pixels from Original, the lower layer, or the previous History state.'
                  : 'Erase only the selected glitch layer to transparency. Original is immutable.'}
        </p>
      </header>
      <div className="retouch-tool-switcher" aria-label="Retouch tools">
        {(['smudge', 'blur', 'sharpen', 'restore', 'eraser'] as RetouchTool[]).map((item) => (
          <button
            key={item}
            className={tool === item ? 'active' : ''}
            onClick={() => onToolChange(item)}
          >
            <EffectIcon id={item === 'restore' ? 'restore' : item} size={15} />
            {item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <PanelSection title="Brush shape" icon={<Brush size={15} />}>
        <SliderField
          label="Size"
          value={brush.size}
          min={2}
          max={600}
          suffix=" px"
          onChange={(value) => onUpdateBrush('size', value)}
        />
        <SliderField
          label="Strength"
          value={brush.strength}
          min={0.01}
          max={1}
          step={0.01}
          onChange={(value) => onUpdateBrush('strength', value)}
        />
        <SliderField
          label="Hardness"
          value={brush.hardness}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onUpdateBrush('hardness', value)}
        />
        <SliderField
          label="Spacing"
          value={brush.spacing}
          min={2}
          max={100}
          suffix="%"
          onChange={(value) => onUpdateBrush('spacing', value)}
        />
      </PanelSection>
      {tool === 'smudge' && (
        <PanelSection title="Smudge transport" icon={<Droplets size={15} />}>
          <SliderField
            label="Pickup"
            value={retouchSettings.smudgePickup}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, smudgePickup: value }))
            }
          />
          <SliderField
            label="Wetness"
            value={retouchSettings.smudgeWetness}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, smudgeWetness: value }))
            }
          />
          <div className="switch-row">
            <Toggle
              label="Sample Merged Layers"
              checked={retouchSettings.sampleMergedLayers}
              onChange={(value) =>
                onRetouchSettingsChange((current) => ({ ...current, sampleMergedLayers: value }))
              }
            />
            <Toggle
              label="Pressure Strength"
              checked={retouchSettings.smudgePressureStrength}
              onChange={(value) =>
                onRetouchSettingsChange((current) => ({
                  ...current,
                  smudgePressureStrength: value,
                }))
              }
            />
          </div>
        </PanelSection>
      )}
      {tool === 'blur' && (
        <PanelSection title="Local blur" icon={<Focus size={15} />}>
          <SliderField
            label="Radius"
            value={retouchSettings.blurRadius}
            min={1}
            max={24}
            step={1}
            suffix=" px"
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, blurRadius: value }))
            }
          />
          <SliderField
            label="Iterations"
            value={retouchSettings.blurIterations}
            min={1}
            max={4}
            step={1}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, blurIterations: value }))
            }
          />
          <SliderField
            label="Edge Protection"
            value={retouchSettings.blurEdgeProtection}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, blurEdgeProtection: value }))
            }
          />
          <Toggle
            label="Sample Merged Layers"
            checked={retouchSettings.sampleMergedLayers}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, sampleMergedLayers: value }))
            }
          />
        </PanelSection>
      )}
      {tool === 'sharpen' && (
        <PanelSection title="Local sharpen" icon={<WandSparkles size={15} />}>
          <SliderField
            label="Radius"
            value={retouchSettings.sharpenRadius}
            min={1}
            max={12}
            step={1}
            suffix=" px"
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, sharpenRadius: value }))
            }
          />
          <SliderField
            label="Threshold"
            value={retouchSettings.sharpenThreshold}
            min={0}
            max={64}
            step={1}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, sharpenThreshold: value }))
            }
          />
          <SliderField
            label="Protect Noise"
            value={retouchSettings.sharpenProtectNoise}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({
                ...current,
                sharpenProtectNoise: value,
              }))
            }
          />
          <Toggle
            label="Sample Merged Layers"
            checked={retouchSettings.sampleMergedLayers}
            onChange={(value) =>
              onRetouchSettingsChange((current) => ({ ...current, sampleMergedLayers: value }))
            }
          />
        </PanelSection>
      )}
      {tool === 'restore' && (
        <PanelSection title="Restore source" icon={<RefreshCcw size={15} />}>
          <label className="inline-select">
            <span>Restore From</span>
            <select
              value={retouchSettings.restoreSource}
              onChange={(event) =>
                onRetouchSettingsChange((current) => ({
                  ...current,
                  restoreSource: event.target.value as RetouchSettings['restoreSource'],
                }))
              }
            >
              <option value="original">Original</option>
              <option value="lower-layer">Lower Layer</option>
              <option value="previous-history">Previous History State</option>
            </select>
          </label>
        </PanelSection>
      )}
      {tool === 'eraser' && (
        <div className="retouch-layer-note">
          <Eraser size={16} />
          <span>
            <strong>ACTIVE LAYER ONLY</strong> Alpha is reduced inside the soft brush mask. Empty
            256×256 tiles are released immediately.
          </span>
        </div>
      )}
      <p className="fine-print">
        Every completed retouch stroke creates exactly one History action. The processing mask is
        hidden unless Show processing mask is enabled.
      </p>
    </section>
  );
}
