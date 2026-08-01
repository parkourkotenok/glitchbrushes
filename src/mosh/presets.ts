import {
  defaultMoshSettings,
  moshEffectDefinitions,
  type MoshEffectId,
  type MoshEffectSettings,
  type MoshPreset,
} from './types';

export const MOSH_USER_PRESETS_STORAGE_KEY = 'hex-redactor-mosh-presets-v1';

export interface MoshUserPreset extends MoshPreset {
  id: string;
  custom: true;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isEffectId(value: unknown): value is MoshEffectId {
  return moshEffectDefinitions.some((definition) => definition.id === value);
}

function cleanSettings(value: unknown): Partial<MoshEffectSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const clean: Partial<MoshEffectSettings> = {};
  for (const key of Object.keys(defaultMoshSettings) as Array<keyof MoshEffectSettings>) {
    if (key in value) {
      (clean as Record<string, unknown>)[key] = (value as Record<string, unknown>)[key];
    }
  }
  return clean;
}

export function normalizeMoshUserPreset(value: unknown, fallbackId: string): MoshUserPreset | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!isEffectId(candidate.effectId) || typeof candidate.name !== 'string') return null;
  const name = candidate.name.trim();
  if (!name) return null;
  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : fallbackId,
    name,
    effectId: candidate.effectId,
    settings: cleanSettings(candidate.settings),
    custom: true,
  };
}

export function parseMoshPresetJson(
  json: string,
  idPrefix = `mosh-import-${Date.now()}`,
): MoshUserPreset[] {
  const parsed = JSON.parse(json) as unknown;
  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  return candidates
    .map((value, index) => normalizeMoshUserPreset(value, `${idPrefix}-${index}`))
    .filter((preset): preset is MoshUserPreset => preset !== null)
    .map((preset, index) => ({
      ...preset,
      id: `${idPrefix}-${index}-${preset.id}`,
    }));
}

export function loadMoshUserPresets(
  storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): MoshUserPreset[] {
  if (!storage) return [];
  try {
    const value = storage.getItem(MOSH_USER_PRESETS_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((preset, index) => normalizeMoshUserPreset(preset, `mosh-user-${index}`))
      .filter((preset): preset is MoshUserPreset => preset !== null);
  } catch {
    return [];
  }
}

export function saveMoshUserPresets(
  presets: MoshUserPreset[],
  storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): void {
  if (!storage) return;
  storage.setItem(MOSH_USER_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}
