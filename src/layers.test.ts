import { describe, expect, it } from 'vitest';
import {
  LAYER_TILE_SIZE,
  activeLayer,
  addLayer,
  clearActiveLayer,
  composeLayerStack,
  createLayerStack,
  deleteActiveLayer,
  deserializeLayerStack,
  duplicateActiveLayer,
  flattenLayerStack,
  layerMemoryBytes,
  mergeActiveLayerDown,
  moveActiveLayer,
  serializeLayerStack,
  setLayerPixel,
  snapshotLayerStack,
  toggleSoloActiveLayer,
  writeCompositeResultToActiveLayer,
} from './layers/sparseLayers';

function opaque(width: number, height: number, rgba: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(rgba, offset);
  return pixels;
}

describe('sparse tiled layer stack', () => {
  it('allocates only touched 256x256 tiles and releases transparent tiles', () => {
    const stack = createLayerStack(600, 400);
    const layer = activeLayer(stack);
    setLayerPixel(stack, layer, 2, 3, [255, 0, 0, 255]);
    setLayerPixel(stack, layer, 300, 3, [0, 255, 0, 255]);
    expect(LAYER_TILE_SIZE).toBe(256);
    expect(layer.tiles.size).toBe(2);
    expect(layerMemoryBytes(stack)).toBeLessThan(600 * 400 * 4);
    expect(clearActiveLayer(stack)).toBe(true);
    expect(layer.tiles.size).toBe(0);
    expect(layerMemoryBytes(stack)).toBe(0);
  });

  it('composes normal, opacity, visibility and solo without mutating Original', () => {
    const original = opaque(2, 1, [100, 100, 100, 255]);
    const preserved = original.slice();
    const stack = createLayerStack(2, 1);
    setLayerPixel(stack, activeLayer(stack), 0, 0, [200, 0, 0, 255]);
    activeLayer(stack).opacity = 0.5;
    expect([...composeLayerStack(stack, original).slice(0, 4)]).toEqual([150, 50, 50, 255]);
    const upper = addLayer(stack);
    setLayerPixel(stack, upper, 1, 0, [0, 0, 255, 255]);
    toggleSoloActiveLayer(stack);
    expect([...composeLayerStack(stack, original)]).toEqual([100, 100, 100, 255, 0, 0, 255, 255]);
    toggleSoloActiveLayer(stack);
    upper.visible = false;
    expect([...composeLayerStack(stack, original).slice(4)]).toEqual([100, 100, 100, 255]);
    expect(original).toEqual(preserved);
  });

  it('writes a rendered effect into the active layer while preserving other layers', () => {
    const original = opaque(4, 4, [20, 30, 40, 255]);
    const stack = createLayerStack(4, 4);
    const before = composeLayerStack(stack, original);
    const target = before.slice();
    target.set([240, 10, 80, 255], (2 * 4 + 1) * 4);
    expect(
      writeCompositeResultToActiveLayer(stack, before, target, { x: 1, y: 2, width: 1, height: 1 }),
    ).toBe(1);
    expect(activeLayer(stack).tiles.size).toBe(1);
    expect(composeLayerStack(stack, original)).toEqual(target);
  });

  it('supports add, duplicate, reorder, delete, merge and flatten operations', () => {
    const original = opaque(2, 2, [10, 20, 30, 255]);
    const stack = createLayerStack(2, 2);
    const firstId = stack.activeLayerId;
    setLayerPixel(stack, activeLayer(stack), 0, 0, [255, 0, 0, 255]);
    const second = duplicateActiveLayer(stack);
    expect(stack.layers).toHaveLength(2);
    expect(second.tiles.size).toBe(1);
    expect(moveActiveLayer(stack, -1)).toBe(true);
    expect(stack.layers[0]!.id).toBe(second.id);
    expect(moveActiveLayer(stack, 1)).toBe(true);
    expect(mergeActiveLayerDown(stack)).toBe(true);
    expect(stack.layers).toHaveLength(1);
    const third = addLayer(stack);
    setLayerPixel(stack, third, 1, 1, [0, 255, 0, 255]);
    expect(deleteActiveLayer(stack)).toBe(true);
    expect(stack.layers).toHaveLength(1);
    expect(stack.activeLayerId).not.toBe(firstId);
    flattenLayerStack(stack, original);
    expect(stack.layers).toHaveLength(1);
    expect(activeLayer(stack).name).toBe('Flattened Result');
  });

  it('round-trips all sparse tiles and metadata through project serialization', () => {
    const stack = createLayerStack(300, 300);
    const bottom = activeLayer(stack);
    bottom.name = 'A';
    bottom.blendMode = 'difference';
    setLayerPixel(stack, bottom, 299, 299, [1, 2, 3, 255]);
    const top = addLayer(stack, 'B');
    top.locked = true;
    top.opacity = 0.33;
    setLayerPixel(stack, top, 5, 6, [9, 8, 7, 128]);
    stack.soloLayerId = top.id;
    const restored = deserializeLayerStack(serializeLayerStack(stack));
    expect(snapshotLayerStack(restored)).toEqual(snapshotLayerStack(stack));
  });
});
