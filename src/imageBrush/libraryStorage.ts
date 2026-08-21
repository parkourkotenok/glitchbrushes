import { defaultImageBrushSettings } from './types';
import type {
  ImageBrushAsset,
  ImageBrushAssetMode,
  ImageBrushAssetOrder,
  ImageBrushFxItem,
  ImageBrushSettings,
} from './types';

const databaseName = 'glitch-brushes';
const storeName = 'image-brush-state';
const libraryKey = 'library-v1';
const preferencesKey = 'preferences-v1';

export interface StoredImageBrushPreferences {
  version: 1;
  activeAssetId: string | null;
  assetMode?: ImageBrushAssetMode;
  assetOrder?: ImageBrushAssetOrder;
  enabledAssetIds?: string[];
  settings: ImageBrushSettings;
  rack: ImageBrushFxItem[];
  seed: string;
  activePresetId: string;
  variationNonce: number;
  lockSeed: boolean;
}

export interface StoredImageBrushState extends StoredImageBrushPreferences {
  library: ImageBrushAsset[];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function asPixels(value: unknown): Uint8ClampedArray | null {
  if (value instanceof Uint8ClampedArray) return value;
  if (value instanceof ArrayBuffer) return new Uint8ClampedArray(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8ClampedArray(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }
  return null;
}

function restoreAsset(value: unknown): ImageBrushAsset | null {
  if (!value || typeof value !== 'object') return null;
  const asset = value as ImageBrushAsset;
  const originalPixels = asPixels(asset.originalPixels);
  const pixels = asPixels(asset.pixels);
  if (
    !originalPixels ||
    !pixels ||
    !Number.isInteger(asset.originalWidth) ||
    !Number.isInteger(asset.originalHeight) ||
    !Number.isInteger(asset.width) ||
    !Number.isInteger(asset.height) ||
    asset.originalWidth <= 0 ||
    asset.originalHeight <= 0 ||
    asset.width <= 0 ||
    asset.height <= 0 ||
    originalPixels.length !== asset.originalWidth * asset.originalHeight * 4 ||
    pixels.length !== asset.width * asset.height * 4
  ) {
    return null;
  }
  return { ...asset, originalPixels, pixels, demo: false };
}

export async function loadImageBrushState(): Promise<StoredImageBrushState | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  try {
    const [preferencesValue, libraryValue] = await new Promise<[unknown, unknown]>(
      (resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const preferencesRequest = store.get(preferencesKey);
        const libraryRequest = store.get(libraryKey);
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Saved brushes could not be read.'));
        transaction.oncomplete = () => resolve([preferencesRequest.result, libraryRequest.result]);
      },
    );
    if (
      !preferencesValue ||
      typeof preferencesValue !== 'object' ||
      (preferencesValue as StoredImageBrushPreferences).version !== 1
    ) {
      return null;
    }
    const stored = preferencesValue as StoredImageBrushPreferences;
    const library = Array.isArray(libraryValue)
      ? libraryValue.map(restoreAsset).filter((asset): asset is ImageBrushAsset => Boolean(asset))
      : [];
    const legacySourceMode =
      stored.settings?.mode === 'sequence' || stored.settings?.mode === 'random-hose'
        ? stored.settings.mode
        : null;
    return {
      version: 1,
      library,
      activeAssetId: typeof stored.activeAssetId === 'string' ? stored.activeAssetId : null,
      assetMode: stored.assetMode === 'all' || legacySourceMode ? 'all' : 'selected',
      assetOrder:
        stored.assetOrder === 'random' || legacySourceMode === 'random-hose' ? 'random' : 'cycle',
      enabledAssetIds: Array.isArray(stored.enabledAssetIds)
        ? stored.enabledAssetIds.filter((id): id is string => typeof id === 'string')
        : legacySourceMode
          ? library.map((asset) => asset.id)
          : [],
      settings: {
        ...defaultImageBrushSettings,
        ...(stored.settings ?? {}),
        mode:
          legacySourceMode === 'sequence'
            ? 'trail'
            : legacySourceMode === 'random-hose'
              ? 'scatter'
              : (stored.settings?.mode ?? defaultImageBrushSettings.mode),
        customAnchor: {
          ...defaultImageBrushSettings.customAnchor,
          ...(stored.settings?.customAnchor ?? {}),
        },
      },
      rack: Array.isArray(stored.rack) ? stored.rack : [],
      seed: typeof stored.seed === 'string' ? stored.seed : 'stamp-4F21',
      activePresetId:
        typeof stored.activePresetId === 'string' ? stored.activePresetId : 'clean-repeat',
      variationNonce: Number.isFinite(stored.variationNonce) ? stored.variationNonce : 0,
      lockSeed: Boolean(stored.lockSeed),
    };
  } finally {
    database.close();
  }
}

async function writeRecord(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Brushes could not be saved.'));
      transaction.oncomplete = () => resolve();
      transaction.objectStore(storeName).put(value, key);
    });
  } finally {
    database.close();
  }
}

export function saveImageBrushPreferences(preferences: StoredImageBrushPreferences): Promise<void> {
  return writeRecord(preferencesKey, preferences);
}

export function saveImageBrushLibrary(library: ImageBrushAsset[]): Promise<void> {
  return writeRecord(libraryKey, library);
}
