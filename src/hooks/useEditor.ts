import { useState } from 'react';
import type { AlgorithmId, Tool } from '../types';

export type InspectorPanelId = 'effect' | 'retouch' | 'mosh' | 'image-brush' | 'raw';

export function useEditor() {
  const [tool, setTool] = useState<Tool>('brush');
  const [algorithm, setAlgorithm] = useState<AlgorithmId>('slice-displacement');
  const [activePanel, setActivePanel] = useState<InspectorPanelId>('effect');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return {
    tool,
    setTool,
    algorithm,
    setAlgorithm,
    activePanel,
    setActivePanel,
    shortcutsOpen,
    setShortcutsOpen,
  };
}
