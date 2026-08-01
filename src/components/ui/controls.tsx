import type { ReactNode } from 'react';

/**
 * Presentational building blocks shared by the editor panels.
 * Extracted from the App monolith so the layout primitives are
 * independently reusable and unit-testable.
 */

export function PanelSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel-section">
      <header>
        <span>
          {icon}
          {title}
        </span>
      </header>
      <div className="panel-section-content">{children}</div>
    </section>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
      <span>{label}</span>
    </label>
  );
}

export function AxisPair({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange(value: [number, number]): void;
}) {
  return (
    <div className="axis-pair">
      <span>{label}</span>
      <label>
        X
        <input
          type="number"
          min={-128}
          max={128}
          value={value[0]}
          onChange={(event) => onChange([Number(event.target.value), value[1]])}
        />
      </label>
      <label>
        Y
        <input
          type="number"
          min={-128}
          max={128}
          value={value[1]}
          onChange={(event) => onChange([value[0], Number(event.target.value)])}
        />
      </label>
    </div>
  );
}
