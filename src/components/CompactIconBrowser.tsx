import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './CompactIconBrowser.css';

export type CompactIconBrowserBadge = 'NEW' | 'META' | 'LEGACY';

export interface CompactIconBrowserItem<T> {
  id: string;
  value: T;
  name: string;
  description: string;
  cost?: string;
  icon: ReactNode;
  badge?: CompactIconBrowserBadge;
  disabled?: boolean;
  detail?: string;
}

export interface CompactIconBrowserGroup<T> {
  id: string;
  label: string;
  items: CompactIconBrowserItem<T>[];
  /** Legacy entries stay hidden until people deliberately ask for them. */
  disclosure?: boolean;
}

interface CompactIconBrowserProps<T> {
  groups: CompactIconBrowserGroup<T>[];
  selectedId?: string;
  ariaLabel: string;
  onSelect(item: CompactIconBrowserItem<T>): void;
  onPreview?(item: CompactIconBrowserItem<T>): void;
  onDismiss?(): void;
  className?: string;
}

function badgeText(badge?: CompactIconBrowserBadge): string {
  return badge ? `${badge}. ` : '';
}

export function CompactIconBrowser<T>({
  groups,
  selectedId,
  ariaLabel,
  onSelect,
  onPreview,
  onDismiss,
  className = '',
}: CompactIconBrowserProps<T>) {
  const [disclosedGroups, setDisclosedGroups] = useState<Set<string>>(() => new Set());
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const visibleGroups = useMemo(
    () => groups.filter((group) => group.items.length && (!group.disclosure || disclosedGroups.has(group.id))),
    [disclosedGroups, groups],
  );
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const enabledItems = visibleItems.filter((item) => !item.disabled);
  const tabStopId = enabledItems.some((item) => item.id === selectedId)
    ? selectedId
    : enabledItems[0]?.id;

  const focusItem = (item?: CompactIconBrowserItem<T>) => buttons.current[item?.id ?? '']?.focus();

  useEffect(() => {
    requestAnimationFrame(() => {
      const selected = visibleItems.find((item) => item.id === selectedId && !item.disabled);
      focusItem(selected ?? visibleItems.find((item) => !item.disabled));
    });
  // Opening this component is the focus-management boundary for all three browsers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onDismiss?.();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const current = visibleItems.findIndex((item) => buttons.current[item.id] === document.activeElement);
    if (event.key === 'Home') {
      event.preventDefault();
      focusItem(enabledItems[0]);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusItem(enabledItems.at(-1));
      return;
    }
    const currentButton = buttons.current[visibleItems[current]?.id ?? ''];
    if (!currentButton) return;
    const currentRect = currentButton.getBoundingClientRect();
    const candidates = visibleItems
      .map((item) => ({ item, button: buttons.current[item.id] }))
      .filter((candidate): candidate is { item: CompactIconBrowserItem<T>; button: HTMLButtonElement } =>
        Boolean(candidate.button && !candidate.button.disabled),
      )
      .map((candidate) => ({ ...candidate, rect: candidate.button.getBoundingClientRect() }));
    const direction = event.key;
    const directional = candidates
      .filter(({ rect }) => {
        if (direction === 'ArrowLeft') return rect.left < currentRect.left - 1;
        if (direction === 'ArrowRight') return rect.left > currentRect.left + 1;
        if (direction === 'ArrowUp') return rect.top < currentRect.top - 1;
        return rect.top > currentRect.top + 1;
      })
      .sort((left, right) => {
        const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
        const primary = horizontal
          ? Math.abs(left.rect.left - currentRect.left) - Math.abs(right.rect.left - currentRect.left)
          : Math.abs(left.rect.top - currentRect.top) - Math.abs(right.rect.top - currentRect.top);
        if (primary !== 0) return primary;
        return horizontal
          ? Math.abs(left.rect.top - currentRect.top) - Math.abs(right.rect.top - currentRect.top)
          : Math.abs(left.rect.left - currentRect.left) - Math.abs(right.rect.left - currentRect.left);
      });
    if (directional[0]) {
      event.preventDefault();
      directional[0].button.focus();
    }
  };

  return (
    <div
      className={`compact-icon-browser ${className}`.trim()}
      role="listbox"
      aria-label={ariaLabel}
      onKeyDown={moveFocus}
    >
      {groups.map((group) => {
        const disclosed = !group.disclosure || disclosedGroups.has(group.id);
        return (
          <section className="compact-icon-browser-group" key={group.id} aria-label={group.label}>
            <div className="compact-icon-browser-group-head">
              <span>{group.label}</span>
              {group.disclosure && (
                <button
                  type="button"
                  className="compact-icon-browser-disclosure"
                  aria-expanded={disclosed}
                  onClick={() =>
                    setDisclosedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                >
                  {disclosed ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
            {disclosed && (
              <div className="compact-icon-browser-grid">
                {group.items.map((item) => {
                  const selected = item.id === selectedId;
                  const label = `${badgeText(item.badge)}${item.name}. ${item.description}${
                    item.cost ? ` Estimated ${item.cost} cost.` : ''
                  }${item.detail ? ` ${item.detail}` : ''}`;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      ref={(node) => {
                        buttons.current[item.id] = node;
                      }}
                      className={selected ? 'selected' : ''}
                      role="option"
                      aria-selected={selected}
                      aria-label={label}
                      tabIndex={item.id === tabStopId ? 0 : -1}
                      disabled={item.disabled}
                      onClick={() => onSelect(item)}
                      onPointerEnter={() => onPreview?.(item)}
                      onFocus={() => onPreview?.(item)}
                    >
                      <span className="compact-icon-browser-glyph" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.badge && <em className={`compact-icon-browser-badge ${item.badge.toLowerCase()}`}>{item.badge}</em>}
                      <span className="compact-icon-browser-tooltip" role="tooltip">
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                        {(item.cost || item.detail) && <i>{[item.cost, item.detail].filter(Boolean).join(' · ')}</i>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
