import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HelpButton } from './components/HelpButton';
import { ImageBrushPanel } from './components/ImageBrushPanel';
import { RangeControl } from './components/SliderField';
import { HelpProvider } from './help/HelpContext';
import { helpRegistry, resolveControlHelp } from './help/registry';
import {
  createDemoBrushAssets,
  removeImageBrushAsset,
  removeImageBrushAssets,
} from './imageBrush/assets';
import { imageBrushFxStageCopy } from './imageBrush/performance';
import { builtInImageBrushPresets } from './imageBrush/presets';
import { defaultImageBrushSettings, type ImageBrushFxItem } from './imageBrush/types';

function renderImageBrush(
  level: 'simple' | 'advanced',
  settings = defaultImageBrushSettings,
  rack: ImageBrushFxItem[] = [],
) {
  const library = createDemoBrushAssets().slice(0, 2);
  return renderToStaticMarkup(
    createElement(
      HelpProvider,
      null,
      createElement(ImageBrushPanel, {
        initialInterfaceLevel: level,
        library,
        activeAssetId: library[0]!.id,
        settings,
        rack,
        seed: 'test',
        activePresetId: builtInImageBrushPresets[0]!.id,
        processedPreview: null,
        processing: false,
        progress: null,
        performance: null,
        onAddAssets() {},
        onRemoveAsset() {},
        onClearLibrary() {},
        onRemoveDemoAssets() {},
        onActiveAssetChange() {},
        onSettingsChange() {},
        onRackChange() {},
        onSeedChange() {},
        onPresetChange() {},
        onRandomize() {},
        randomizeNonce: 0,
        randomizeLockSeed: false,
        onRandomizeLockSeedChange() {},
        onNewVariation() {},
        onOptimizeAsset() {},
        onRestoreDemos() {},
        onDownloadProcessed() {},
        onCopyProcessed() {},
        onTestStamp() {},
        onTestTrail() {},
        onCancelProcessing() {},
        onNotice() {},
      }),
    ),
  );
}

