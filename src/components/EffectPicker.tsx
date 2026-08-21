import { useEffect, useId, useRef, useState } from 'react';
import type { GlitchAlgorithm } from '../types';
import { EffectIcon, algorithmIconIds } from '../icons/effects';
import { EffectPreviewStage } from './EffectPreviewStage';
import { sharedEffectForAlgorithm } from '../effects/sharedRegistry';

interface EffectPickerProps {
  value: GlitchAlgorithm;
  items: GlitchAlgorithm[];
  descriptions: Record<string, string>;
  legacyItems?: GlitchAlgorithm[];
  onChange(id: GlitchAlgorithm['id']): void;
}

export function EffectPicker({
  value,
  items,
  descriptions,
  legacyItems = [],
  onChange,
}: EffectPickerProps) {
  const [open, setOpen] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [previewId, setPreviewId] = useState(value.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Partial<Record<GlitchAlgorithm['id'], HTMLButtonElement | null>>>({});
  const listboxId = useId();

  const closeAndRestoreFocus = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAndRestoreFocus();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => optionRefs.current[value.id]?.focus());
  }, [open, value.id]);

  useEffect(() => setPreviewId(value.id), [value.id]);
  const previewItem = [...items, ...legacyItems].find((item) => item.id === previewId) ?? value;
  const sharedPreviewItem = sharedEffectForAlgorithm(previewId);

  const renderGroup = (label: string, group: GlitchAlgorithm[], meta = false) =>
    group.length ? (
      <div className="effect-picker-group" key={label}>
        <span>{label}</span>
        {group.map((item) => (
          <button
            aria-selected={item.id === value.id}
            className={item.id === value.id ? 'selected' : ''}
            key={item.id}
            ref={(node) => {
              optionRefs.current[item.id] = node;
            }}
            onClick={() => {
              onChange(item.id);
              closeAndRestoreFocus();
            }}
            onPointerEnter={() => setPreviewId(item.id)}
            onFocus={() => setPreviewId(item.id)}
            role="option"
            tabIndex={-1}
          >
            <EffectIcon id={algorithmIconIds[item.id]} size={18} />
            <span>
              <strong>
                {item.name}
                {meta && <em className="meta-effect-badge">META</em>}
                {item.experimental && <em className="new-effect-badge">NEW</em>}
              </strong>
              <small>{descriptions[item.id]}</small>
            </span>
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className={`effect-picker ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        className="effect-picker-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <EffectIcon id={algorithmIconIds[value.id]} size={19} />
        <span>{value.name}</span>
        {value.experimental && <em className="new-effect-badge">NEW</em>}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="effect-picker-menu">
          <div className="effect-picker-preview-pinned">
            <EffectPreviewStage
              algorithm={previewId}
              description={sharedPreviewItem?.description ?? descriptions[previewId]}
              estimatedCost={(
                sharedPreviewItem?.cost ??
                (previewItem.family === 'advanced-brush'
                  ? 'high'
                  : previewItem.family === 'pixel'
                    ? 'low'
                    : 'medium')
              ).toUpperCase()}
              experimental={previewItem.experimental}
            />
          </div>
          <div
            className="effect-picker-options"
            id={listboxId}
            role="listbox"
            aria-label="Effects"
            onKeyDown={(event) => {
              const visible = [...items, ...(showLegacy ? legacyItems : [])];
              const current = visible.findIndex(
                (item) => optionRefs.current[item.id] === document.activeElement,
              );
              let next = current;
              if (event.key === 'ArrowDown') next = Math.min(visible.length - 1, current + 1);
              else if (event.key === 'ArrowUp') next = Math.max(0, current - 1);
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = visible.length - 1;
              else return;
              event.preventDefault();
              optionRefs.current[visible[Math.max(0, next)]?.id ?? value.id]?.focus();
            }}
          >
            {renderGroup(
              'NEW / EXPERIMENTAL',
              items.filter((item) => item.experimental),
            )}
            {renderGroup(
              'ADVANCED BRUSH EFFECTS',
              items.filter((item) => item.family === 'advanced-brush' && !item.experimental),
            )}
            {renderGroup(
              'STRUCTURAL GLITCH STAMPS',
              items.filter(
                (item) =>
                  item.family !== 'pixel' &&
                  item.family !== 'advanced-brush' &&
                  !item.experimental &&
                  item.id !== 'structural-mixed',
              ),
            )}
            {renderGroup(
              'META / COMBINATION EFFECTS',
              items.filter((item) => item.id === 'structural-mixed'),
              true,
            )}
            {legacyItems.length > 0 && (
              <div className="effect-picker-legacy-toggle">
                <button
                  aria-expanded={showLegacy}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowLegacy((current) => !current);
                  }}
                >
                  {showLegacy ? 'Hide Legacy Effects' : 'Show Legacy Effects'}
                </button>
                <small>
                  Older byte-level effects. They are simpler and less structural than the main
                  glitch tools.
                </small>
              </div>
            )}
            {showLegacy && renderGroup('LEGACY EFFECTS', legacyItems)}
          </div>
        </div>
      )}
    </div>
  );
}
