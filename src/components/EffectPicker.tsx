import { useEffect, useRef, useState } from 'react';
import type { GlitchAlgorithm } from '../types';
import type { AlgorithmSettings } from '../types';
import { EffectIcon, algorithmIconIds } from '../icons/effects';
import { EffectPreviewStage, type EffectPreviewSource } from './EffectPreviewStage';
import { sharedEffectForAlgorithm } from '../effects/sharedRegistry';

interface EffectPickerProps {
  value: GlitchAlgorithm;
  items: GlitchAlgorithm[];
  descriptions: Record<string, string>;
  legacyItems?: GlitchAlgorithm[];
  previewSource: EffectPreviewSource;
  settings: AlgorithmSettings;
  seed: string;
  onChange(id: GlitchAlgorithm['id']): void;
}

export function EffectPicker({
  value,
  items,
  descriptions,
  legacyItems = [],
  previewSource,
  settings,
  seed,
  onChange,
}: EffectPickerProps) {
  const [open, setOpen] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [previewId, setPreviewId] = useState(value.id);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

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
            onClick={() => {
              onChange(item.id);
              setOpen(false);
            }}
            onPointerEnter={() => setPreviewId(item.id)}
            onFocus={() => setPreviewId(item.id)}
            role="option"
          >
            <EffectIcon id={algorithmIconIds[item.id]} size={18} />
            <span>
              <strong>
                {item.name}
                {meta && <em className="meta-effect-badge">META</em>}
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
        aria-expanded={open}
        aria-haspopup="listbox"
        className="effect-picker-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <EffectIcon id={algorithmIconIds[value.id]} size={19} />
        <span>{value.name}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="effect-picker-menu" role="listbox">
          <EffectPreviewStage
            algorithm={previewId}
            source={previewSource}
            settings={settings}
            seed={seed}
            description={sharedPreviewItem?.description ?? descriptions[previewId]}
            estimatedCost={(
              sharedPreviewItem?.cost ??
              (previewItem.family === 'advanced-brush'
                ? 'high'
                : previewItem.family === 'pixel'
                  ? 'low'
                  : 'medium')
            ).toUpperCase()}
          />
          {renderGroup(
            'ADVANCED BRUSH EFFECTS',
            items.filter((item) => item.family === 'advanced-brush'),
          )}
          {renderGroup(
            'STRUCTURAL GLITCH STAMPS',
            items.filter(
              (item) =>
                item.family !== 'pixel' &&
                item.family !== 'advanced-brush' &&
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
                Older byte-level effects. They are simpler and less structural than the main glitch
                tools.
              </small>
            </div>
          )}
          {showLegacy && renderGroup('LEGACY EFFECTS', legacyItems)}
        </div>
      )}
    </div>
  );
}
