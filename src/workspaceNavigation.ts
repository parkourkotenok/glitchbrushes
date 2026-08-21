export type BrushesPanelId = 'effect' | 'retouch' | 'mosh';
export type InspectorPanelId = BrushesPanelId | 'image-brush';
export type InspectorWorkspace = 'brushes' | 'image-brush';

const legacyPanelAliases: Record<string, InspectorPanelId> = {
  effect: 'effect',
  effects: 'effect',
  retouch: 'retouch',
  mosh: 'mosh',
  'mosh-lab': 'mosh',
  'mosh lab': 'mosh',
  'image-brush': 'image-brush',
  image: 'image-brush',
};

/** Resolves both old persisted panel IDs and the new workspace URL values. */
export function normalizeInspectorPanel(value: string | null | undefined): InspectorPanelId {
  return legacyPanelAliases[value?.trim().toLowerCase() ?? ''] ?? 'effect';
}

export function workspaceForPanel(panel: InspectorPanelId): InspectorWorkspace {
  return panel === 'image-brush' ? 'image-brush' : 'brushes';
}

export function brushesPanelFor(panel: InspectorPanelId): BrushesPanelId {
  return panel === 'image-brush' ? 'effect' : panel;
}

export interface WorkspaceNavigationState {
  workspace: InspectorWorkspace;
  brushesPanel: BrushesPanelId;
}

export function workspaceNavigationState(panel: InspectorPanelId): WorkspaceNavigationState {
  return {
    workspace: workspaceForPanel(panel),
    brushesPanel: brushesPanelFor(panel),
  };
}

export function selectNavigationPanel(
  state: WorkspaceNavigationState,
  panel: InspectorPanelId,
): WorkspaceNavigationState {
  return {
    workspace: workspaceForPanel(panel),
    brushesPanel: panel === 'image-brush' ? state.brushesPanel : panel,
  };
}

export function selectNavigationWorkspace(
  state: WorkspaceNavigationState,
  workspace: InspectorWorkspace,
): WorkspaceNavigationState {
  return { ...state, workspace };
}
