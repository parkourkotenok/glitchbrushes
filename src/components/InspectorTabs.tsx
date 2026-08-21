import { useRef, type KeyboardEvent, type RefObject } from 'react';
import { EffectIcon } from '../icons/effects';
import type { BrushesPanelId, InspectorWorkspace } from '../workspaceNavigation';

interface InspectorTabsProps {
  activeWorkspace: InspectorWorkspace;
  onSelect: (workspace: InspectorWorkspace) => void;
}

function selectTabFromKey(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  count: number,
  refs: RefObject<Array<HTMLButtonElement | null>>,
  select: (index: number) => void,
) {
  const next =
    event.key === 'ArrowRight'
      ? (index + 1) % count
      : event.key === 'ArrowLeft'
        ? (index - 1 + count) % count
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? count - 1
            : null;
  if (next === null) return;
  event.preventDefault();
  select(next);
  refs.current[next]?.focus();
}

export function InspectorTabs({ activeWorkspace, onSelect }: InspectorTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs: Array<{ id: InspectorWorkspace; label: string }> = [
    { id: 'brushes', label: 'Brushes' },
    { id: 'image-brush', label: 'Image Brush' },
  ];
  return (
    <nav className="inspector-tabs" aria-label="Workspaces" role="tablist">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`workspace-tab-${tab.id}`}
          role="tab"
          tabIndex={activeWorkspace === tab.id ? 0 : -1}
          aria-selected={activeWorkspace === tab.id}
          aria-controls={`workspace-panel-${tab.id}`}
          className={activeWorkspace === tab.id ? 'active' : ''}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) =>
            selectTabFromKey(event, index, tabs.length, refs, (next) => onSelect(tabs[next]!.id))
          }
        >
          <EffectIcon id={tab.id === 'brushes' ? 'pixel-sort-brush' : 'image-brush'} size={15} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

interface BrushesTabsProps {
  activePanel: BrushesPanelId;
  onSelect: (panel: BrushesPanelId) => void;
}

export function BrushesTabs({ activePanel, onSelect }: BrushesTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs: Array<{ id: BrushesPanelId; label: string }> = [
    { id: 'effect', label: 'Effect' },
    { id: 'retouch', label: 'Retouch' },
    { id: 'mosh', label: 'Mosh' },
  ];
  return (
    <nav className="brushes-tabs" aria-label="Brush tools" role="tablist">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`brushes-tab-${tab.id}`}
          role="tab"
          tabIndex={activePanel === tab.id ? 0 : -1}
          aria-selected={activePanel === tab.id}
          aria-controls={`brushes-panel-${tab.id}`}
          className={activePanel === tab.id ? 'active' : ''}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) =>
            selectTabFromKey(event, index, tabs.length, refs, (next) => onSelect(tabs[next]!.id))
          }
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
