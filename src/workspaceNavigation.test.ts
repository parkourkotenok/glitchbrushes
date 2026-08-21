import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import tabsSource from './components/InspectorTabs.tsx?raw';
import {
  normalizeInspectorPanel,
  selectNavigationPanel,
  selectNavigationWorkspace,
  workspaceNavigationState,
} from './workspaceNavigation';

describe('workspace navigation', () => {
  it('migrates persisted legacy panel IDs to the two-level workspace model', () => {
    expect(normalizeInspectorPanel('Mosh Lab')).toBe('mosh');
    expect(normalizeInspectorPanel('mosh-lab')).toBe('mosh');
    expect(normalizeInspectorPanel('image')).toBe('image-brush');
    expect(normalizeInspectorPanel('unknown-panel')).toBe('effect');
  });

  it('keeps the selected Brushes subtool while Image Brush is open', () => {
    const retouch = workspaceNavigationState('retouch');
    const imageBrush = selectNavigationPanel(retouch, 'image-brush');
    expect(imageBrush).toEqual({ workspace: 'image-brush', brushesPanel: 'retouch' });
    expect(selectNavigationWorkspace(imageBrush, 'brushes')).toEqual({
      workspace: 'brushes',
      brushesPanel: 'retouch',
    });
  });

  it('uses accessible roving tabs for both navigation levels', () => {
    expect(tabsSource).toContain('role="tablist"');
    expect(tabsSource).toContain('role="tab"');
    expect(tabsSource).toContain('aria-controls');
    expect(tabsSource).toContain("event.key === 'ArrowRight'");
    expect(tabsSource).toContain("event.key === 'ArrowLeft'");
    expect(tabsSource).toContain("event.key === 'Home'");
    expect(tabsSource).toContain("event.key === 'End'");
    expect(tabsSource).toContain('?.focus()');
  });

  it('keeps panel content mounted, restores its scroll, and routes panel changes', () => {
    expect(appSource).toContain('inspectorScrollPositionsRef');
    expect(appSource).toContain('moshPanelMounted');
    expect(appSource).toContain('imageBrushPanelMounted');
    expect(appSource).toContain("params.get('panel') ?? params.get('activePanel')");
    expect(appSource).toContain("url.searchParams.set('panel', panel)");
    expect(appSource).toContain('role="tabpanel"');
  });
});
