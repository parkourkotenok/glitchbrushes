import { describe, expect, it } from 'vitest';
import {
  algorithmList,
  algorithms,
  defaultAlgorithmSettings,
  legacyAlgorithmList,
} from './glitchAlgorithms';
import { migrateAlgorithmSelection } from './glitchAlgorithms/migration';
import { imageBrushFxDefinitions } from './imageBrush/types';
import { migrateImageBrushFxId } from './imageBrush/assets';
import type { AlgorithmSettings, GlitchContext } from './types';

function sourceImage(width = 128, height = 96): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 7 + y * 3) & 255;
      pixels[offset + 1] = (x * 2 + y * 11) & 255;
      pixels[offset + 2] = ((x >> 3) * 41 + (y >> 3) * 29) & 255;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function render(
  algorithm: 'block-corruption' | 'codec-block-damage',
  settings: Partial<AlgorithmSettings>,
): Uint8ClampedArray {
  const width = 128;
  const height = 96;
  const pixels = sourceImage(width, height);
  const context: GlitchContext = {
    pixels,
    originalPixels: pixels.slice(),
    width,
    height,
    mask: new Float32Array(width * height).fill(1),
    bounds: { x: 8, y: 8, width: 112, height: 80 },
    writeBounds: { x: 0, y: 0, width, height },
    strength: 1,
    pressure: 1,
    seed: 'consolidation-audit',
    settings: { ...defaultAlgorithmSettings, structuralDensity: 1, ...settings },
    movement: { x: 36, y: 4 },
  };
  algorithms[algorithm].apply(context);
  return pixels;
}

function hash(bytes: Uint8ClampedArray): number {
  let value = 2166136261;
  for (let index = 0; index < bytes.length; index += 13) {
    value = Math.imul(value ^ bytes[index]!, 16777619) >>> 0;
  }
  return value;
}

