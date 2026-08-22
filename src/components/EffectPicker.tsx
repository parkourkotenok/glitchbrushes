import { useEffect, useRef, useState } from 'react';
import type { GlitchAlgorithm } from '../types';
import { EffectIcon, algorithmIconIds } from '../icons/effects';
import { EffectPreviewStage } from './EffectPreviewStage';
import { sharedEffectForAlgorithm } from '../effects/sharedRegistry';
import {
  CompactIconBrowser,
  type CompactIconBrowserGroup,
  type CompactIconBrowserItem,
} from './CompactIconBrowser';

interface EffectPickerProps {
  value: GlitchAlgorithm;
  items: GlitchAlgorithm[];
  descriptions: Record<string, string>;
  legacyItems?: GlitchAlgorithm[];
  onChange(id: GlitchAlgorithm['id']): void;
  open?: boolean;
  onOpenChange?(open: boolean): void;
}

export function EffectPicker({
  value,
  items,
  descriptions,
  legacyItems = [],
  onChange,
  open: controlledOpen,
  onOpenChange,
}: EffectPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(open) : next;
    if (controlledOpen === undefined) setInternalOpen(resolved);
    onOpenChange?.(resolved);
  };
  const [previewId, setPreviewId] = useState(value.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    setPreviewId(value.id);
  }, [open, value.id]);

  useEffect(() => setPreviewId(value.id), [value.id]);
  const previewItem = [...items, ...legacyItems].find((item) => item.id === previewId) ?? value;
  const sharedPreviewItem = sharedEffectForAlgorithm(previewId);

  const asBrowserItem = (item: GlitchAlgorithm, badge?: 'NEW' | 'META' | 'LEGACY') => {
    const shared = sharedEffectForAlgorithm(item.id);
    return {
      id: item.id,
      value: item,
      name: item.name,
      description: shared?.description ?? descriptions[item.id],
      cost: (
        shared?.cost ??
        (item.family === 'advanced-brush' ? 'high' : item.family === 'pixel' ? 'low' : 'medium')
      ).toUpperCase(),
      badge,
      icon: <EffectIcon id={algorithmIconIds[item.id]} size={21} />,
    } satisfies CompactIconBrowserItem<GlitchAlgorithm>;
  };
  const groups: CompactIconBrowserGroup<GlitchAlgorithm>[] = [
    {
      id: 'experimental',
      label: 'NEW / EXPERIMENTAL',
      items: items.filter((item) => item.experimental).map((item) => asBrowserItem(item, 'NEW')),
    },
    {
      id: 'advanced',
      label: 'ADVANCED BRUSH EFFECTS',
      items: items
        .filter((item) => item.family === 'advanced-brush' && !item.experimental)
        .map((item) => asBrowserItem(item)),
    },
    {
      id: 'structural',
      label: 'STRUCTURAL GLITCH STAMPS',
      items: items
        .filter(
          (item) =>
            item.family !== 'pixel' &&
            item.family !== 'advanced-brush' &&
            !item.experimental &&
            item.id !== 'structural-mixed',
        )
        .map((item) => asBrowserItem(item)),
    },
    {
      id: 'meta',
      label: 'META / COMBINATION EFFECTS',
      items: items
        .filter((item) => item.id === 'structural-mixed')
        .map((item) => asBrowserItem(item, 'META')),
    },
    {
      id: 'legacy',
      label: 'LEGACY EFFECTS',
      disclosure: true,
      items: legacyItems.map((item) => asBrowserItem(item, 'LEGACY')),
    },
  ];

  return (
    <div className={`effect-picker ${open ? 'open' : ''}`} ref={rootRef}>
      <div className="effect-picker-selected-row">
        <button
          ref={triggerRef}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="effect-picker-trigger"
          onClick={() => setOpen((current) => !current)}
        >
          <EffectIcon id={algorithmIconIds[value.id]} size={19} />
          <span>{value.name}</span>
          {value.experimental && <em className="new-effect-badge">NEW</em>}
        </button>
      </div>
      {open && (
        <div className="effect-picker-menu compact-effect-picker-menu">
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
          <CompactIconBrowser
            groups={groups}
            selectedId={value.id}
            ariaLabel="Effects"
            onPreview={(item) => setPreviewId(item.id as GlitchAlgorithm['id'])}
            onSelect={(item) => {
              onChange(item.value.id);
              closeAndRestoreFocus();
            }}
            onDismiss={closeAndRestoreFocus}
          />
        </div>
      )}
    </div>
  );
}
