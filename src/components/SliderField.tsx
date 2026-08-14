import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  const [draftValue, setDraftValue] = useState(value);
  const pendingValueRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (pendingValueRef.current === null) setDraftValue(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  const flushPending = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingValueRef.current;
    pendingValueRef.current = null;
    if (pending !== null) onChangeRef.current(pending);
  };
  const scheduleChange = (next: number) => {
    setDraftValue(next);
    pendingValueRef.current = next;
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(flushPending, 50);
  };
  const progress = calculateRangeProgress(draftValue, min, max);
  const style = {
    '--range-progress': `${progress}%`,
  } as CSSProperties;
  const stopCardDrag = (event: ReactPointerEvent<HTMLInputElement>) => event.stopPropagation();
  return (
    <label className="slider-field">
      <span>{label}</span>
      <output>
        {displayValue ??
          `${Number.isInteger(step) ? Math.round(draftValue) : draftValue.toFixed(2)}${unit ?? suffix}`}
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
        value={draftValue}
        disabled={disabled}
        style={style}
        onPointerDown={stopCardDrag}
        onPointerUp={flushPending}
        onBlur={flushPending}
        onDoubleClick={() => {
          if (defaultValue !== undefined && !disabled) {
            setDraftValue(defaultValue);
            pendingValueRef.current = defaultValue;
            flushPending();
          }
        }}
        onChange={(event) => scheduleChange(Number(event.target.value))}
      />
    </label>
  );
}

export const SliderField = RangeControl;
