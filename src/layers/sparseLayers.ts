import type {
  LayerBlendMode,
  LayerStackSnapshot,
  Rectangle,
  SparseLayerSnapshot,
  SparseLayerTileSnapshot,
} from '../types';

export const LAYER_TILE_SIZE = 256;

export interface SparseLayerTile {
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface SparseLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  locked: boolean;
  tiles: Map<string, SparseLayerTile>;
}

export interface LayerStack {
  width: number;
  height: number;
  activeLayerId: string;
  soloLayerId: string | null;
  layers: SparseLayer[];
}

export interface SerializedSparseLayerTile extends Omit<SparseLayerTileSnapshot, 'pixels'> {
  rgbaBase64: string;
}

export interface SerializedSparseLayer extends Omit<SparseLayerSnapshot, 'tiles'> {
  tiles: SerializedSparseLayerTile[];
}

export interface SerializedLayerStack extends Omit<LayerStackSnapshot, 'layers'> {
  layers: SerializedSparseLayer[];
}

const tileKey = (tileX: number, tileY: number) => `${tileX}:${tileY}`;

function createLayer(index: number, name?: string): SparseLayer {
  return {
    id: `glitch-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name: name ?? `Glitch Layer ${index}`,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    locked: false,
    tiles: new Map(),
  };
}

export function createLayerStack(width: number, height: number): LayerStack {
  const first = createLayer(1);
  return {
    width,
    height,
    activeLayerId: first.id,
    soloLayerId: null,
    layers: [first],
  };
}

export function activeLayer(stack: LayerStack): SparseLayer {
  return stack.layers.find((layer) => layer.id === stack.activeLayerId) ?? stack.layers[0]!;
}

export function snapshotLayerStack(stack: LayerStack): LayerStackSnapshot {
  return {
    version: 1,
    width: stack.width,
    height: stack.height,
    activeLayerId: stack.activeLayerId,
    soloLayerId: stack.soloLayerId,
    layers: stack.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      locked: layer.locked,
      tiles: [...layer.tiles.values()].map((tile) => ({
        tileX: tile.tileX,
        tileY: tile.tileY,
        width: tile.width,
        height: tile.height,
        pixels: tile.pixels.slice(),
      })),
    })),
  };
}

export function restoreLayerStack(snapshot: LayerStackSnapshot): LayerStack {
  if (snapshot.version !== 1 || snapshot.width <= 0 || snapshot.height <= 0) {
    throw new Error('Unsupported layer stack snapshot.');
  }
  const layers = snapshot.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: Math.max(0, Math.min(1, layer.opacity)),
    blendMode: layer.blendMode,
    locked: layer.locked,
    tiles: new Map(
      layer.tiles.map((tile) => [
        tileKey(tile.tileX, tile.tileY),
        {
          tileX: tile.tileX,
          tileY: tile.tileY,
          width: tile.width,
          height: tile.height,
          pixels: tile.pixels.slice(),
        },
      ]),
    ),
  }));
  if (!layers.length) return createLayerStack(snapshot.width, snapshot.height);
  const activeLayerId = layers.some((layer) => layer.id === snapshot.activeLayerId)
    ? snapshot.activeLayerId
    : layers[layers.length - 1]!.id;
  return {
    width: snapshot.width,
    height: snapshot.height,
    activeLayerId,
    soloLayerId: layers.some((layer) => layer.id === snapshot.soloLayerId)
      ? snapshot.soloLayerId
      : null,
    layers,
  };
}

export function cloneLayerStack(stack: LayerStack): LayerStack {
  return restoreLayerStack(snapshotLayerStack(stack));
}

function createTile(stack: LayerStack, tileX: number, tileY: number): SparseLayerTile {
  const left = tileX * LAYER_TILE_SIZE;
  const top = tileY * LAYER_TILE_SIZE;
  const width = Math.min(LAYER_TILE_SIZE, stack.width - left);
  const height = Math.min(LAYER_TILE_SIZE, stack.height - top);
  return {
    tileX,
    tileY,
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
  };
}

function tileIsEmpty(tile: SparseLayerTile): boolean {
  for (let offset = 3; offset < tile.pixels.length; offset += 4) {
    if (tile.pixels[offset] !== 0) return false;
  }
  return true;
}

export function setLayerPixel(
  stack: LayerStack,
  layer: SparseLayer,
  x: number,
  y: number,
  rgba: ArrayLike<number>,
): void {
  if (x < 0 || y < 0 || x >= stack.width || y >= stack.height) return;
  const tileX = Math.floor(x / LAYER_TILE_SIZE);
  const tileY = Math.floor(y / LAYER_TILE_SIZE);
  const key = tileKey(tileX, tileY);
  let tile = layer.tiles.get(key);
  if (!tile && rgba[3] === 0) return;
  if (!tile) {
    tile = createTile(stack, tileX, tileY);
    layer.tiles.set(key, tile);
  }
  const localX = x - tileX * LAYER_TILE_SIZE;
  const localY = y - tileY * LAYER_TILE_SIZE;
  const offset = (localY * tile.width + localX) * 4;
  tile.pixels[offset] = rgba[0] ?? 0;
  tile.pixels[offset + 1] = rgba[1] ?? 0;
  tile.pixels[offset + 2] = rgba[2] ?? 0;
  tile.pixels[offset + 3] = rgba[3] ?? 0;
}

function blendChannel(backdrop: number, source: number, mode: LayerBlendMode): number {
  if (mode === 'multiply') return backdrop * source;
  if (mode === 'screen') return backdrop + source - backdrop * source;
  if (mode === 'overlay') {
    return backdrop <= 0.5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source);
  }
  if (mode === 'difference') return Math.abs(backdrop - source);
  return source;
}

function compositePixel(
  output: Uint8ClampedArray,
  destinationOffset: number,
  source: Uint8ClampedArray,
  sourceOffset: number,
  opacity: number,
  mode: LayerBlendMode,
): void {
  const sourceAlpha = (source[sourceOffset + 3]! / 255) * opacity;
  if (sourceAlpha <= 0) return;
  const backdropAlpha = output[destinationOffset + 3]! / 255;
  const outputAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) {
    output.fill(0, destinationOffset, destinationOffset + 4);
    return;
  }
  for (let channel = 0; channel < 3; channel += 1) {
    const backdrop = output[destinationOffset + channel]! / 255;
    const sourceValue = source[sourceOffset + channel]! / 255;
    const blended = blendChannel(backdrop, sourceValue, mode);
    const premultiplied =
      (1 - sourceAlpha) * backdrop * backdropAlpha +
      (1 - backdropAlpha) * sourceValue * sourceAlpha +
      sourceAlpha * backdropAlpha * blended;
    output[destinationOffset + channel] = Math.round((premultiplied / outputAlpha) * 255);
  }
  output[destinationOffset + 3] = Math.round(outputAlpha * 255);
}

export function composeLayerStack(
  stack: LayerStack,
  original: Uint8ClampedArray,
): Uint8ClampedArray {
  if (original.length !== stack.width * stack.height * 4) {
    throw new Error('Original image dimensions do not match the layer stack.');
  }
  const output = original.slice();
  for (const layer of stack.layers) {
    if (!layer.visible || (stack.soloLayerId && stack.soloLayerId !== layer.id)) continue;
    for (const tile of layer.tiles.values()) {
      const left = tile.tileX * LAYER_TILE_SIZE;
      const top = tile.tileY * LAYER_TILE_SIZE;
      for (let localY = 0; localY < tile.height; localY += 1) {
        for (let localX = 0; localX < tile.width; localX += 1) {
          const sourceOffset = (localY * tile.width + localX) * 4;
          if (tile.pixels[sourceOffset + 3] === 0) continue;
          const destinationOffset = ((top + localY) * stack.width + left + localX) * 4;
          compositePixel(
            output,
            destinationOffset,
            tile.pixels,
            sourceOffset,
            layer.opacity,
            layer.blendMode,
          );
        }
      }
    }
  }
  return output;
}

export function composeLayerStackBelowActive(
  stack: LayerStack,
  original: Uint8ClampedArray,
): Uint8ClampedArray {
  const activeIndex = stack.layers.findIndex((layer) => layer.id === stack.activeLayerId);
  if (activeIndex <= 0) return original.slice();
  return composeLayerStack(
    {
      width: stack.width,
      height: stack.height,
      activeLayerId: stack.layers[Math.max(0, activeIndex - 1)]!.id,
      soloLayerId: null,
      layers: stack.layers.slice(0, activeIndex),
    },
    original,
  );
}

export function composeActiveLayerPixels(stack: LayerStack): Uint8ClampedArray {
  const layer = activeLayer(stack);
  return composeLayerStack(
    {
      width: stack.width,
      height: stack.height,
      activeLayerId: layer.id,
      soloLayerId: null,
      layers: [layer],
    },
    new Uint8ClampedArray(stack.width * stack.height * 4),
  );
}

export function eraseActiveLayerWithMask(
  stack: LayerStack,
  compactMask: Uint8Array,
  bounds: Rectangle,
  strength: number,
): number {
  const layer = activeLayer(stack);
  if (layer.locked || compactMask.length !== bounds.width * bounds.height) return 0;
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(stack.width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(stack.height, Math.ceil(bounds.y + bounds.height));
  const amount = Math.max(0, Math.min(1, strength));
  let changed = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const maskValue = compactMask[(y - bounds.y) * bounds.width + x - bounds.x]! / 255;
      if (maskValue <= 0) continue;
      const tileX = Math.floor(x / LAYER_TILE_SIZE);
      const tileY = Math.floor(y / LAYER_TILE_SIZE);
      const tile = layer.tiles.get(tileKey(tileX, tileY));
      if (!tile) continue;
      const localX = x - tileX * LAYER_TILE_SIZE;
      const localY = y - tileY * LAYER_TILE_SIZE;
      const offset = (localY * tile.width + localX) * 4;
      const beforeAlpha = tile.pixels[offset + 3]!;
      const nextAlpha = Math.round(beforeAlpha * (1 - maskValue * amount));
      if (nextAlpha === beforeAlpha) continue;
      tile.pixels[offset + 3] = nextAlpha;
      if (nextAlpha === 0) tile.pixels.fill(0, offset, offset + 4);
      changed += 1;
    }
  }
  for (const [key, tile] of layer.tiles) if (tileIsEmpty(tile)) layer.tiles.delete(key);
  return changed;
}

export function writeCompositeResultToActiveLayer(
  stack: LayerStack,
  beforeComposite: Uint8ClampedArray,
  targetComposite: Uint8ClampedArray,
  bounds: Rectangle,
): number {
  const layer = activeLayer(stack);
  if (layer.locked) return 0;
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(stack.width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(stack.height, Math.ceil(bounds.y + bounds.height));
  let changed = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * stack.width + x) * 4;
      if (
        beforeComposite[offset] === targetComposite[offset] &&
        beforeComposite[offset + 1] === targetComposite[offset + 1] &&
        beforeComposite[offset + 2] === targetComposite[offset + 2] &&
        beforeComposite[offset + 3] === targetComposite[offset + 3]
      )
        continue;
      setLayerPixel(stack, layer, x, y, targetComposite.subarray(offset, offset + 4));
      changed += 1;
    }
  }
  for (const [key, tile] of layer.tiles) {
    if (tileIsEmpty(tile)) layer.tiles.delete(key);
  }
  return changed;
}

export function addLayer(stack: LayerStack, name?: string): SparseLayer {
  const layer = createLayer(stack.layers.length + 1, name);
  const activeIndex = stack.layers.findIndex((item) => item.id === stack.activeLayerId);
  stack.layers.splice(Math.max(0, activeIndex + 1), 0, layer);
  stack.activeLayerId = layer.id;
  stack.soloLayerId = null;
  return layer;
}

export function duplicateActiveLayer(stack: LayerStack): SparseLayer {
  const source = activeLayer(stack);
  const duplicate = createLayer(stack.layers.length + 1, `${source.name} copy`);
  duplicate.visible = source.visible;
  duplicate.opacity = source.opacity;
  duplicate.blendMode = source.blendMode;
  duplicate.locked = false;
  duplicate.tiles = new Map(
    [...source.tiles].map(([key, tile]) => [key, { ...tile, pixels: tile.pixels.slice() }]),
  );
  const index = stack.layers.indexOf(source);
  stack.layers.splice(index + 1, 0, duplicate);
  stack.activeLayerId = duplicate.id;
  stack.soloLayerId = null;
  return duplicate;
}

export function deleteActiveLayer(stack: LayerStack): boolean {
  if (stack.layers.length <= 1) return false;
  const index = stack.layers.findIndex((layer) => layer.id === stack.activeLayerId);
  if (index < 0) return false;
  const [removed] = stack.layers.splice(index, 1);
  stack.activeLayerId = stack.layers[Math.min(index, stack.layers.length - 1)]!.id;
  if (stack.soloLayerId === removed!.id) stack.soloLayerId = null;
  return true;
}

export function moveActiveLayer(stack: LayerStack, direction: -1 | 1): boolean {
  const index = stack.layers.findIndex((layer) => layer.id === stack.activeLayerId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= stack.layers.length) return false;
  const [layer] = stack.layers.splice(index, 1);
  stack.layers.splice(target, 0, layer!);
  return true;
}

export function clearActiveLayer(stack: LayerStack): boolean {
  const layer = activeLayer(stack);
  if (layer.locked || layer.tiles.size === 0) return false;
  layer.tiles.clear();
  return true;
}

export function toggleSoloActiveLayer(stack: LayerStack): void {
  stack.soloLayerId = stack.soloLayerId === stack.activeLayerId ? null : stack.activeLayerId;
}

function transparentBase(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

function writeOpaqueBufferToLayer(
  stack: LayerStack,
  layer: SparseLayer,
  pixels: Uint8ClampedArray,
): void {
  layer.tiles.clear();
  for (let y = 0; y < stack.height; y += 1) {
    for (let x = 0; x < stack.width; x += 1) {
      const offset = (y * stack.width + x) * 4;
      if (pixels[offset + 3] === 0) continue;
      setLayerPixel(stack, layer, x, y, pixels.subarray(offset, offset + 4));
    }
  }
}

export function mergeActiveLayerDown(stack: LayerStack): boolean {
  const topIndex = stack.layers.findIndex((layer) => layer.id === stack.activeLayerId);
  if (topIndex <= 0) return false;
  const lower = stack.layers[topIndex - 1]!;
  const upper = stack.layers[topIndex]!;
  if (lower.locked || upper.locked) return false;
  const pair: LayerStack = {
    width: stack.width,
    height: stack.height,
    activeLayerId: upper.id,
    soloLayerId: null,
    layers: [lower, upper],
  };
  const mergedPixels = composeLayerStack(pair, transparentBase(stack.width, stack.height));
  const merged = createLayer(stack.layers.length, `${lower.name} + ${upper.name}`);
  writeOpaqueBufferToLayer(stack, merged, mergedPixels);
  stack.layers.splice(topIndex - 1, 2, merged);
  stack.activeLayerId = merged.id;
  stack.soloLayerId = null;
  return true;
}

export function flattenLayerStack(stack: LayerStack, original: Uint8ClampedArray): void {
  const flattenedPixels = composeLayerStack(stack, original);
  const flattened = createLayer(1, 'Flattened Result');
  writeOpaqueBufferToLayer(stack, flattened, flattenedPixels);
  stack.layers = [flattened];
  stack.activeLayerId = flattened.id;
  stack.soloLayerId = null;
}

export function layerMemoryBytes(stack: LayerStack): number {
  return stack.layers.reduce(
    (total, layer) =>
      total +
      [...layer.tiles.values()].reduce(
        (layerTotal, tile) => layerTotal + tile.pixels.byteLength,
        0,
      ),
    0,
  );
}

export function layerTileCount(layer: SparseLayer): number {
  return layer.tiles.size;
}

function bytesToBase64(bytes: Uint8ClampedArray): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8ClampedArray {
  const binary = atob(value);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function serializeLayerStack(stack: LayerStack): SerializedLayerStack {
  const snapshot = snapshotLayerStack(stack);
  return {
    ...snapshot,
    layers: snapshot.layers.map((layer) => ({
      ...layer,
      tiles: layer.tiles.map((tile) => ({
        tileX: tile.tileX,
        tileY: tile.tileY,
        width: tile.width,
        height: tile.height,
        rgbaBase64: bytesToBase64(tile.pixels),
      })),
    })),
  };
}

export function deserializeLayerStack(serialized: SerializedLayerStack): LayerStack {
  return restoreLayerStack({
    ...serialized,
    layers: serialized.layers.map((layer) => ({
      ...layer,
      tiles: layer.tiles.map((tile) => ({
        tileX: tile.tileX,
        tileY: tile.tileY,
        width: tile.width,
        height: tile.height,
        pixels: base64ToBytes(tile.rgbaBase64),
      })),
    })),
  });
}
