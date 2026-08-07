import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, PRODUCT_SUBTITLE, STORAGE_KEYS } from './brand/brand';
import {
  builtInPresets,
  CUSTOM_PRESETS_STORAGE_KEY,
  LEGACY_CUSTOM_PRESETS_STORAGE_KEY,
  loadCustomPresets,
} from './presets';

describe('imgfuck identity and saved-data compatibility', () => {
  it('uses the new product identity from one source', () => {
    expect(PRODUCT_NAME).toBe('imgfuck');
    expect(PRODUCT_SUBTITLE).toBe('local image destruction toy');
    expect(CUSTOM_PRESETS_STORAGE_KEY).toBe(STORAGE_KEYS.presets);
  });

  it('migrates legacy effect presets while preserving the legacy key', () => {
    const legacyPreset = { ...builtInPresets[0]!, id: 'legacy-effect', custom: true };
    const values = new Map<string, string>([
      [LEGACY_CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify([legacyPreset])],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(loadCustomPresets(storage)).toHaveLength(1);
    expect(values.has(CUSTOM_PRESETS_STORAGE_KEY)).toBe(true);
    expect(values.has(LEGACY_CUSTOM_PRESETS_STORAGE_KEY)).toBe(true);
  });
});
