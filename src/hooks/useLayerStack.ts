import { useCallback, useRef, useState } from 'react';
import {
  composeLayerStack,
  createImageLayerStack,
  restoreLayerStack,
  snapshotLayerStack,
  writeCompositeResultToActiveLayer,
  type LayerStack,
} from '../layers/sparseLayers';
import { finalizePatches, rowPatchesBefore } from '../layers/patches';
import type { EditorDocument, LayerStackSnapshot, Rectangle } from '../types';

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
      const current = docRef.current;
      const beforeStack = restoreLayerStack(beforeSnapshot);
      const beforeComposite = composeLayerStack(beforeStack, current.background);
      const left = Math.max(0, Math.floor(bounds.x));
      const top = Math.max(0, Math.floor(bounds.y));
      const right = Math.min(current.width, Math.ceil(bounds.x + bounds.width));
      const bottom = Math.min(current.height, Math.ceil(bounds.y + bounds.height));
      let hasVisibleChange = false;
      for (let y = top; y < bottom && !hasVisibleChange; y += 1) {
        const start = (y * current.width + left) * 4;
        const end = (y * current.width + right) * 4;
        for (let offset = start; offset < end; offset += 1) {
          if (beforeComposite[offset] !== current.pixels[offset]) {
            hasVisibleChange = true;
            break;
          }
        }
      }
      if (!hasVisibleChange) {
        return {
          changed: 0,
          patches: [],
          layerBefore: beforeSnapshot,
          layerAfter: beforeSnapshot,
        };
      }
      const changed = writeCompositeResultToActiveLayer(
        layerStackRef.current,
        beforeComposite,
        current.pixels,
        bounds,
        beforeSnapshot.activeLayerId,
      );
      current.pixels.set(composeLayerStack(layerStackRef.current, current.background));
      const beforeRows = rowPatchesBefore(beforeComposite, current.width, bounds);
      const patches = finalizePatches(beforeRows, current.pixels);
      setLayerVersion((version) => version + 1);
      return {
        changed,
        patches,
        layerBefore: beforeSnapshot,
        layerAfter: snapshotLayerStack(layerStackRef.current),
      };
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
