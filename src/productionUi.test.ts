import { describe, expect, it } from 'vitest';
import { resolveEditorShortcut } from './utils/shortcuts';
import appSource from './App.tsx?raw';
import algorithmControlsSource from './components/AlgorithmControls.tsx?raw';
import effectControlRegistrySource from './components/effectControlRegistry.ts?raw';
import canvasWorkspaceSource from './components/CanvasWorkspace.tsx?raw';
import effectPanelSource from './components/EffectPanel.tsx?raw';
import effectPreviewSource from './components/EffectPreviewStage.tsx?raw';
import effectPickerSource from './components/EffectPicker.tsx?raw';
import compactIconBrowserSource from './components/CompactIconBrowser.tsx?raw';
import splitterSource from './components/ControlsLayersSplitter.tsx?raw';
import moshLabSource from './components/MoshLab.tsx?raw';
import sharedRegistrySource from './effects/sharedRegistry.ts?raw';
import imageBrushEssentialSource from './components/ImageBrushEssentialControls.tsx?raw';
import interfaceModeSource from './components/InterfaceModeSwitch.tsx?raw';
import imageBrushPanelSource from './components/ImageBrushPanel.tsx?raw';
import imageBrushSimpleSource from './imageBrush/simple.ts?raw';
import landingSource from './components/LandingScreen.tsx?raw';
import layersDockSource from './components/LayersDock.tsx?raw';
import imageBrushDecodeSource from './imageBrush/decode.ts?raw';
import imageBrushStorageSource from './imageBrush/libraryStorage.ts?raw';
import retouchPanelSource from './components/RetouchPanel.tsx?raw';
import statusBarSource from './components/StatusBar.tsx?raw';
import topBarSource from './components/TopBar.tsx?raw';
import documentHookSource from './hooks/useDocument.ts?raw';
import brushWorkerSource from './workers/brush.worker.ts?raw';
import imageBrushWorkerSource from './workers/imageBrush.worker.ts?raw';
import retouchWorkerSource from './workers/retouch.worker.ts?raw';
import moshWorkerSource from './workers/mosh.worker.ts?raw';
import localLauncherSource from '../start-local.bat?raw';
import devLauncherSource from '../start-dev.bat?raw';
import imageBrushPresetSource from './imageBrush/presets.ts?raw';
import { algorithmList, defaultAlgorithmSettings } from './glitchAlgorithms';
import { imageBrushFxDefinitions } from './effects/sharedRegistry';
import { builtInImageBrushPresets } from './imageBrush/presets';
import { defaultImageBrushSettings } from './imageBrush/types';

