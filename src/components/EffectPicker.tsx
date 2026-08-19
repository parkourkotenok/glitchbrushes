import { useEffect, useRef, useState } from 'react';
import type { GlitchAlgorithm } from '../types';
import { EffectIcon, algorithmIconIds } from '../icons/effects';
import { EffectPreviewStage, effectPreviewAssetUrl } from './EffectPreviewStage';
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

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => setPreviewId(value.id), [value.id]);
  useEffect(() => {
    const ids = [...items, ...legacyItems].map((item) => item.id);
    const urls = [
      '/assets/effect-previews/original.webp',
      ...ids.flatMap((id) => [
        effectPreviewAssetUrl(id, 'after'),
        effectPreviewAssetUrl(id, 'difference'),
      ]),
    ];
    for (const url of urls) {
      const image = new Image();
      image.src = url;
    }
  }, [items, legacyItems]);
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
        aria-haspopup="dialog"
        className="effect-picker-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <EffectIcon id={algorithmIconIds[value.id]} size={19} />
        <span>{value.name}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="effect-picker-menu" role="dialog" aria-label="Choose an effect">
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
            />
          </div>
          <div className="effect-picker-options" role="listbox" aria-label="Effects">
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
