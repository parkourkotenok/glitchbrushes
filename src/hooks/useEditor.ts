import { useCallback, useState } from 'react';
import type { AlgorithmId, Tool } from '../types';
import {
  brushesPanelFor,
  workspaceForPanel,
  type InspectorPanelId,
  type InspectorWorkspace,
} from '../workspaceNavigation';

export type { InspectorPanelId } from '../workspaceNavigation';

export function useEditor(initialPanel: InspectorPanelId = 'effect') {
  const [tool, setTool] = useState<Tool>('brush');
  const [algorithm, setAlgorithm] = useState<AlgorithmId>('slice-displacement');
  const [activeWorkspace, setActiveWorkspace] = useState<InspectorWorkspace>(
    workspaceForPanel(initialPanel),
  );
  const [activeBrushesPanel, setActiveBrushesPanel] = useState(brushesPanelFor(initialPanel));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const activePanel: InspectorPanelId =
    activeWorkspace === 'image-brush' ? 'image-brush' : activeBrushesPanel;

  const setActivePanel = useCallback((panel: InspectorPanelId) => {
    setActiveWorkspace(workspaceForPanel(panel));
    if (panel !== 'image-brush') setActiveBrushesPanel(panel);
  }, []);

  return {
    tool,
    setTool,
    algorithm,
    setAlgorithm,
    activePanel,
    setActivePanel,
    activeWorkspace,
    setActiveWorkspace,
    activeBrushesPanel,
    shortcutsOpen,
    setShortcutsOpen,
  };
}
