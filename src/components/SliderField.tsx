import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { helpSlug } from '../help/registry';

export interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  unit?: string;
  displayValue?: string;
  defaultValue?: number;
  disabled?: boolean;
  helpId?: string;
  onChange(value: number): void;
}

export function calculateRangeProgress(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  unit,
  displayValue,
  defaultValue,
  disabled = false,
  helpId,
  onChange,
}: RangeControlProps) {
  const resolvedHelpId = helpId ?? `control.${helpSlug(label)}`;
  const progress = calculateRangeProgress(value, min, max);
  const style = {
    '--range-progress': `${progress}%`,
  } as CSSProperties;
  const stopCardDrag = (event: ReactPointerEvent<HTMLInputElement>) => event.stopPropagation();
  return (
    <label className="slider-field">
      <span>{label}</span>
      <output>
        {displayValue ??
          `${Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}${unit ?? suffix}`}
      </output>
      <input
        aria-label={label}
        data-tooltip-id={resolvedHelpId}
        data-tooltip-label={label}
        data-tooltip-reset={defaultValue === undefined ? undefined : String(defaultValue)}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={style}
        onPointerDown={stopCardDrag}
        onDoubleClick={() => {
          if (defaultValue !== undefined && !disabled) onChange(defaultValue);
        }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export const SliderField = RangeControl;
