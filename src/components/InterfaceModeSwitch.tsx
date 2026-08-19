import { SlidersHorizontal, Sparkles } from 'lucide-react';

export type InterfaceMode = 'simple' | 'advanced';

interface InterfaceModeSwitchProps {
  value: InterfaceMode;
  onChange(value: InterfaceMode): void;
}

export function InterfaceModeSwitch({ value, onChange }: InterfaceModeSwitchProps) {
  return (
    <section className="interface-mode" aria-labelledby="interface-mode-label">
      <div className="interface-mode-copy">
        {value === 'simple' ? <Sparkles size={14} /> : <SlidersHorizontal size={14} />}
        <span>
          <strong id="interface-mode-label">Controls</strong>
          <small>
            {value === 'simple' ? 'The useful essentials' : 'Every available parameter'}
          </small>
        </span>
      </div>
      <div className="interface-mode-options" aria-label="Control complexity">
        <button
          type="button"
          aria-pressed={value === 'simple'}
          className={value === 'simple' ? 'active' : ''}
          onClick={() => onChange('simple')}
        >
          Simple
        </button>
        <button
          type="button"
          aria-pressed={value === 'advanced'}
          className={value === 'advanced' ? 'active' : ''}
          onClick={() => onChange('advanced')}
        >
          Advanced
        </button>
      </div>
    </section>
  );
}
