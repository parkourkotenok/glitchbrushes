import type { Rectangle } from '../types';
import { clamp } from '../utils/geometry';
import { normalizeImageBrushSettings } from './performance';
import type {
  ImageBrushAsset,
  ImageBrushFxId,
  ImageBrushProjectData,
  ImageBrushSettings,
  SerializedImageBrushAsset,
} from './types';

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

const EMBEDDED_RGBA_TYPE = 'data:application/x-imgfuck-rgba';
const LEGACY_EMBEDDED_RGBA_TYPE = 'data:application/x-hex-redactor-rgba';
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
  if (!dataUrl.startsWith(EMBEDDED_RGBA_TYPE) && !dataUrl.startsWith(LEGACY_EMBEDDED_RGBA_TYPE))
    throw new Error('Unsupported embedded brush data.');
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

export function optimizeImageBrushAsset(
  asset: ImageBrushAsset,
  maximumDimension: number | null,
  trim = true,
  threshold = 2,
): ImageBrushAsset {
  const bounds = trim
    ? transparentBounds(asset.originalPixels, asset.originalWidth, asset.originalHeight, threshold)
    : { x: 0, y: 0, width: asset.originalWidth, height: asset.originalHeight };
  const cropped = cropRgba(asset.originalPixels, asset.originalWidth, bounds);
  const resized =
    maximumDimension === null
      ? { pixels: cropped, width: bounds.width, height: bounds.height }
      : resizeRgba(cropped, bounds.width, bounds.height, maximumDimension);
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
  options: { id?: string; demo?: boolean; defaultSize?: number } = {},
): ImageBrushAsset {
  const trimBounds = trim
    ? transparentBounds(pixels, width, height, threshold)
    : { x: 0, y: 0, width, height };
  return {
    id: options.id ?? `image-brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    fileName,
    mimeType,
    originalWidth: width,
    originalHeight: height,
    originalPixels: pixels.slice(),
    width: trimBounds.width,
    height: trimBounds.height,
    pixels: cropRgba(pixels, width, trimBounds),
    trimBounds,
    embeddedDataUrl: embeddedRgbaDataUrl(pixels, width, height),
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
): ImageBrushAsset {
  const bounds = trim
    ? transparentBounds(asset.originalPixels, asset.originalWidth, asset.originalHeight, threshold)
    : { x: 0, y: 0, width: asset.originalWidth, height: asset.originalHeight };
  return {
    ...asset,
    width: bounds.width,
    height: bounds.height,
    pixels: cropRgba(asset.originalPixels, asset.originalWidth, bounds),
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

function createDemoPixels(
  draw: (set: (x: number, y: number, rgba: readonly number[]) => void) => void,
): Uint8ClampedArray {
  const size = 64;
  const output = new Uint8ClampedArray(size * size * 4);
  const set = (x: number, y: number, rgba: readonly number[]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
    output[offset] = rgba[0]!;
    output[offset + 1] = rgba[1]!;
    output[offset + 2] = rgba[2]!;
    output[offset + 3] = rgba[3] ?? 255;
  };
  draw(set);
  return output;
}

function fillRect(
  set: (x: number, y: number, rgba: readonly number[]) => void,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly number[],
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) set(px, py, color);
  }
}

export function createDemoBrushAssets(): ImageBrushAsset[] {
  const gold = [226, 179, 83, 255] as const;
  const coral = [229, 86, 70, 255] as const;
  const cyan = [68, 205, 203, 255] as const;
  const pale = [238, 234, 218, 255] as const;
  const demos: Array<
    [string, (set: (x: number, y: number, rgba: readonly number[]) => void) => void]
  > = [
    ['Square', (set) => fillRect(set, 10, 10, 44, 44, gold)],
    [
      'Circle',
      (set) => {
        for (let y = 4; y < 60; y++)
          for (let x = 4; x < 60; x++) {
            const distance = Math.hypot(x - 31.5, y - 31.5);
            if (distance <= 27) set(x, y, distance > 22 ? coral : gold);
          }
      },
    ],
    [
      'Cross',
      (set) => {
        fillRect(set, 26, 5, 12, 54, pale);
        fillRect(set, 5, 26, 54, 12, coral);
      },
    ],
    [
      'Arrow',
      (set) => {
        fillRect(set, 8, 27, 36, 10, cyan);
        for (let row = 0; row < 24; row++)
          fillRect(set, 38 + Math.floor(row / 2), 20 + row, 4, 1, gold);
        for (let row = 0; row < 24; row++)
          fillRect(set, 38 + Math.floor(row / 2), 43 - row, 4, 1, gold);
      },
    ],
    [
      'Checker Tile',
      (set) => {
        for (let y = 8; y < 56; y++)
          for (let x = 8; x < 56; x++) {
            set(x, y, (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? coral : cyan);
          }
      },
    ],
    [
      'Barcode',
      (set) => {
        const widths = [2, 5, 1, 3, 6, 2, 4, 1, 5, 3, 2];
        let x = 7;
        widths.forEach((width, index) => {
          fillRect(
            set,
            x,
            7 + (index % 3) * 4,
            width,
            50 - (index % 3) * 8,
            index % 2 ? gold : pale,
          );
          x += width + 2;
        });
      },
    ],
    [
      'Broken UI Window',
      (set) => {
        fillRect(set, 6, 8, 52, 46, pale);
        fillRect(set, 9, 12, 46, 7, coral);
        fillRect(set, 11, 24, 18, 22, cyan);
        fillRect(set, 34, 24, 18, 5, gold);
        fillRect(set, 31, 34, 21, 4, coral);
        fillRect(set, 39, 42, 16, 8, cyan);
        fillRect(set, 17, 31, 28, 3, [0, 0, 0, 0]);
      },
    ],
    [
      'Pixel Star',
      (set) => {
        const rows = [4, 8, 14, 24, 50, 24, 14, 8, 4];
        rows.forEach((width, index) =>
          fillRect(set, 32 - width / 2, 5 + index * 6, width, 5, index % 2 ? coral : gold),
        );
      },
    ],
    [
      'Abstract Symbol',
      (set) => {
        fillRect(set, 8, 8, 14, 42, cyan);
        fillRect(set, 22, 8, 30, 10, gold);
        fillRect(set, 30, 18, 10, 38, coral);
        fillRect(set, 40, 42, 17, 14, pale);
        fillRect(set, 13, 25, 40, 6, [19, 19, 18, 255]);
      },
    ],
  ];
  return demos.map(([name, draw], index) =>
    createImageBrushAsset(
      name,
      `${name.toLowerCase().replace(/\s+/g, '-')}.png`,
      'image/png',
      createDemoPixels(draw),
      64,
      64,
      true,
      1,
      { id: `demo-image-brush-${index}`, demo: true, defaultSize: 84 },
    ),
  );
}

export function serializeImageBrushAsset(asset: ImageBrushAsset): SerializedImageBrushAsset {
  return {
    id: asset.id,
    name: asset.name,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    originalWidth: asset.originalWidth,
    originalHeight: asset.originalHeight,
    embeddedDataUrl: asset.embeddedDataUrl,
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
  restored.anchor = serialized.anchor;
  restored.customAnchor = { ...serialized.customAnchor };
  restored.fxPresetId = serialized.fxPresetId;
  return restored;
}

export function serializeImageBrushProject(
  data: Omit<ImageBrushProjectData, 'version' | 'library'> & { library: ImageBrushAsset[] },
): ImageBrushProjectData {
  return {
    ...data,
    version: 1,
    settings: { ...data.settings, customAnchor: { ...data.settings.customAnchor } },
    rack: data.rack.map((item) => ({ ...item })),
    library: data.library.map(serializeImageBrushAsset),
  };
}

export function restoreImageBrushProject(project: ImageBrushProjectData): {
  settings: ImageBrushSettings;
  seed: string;
  activePresetId: string;
  activeAssetId: string | null;
  evolutionOffset: number;
  rack: ImageBrushProjectData['rack'];
  library: ImageBrushAsset[];
} {
  if (project.version !== 1) throw new Error('Unsupported Image Brush project version.');
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
  return {
    settings,
    seed: project.seed,
    activePresetId: project.activePresetId,
    activeAssetId: library.some((asset) => asset.id === project.activeAssetId)
      ? project.activeAssetId
      : (library[0]?.id ?? null),
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
