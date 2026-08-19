import { useCallback, useRef, useState } from 'react';
import {
  composeLayerStack,
  createLayerStack,
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
    layerStackRef.current = createLayerStack(docRef.current.width, docRef.current.height);
  }
  const [layerVersion, setLayerVersion] = useState(0);

  const bumpLayers = useCallback(() => {
    setLayerVersion((version) => version + 1);
  }, []);

  const restoreLayerSnapshot = useCallback(
    (snapshot: LayerStackSnapshot) => {
      layerStackRef.current = restoreLayerStack(snapshot);
      const current = docRef.current;
      current.pixels.set(composeLayerStack(layerStackRef.current, current.original));
      setLayerVersion((version) => version + 1);
    },
    [docRef],
  );

  const commitCurrentBufferToActiveLayer = useCallback(
    (beforeSnapshot: LayerStackSnapshot, bounds: Rectangle) => {
      const current = docRef.current;
      const beforeStack = restoreLayerStack(beforeSnapshot);
      const beforeComposite = composeLayerStack(beforeStack, current.original);
      const changed = writeCompositeResultToActiveLayer(
        layerStackRef.current,
        beforeComposite,
        current.pixels,
        bounds,
      );
      current.pixels.set(composeLayerStack(layerStackRef.current, current.original));
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
