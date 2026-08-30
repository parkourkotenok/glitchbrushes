import type { BytePatch, HistoryAction } from '../types';
import { performanceDiagnosticsEnabled, recordPerformanceMeasure } from '../utils/performance';

export class PatchHistory {
  private undoActions: HistoryAction[] = [];
  private redoActions: HistoryAction[] = [];
  private retainedMemoryBytes = 0;
  private logicalRetainedMemoryBytes = 0;

  constructor(private readonly limit = 50) {}

  push(action: HistoryAction): void {
    if (action.patches.length === 0 && !action.layerBefore && !action.layerAfter) return;
    this.undoActions.push(action);
    this.redoActions = [];
    if (this.undoActions.length > this.limit) this.undoActions.shift();
    this.recalculateMemory();
  }

  undo(buffer: Uint8ClampedArray): HistoryAction | null {
    const action = this.undoActions.pop();
    if (!action) return null;
    // Layer snapshots are the authoritative state for layer-backed actions. App restores that
    // snapshot immediately after this method returns, so replaying the duplicate byte patches
    // first only adds full-region bandwidth to Undo.
    if (!action.layerBefore) {
      for (let index = action.patches.length - 1; index >= 0; index -= 1) {
        const patch = action.patches[index]!;
        buffer.set(patch.before, patch.start);
      }
    }
    this.redoActions.push(action);
    this.recalculateMemory();
    return action;
  }

  redo(buffer: Uint8ClampedArray): HistoryAction | null {
    const action = this.redoActions.pop();
    if (!action) return null;
    if (!action.layerAfter) {
      for (const patch of action.patches) buffer.set(patch.after, patch.start);
    }
    this.undoActions.push(action);
    this.recalculateMemory();
    return action;
  }

  clear(): void {
    this.undoActions = [];
    this.redoActions = [];
    this.recalculateMemory();
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
    const startedAt = performance.now();
    const result = this.retainedMemoryBytes;
    recordPerformanceMeasure('glitchbrushes:history-memory-read', startedAt);
    return result;
  }

  get logicalMemoryBytes(): number {
    return this.logicalRetainedMemoryBytes;
  }

  private recalculateMemory(): void {
    const measure = performanceDiagnosticsEnabled();
    const startedAt = measure ? performance.now() : 0;
    const uniqueBuffers = new Set<ArrayBufferLike>();
    let uniqueBytes = 0;
    let logicalBytes = 0;
    const count = (pixels: Uint8Array | Uint8ClampedArray) => {
      logicalBytes += pixels.byteLength;
      if (uniqueBuffers.has(pixels.buffer)) return;
      uniqueBuffers.add(pixels.buffer);
      uniqueBytes += pixels.buffer.byteLength;
    };
    for (const action of [...this.undoActions, ...this.redoActions]) {
      for (const patch of action.patches) {
        count(patch.before);
        count(patch.after);
      }
      for (const snapshot of [action.layerBefore, action.layerAfter]) {
        if (!snapshot) continue;
        for (const layer of snapshot.layers) {
          if (layer.raster) count(layer.raster.pixels);
          for (const tile of layer.tiles) count(tile.pixels);
        }
      }
    }
    this.retainedMemoryBytes = uniqueBytes;
    this.logicalRetainedMemoryBytes = logicalBytes;
    if (measure) {
      recordPerformanceMeasure('glitchbrushes:history-memory-recalculate', startedAt, {
        actions: this.undoActions.length + this.redoActions.length,
        uniqueBytes,
        logicalBytes,
      });
    }
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
