import type { Rectangle } from '../types';
import { clamp } from '../utils/geometry';
import { normalizeImageBrushSettings } from './performance';
import { resolveImageBrushStyleId } from './presets';
import type {
  ImageBrushAsset,
  ImageBrushAssetMode,
  ImageBrushAssetOrder,
  ImageBrushFxId,
  ImageBrushProjectData,
  ImageBrushSettings,
  SerializedImageBrushAsset,
} from './types';

export interface ImageBrushAssetSelection {
  mode: ImageBrushAssetMode;
  order: ImageBrushAssetOrder;
  enabledAssetIds: string[];
}

/**
 * Keeps source selection out of ImageBrushSettings so applying a Style cannot
 * accidentally change a project’s brush set.  A custom library starts with
 * its custom images enabled; the bundled demo is opt-in once custom images exist.
 */
export function normalizeImageBrushAssetSelection(
  library: Pick<ImageBrushAsset, 'id' | 'demo'>[],
  activeAssetId: string | null,
  selection: Partial<ImageBrushAssetSelection> | null | undefined,
  legacyAllAssets = false,
): ImageBrushAssetSelection {
  const ids = new Set(library.map((asset) => asset.id));
  const fallback = library.filter((asset) => !asset.demo);
  const defaultIds = (fallback.length ? fallback : library).map((asset) => asset.id);
  const supplied = Array.isArray(selection?.enabledAssetIds)
    ? selection.enabledAssetIds.filter(
        (id, index, list) => ids.has(id) && list.indexOf(id) === index,
      )
    : [];
  const enabledAssetIds = legacyAllAssets
    ? library.map((asset) => asset.id)
    : supplied.length
      ? supplied
      : defaultIds;
  if (!enabledAssetIds.length && activeAssetId && ids.has(activeAssetId)) {
    enabledAssetIds.push(activeAssetId);
  }
  return {
    mode: selection?.mode === 'all' ? 'all' : 'selected',
    order: selection?.order === 'random' ? 'random' : 'cycle',
    enabledAssetIds,
  };
}

export function requiredImageBrushAssets<T extends Pick<ImageBrushAsset, 'id'>>(
  library: T[],
  activeAssetId: string | null,
  selection: Pick<ImageBrushAssetSelection, 'mode' | 'enabledAssetIds'>,
): T[] {
  const active = library.find((asset) => asset.id === activeAssetId);
  if (selection.mode !== 'all') return active ? [active] : [];
  const enabled = new Set(selection.enabledAssetIds);
  return library.filter((asset) => enabled.has(asset.id));
}

export function migrateImageBrushFxId(effectId: ImageBrushFxId): ImageBrushFxId {
  if (effectId === 'macroblock' || effectId === 'packet-loss') return 'block-corruption';
  if (effectId === 'compression' || effectId === 'tile-scramble') return 'codec-block-damage';
  if (effectId === 'pixel-noise' || effectId === 'bit-flip') return 'palette';
  return effectId;
}

function migrateImageBrushRecipe(
  recipe: ImageBrushFxId | 'clean' | 'mixed',
): ImageBrushFxId | 'clean' | 'mixed' {
  return recipe === 'clean' || recipe === 'mixed' ? recipe : migrateImageBrushFxId(recipe);
}

const EMBEDDED_RGBA_TYPE = 'data:application/x-hex-redactor-rgba';
export const IMAGE_BRUSH_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

function bytesToBase64(bytes: Uint8ClampedArray): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8ClampedArray {
  const binary = atob(value);
  const output = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

export function isSupportedBrushMime(type: string): boolean {
  return IMAGE_BRUSH_FILE_TYPES.includes(type as (typeof IMAGE_BRUSH_FILE_TYPES)[number]);
}

export function embeddedRgbaDataUrl(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  return `${EMBEDDED_RGBA_TYPE};w=${width};h=${height};base64,${bytesToBase64(pixels)}`;
}

export function decodeEmbeddedRgbaDataUrl(dataUrl: string): {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
} {
  if (!dataUrl.startsWith(EMBEDDED_RGBA_TYPE)) throw new Error('Unsupported embedded brush data.');
  const match = dataUrl.match(/;w=(\d+);h=(\d+);base64,(.+)$/);
  if (!match) throw new Error('Malformed embedded brush data.');
  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = base64ToBytes(match[3]!);
  if (pixels.length !== width * height * 4)
    throw new Error('Embedded brush dimensions do not match its pixels.');
  return { pixels, width, height };
}

export function transparentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold: number,
): Rectangle {
  const threshold = clamp(Math.round(alphaThreshold), 0, 255);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3]! <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function cropRgba(
  pixels: Uint8ClampedArray,
  width: number,
  bounds: Rectangle,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const source = ((bounds.y + y) * width + bounds.x) * 4;
    output.set(pixels.subarray(source, source + bounds.width * 4), y * bounds.width * 4);
  }
  return output;
}