describe('effect consolidation and migration', () => {
  it('shows only the two consolidated structural effects and hides useful legacy effects by default', () => {
    const primaryIds = algorithmList.map((item) => item.id);
    expect(primaryIds).toContain('block-corruption');
    expect(primaryIds).toContain('codec-block-damage');
    expect(primaryIds).not.toContain('macroblock-shift');
    expect(primaryIds).not.toContain('packet-loss');
    expect(primaryIds).not.toContain('compression-block-damage');
    expect(primaryIds).not.toContain('tile-scramble');
    expect(primaryIds).not.toContain('byte-noise');
    expect(primaryIds).not.toContain('bit-flip');
    expect(legacyAlgorithmList.map((item) => item.id)).toEqual([
      'palette-collapse',
      'channel-shift',
      'byte-swap',
    ]);
    const imageBrushIds = imageBrushFxDefinitions.map((item) => item.id);
    expect(imageBrushIds).toContain('block-corruption');
    expect(imageBrushIds).toContain('codec-block-damage');
    expect(imageBrushIds).not.toContain('pixel-noise');
    expect(imageBrushIds).not.toContain('bit-flip');
  });

  it('migrates every replaced project and preset ID to a matching new mode', () => {
    expect(migrateAlgorithmSelection('macroblock-shift')).toMatchObject({
      algorithm: 'block-corruption',
      settings: { blockCorruptionMode: 'shift' },
    });
    expect(migrateAlgorithmSelection('packet-loss')).toMatchObject({
      algorithm: 'block-corruption',
      settings: { blockCorruptionMode: 'mixed-packet-loss' },
    });
    expect(migrateAlgorithmSelection('compression-block-damage')).toMatchObject({
      algorithm: 'codec-block-damage',
      settings: { codecBlockDamageMode: 'compression-loss' },
    });
    expect(migrateAlgorithmSelection('tile-scramble')).toMatchObject({
      algorithm: 'codec-block-damage',
      settings: { codecBlockDamageMode: 'tile-scramble' },
    });
    expect(migrateImageBrushFxId('macroblock')).toBe('block-corruption');
    expect(migrateImageBrushFxId('packet-loss')).toBe('block-corruption');
    expect(migrateImageBrushFxId('compression')).toBe('codec-block-damage');
    expect(migrateImageBrushFxId('tile-scramble')).toBe('codec-block-damage');
    expect(migrateImageBrushFxId('pixel-noise')).toBe('palette');
    expect(migrateImageBrushFxId('bit-flip')).toBe('palette');
  });

  it('renders all seven Block Corruption modes as changed, distinct results', () => {
    const modes = [
      'shift',
      'repeat',
      'dropout',
      'neighbor-inherit',
      'swap',
      'stretch',
      'mixed-packet-loss',
    ] as const;
    const original = sourceImage();
    const outputs = modes.map((mode) => render('block-corruption', { blockCorruptionMode: mode }));
    expect(outputs.every((output) => hash(output) !== hash(original))).toBe(true);
    expect(new Set(outputs.map(hash)).size).toBe(modes.length);
  });

  it('renders all six Codec Block Damage modes as changed, distinct results', () => {
    const modes = [
      'compression-loss',
      'tile-scramble',
      'coefficient-dropout',
      'block-repeat',
      'recompressed',
      'mixed-codec-failure',
    ] as const;
    const original = sourceImage();
    const outputs = modes.map((mode) =>
      render('codec-block-damage', { codecBlockDamageMode: mode }),
    );
    expect(outputs.every((output) => hash(output) !== hash(original))).toBe(true);
    expect(new Set(outputs.map(hash)).size).toBe(modes.length);
  });

  it('makes every exposed Codec Block Damage control visibly affect output', () => {
    const baseline: Partial<AlgorithmSettings> = {
      codecBlockDamageMode: 'mixed-codec-failure',
      compressionTileSize: 8,
      compressionQuantization: 0.52,
      codecHighFrequencyLoss: 0.46,
      codecCoefficientDropout: 0.38,
      tileShuffle: 0.55,
      compressionTileOffset: 0.44,
      codecBoundaryStrength: 0.5,
      compressionChromaLoss: 0.42,
      codecRinging: 0.48,
      compressionReplication: 0.5,
      codecMix: 0.72,
    };
    const cases: Array<
      [
        keyof AlgorithmSettings,
        AlgorithmSettings[keyof AlgorithmSettings],
        AlgorithmSettings[keyof AlgorithmSettings],
      ]
    > = [
      ['compressionTileSize', 8, 16],
      ['compressionQuantization', 0.05, 1],
      ['codecHighFrequencyLoss', 0, 1],
      ['codecCoefficientDropout', 0, 1],
      ['tileShuffle', 0, 1],
      ['compressionTileOffset', 0, 1],
      ['codecBoundaryStrength', 0, 1],
      ['compressionChromaLoss', 0, 1],
      ['codecRinging', 0, 1],
      ['compressionReplication', 0, 1],
      ['codecMix', 0.05, 1],
    ];
    for (const [key, minimum, maximum] of cases) {
      const low = render('codec-block-damage', { ...baseline, [key]: minimum });
      const high = render('codec-block-damage', { ...baseline, [key]: maximum });
      expect(hash(low), `${String(key)} minimum and maximum must differ`).not.toBe(hash(high));
    }
  });

  it('keeps a locked meta recipe deterministic and changes output with a new seed', () => {
    const renderMeta = (seed: string) => {
      const width = 128;
      const height = 96;
      const pixels = sourceImage(width, height);
      algorithms['structural-mixed'].apply({
        pixels,
        originalPixels: pixels.slice(),
        width,
        height,
        mask: new Float32Array(width * height).fill(1),
        bounds: { x: 8, y: 8, width: 112, height: 80 },
        writeBounds: { x: 0, y: 0, width, height },
        strength: 1,
        pressure: 1,
        seed,
        settings: { ...defaultAlgorithmSettings, structuralDensity: 1 },
      });
      return pixels;
    };
    expect(renderMeta('locked')).toEqual(renderMeta('locked'));
    expect(hash(renderMeta('new-recipe'))).not.toBe(hash(renderMeta('locked')));
  });
});
