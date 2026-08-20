import { useCallback, useRef, useState } from 'react';
import {
  composeLayerStack,
  composeLayerStackRegionInto,
  createImageLayerStack,
  restoreLayerStack,
  snapshotLayerStack,
  writeCompositeRegionToActiveLayer,
  type LayerStack,
} from '../layers/sparseLayers';
import { finalizePatches, rowPatchesBefore } from '../layers/patches';
import type { EditorDocument, LayerStackSnapshot, Rectangle } from '../types';
import { recordPerformanceMeasure } from '../utils/performance';

export function useLayerStack(docRef: { readonly current: EditorDocument }) {
  const layerStackRef = useRef<LayerStack>(null!);
  if (!layerStackRef.current) {
    const current = docRef.current;
    layerStackRef.current = createImageLayerStack(
      current.width,
      current.height,
      current.fileName.replace(/\.[^.]+$/, '') || 'Image 1',
      current.original,
    );
  }
  const [layerVersion, setLayerVersion] = useState(0);

  const bumpLayers = useCallback(() => {
    setLayerVersion((version) => version + 1);
  }, []);

  const restoreLayerSnapshot = useCallback(
    (snapshot: LayerStackSnapshot) => {
      layerStackRef.current = restoreLayerStack(snapshot);
      const current = docRef.current;
      current.pixels.set(composeLayerStack(layerStackRef.current, current.background));
      setLayerVersion((version) => version + 1);
    },
    [docRef],
  );

  const commitCurrentBufferToActiveLayer = useCallback(
    (beforeSnapshot: LayerStackSnapshot, bounds: Rectangle) => {
      const commitStartedAt = performance.now();
      const finish = <Result,>(result: Result): Result => {
        recordPerformanceMeasure('glitchbrushes:commit-current-buffer', commitStartedAt);
        return result;
      };
      const current = docRef.current;
      const beforeStack = restoreLayerStack(beforeSnapshot);
      const left = Math.max(0, Math.floor(bounds.x));
      const top = Math.max(0, Math.floor(bounds.y));
      const right = Math.min(current.width, Math.ceil(bounds.x + bounds.width));
      const bottom = Math.min(current.height, Math.ceil(bounds.y + bounds.height));
      const normalizedBounds = {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
      if (normalizedBounds.width === 0 || normalizedBounds.height === 0) {
        return finish({
          changed: 0,
          patches: [],
          layerBefore: beforeSnapshot,
          layerAfter: beforeSnapshot,
        });
      }

      // Preserve only the dirty target. Rebuild the visible "before" state directly into the
      // existing document buffer, then write the compact target into tiles and regionally
      // recompose the final pixels. No full-canvas before/after RGBA arrays are allocated.
      const targetRegion = new Uint8ClampedArray(
        normalizedBounds.width * normalizedBounds.height * 4,
      );
      for (let row = 0; row < normalizedBounds.height; row += 1) {
        const sourceStart = ((top + row) * current.width + left) * 4;
        targetRegion.set(
          current.pixels.subarray(
            sourceStart,
            sourceStart + normalizedBounds.width * 4,
          ),
          row * normalizedBounds.width * 4,
        );
      }
      composeLayerStackRegionInto(
        beforeStack,
        current.background,
        current.pixels,
        normalizedBounds,
      );
      const beforeRows = rowPatchesBefore(current.pixels, current.width, normalizedBounds);
      let hasVisibleChange = false;
      for (let y = top; y < bottom && !hasVisibleChange; y += 1) {
        const beforeRow = beforeRows[y - top]!.before;
        const targetRowStart = (y - top) * normalizedBounds.width * 4;
        for (let offset = 0; offset < beforeRow.length; offset += 1) {
          if (beforeRow[offset] !== targetRegion[targetRowStart + offset]) {
            hasVisibleChange = true;
            break;
          }
        }
      }
      if (!hasVisibleChange) {
        for (let row = 0; row < normalizedBounds.height; row += 1) {
          const destinationStart = ((top + row) * current.width + left) * 4;
          current.pixels.set(
            targetRegion.subarray(
              row * normalizedBounds.width * 4,
              (row + 1) * normalizedBounds.width * 4,
            ),
            destinationStart,
          );
        }
        return finish({
          changed: 0,
          patches: [],
          layerBefore: beforeSnapshot,
          layerAfter: beforeSnapshot,
        });
      }
      const changed = writeCompositeRegionToActiveLayer(
        layerStackRef.current,
        current.pixels,
        targetRegion,
        normalizedBounds,
        beforeSnapshot.activeLayerId,
      );
      composeLayerStackRegionInto(
        layerStackRef.current,
        current.background,
        current.pixels,
        normalizedBounds,
      );
      const patches = finalizePatches(beforeRows, current.pixels);
      setLayerVersion((version) => version + 1);
      return finish({
        changed,
        patches,
        layerBefore: beforeSnapshot,
        layerAfter: snapshotLayerStack(layerStackRef.current),
      });
    },
    [docRef],
  );

  return {
    layerStackRef,
    layerVersion,
    bumpLayers,
    restoreLayerSnapshot,
    commitCurrentBufferToActiveLayer,
  };
}