describe('contextual help', () => {
  it('gives every registered help ID a title and short description', () => {
    for (const [id, help] of Object.entries(helpRegistry)) {
      expect(help.id).toBe(id);
      expect(help.title.trim().length).toBeGreaterThan(0);
      expect(help.short.trim().length).toBeGreaterThan(0);
    }
  });

  it('resolves a typed generic entry for every editor slider label', () => {
    const help = resolveControlHelp('control.spacing', 'Spacing');
    expect(help.id).toBe('control.spacing');
    expect(help.title).toBe('Spacing');
    expect(help.short).toContain('Spacing'.toLowerCase());
  });

  it('renders HelpButton as a keyboard-focusable named button', () => {
    const html = renderToStaticMarkup(
      createElement(
        HelpProvider,
        null,
        createElement(HelpButton, {
          helpId: 'control.propagation-length',
          label: 'Propagation length',
        }),
      ),
    );
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Help: Propagation length"');
    expect(html).toContain('data-help-id="control.propagation-length"');
  });

  it('documents the same three stages implemented by the Image Brush pipeline', () => {
    expect(imageBrushFxStageCopy.before.pipelineIndex).toEqual([0]);
    expect(imageBrushFxStageCopy.each.pipelineIndex).toEqual([1]);
    expect(imageBrushFxStageCopy.after.pipelineIndex).toEqual([2]);
    expect(imageBrushFxStageCopy['before-after'].pipelineIndex).toEqual([0, 1, 2]);
    expect(imageBrushFxStageCopy.after.description).toContain('local region');
  });

  it('renders slider metadata without mounting a visible HelpButton', () => {
    const html = renderToStaticMarkup(
      createElement(
        HelpProvider,
        null,
        createElement(RangeControl, {
          label: 'Spacing',
          value: 48,
          min: 2,
          max: 300,
          onChange() {},
        }),
      ),
    );
    expect(html).toContain('data-tooltip-id="control.spacing"');
    expect(html).not.toContain('class="help-button"');
  });

  it('keeps visible HelpButtons beside dropdowns only in the compact inspector', () => {
    const html = renderImageBrush('simple');
    const helpButtons = html.match(/class="help-button"/g) ?? [];
    const selects = html.match(/<select/g) ?? [];
    const essential =
      html.match(/data-testid="image-brush-essential"[\s\S]*?<\/section>/)?.[0] ?? '';
    const essentialSliders = essential.match(/type="range"/g) ?? [];
    expect(helpButtons).toHaveLength(selects.length);
    expect(essentialSliders).toHaveLength(5);
    expect(html).not.toContain('Help: Size');
    expect(html).not.toContain('Help: Test one stamp');
  });

  it('describes every option of each core Image Brush dropdown in one entry', () => {
    const expectedCounts: Record<string, number> = {
      'control.rendering-quality': 4,
      'image-brush.brush-mode': 5,
      'image-brush.unit': 2,
      'image-brush.rotation': 6,
      'image-brush.blend-mode': 10,
      'image-brush.anchor': 6,
      'image-brush.mutation': 9,
      'image-brush.fx-stage': 4,
      'image-brush.alpha-mode': 4,
      'image-brush.evolution-curve': 7,
    };
    for (const [id, count] of Object.entries(expectedCounts)) {
      const options = helpRegistry[id]?.options ?? [];
      expect(options).toHaveLength(count);
      expect(options.every((option) => option.description.trim().length > 12)).toBe(true);
    }
  });

  it('resolves every advanced Image Brush tooltip ID to audited metadata', () => {
    const rack: ImageBrushFxItem[] = [
      { id: 'audit-slice', effectId: 'slice', enabled: true, amount: 0.5, mix: 0.8 },
    ];
    const html = [
      renderImageBrush(
        'advanced',
        {
          ...defaultImageBrushSettings,
          mode: 'scatter',
          mutationMode: 'per-stamp',
          pressureSize: true,
          pressureOpacity: true,
        },
        rack,
      ),
      renderImageBrush(
        'advanced',
        {
          ...defaultImageBrushSettings,
          mutationMode: 'progressive',
          fxStage: 'after',
          alphaMode: 'bleed',
        },
        rack,
      ),
    ].join('');
    const ids = [...html.matchAll(/data-tooltip-id="([^"]+)"/g)].map((match) => match[1]!);
    expect(ids.length).toBeGreaterThan(20);
    for (const id of new Set(ids)) {
      expect(helpRegistry[id], id).toBeDefined();
    }
    expect(helpRegistry['image-brush.mutation']?.options).toHaveLength(9);
    expect(
      helpRegistry['image-brush.evolution-curve']?.options?.some(
        (option) => option.value === 'exponential',
      ),
    ).toBe(true);
  });

  it('uses one compact inspector with essential controls and collapsible advanced controls', () => {
    const simple = renderImageBrush('simple');
    expect(simple).toContain('data-testid="image-brush-essential"');
    expect(simple).toContain('CURRENT BRUSH');
    expect(simple).toContain('Maximum generated stamps');
    expect(simple).not.toContain('image-brush-style-cards');
    expect(simple).not.toContain('image-brush-interface-level');
    expect(simple.match(/<canvas/g) ?? []).toHaveLength(5);
    const advanced = renderImageBrush('advanced');
    expect(advanced).toBe(simple);
    expect(advanced).toContain('Maximum generated stamps');
    expect(advanced).toContain('Stamp Layout');
    expect(advanced).toContain('<summary>Mutation</summary>');
    expect(advanced).toContain('<summary>Performance</summary>');
  });

  it('hides controls that the active mode does not read', () => {
    const inactive = renderImageBrush('advanced', {
      ...defaultImageBrushSettings,
      mode: 'trail',
      mutationMode: 'fixed',
      pressureSize: false,
      pressureOpacity: false,
    });
    expect(inactive).not.toContain('X scatter');
    expect(inactive).not.toContain('Variant pool');
    expect(inactive).not.toContain('Feedback amount');
    expect(inactive).not.toContain('Minimum pressure size');
    const active = renderImageBrush('advanced', {
      ...defaultImageBrushSettings,
      mode: 'scatter',
      mutationMode: 'per-stamp',
      pressureSize: true,
    });
    expect(active).toContain('X scatter');
    expect(active).toContain('Variant pool');
    expect(active).toContain('Minimum pressure size');
  });
});

describe('Image Brush library lifecycle', () => {
  it('selects the next asset, then the previous asset, when the active asset is removed', () => {
    const assets = createDemoBrushAssets().slice(0, 3);
    const fromMiddle = removeImageBrushAsset(assets, assets[1]!.id, assets[1]!.id);
    expect(fromMiddle.library.map((asset) => asset.id)).toEqual([assets[0]!.id, assets[2]!.id]);
    expect(fromMiddle.activeAssetId).toBe(assets[2]!.id);
    const fromLast = removeImageBrushAsset(fromMiddle.library, assets[2]!.id, assets[2]!.id);
    expect(fromLast.activeAssetId).toBe(assets[0]!.id);
    const empty = removeImageBrushAsset(fromLast.library, assets[0]!.id, assets[0]!.id);
    expect(empty.library).toHaveLength(0);
    expect(empty.activeAssetId).toBeNull();
  });

  it('removes demos without reviving removed assets and preserves a non-demo selection', () => {
    const demos = createDemoBrushAssets().slice(0, 2);
    const uploaded = { ...demos[0]!, id: 'uploaded-brush', demo: false };
    const removal = removeImageBrushAssets([demos[0]!, uploaded, demos[1]!], uploaded.id, (asset) =>
      Boolean(asset.demo),
    );
    expect(removal.library.map((asset) => asset.id)).toEqual([uploaded.id]);
    expect(removal.activeAssetId).toBe(uploaded.id);
    expect(removal.removed).toHaveLength(2);
  });
});
