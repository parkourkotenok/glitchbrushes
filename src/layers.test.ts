import { describe, expect, it } from 'vitest';
import {
  LAYER_TILE_SIZE,
  activeLayer,
  addImageLayer,
  addLayer,
  clearActiveLayer,
  canUseVisibleCompositeAsLayerSource,
  composeLayerStack,
  composeLayerStackRegionInto,
  composeLayerPixels,
  composeLayerPixelsRegion,
  createImageLayerStack,
  createLayerStack,
  deleteActiveLayer,
  deserializeLayerStack,
  duplicateActiveLayer,
  flattenLayerStack,
  layerMemoryBytes,
  mergeActiveLayerDown,
  moveActiveLayer,
  removeGeneratedLayers,
  restoreLayerStack,
  serializeLayerStack,
  setLayerPixel,
  snapshotLayerStack,
  toggleSoloActiveLayer,
  writeCompositeResultToActiveLayer,
  writeCompositeRegionToActiveLayer,
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

  it('composes a selected layer crop without allocating a document-sized result', () => {
    const stack = createImageLayerStack(8, 6, 'Photo', opaque(8, 6, [30, 60, 90, 255]));
    const layer = activeLayer(stack);
    layer.opacity = 0.72;
    setLayerPixel(stack, layer, 4, 3, [220, 20, 70, 180]);
    const bounds = { x: 2, y: 1, width: 4, height: 3 };
    const full = composeLayerPixels(stack, layer.id);
    const expected = new Uint8ClampedArray(bounds.width * bounds.height * 4);
    for (let row = 0; row < bounds.height; row += 1) {
      const source = ((bounds.y + row) * stack.width + bounds.x) * 4;
      expected.set(full.subarray(source, source + bounds.width * 4), row * bounds.width * 4);
    }
    const region = composeLayerPixelsRegion(stack, layer.id, bounds);
    expect(region).toHaveLength(bounds.width * bounds.height * 4);
    expect(region).toEqual(expected);
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

  it('keeps imported photos as independent hideable raster layers over white', () => {
    const white = opaque(4, 3, [255, 255, 255, 255]);
    const firstPixels = opaque(4, 3, [30, 60, 90, 255]);
    const stack = createImageLayerStack(4, 3, 'First photo', firstPixels);
    const second = addImageLayer(stack, 'Second photo', opaque(2, 1, [220, 20, 40, 255]), 2, 1);

    expect(stack.layers.map((layer) => layer.kind)).toEqual(['image', 'image']);
    expect([...composeLayerStack(stack, white).slice((1 * 4 + 1) * 4, (1 * 4 + 2) * 4)]).toEqual([
      220, 20, 40, 255,
    ]);
    second.visible = false;
    expect([...composeLayerStack(stack, white).slice((1 * 4 + 1) * 4, (1 * 4 + 2) * 4)]).toEqual([
      30, 60, 90, 255,
    ]);
    stack.layers[0]!.visible = false;
    expect(composeLayerStack(stack, white)).toEqual(white);
  });

  it('isolates the selected source and commits effects without growing the layer stack', () => {
    const stack = createImageLayerStack(2, 1, 'Photo', opaque(2, 1, [12, 24, 36, 255]));
    const imageId = stack.activeLayerId;
    expect(composeLayerPixels(stack, imageId)).toEqual(opaque(2, 1, [12, 24, 36, 255]));
    const before = composeLayerStack(stack, opaque(2, 1, [255, 255, 255, 255]));
    const target = before.slice();
    target.set([220, 10, 30, 255], 0);
    writeCompositeResultToActiveLayer(
      stack,
      before,
      target,
      { x: 0, y: 0, width: 1, height: 1 },
      imageId,
    );
    expect(stack.layers).toHaveLength(1);
    expect(stack.layers[0]!.kind).toBe('image');
    expect([...composeLayerStack(stack, opaque(2, 1, [255, 255, 255, 255])).slice(0, 4)]).toEqual([
      220, 10, 30, 255,
    ]);
  });

  it('uses the visible composite as a selected-layer source only for the safe opaque case', () => {
    const stack = createImageLayerStack(4, 3, 'Photo', opaque(4, 3, [12, 24, 36, 255]));
    const imageId = stack.activeLayerId;
    expect(canUseVisibleCompositeAsLayerSource(stack, imageId)).toBe(true);

    const hidden = addLayer(stack, 'Hidden');
    hidden.visible = false;
    stack.activeLayerId = imageId;
    expect(canUseVisibleCompositeAsLayerSource(stack, imageId)).toBe(true);

    hidden.visible = true;
    expect(canUseVisibleCompositeAsLayerSource(stack, imageId)).toBe(false);
    hidden.visible = false;
    stack.layers[0]!.opacity = 0.5;
    expect(canUseVisibleCompositeAsLayerSource(stack, imageId)).toBe(false);
  });

  it('commits a compact dirty-region target without a full target buffer', () => {
    const width = 8;
    const height = 6;
    const background = opaque(width, height, [255, 255, 255, 255]);
    const stack = createImageLayerStack(
      width,
      height,
      'Photo',
      opaque(width, height, [20, 30, 40, 255]),
    );
    const before = composeLayerStack(stack, background);
    const bounds = { x: 3, y: 2, width: 2, height: 2 };
    const targetRegion = new Uint8ClampedArray([
      200, 10, 20, 255, 210, 20, 30, 255,
      220, 30, 40, 255, 230, 40, 50, 255,
    ]);
    expect(targetRegion.byteLength).toBe(bounds.width * bounds.height * 4);
    expect(
      writeCompositeRegionToActiveLayer(
        stack,
        before,
        targetRegion,
        bounds,
        stack.activeLayerId,
      ),
    ).toBe(4);
    const result = composeLayerStack(stack, background);
    for (let row = 0; row < bounds.height; row += 1) {
      const start = ((bounds.y + row) * width + bounds.x) * 4;
      expect(result.slice(start, start + bounds.width * 4)).toEqual(
        targetRegion.slice(row * bounds.width * 4, (row + 1) * bounds.width * 4),
      );
    }
  });

  it('shares history tiles until the first write and then copies only the touched tile', () => {
    const stack = createLayerStack(600, 400);
    const layer = activeLayer(stack);
    setLayerPixel(stack, layer, 5, 5, [10, 20, 30, 255]);
    setLayerPixel(stack, layer, 300, 5, [40, 50, 60, 255]);
    const snapshot = snapshotLayerStack(stack);
    const firstBefore = snapshot.layers[0]!.tiles.find((tile) => tile.tileX === 0)!.pixels;
    const secondBefore = snapshot.layers[0]!.tiles.find((tile) => tile.tileX === 1)!.pixels;
    expect(layer.tiles.get('0:0')!.pixels).toBe(firstBefore);
    expect(layer.tiles.get('1:0')!.pixels).toBe(secondBefore);

    setLayerPixel(stack, layer, 5, 5, [90, 80, 70, 255]);
    expect(layer.tiles.get('0:0')!.pixels).not.toBe(firstBefore);
    expect(layer.tiles.get('1:0')!.pixels).toBe(secondBefore);
    expect([...firstBefore.slice((5 * 256 + 5) * 4, (5 * 256 + 5) * 4 + 4)]).toEqual([
      10, 20, 30, 255,
    ]);

    const restored = restoreLayerStack(snapshot);
    setLayerPixel(restored, activeLayer(restored), 5, 5, [1, 2, 3, 255]);
    expect([...firstBefore.slice((5 * 256 + 5) * 4, (5 * 256 + 5) * 4 + 4)]).toEqual([
      10, 20, 30, 255,
    ]);
  });

  it('commits a wide rendered region tile-by-tile without mutating shared history tiles', () => {
    const width = LAYER_TILE_SIZE + 3;
    const original = opaque(width, 1, [20, 30, 40, 255]);
    const stack = createLayerStack(width, 1);
    const before = composeLayerStack(stack, original);
    const firstTarget = before.slice();
    firstTarget.set([80, 90, 100, 255], 0);
    firstTarget.set([110, 120, 130, 255], LAYER_TILE_SIZE * 4);
    writeCompositeResultToActiveLayer(stack, before, firstTarget, { x: 0, y: 0, width, height: 1 });
    const snapshot = snapshotLayerStack(stack);
    const sharedFirstTile = snapshot.layers[0]!.tiles.find((tile) => tile.tileX === 0)!.pixels;
    const sharedSecondTile = snapshot.layers[0]!.tiles.find((tile) => tile.tileX === 1)!.pixels;

    const secondTarget = firstTarget.slice();
    secondTarget.set([140, 150, 160, 255], 0);
    secondTarget.set([170, 180, 190, 255], LAYER_TILE_SIZE * 4);
    expect(
      writeCompositeResultToActiveLayer(stack, firstTarget, secondTarget, {
        x: 0,
        y: 0,
        width,
        height: 1,
      }),
    ).toBe(2);
    expect(activeLayer(stack).tiles.get('0:0')!.pixels).not.toBe(sharedFirstTile);
    expect(activeLayer(stack).tiles.get('1:0')!.pixels).not.toBe(sharedSecondTile);
    expect(composeLayerStack(restoreLayerStack(snapshot), original)).toEqual(firstTarget);
    expect(composeLayerStack(stack, original)).toEqual(secondTarget);
  });

  it('composites opaque source-over sparse rows exactly', () => {
    const stack = createLayerStack(3, 1);
    const layer = activeLayer(stack);
    setLayerPixel(stack, layer, 0, 0, [200, 10, 20, 255]);
    setLayerPixel(stack, layer, 1, 0, [30, 210, 40, 255]);
    setLayerPixel(stack, layer, 2, 0, [50, 60, 220, 255]);
    expect(composeLayerStack(stack, opaque(3, 1, [1, 2, 3, 255]))).toEqual(
      new Uint8ClampedArray([200, 10, 20, 255, 30, 210, 40, 255, 50, 60, 220, 255]),
    );
  });

  it('matches full composition when recomposing a region with an opaque raster base', () => {
    const width = 6;
    const height = 4;
    const background = opaque(width, height, [5, 15, 25, 255]);
    const stack = createImageLayerStack(
      width,
      height,
      'Base',
      opaque(width, height, [60, 90, 120, 255]),
    );
    setLayerPixel(stack, activeLayer(stack), 0, 0, [30, 40, 50, 160]);

    const multiply = addLayer(stack, 'Multiply');
    multiply.blendMode = 'multiply';
    multiply.opacity = 0.7;
    setLayerPixel(stack, multiply, 2, 1, [180, 70, 40, 220]);
    setLayerPixel(stack, multiply, 4, 2, [40, 200, 90, 160]);

    const image = addImageLayer(
      stack,
      'Difference raster',
      opaque(3, 2, [90, 180, 30, 255]),
      3,
      2,
      1,
      1,
    );
    image.blendMode = 'difference';
    image.opacity = 0.6;

    const screen = addLayer(stack, 'Screen');
    screen.blendMode = 'screen';
    screen.opacity = 0.45;
    setLayerPixel(stack, screen, 1, 2, [220, 30, 200, 180]);
    setLayerPixel(stack, screen, 5, 3, [30, 220, 200, 255]);

    const full = composeLayerStack(stack, background);
    const wholeRegion = new Uint8ClampedArray(full.length);
    composeLayerStackRegionInto(stack, background, wholeRegion, { x: 0, y: 0, width, height });
    expect(wholeRegion).toEqual(full);

    const partialRegion = new Uint8ClampedArray(full.length).fill(17);
    const bounds = { x: 1, y: 1, width: 4, height: 2 };
    composeLayerStackRegionInto(stack, background, partialRegion, bounds);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const inside = x >= 1 && x < 5 && y >= 1 && y < 3;
        expect([...partialRegion.slice(offset, offset + 4)]).toEqual(
          inside ? [...full.slice(offset, offset + 4)] : [17, 17, 17, 17],
        );
      }
    }
  });

  it('reset keeps imported image layers but removes their direct effect tiles', () => {
    const stack = createImageLayerStack(2, 1, 'Photo', opaque(2, 1, [10, 20, 30, 255]));
    setLayerPixel(stack, activeLayer(stack), 0, 0, [200, 100, 50, 255]);
    removeGeneratedLayers(stack);
    expect(stack.layers).toHaveLength(1);
    expect(stack.layers[0]!.kind).toBe('image');
    expect(stack.layers[0]!.tiles.size).toBe(0);
  });

  it('shares immutable photo pixels across history snapshots but serializes them portably', () => {
    const pixels = opaque(2, 2, [4, 8, 12, 255]);
    const stack = createImageLayerStack(2, 2, 'Photo', pixels);
    const snapshot = snapshotLayerStack(stack);
    expect(snapshot.layers[0]!.raster!.pixels).toBe(pixels);
    const restored = deserializeLayerStack(serializeLayerStack(stack));
    expect(restored.layers[0]!.kind).toBe('image');
    expect(restored.layers[0]!.raster?.pixels).toEqual(pixels);
  });
});
