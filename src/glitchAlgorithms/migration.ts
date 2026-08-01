import type { AlgorithmId, AlgorithmSettings, Preset } from '../types';

export interface MigratedAlgorithmSelection {
  algorithm: AlgorithmId;
  settings: Partial<AlgorithmSettings>;
  migratedFrom: AlgorithmId | null;
}

export function migrateAlgorithmSelection(
  algorithm: AlgorithmId,
  settings: Partial<AlgorithmSettings> = {},
): MigratedAlgorithmSelection {
  if (algorithm === 'macroblock-shift') {
    return {
      algorithm: 'block-corruption',
      settings: { ...settings, blockCorruptionMode: 'shift' },
      migratedFrom: algorithm,
    };
  }
  if (algorithm === 'packet-loss') {
    return {
      algorithm: 'block-corruption',
      settings: { ...settings, blockCorruptionMode: 'mixed-packet-loss' },
      migratedFrom: algorithm,
    };
  }
  if (algorithm === 'compression-block-damage' || algorithm === 'compression') {
    return {
      algorithm: 'codec-block-damage',
      settings: { ...settings, codecBlockDamageMode: 'compression-loss' },
      migratedFrom: algorithm,
    };
  }
  if (algorithm === 'tile-scramble') {
    return {
      algorithm: 'codec-block-damage',
      settings: { ...settings, codecBlockDamageMode: 'tile-scramble' },
      migratedFrom: algorithm,
    };
  }
  if (algorithm === 'byte-noise' || algorithm === 'bit-flip') {
    return {
      algorithm: 'palette-collapse',
      settings: { ...settings },
      migratedFrom: algorithm,
    };
  }
  return { algorithm, settings: { ...settings }, migratedFrom: null };
}

export function migratePreset(preset: Preset): Preset {
  const migrated = migrateAlgorithmSelection(preset.algorithm, preset.settings);
  return {
    ...preset,
    algorithm: migrated.algorithm,
    settings: migrated.settings,
  };
}
