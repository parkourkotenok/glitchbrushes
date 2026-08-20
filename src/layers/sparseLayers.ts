import type {
  LayerBlendMode,
  LayerKind,
  LayerStackSnapshot,
  RasterLayerSnapshot,
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
  /** The pixel buffer is also owned by a history snapshot or duplicate. Clone before writing. */
  shared: boolean;
}

export interface SparseLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  locked: boolean;
  kind: LayerKind;
  /** Immutable cropped RGBA source for ordinary image layers. */
  raster: RasterLayerSnapshot | null;
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

export interface SerializedSparseLayer extends Omit<SparseLayerSnapshot, 'tiles' | 'raster'> {
  raster?: Omit<RasterLayerSnapshot, 'pixels'> & { rgbaBase64: string };
  tiles: SerializedSparseLayerTile[];
}

export interface SerializedLayerStack extends Omit<LayerStackSnapshot, 'layers'> {
  layers: SerializedSparseLayer[];
}

const tileKey = (tileX: number, tileY: number) => `${tileX}:${tileY}`;

function createLayer(index: number, name?: string, kind: LayerKind = 'glitch'): SparseLayer {
  return {
    id: `${kind}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name:
      name ??
      (kind === 'image-brush'
        ? `Image Brush Layer ${index}`
        : kind === 'image'
          ? `Image ${index}`
          : `Glitch Layer ${index}`),
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    locked: false,
    kind,
    raster: null,
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

function rasterIsOpaque(pixels: Uint8ClampedArray): boolean {
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] !== 255) return false;
  }
  return true;
}

export function createImageLayerStack(
  width: number,
  height: number,
  name: string,
  pixels: Uint8ClampedArray,
): LayerStack {
  if (pixels.length !== width * height * 4) {
    throw new Error('Initial image dimensions do not match the canvas.');
  }
  const image = createLayer(1, name, 'image');
  image.raster = { x: 0, y: 0, width, height, opaque: rasterIsOpaque(pixels), pixels };
  return { width, height, activeLayerId: image.id, soloLayerId: null, layers: [image] };
}

export function addImageLayer(
  stack: LayerStack,
  name: string,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x = Math.floor((stack.width - width) / 2),
  y = Math.floor((stack.height - height) / 2),
): SparseLayer {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) {
    throw new Error('Image layer dimensions are invalid.');
  }
  const layer = createLayer(stack.layers.length + 1, name, 'image');
  layer.raster = { x, y, width, height, opaque: rasterIsOpaque(pixels), pixels };
  stack.layers.push(layer);
  stack.activeLayerId = layer.id;
  stack.soloLayerId = null;
  return layer;
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
      kind: layer.kind,
      // Raster sources are immutable. History snapshots deliberately share this buffer so a
      // stroke does not copy every imported photograph.
      raster: layer.raster ? { ...layer.raster, pixels: layer.raster.pixels } : null,
      tiles: [...layer.tiles.values()].map((tile) => {
        // History snapshots are immutable. Sharing unchanged tile buffers makes taking a
        // snapshot O(tile count), rather than copying every painted pixel on every stroke.
        // All mutations go through ensureWritableTile(), which performs the copy lazily.
        tile.shared = true;
        return {
          tileX: tile.tileX,
          tileY: tile.tileY,
          width: tile.width,
          height: tile.height,
          pixels: tile.pixels,
        };
      }),
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
    kind: layer.kind ?? 'glitch',
    raster: layer.raster ? { ...layer.raster, pixels: layer.raster.pixels } : null,
    tiles: new Map(
      layer.tiles.map((tile) => [
        tileKey(tile.tileX, tile.tileY),
        {
          tileX: tile.tileX,
          tileY: tile.tileY,
          width: tile.width,
          height: tile.height,
          pixels: tile.pixels,
          shared: true,
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
    shared: false,
  };
}

function ensureWritableTile(
  layer: SparseLayer,
  key: string,
  tile: SparseLayerTile,
): SparseLayerTile {
  if (!tile.shared) return tile;
  const writable = { ...tile, pixels: tile.pixels.slice(), shared: false };
  layer.tiles.set(key, writable);
  return writable;
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
  setLayerPixelChannels(stack, layer, x, y, rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 0);
}

/**
 * Write four channels without creating a short-lived typed-array view. Effects can touch
 * hundreds of thousands of pixels in one commit, so a `subarray(offset, offset + 4)` per
 * pixel turns an otherwise linear write into a large amount of garbage collection work.
 */
function setLayerPixelChannels(
  stack: LayerStack,
  layer: SparseLayer,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= stack.width || y >= stack.height) return;
  const tileX = Math.floor(x / LAYER_TILE_SIZE);
  const tileY = Math.floor(y / LAYER_TILE_SIZE);
  const key = tileKey(tileX, tileY);
  let tile = layer.tiles.get(key);
  if (!tile && alpha === 0) return;
  if (!tile) {
    tile = createTile(stack, tileX, tileY);
    layer.tiles.set(key, tile);
  } else {
    tile = ensureWritableTile(layer, key, tile);
  }
  const localX = x - tileX * LAYER_TILE_SIZE;
  const localY = y - tileY * LAYER_TILE_SIZE;
  const offset = (localY * tile.width + localX) * 4;
  tile.pixels[offset] = red;
  tile.pixels[offset + 1] = green;
  tile.pixels[offset + 2] = blue;
  tile.pixels[offset + 3] = alpha;
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
  background: Uint8ClampedArray,
): Uint8ClampedArray {
  if (background.length !== stack.width * stack.height * 4) {
    throw new Error('Background dimensions do not match the layer stack.');
  }
  const output = background.slice();
  compositeLayersInto(stack, output, stack.layers);
  return output;
}

function compositeRasterInto(
  stack: LayerStack,
  output: Uint8ClampedArray,
  layer: SparseLayer,
): void {
  const raster = layer.raster;
  if (!raster) return;
  const left = Math.max(0, raster.x);
  const top = Math.max(0, raster.y);
  const right = Math.min(stack.width, raster.x + raster.width);
  const bottom = Math.min(stack.height, raster.y + raster.height);
  if (right <= left || bottom <= top) return;

  const canCopyRows = raster.opaque && layer.opacity >= 0.999 && layer.blendMode === 'source-over';
  for (let y = top; y < bottom; y += 1) {
    const sourceY = y - raster.y;
    const sourceX = left - raster.x;
    const sourceStart = (sourceY * raster.width + sourceX) * 4;
    const destinationStart = (y * stack.width + left) * 4;
    if (canCopyRows) {
      output.set(
        raster.pixels.subarray(sourceStart, sourceStart + (right - left) * 4),
        destinationStart,
      );
      continue;
    }
    for (let x = left; x < right; x += 1) {
      const sourceOffset = (sourceY * raster.width + x - raster.x) * 4;
      if (raster.pixels[sourceOffset + 3] === 0) continue;
      compositePixel(
        output,
        (y * stack.width + x) * 4,
        raster.pixels,
        sourceOffset,
        layer.opacity,
        layer.blendMode,
      );
    }
  }
}

function compositeLayerInto(
  stack: LayerStack,
  output: Uint8ClampedArray,
  layer: SparseLayer,
): void {
  compositeRasterInto(stack, output, layer);
  const canCopyOpaquePixels = layer.opacity >= 0.999 && layer.blendMode === 'source-over';
  for (const tile of layer.tiles.values()) {
    const left = tile.tileX * LAYER_TILE_SIZE;
    const top = tile.tileY * LAYER_TILE_SIZE;
    for (let localY = 0; localY < tile.height; localY += 1) {
      const sourceRowStart = localY * tile.width * 4;
      const destinationRowStart = ((top + localY) * stack.width + left) * 4;
      if (canCopyOpaquePixels) {
        let rowIsOpaque = true;
        for (let localX = 0; localX < tile.width; localX += 1) {
          if (tile.pixels[sourceRowStart + localX * 4 + 3] !== 255) {
            rowIsOpaque = false;
            break;
          }
        }
        if (rowIsOpaque) {
          output.set(
            tile.pixels.subarray(sourceRowStart, sourceRowStart + tile.width * 4),
            destinationRowStart,
          );
          continue;
        }
      }
      for (let localX = 0; localX < tile.width; localX += 1) {
        const sourceOffset = sourceRowStart + localX * 4;
        const sourceAlpha = tile.pixels[sourceOffset + 3]!;
        if (sourceAlpha === 0) continue;
        const destinationOffset = destinationRowStart + localX * 4;
        // The common effect path writes opaque source-over pixels. Copying them directly
        // avoids the expensive floating-point blend calculation for every pixel.
        if (canCopyOpaquePixels && sourceAlpha === 255) {
          output[destinationOffset] = tile.pixels[sourceOffset]!;
          output[destinationOffset + 1] = tile.pixels[sourceOffset + 1]!;
          output[destinationOffset + 2] = tile.pixels[sourceOffset + 2]!;
          output[destinationOffset + 3] = 255;
          continue;
        }
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

function compositeLayersInto(
  stack: LayerStack,
  output: Uint8ClampedArray,
  layers: SparseLayer[],
): void {
  for (const layer of layers) {
    if (!layer.visible || (stack.soloLayerId && stack.soloLayerId !== layer.id)) continue;
    compositeLayerInto(stack, output, layer);
  }
}

export function composeImageLayers(
  stack: LayerStack,
  background: Uint8ClampedArray,
): Uint8ClampedArray {
  if (background.length !== stack.width * stack.height * 4) {
    throw new Error('Background dimensions do not match the layer stack.');
  }
  const output = background.slice();
  compositeLayersInto(
    { ...stack, soloLayerId: null },
    output,
    stack.layers.filter((layer) => layer.kind === 'image'),
  );
  return output;
}

export function composeLayerPixels(stack: LayerStack, layerId: string): Uint8ClampedArray {
  const layer = stack.layers.find((candidate) => candidate.id === layerId);
  const output = new Uint8ClampedArray(stack.width * stack.height * 4);
  if (layer?.visible) compositeLayerInto({ ...stack, soloLayerId: null }, output, layer);
  return output;
}

export function composeLayerStackBelowActive(
  stack: LayerStack,
  background: Uint8ClampedArray,
): Uint8ClampedArray {
  const activeIndex = stack.layers.findIndex((layer) => layer.id === stack.activeLayerId);
  if (activeIndex <= 0) return background.slice();
  return composeLayerStack(
    {
      width: stack.width,
      height: stack.height,
      activeLayerId: stack.layers[Math.max(0, activeIndex - 1)]!.id,
      soloLayerId: null,
      layers: stack.layers.slice(0, activeIndex),
    },
    background,
  );
}

export function composeActiveLayerPixels(stack: LayerStack): Uint8ClampedArray {
  return composeLayerPixels(stack, stack.activeLayerId);
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
      const key = tileKey(tileX, tileY);
      const existingTile = layer.tiles.get(key);
      const tile = existingTile ? ensureWritableTile(layer, key, existingTile) : undefined;
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
  targetLayerId = stack.activeLayerId,
): number {
  const layer = stack.layers.find((candidate) => candidate.id === targetLayerId);
  if (!layer || layer.locked) return 0;
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(stack.width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(stack.height, Math.ceil(bounds.y + bounds.height));
  let changed = 0;
  const firstTileX = Math.floor(left / LAYER_TILE_SIZE);
  const lastTileX = Math.floor((right - 1) / LAYER_TILE_SIZE);
  const firstTileY = Math.floor(top / LAYER_TILE_SIZE);
  const lastTileY = Math.floor((bottom - 1) / LAYER_TILE_SIZE);

  // Process one tile at a time. This keeps the Map lookup and copy-on-write check out of
  // the per-pixel hot path, while preserving lazy tile allocation and snapshot ownership.
  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const key = tileKey(tileX, tileY);
      let tile = layer.tiles.get(key);
      let writable = false;
      let mayBeEmpty = false;
      const tileLeft = tileX * LAYER_TILE_SIZE;
      const tileTop = tileY * LAYER_TILE_SIZE;
      const tileRight = Math.min(right, tileLeft + LAYER_TILE_SIZE);
      const tileBottom = Math.min(bottom, tileTop + LAYER_TILE_SIZE);

      for (let y = Math.max(top, tileTop); y < tileBottom; y += 1) {
        let sourceOffset = (y * stack.width + Math.max(left, tileLeft)) * 4;
        for (let x = Math.max(left, tileLeft); x < tileRight; x += 1, sourceOffset += 4) {
          if (
            beforeComposite[sourceOffset] === targetComposite[sourceOffset] &&
            beforeComposite[sourceOffset + 1] === targetComposite[sourceOffset + 1] &&
            beforeComposite[sourceOffset + 2] === targetComposite[sourceOffset + 2] &&
            beforeComposite[sourceOffset + 3] === targetComposite[sourceOffset + 3]
          )
            continue;

          changed += 1;
          const alpha = targetComposite[sourceOffset + 3]!;
          if (!tile) {
            if (alpha === 0) continue;
            tile = createTile(stack, tileX, tileY);
            layer.tiles.set(key, tile);
            writable = true;
          } else if (!writable) {
            tile = ensureWritableTile(layer, key, tile);
            writable = true;
          }

          const localOffset = ((y - tileTop) * tile.width + x - tileLeft) * 4;
          tile.pixels[localOffset] = targetComposite[sourceOffset]!;
          tile.pixels[localOffset + 1] = targetComposite[sourceOffset + 1]!;
          tile.pixels[localOffset + 2] = targetComposite[sourceOffset + 2]!;
          tile.pixels[localOffset + 3] = alpha;
          mayBeEmpty ||= alpha === 0;
        }
      }
      if (tile && mayBeEmpty && tileIsEmpty(tile)) layer.tiles.delete(key);
    }
  }
  return changed;
}

export function addLayer(
  stack: LayerStack,
  name?: string,
  kind: LayerKind = 'glitch',
): SparseLayer {
  const layer = createLayer(stack.layers.length + 1, name, kind);
  const activeIndex = stack.layers.findIndex((item) => item.id === stack.activeLayerId);
  stack.layers.splice(Math.max(0, activeIndex + 1), 0, layer);
  stack.activeLayerId = layer.id;
  stack.soloLayerId = null;
  return layer;
}

export function ensureSpecialLayer(stack: LayerStack, kind: 'glitch' | 'image-brush'): SparseLayer {
  const current = activeLayer(stack);
  if (current.kind === kind && !current.locked) return current;
  const count = stack.layers.filter((layer) => layer.kind === kind).length + 1;
  const layer = createLayer(
    stack.layers.length + 1,
    kind === 'image-brush' ? `Image Brush Layer ${count}` : `Glitch Layer ${count}`,
    kind,
  );
  stack.layers.push(layer);
  stack.activeLayerId = layer.id;
  stack.soloLayerId = null;
  return layer;
}

export function removeGeneratedLayers(stack: LayerStack): void {
  const images = stack.layers.filter((layer) => layer.kind === 'image');
  if (images.length) {
    for (const image of images) image.tiles.clear();
    stack.layers = images;
    stack.activeLayerId = images[images.length - 1]!.id;
  } else {
    const empty = createLayer(1, 'Layer 1', 'image');
    stack.layers = [empty];
    stack.activeLayerId = empty.id;
  }
  stack.soloLayerId = null;
}

export function duplicateActiveLayer(stack: LayerStack): SparseLayer {
  const source = activeLayer(stack);
  const duplicate = createLayer(stack.layers.length + 1, `${source.name} copy`, source.kind);
  duplicate.visible = source.visible;
  duplicate.opacity = source.opacity;
  duplicate.blendMode = source.blendMode;
  duplicate.locked = false;
  // Image sources are immutable, so duplicates safely share their RGBA buffer.
  duplicate.raster = source.raster ? { ...source.raster, pixels: source.raster.pixels } : null;
  duplicate.tiles = new Map(
    [...source.tiles].map(([key, tile]) => {
      tile.shared = true;
      return [key, { ...tile, pixels: tile.pixels, shared: true }];
    }),
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
  if (layer.locked || (layer.tiles.size === 0 && !layer.raster)) return false;
  layer.tiles.clear();
  layer.raster = null;
  return true;
}

export function toggleSoloActiveLayer(stack: LayerStack): void {
  stack.soloLayerId = stack.soloLayerId === stack.activeLayerId ? null : stack.activeLayerId;
}

function transparentBase(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
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
  const merged = createLayer(stack.layers.length, `${lower.name} + ${upper.name}`, 'image');
  merged.raster = {
    x: 0,
    y: 0,
    width: stack.width,
    height: stack.height,
    opaque: rasterIsOpaque(mergedPixels),
    pixels: mergedPixels,
  };
  stack.layers.splice(topIndex - 1, 2, merged);
  stack.activeLayerId = merged.id;
  stack.soloLayerId = null;
  return true;
}

export function flattenLayerStack(stack: LayerStack, original: Uint8ClampedArray): void {
  const flattenedPixels = composeLayerStack(stack, original);
  const flattened = createLayer(1, 'Flattened Result', 'image');
  flattened.raster = {
    x: 0,
    y: 0,
    width: stack.width,
    height: stack.height,
    opaque: rasterIsOpaque(flattenedPixels),
    pixels: flattenedPixels,
  };
  stack.layers = [flattened];
  stack.activeLayerId = flattened.id;
  stack.soloLayerId = null;
}

export function layerMemoryBytes(stack: LayerStack): number {
  return stack.layers.reduce(
    (total, layer) =>
      total +
      (layer.raster?.pixels.byteLength ?? 0) +
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
      raster: layer.raster
        ? {
            x: layer.raster.x,
            y: layer.raster.y,
            width: layer.raster.width,
            height: layer.raster.height,
            opaque: layer.raster.opaque,
            rgbaBase64: bytesToBase64(layer.raster.pixels),
          }
        : undefined,
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
      raster: layer.raster
        ? {
            x: layer.raster.x,
            y: layer.raster.y,
            width: layer.raster.width,
            height: layer.raster.height,
            opaque: layer.raster.opaque,
            pixels: base64ToBytes(layer.raster.rgbaBase64),
          }
        : null,
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