describe('production editor cleanup', () => {
  it('uses one accessible compact icon browser across Effect, Mosh and Image Brush', () => {
    expect(effectPanelSource).toContain('LayoutGrid');
    expect(effectPanelSource).toContain('aria-label="Browse effects"');
    expect(effectPickerSource).toContain('<CompactIconBrowser');
    expect(moshLabSource).toContain('<CompactIconBrowser');
    expect(imageBrushPanelSource).toContain('<CompactIconBrowser');
    expect(compactIconBrowserSource).toContain('role="listbox"');
    expect(compactIconBrowserSource).toContain('role="option"');
    expect(compactIconBrowserSource).toContain("event.key === 'Escape'");
    expect(compactIconBrowserSource).toContain("'ArrowLeft'");
    expect(compactIconBrowserSource).toContain("'ArrowRight'");
    expect(compactIconBrowserSource).toContain('compact-icon-browser-tooltip');
    expect(imageBrushPanelSource).toContain('image-brush-style-thumbnail');
  });

  it('derives Evolution recipes from the shared registry and mounts the dock splitter', () => {
    expect(imageBrushPanelSource).toContain('buildImageBrushEvolutionRecipeOptions');
    expect(sharedRegistrySource).toContain('NEW · ');
    expect(appSource).toContain('<ControlsLayersSplitter');
    expect(splitterSource).toContain('setPointerCapture(event.pointerId)');
    expect(splitterSource).toContain('localStorage.setItem');
    expect(splitterSource).toContain('new ResizeObserver');
  });

  it('does not import, route or render the HEX editor in the production App', () => {
    expect(appSource).not.toContain('import { HexEditor }');
    expect(appSource).not.toContain("activePanel === 'hex'");
    expect(appSource).not.toContain("setActivePanel('hex')");
    expect(appSource).not.toContain('> HEX<');
    expect(appSource).not.toContain('Inspect pixel in HEX editor');
  });

  it('does not expose the removed File Corruption panel or canvas badge', () => {
    expect(appSource).not.toContain('FileCorruptionPanel');
    expect(appSource).not.toContain("activePanel === 'raw'");
    expect(canvasWorkspaceSource).not.toContain('SHIFT + CLICK · SELECT PIXEL TARGET');
  });

  it('keeps the Parkour Kotenok entrance minimal and focused on one tool', () => {
    expect(landingSource).toContain('PARKOUR KOTENOK');
    expect(landingSource).toContain('GLITCH BRUSHES');
    expect(landingSource).not.toContain('/assets/parkour-kotenok-road.jpg');
    expect(landingSource.match(/<button/g)).toHaveLength(1);
    expect(landingSource).not.toContain('COMING SOON');
  });

  it('uses the supplied road photograph as the editor demo document', () => {
    expect(appSource).toContain("fetch('/assets/parkour-kotenok-road.jpg')");
    expect(appSource).toContain("new File([blob], 'parkour-kotenok-road.jpg'");
  });

  it('offers progressive disclosure through Simple and Advanced controls', () => {
    expect(appSource).toContain('data-interface-mode={interfaceMode}');
    expect(interfaceModeSource).toContain('Simple');
    expect(interfaceModeSource).toContain('Advanced');
    expect(interfaceModeSource).toContain('aria-pressed');
  });

  it('keeps layers in a dedicated bottom dock for every editor panel', () => {
    expect(appSource).toContain('<LayersDock');
    expect(layersDockSource).toContain('aria-label="Layers"');
    expect(layersDockSource).toContain('aria-label="Layer blend mode"');
    expect(layersDockSource).toContain('aria-label="Layer opacity"');
    expect(layersDockSource).toContain('aria-label="Add layer"');
    expect(layersDockSource).toContain('aria-label="Delete layer"');
    expect(layersDockSource).toContain('<LayerThumbnail');
  });

  it('keeps essentials style-safe and orders the Image Brush workflow clearly', () => {
    expect(imageBrushEssentialSource).toContain('Upright column');
    expect(imageBrushEssentialSource).toContain('Follow stroke');
    expect(imageBrushEssentialSource).toContain('label="Spacing"');
    const source = imageBrushPanelSource.indexOf('<strong>Source</strong>');
    const style = imageBrushPanelSource.indexOf('<strong>Style</strong>');
    const preview = imageBrushPanelSource.indexOf('<strong>Preview</strong>');
    const essentials = imageBrushPanelSource.indexOf('<ImageBrushEssentialControls');
    expect(source).toBeLessThan(style);
    expect(style).toBeLessThan(preview);
    expect(preview).toBeLessThan(essentials);
    expect(imageBrushPanelSource).toContain('applyImageBrushStyleKeepingEssentials');
  });

  it('exposes independent Selected/All source controls without making them Style settings', () => {
    expect(imageBrushPanelSource).toContain('aria-label="Image source mode"');
    expect(imageBrushPanelSource).toContain('Selected');
    expect(imageBrushPanelSource).toContain('All');
    expect(imageBrushPanelSource).toContain("assetMode === 'all'");
    expect(imageBrushPanelSource).toContain('>Order<');
    expect(imageBrushPanelSource).toContain('value="cycle"');
    expect(imageBrushPanelSource).toContain('value="random"');
    expect(imageBrushPanelSource).toContain('Enable ${asset.name} in All images');
    expect(imageBrushPanelSource).toContain('Keep at least one image enabled');
    expect(appSource).toContain('enabledImageBrushAssetIds');
    expect(appSource).toContain('requiredImageBrushAssets');
  });

  it('uses pre-rendered landscape effect previews that never read the open document', () => {
    expect(effectPreviewSource).toContain('/assets/effect-previews/original.webp');
    expect(effectPreviewSource).toContain('PRE-RENDERED DEMO');
    expect(effectPreviewSource).not.toContain('new Worker');
    expect(appSource).not.toContain('effectPreviewSource');
  });

  it('ships one astronaut brush demo, one balanced randomize entry point and persistent styles', () => {
    expect(imageBrushDecodeSource).toContain('/assets/image-brush-astronaut.png');
    expect(imageBrushPanelSource.match(/className="image-brush-randomize-main"/g)).toHaveLength(1);
    expect(imageBrushPanelSource).toContain("onRandomize('balanced')");
    expect(imageBrushPanelSource).toContain('Save current as new style');
    expect(imageBrushPanelSource).not.toContain('New Variation');
    expect(imageBrushPanelSource).not.toContain('Demo images');
    expect(imageBrushStorageSource).toContain('indexedDB.open(databaseName, 1)');
    expect(appSource).toContain('saveImageBrushLibrary(customAssets)');
  });

  it('uses a static visual Style browser and keeps raw recipe editing Advanced-only', () => {
    expect(imageBrushPanelSource).toContain('aria-label="Image Brush style browser"');
    expect(imageBrushPanelSource).toContain('CompactIconBrowser');
    expect(imageBrushPanelSource).toContain('imageBrushStaticStyleThumbnail');
    expect(imageBrushPanelSource).toContain('image-brush-style-thumbnail');
    expect(imageBrushPanelSource).not.toContain('new Worker');
    expect(imageBrushSimpleSource).toContain('preGeneratedStyleThumbnails');
    expect(imageBrushSimpleSource).toContain("catalog: 'legacy'");
    expect(imageBrushPanelSource).toContain('image-brush-workflow-tabs interface-advanced-only');
    expect(imageBrushPanelSource).toContain('image-brush-master-advanced interface-advanced-only');
    expect(imageBrushPanelSource).toContain('Balanced variation');
    expect(imageBrushPresetSource).toContain('Pixel Embroidery');
    expect(imageBrushPresetSource).toContain('Xerox Decay');
    expect(imageBrushPresetSource).toContain('Zine Stitch');
  });

  it('keeps Image Brush FX controls compact without the five duplicate amount presets', () => {
    expect(imageBrushPanelSource).not.toContain('image-brush-fx-levels');
    expect(imageBrushPanelSource).toContain('label="Amount"');
    expect(imageBrushPanelSource).toContain('label="Mix"');
  });

  it('removes duplicate Image Brush production blocks and exposes persistent accessible tabs', () => {
    expect(imageBrushPanelSource).not.toContain('CURRENT BRUSH');
    expect(imageBrushPanelSource).not.toContain('Library and Project');
    expect(imageBrushPanelSource).not.toContain('Download tip');
    expect(imageBrushPanelSource).not.toContain('Copy tip');
    expect(imageBrushPanelSource).toContain('role="tablist"');
    expect(imageBrushPanelSource).toContain('role="tab"');
    expect(imageBrushPanelSource).toContain('role="tabpanel"');
    expect(imageBrushPanelSource).toContain(
      "sessionStorage.setItem('glitchbrushes:image-brush-tab'",
    );
    expect(imageBrushPanelSource).toContain('diagnosticsEnabled &&');
  });

  it('renders Image Brush preview over the immutable source instead of prior brush strokes', () => {
    expect(appSource).toContain('const imageBrushPreviewSource = docRef.current.original');
    expect(appSource).not.toContain(
      'resizeRgba(docRef.current.pixels, docRef.current.width, docRef.current.height, 320)',
    );
    expect(appSource).not.toContain('strokeNonce: imageBrushStrokeNonce');
  });

  it('maps Retouch shortcuts from physical codes so Cyrillic layout does not change them', () => {
    expect(resolveEditorShortcut({ code: 'KeyS' })).toBe('smudge');
    expect(resolveEditorShortcut({ code: 'KeyR' })).toBe('finger');
    expect(resolveEditorShortcut({ code: 'KeyU' })).toBe('blur-retouch');
    expect(resolveEditorShortcut({ code: 'KeyJ' })).toBe('sharpen');
    expect(resolveEditorShortcut({ code: 'KeyE' })).toBe('restore');
    expect(resolveEditorShortcut({ code: 'KeyX' })).toBe('eraser');
  });

  it('does not mount the expensive Retouch tool preview', () => {
    expect(retouchPanelSource).not.toContain('RetouchPreviewStage');
    expect(retouchPanelSource).not.toContain('REAL TOOL PREVIEW');
  });

  it('keeps the legacy canvas mode switch and default pixel marker out of the toolbar', () => {
    expect(canvasWorkspaceSource).not.toContain("['continuous', 'stroke', 'preview']");
    expect(canvasWorkspaceSource).not.toContain('pixel-highlight');
  });

  it('keeps multi-megabyte document pixel buffers out of ordinary React UI props', () => {
    expect(appSource).toContain('doc={documentMeta}');
    expect(appSource).toContain('documentWidth={doc.width}');
    expect(appSource).not.toContain('original={doc.original}');
    expect(topBarSource).not.toContain('EditorDocument');
    expect(canvasWorkspaceSource).not.toContain('EditorDocument');
    expect(statusBarSource).not.toContain('EditorDocument');
    expect(effectPanelSource).not.toContain('Uint8ClampedArray');
  });

  it('exposes six explicit Clone Corruption modes and factual source alignment', () => {
    const source = `${appSource}\n${algorithmControlsSource}\n${effectControlRegistrySource}`;
    for (const label of [
      'Clean Clone',
      'Fragment Clone',
      'Slice Clone',
      'Packet Clone',
      'RGB Clone',
      'Evolving Clone',
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('source and destination move together');
    expect(source).toContain('reuse the picked source');
  });

  it('keeps pixel revisions separate from document surface initialization', () => {
    expect(documentHookSource).toContain('documentSurfaceVersion');
    expect(documentHookSource).toContain('bumpDocumentSurface');
    expect(appSource).toContain(
      '[documentSurfaceVersion, updateOriginalCanvas, updateWorkingCanvas]',
    );
    expect(appSource).toContain('[documentSurfaceVersion, fitToScreen]');
    expect(appSource).not.toContain('[documentVersion, fitToScreen]');
    expect(appSource).toContain('glitchbrushes:canvas-dirty-upload');
    expect(appSource).toContain('glitchbrushes:canvas-full-sync');
  });

  it('lets successful one-shot workers close themselves after transferring results', () => {
    for (const workerSource of [
      brushWorkerSource,
      imageBrushWorkerSource,
      retouchWorkerSource,
      moshWorkerSource,
    ]) {
      expect(workerSource).toContain('self.close()');
    }
    expect(appSource).not.toMatch(
      /(?:mosh|brush|imageBrush)JobGateRef\.current\.cancel\(result\.jobId\);\s*worker\.terminate\(\)/,
    );
  });

  it('reuses the full brush mask and launches production separately from development', () => {
    expect(appSource).not.toContain('maskRef.current = new Float32Array(maskRef.current.length)');
    expect(localLauncherSource).toContain('npm run build');
    expect(localLauncherSource).toContain('npm run preview');
    expect(localLauncherSource).not.toContain('npm run dev');
    expect(devLauncherSource).toContain('npm run dev');
  });

  it('renders six metadata-driven NEW tools without leaking them into normal groups or random pools', () => {
    const experimentalAlgorithms = algorithmList.filter((item) => item.experimental);
    const experimentalImageFx = imageBrushFxDefinitions.filter((item) => item.experimental);
    expect(experimentalAlgorithms.map((item) => item.id)).toEqual([
      'mirror-fold-brush',
      'raster-loom-brush',
      'contour-crawl-brush',
      'jpeg-resample-brush',
    ]);
    expect(experimentalImageFx.map((item) => item.id)).toEqual([
      'jpeg-resample',
      'pixel-embroidery',
      'xerox-decay',
    ]);
    expect(effectPickerSource).toContain('NEW / EXPERIMENTAL');
    expect(effectPickerSource).toContain(".map((item) => asBrowserItem(item, 'NEW'))");
    expect(effectPickerSource).toContain(
      'value.experimental && <em className="new-effect-badge">NEW</em>',
    );
    expect(effectPickerSource).toContain('experimental={previewItem.experimental}');
    expect(effectPickerSource).toContain("item.family === 'advanced-brush' && !item.experimental");
    expect(imageBrushPanelSource).toContain(
      'definition.experimental && <em className="new-effect-badge">NEW</em>',
    );
    const experimentalImageFxIds = new Set<string>(experimentalImageFx.map((item) => item.id));
    const dedicatedExperimentalStyleIds = new Set(['pixel-embroidery', 'xerox-decay']);
    for (const item of [...experimentalAlgorithms, ...experimentalImageFx]) {
      expect(defaultAlgorithmSettings.structuralMixPool).not.toContain(item.id);
      expect(defaultImageBrushSettings.effectPool).not.toContain(item.id);
      if (experimentalImageFxIds.has(item.id) && dedicatedExperimentalStyleIds.has(item.id)) {
        expect(builtInImageBrushPresets.some((preset) => preset.id === item.id)).toBe(true);
      } else {
        expect(
          builtInImageBrushPresets.some((preset) =>
            preset.rack.some((fx) => fx.effectId === item.id),
          ),
        ).toBe(false);
      }
    }
    expect(imageBrushPresetSource).toContain('!definition.experimental');
  });
});
