import type { BytePatch, HistoryAction } from '../types';

export class PatchHistory {
  private undoActions: HistoryAction[] = [];
  private redoActions: HistoryAction[] = [];

  constructor(private readonly limit = 50) {}

  push(action: HistoryAction): void {
    if (action.patches.length === 0 && !action.layerBefore && !action.layerAfter) return;
    this.undoActions.push(action);
    this.redoActions = [];
    if (this.undoActions.length > this.limit) this.undoActions.shift();
  }

  undo(buffer: Uint8ClampedArray): HistoryAction | null {
    const action = this.undoActions.pop();
    if (!action) return null;
    for (let index = action.patches.length - 1; index >= 0; index -= 1) {
      const patch = action.patches[index]!;
      buffer.set(patch.before, patch.start);
    }
    this.redoActions.push(action);
    return action;
  }

  redo(buffer: Uint8ClampedArray): HistoryAction | null {
    const action = this.redoActions.pop();
    if (!action) return null;
    for (const patch of action.patches) buffer.set(patch.after, patch.start);
    this.undoActions.push(action);
    return action;
  }

  clear(): void {
    this.undoActions = [];
    this.redoActions = [];
  }

  undoTo(buffer: Uint8ClampedArray, actionId: string): HistoryAction[] {
    const targetIndex = this.undoActions.findIndex((action) => action.id === actionId);
    if (targetIndex < 0) return [];
    const undone: HistoryAction[] = [];
    while (this.undoActions.length - 1 > targetIndex) {
      const action = this.undo(buffer);
      if (!action) break;
      undone.push(action);
    }
    return undone;
  }

  get canUndo(): boolean {
    return this.undoActions.length > 0;
  }

  get canRedo(): boolean {
    return this.redoActions.length > 0;
  }

  get undoCount(): number {
    return this.undoActions.length;
  }

  get redoCount(): number {
    return this.redoActions.length;
  }

  get undoEntries(): readonly HistoryAction[] {
    return [...this.undoActions];
  }

  get redoEntries(): readonly HistoryAction[] {
    return [...this.redoActions];
  }

  get memoryBytes(): number {
    return [...this.undoActions, ...this.redoActions].reduce(
      (total, action) =>
        total +
        action.patches.reduce(
          (patchTotal, patch) => patchTotal + patch.before.byteLength + patch.after.byteLength,
          0,
        ) +
        [action.layerBefore, action.layerAfter].reduce(
          (snapshotTotal, snapshot) =>
            snapshotTotal +
            (snapshot?.layers.reduce(
              (layerTotal, layer) =>
                layerTotal +
                layer.tiles.reduce((tileTotal, tile) => tileTotal + tile.pixels.byteLength, 0),
              0,
            ) ?? 0),
          0,
        ),
      0,
    );
  }
}

export function createPatch(
  start: number,
  before: Uint8ClampedArray,
  buffer: Uint8ClampedArray,
): BytePatch | null {
  const after = buffer.slice(start, start + before.length);
  let changed = false;
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] !== after[index]) {
      changed = true;
      break;
    }
  }
  return changed ? { start, before, after } : null;
}

export function restoreOriginalRange(
  buffer: Uint8ClampedArray,
  original: Uint8ClampedArray,
  start: number,
  end: number,
): BytePatch | null {
  const safeStart = Math.max(0, Math.min(start, buffer.length - 1));
  const safeEnd = Math.max(safeStart, Math.min(end, buffer.length - 1));
  const before = buffer.slice(safeStart, safeEnd + 1);
  buffer.set(original.subarray(safeStart, safeEnd + 1), safeStart);
  return createPatch(safeStart, before, buffer);
}