export function resizeRgba(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maximumDimension: number,
): { pixels: Uint8ClampedArray; width: number; height: number } {
  const safeMaximum = Math.max(1, Math.round(maximumDimension));
  const scale = Math.min(1, safeMaximum / Math.max(width, height));
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  if (nextWidth === width && nextHeight === height) {
    return { pixels: pixels.slice(), width, height };
  }
  const output = new Uint8ClampedArray(nextWidth * nextHeight * 4);
  for (let y = 0; y < nextHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / nextHeight));
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / nextWidth));
      const source = (sourceY * width + sourceX) * 4;
      const target = (y * nextWidth + x) * 4;
      output[target] = pixels[source]!;
      output[target + 1] = pixels[source + 1]!;
      output[target + 2] = pixels[source + 2]!;
      output[target + 3] = pixels[source + 3]!;
    }
  }
  return { pixels: output, width: nextWidth, height: nextHeight };
}

function resizeRgbaBounds(
  pixels: Uint8ClampedArray,
  sourceWidth: number,
  bounds: Rectangle,
  maximumDimension: number | null,
): { pixels: Uint8ClampedArray; width: number; height: number } {
  if (maximumDimension === null || Math.max(bounds.width, bounds.height) <= maximumDimension) {
    return {
      pixels: cropRgba(pixels, sourceWidth, bounds),
      width: bounds.width,
      height: bounds.height,
    };
  }
  const scale = Math.max(1, Math.round(maximumDimension)) / Math.max(bounds.width, bounds.height);
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY =
      bounds.y + Math.min(bounds.height - 1, Math.floor(((y + 0.5) * bounds.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX =
        bounds.x + Math.min(bounds.width - 1, Math.floor(((x + 0.5) * bounds.width) / width));
      const source = (sourceY * sourceWidth + sourceX) * 4;
      const target = (y * width + x) * 4;
      output[target] = pixels[source]!;
      output[target + 1] = pixels[source + 1]!;
      output[target + 2] = pixels[source + 2]!;
      output[target + 3] = pixels[source + 3]!;
    }
  }
  return { pixels: output, width, height };
}

export function optimizeImageBrushAsset(
  asset: ImageBrushAsset,
  maximumDimension: number | null,
  trim = true,
  threshold = 2,
): ImageBrushAsset {
  const bounds = trim
    ? transparentBounds(asset.originalPixels, asset.originalWidth, asset.originalHeight, threshold)
    : { x: 0, y: 0, width: asset.originalWidth, height: asset.originalHeight };
  const resized = resizeRgbaBounds(
    asset.originalPixels,
    asset.originalWidth,
    bounds,
    maximumDimension,
  );
  return {
    ...asset,
    width: resized.width,
    height: resized.height,
    pixels: resized.pixels,
    trimBounds: bounds,
  };
}

export function createImageBrushAsset(
  name: string,
  fileName: string,
  mimeType: string,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  trim = true,
  threshold = 2,
  options: {
    id?: string;
    demo?: boolean;
    defaultSize?: number;
    maximumDimension?: number | null;
    reuseOriginalPixels?: boolean;
  } = {},
): ImageBrushAsset {
  const trimBounds = trim
    ? transparentBounds(pixels, width, height, threshold)
    : { x: 0, y: 0, width, height };
  const working = resizeRgbaBounds(pixels, width, trimBounds, options.maximumDimension ?? null);
  return {
    id: options.id ?? `image-brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    fileName,
    mimeType,
    originalWidth: width,
    originalHeight: height,
    originalPixels: options.reuseOriginalPixels ? pixels : pixels.slice(),
    width: working.width,
    height: working.height,
    pixels: working.pixels,
    trimBounds,
    defaultSize: options.defaultSize ?? Math.min(160, Math.max(32, Math.max(width, height))),
    anchor: 'center',
    customAnchor: { x: 0.5, y: 0.5 },
    demo: options.demo,
  };
}

export function retrimImageBrushAsset(
  asset: ImageBrushAsset,
  trim: boolean,
  threshold: number,
  maximumDimension: number | null = 512,
): ImageBrushAsset {
  const bounds = trim
    ? transparentBounds(asset.originalPixels, asset.originalWidth, asset.originalHeight, threshold)
    : { x: 0, y: 0, width: asset.originalWidth, height: asset.originalHeight };
  const working = resizeRgbaBounds(
    asset.originalPixels,
    asset.originalWidth,
    bounds,
    maximumDimension,
  );
  return {
    ...asset,
    width: working.width,
    height: working.height,
    pixels: working.pixels,
    trimBounds: bounds,
  };
}

export async function decodeImageBrushFile(
  file: File,
  settings: Pick<ImageBrushSettings, 'trimTransparent' | 'trimThreshold'>,
): Promise<ImageBrushAsset> {
  if (!isSupportedBrushMime(file.type)) throw new Error('Choose a PNG, JPEG, or WebP brush image.');
  if (file.size > 48 * 1024 * 1024) throw new Error('Brush image exceeds the 48 MB safety limit.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16_000_000) {
      throw new Error('Decoded brush image exceeds the 16 megapixel safety limit.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return createImageBrushAsset(
      file.name.replace(/\.[^.]+$/, '') || 'Brush image',
      file.name,
      file.type,
      pixels,
      bitmap.width,
      bitmap.height,
      settings.trimTransparent,
      settings.trimThreshold,
    );
  } finally {
    bitmap.close();
  }
}

export function serializeImageBrushAsset(asset: ImageBrushAsset): SerializedImageBrushAsset {
  const dataUrl =
    asset.embeddedDataUrl ??
    embeddedRgbaDataUrl(asset.originalPixels, asset.originalWidth, asset.originalHeight);
  asset.embeddedDataUrl = dataUrl;
  return {
    id: asset.id,
    name: asset.name,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    originalWidth: asset.originalWidth,
    originalHeight: asset.originalHeight,
    embeddedDataUrl: dataUrl,
    defaultSize: asset.defaultSize,
    anchor: asset.anchor,
    customAnchor: { ...asset.customAnchor },
    fxPresetId: asset.fxPresetId,
    demo: asset.demo,
  };
}

export function restoreImageBrushAsset(
  serialized: SerializedImageBrushAsset,
  settings: Pick<ImageBrushSettings, 'trimTransparent' | 'trimThreshold'>,
): ImageBrushAsset {
  const decoded = decodeEmbeddedRgbaDataUrl(serialized.embeddedDataUrl);
  const restored = createImageBrushAsset(
    serialized.name,
    serialized.fileName,
    serialized.mimeType,
    decoded.pixels,
    decoded.width,
    decoded.height,
    settings.trimTransparent,
    settings.trimThreshold,
    { id: serialized.id, demo: serialized.demo, defaultSize: serialized.defaultSize },
  );
  restored.embeddedDataUrl = serialized.embeddedDataUrl;
  restored.anchor = serialized.anchor;
  restored.customAnchor = { ...serialized.customAnchor };
  restored.fxPresetId = serialized.fxPresetId;
  return restored;
}

export function serializeImageBrushProject(
  data: Omit<ImageBrushProjectData, 'version' | 'library'> & { library: ImageBrushAsset[] },
): ImageBrushProjectData {
  const activeStyleId =
    typeof data.activeStyleId === 'string'
      ? resolveImageBrushStyleId(data.activeStyleId)
      : resolveImageBrushStyleId(data.activePresetId);
  return {
    ...data,
    version: 1,
    activeStyleId,
    // Keep this exact legacy key for old project readers.
    activePresetId: activeStyleId,
    settings: { ...data.settings, customAnchor: { ...data.settings.customAnchor } },
    rack: data.rack.map((item) => ({ ...item })),
    library: data.library.map(serializeImageBrushAsset),
  };
}

export function restoreImageBrushProject(project: ImageBrushProjectData): {
  settings: ImageBrushSettings;
  seed: string;
  activeStyleId: string;
  activeAssetId: string | null;
  assetMode: ImageBrushAssetMode;
  assetOrder: ImageBrushAssetOrder;
  enabledAssetIds: string[];
  evolutionOffset: number;
  rack: ImageBrushProjectData['rack'];
  library: ImageBrushAsset[];
} {
  if (project.version !== 1) throw new Error('Unsupported Image Brush project version.');
  const legacyMode =
    project.settings.mode === 'sequence' || project.settings.mode === 'random-hose';
  const normalized = normalizeImageBrushSettings(project.settings);
  const settings: ImageBrushSettings = {
    ...normalized,
    effectPool: [...new Set(normalized.effectPool.map(migrateImageBrushFxId))],
    recipeA: migrateImageBrushRecipe(normalized.recipeA),
    recipeB: migrateImageBrushRecipe(normalized.recipeB),
    gradientStart: migrateImageBrushRecipe(normalized.gradientStart),
    gradientEnd: migrateImageBrushRecipe(normalized.gradientEnd),
  };
  const library = project.library.map((asset) => restoreImageBrushAsset(asset, settings));
  const activeAssetId = library.some((asset) => asset.id === project.activeAssetId)
    ? project.activeAssetId
    : (library[0]?.id ?? null);
  const selection = normalizeImageBrushAssetSelection(
    library,
    activeAssetId,
    {
      mode:
        project.assetMode ??
        (project.settings.mode === 'sequence' || project.settings.mode === 'random-hose'
          ? 'all'
          : 'selected'),
      order: project.assetOrder ?? (project.settings.mode === 'random-hose' ? 'random' : 'cycle'),
      enabledAssetIds: project.enabledAssetIds,
    },
    legacyMode,
  );
  return {
    settings,
    seed: project.seed,
    // Projects saved before Style identity only have activePresetId. Keep accepting it so a
    // size or opacity override does not turn an old project's selected Style into Custom.
    activeStyleId:
      typeof project.activeStyleId === 'string'
        ? resolveImageBrushStyleId(project.activeStyleId)
        : typeof project.activePresetId === 'string'
          ? resolveImageBrushStyleId(project.activePresetId)
          : 'clean-repeat',
    activeAssetId,
    assetMode: selection.mode,
    assetOrder: selection.order,
    enabledAssetIds: selection.enabledAssetIds,
    evolutionOffset: Math.max(0, project.evolutionOffset || 0),
    rack: project.rack.map((item) => ({
      ...item,
      effectId: migrateImageBrushFxId(item.effectId),
    })),
    library,
  };
}

export function disposeBrushResource(resource: { close?: () => void } | null | undefined): void {
  resource?.close?.();
}

export interface ImageBrushLibraryRemoval {
  library: ImageBrushAsset[];
  activeAssetId: string | null;
  removed: ImageBrushAsset[];
}

export function removeImageBrushAssets(
  library: ImageBrushAsset[],
  activeAssetId: string | null,
  shouldRemove: (asset: ImageBrushAsset) => boolean,
): ImageBrushLibraryRemoval {
  const removed = library.filter(shouldRemove);
  if (!removed.length) return { library, activeAssetId, removed };
  const nextLibrary = library.filter((asset) => !shouldRemove(asset));
  if (!removed.some((asset) => asset.id === activeAssetId)) {
    return { library: nextLibrary, activeAssetId, removed };
  }
  const activeIndex = Math.max(
    0,
    library.findIndex((asset) => asset.id === activeAssetId),
  );
  const nextAsset = library.find((asset, index) => index > activeIndex && !shouldRemove(asset));
  const previousAsset = library
    .slice(0, activeIndex)
    .reverse()
    .find((asset) => !shouldRemove(asset));
  return {
    library: nextLibrary,
    activeAssetId: nextAsset?.id ?? previousAsset?.id ?? null,
    removed,
  };
}

export function removeImageBrushAsset(
  library: ImageBrushAsset[],
  activeAssetId: string | null,
  assetId: string,
): ImageBrushLibraryRemoval {
  return removeImageBrushAssets(library, activeAssetId, (asset) => asset.id === assetId);
}
