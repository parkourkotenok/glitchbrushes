import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { FileImage } from 'lucide-react';
import { PRODUCT_NAME } from './brand/brand';
import { stampSoftBrush } from './canvas/brushMask';
// Heavy interactive tabs are loaded lazily so the initial bundle stays small
// and the heavy worker-driven panels are code-split into their own chunks.
const MoshLab = lazy(() => import('./components/MoshLab').then((m) => ({ default: m.MoshLab })));
const ImageBrushPanel = lazy(() =>
  import('./components/ImageBrushPanel').then((m) => ({ default: m.ImageBrushPanel })),
);
import { FileCorruptionPanel } from './components/FileCorruptionPanel';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { HistoryPopover } from './components/HistoryPopover';
import { ToolRail } from './components/ToolRail';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { InspectorTabs } from './components/InspectorTabs';
import { EffectPanel } from './components/EffectPanel';
import { RetouchPanel } from './components/RetouchPanel';
import { ShortcutsModal, ExportModal, ProjectModal } from './components/Modals';
import {
  algorithmList,
  algorithms,
  defaultAlgorithmSettings,
  legacyAlgorithmList,
} from './glitchAlgorithms';
import { migrateAlgorithmSelection, migratePreset } from './glitchAlgorithms/migration';
import {
  deriveAdvancedBrushOverlays,
  isAdvancedBrushId,
  randomizeAdvancedBrush,
} from './glitchAlgorithms/advancedBrushConfig';
import type { BrushProgress } from './brush/engine';
import type { RetouchProgress } from './retouch/types';
import { isRetouchTool } from './retouch/tools';
import { structuralWriteBounds } from './glitchAlgorithms/structuralUtils';
import { createPatch } from './history/PatchHistory';
import { useHistory } from './hooks/useHistory';
import { createDemoDocument, useDocument } from './hooks/useDocument';
import { useLayerStack } from './hooks/useLayerStack';
import { useMosh } from './hooks/useMosh';
import { useImageBrush, type ImageBrushStrokeState } from './hooks/useImageBrush';
import {
  useBrush,
  defaultBrush,
  type StrokeState,
  type PersistedBrushMask,
} from './hooks/useBrush';
import { useRetouch } from './hooks/useRetouch';
import { useExport } from './hooks/useExport';
import { useProject } from './hooks/useProject';
import { useViewport } from './hooks/useViewport';
import { useEditor } from './hooks/useEditor';
import { usePixelState } from './hooks/usePixelState';
import { useNotice } from './hooks/useNotice';
import { finalizePatches, rowPatchesBefore } from './layers/patches';
import {
  activeLayer,
  composeActiveLayerPixels,
  composeLayerStack,
  composeLayerStackBelowActive,
  createLayerStack,
  deserializeLayerStack,
  eraseActiveLayerWithMask,
  layerMemoryBytes,
  restoreLayerStack,
  serializeLayerStack,
  snapshotLayerStack,
  writeCompositeResultToActiveLayer,
  type LayerStack,
  type SerializedLayerStack,
} from './layers/sparseLayers';
import { algorithmIconIds } from './icons/effects';
import { countChangedPixels } from './mosh/engine';
import {
  createDemoBrushAssets,
  removeImageBrushAsset as removeImageBrushAssetFromLibrary,
  removeImageBrushAssets,
  resizeRgba,
  optimizeImageBrushAsset,
  restoreImageBrushProject,
  retrimImageBrushAsset,
  serializeImageBrushProject,
} from './imageBrush/assets';
import { cropRgbaRegion, estimateImageBrushReadBounds } from './imageBrush/bounds';
import { imageBrushFxCacheKey, resolveImageBrushQuality } from './imageBrush/performance';
import {
  appendStampPath,
  anchorPoint,
  beginStampPath,
  rotationForStamp,
  spacingInPixels,
} from './imageBrush/path';
import {
  builtInImageBrushPresets,
  randomizeImageBrush,
  type ImageBrushRandomizeScope,
} from './imageBrush/presets';
import {
  type ImageBrushAsset,
  type ImageBrushProcessResult,
  type ImageBrushPreviewResult,
  type ImageBrushProgress,
  type ImageBrushProjectData,
  type StampPoint,
} from './imageBrush/types';
import {
  clearMoshRegions,
  deriveMoshOverlays,
  isMoshRackReady,
  setMoshRegion,
} from './mosh/interactions';
import { useHelp } from './help/HelpContext';
import {
  createMoshCard,
  moshEffectDefinitions,
  type MoshEffectCard,
  type MoshProgress,
} from './mosh/types';
import { builtInPresets, saveCustomPresets } from './presets';
import { applyProjectRuns, encodeProjectRuns, type ProjectRun } from './projectRuns';
import type {
  AlgorithmId,
  AlgorithmSettings,
  ApplyMode,
  BrushSettings,
  BytePatch,
  HistoryAction,
  LayerBlendMode,
  LayerStackSnapshot,
  Point,
  Preset,
  Rectangle,
  CanvasOverlayState,
  Tool,
} from './types';
import { clamp, formatBytes, pixelToByteOffset, unionRect } from './utils/geometry';
import { createSeed, createSeededRandom } from './utils/prng';
import { isTypingTarget, resolveEditorShortcut } from './utils/shortcuts';
import { algorithmDescriptions } from './effects/descriptions';
import { triggerDownload } from './utils/download';

interface RegionDragState {
  pointerId: number;
  ownerEffectInstanceId: string;
  mode: 'source' | 'destination';
  start: Point;
  rectangle: Rectangle;
}

function imageDataFrom(buffer: Uint8ClampedArray, width: number, height: number): ImageData {
  return new ImageData(buffer, width, height);
}

/** Shown while a lazily loaded tab chunk is being fetched. */
function PanelLoading() {
  return (
    <div className="panel-loading" role="status">
      Loading…
    </div>
  );
}

export function App() {
  const { helpMode, panelOpen: helpPanelOpen, togglePanel: toggleHelpPanel } = useHelp();
  const {
    docRef,
    documentVersion,
    bumpDocument,
    processing,
    setProcessing,
    exportName,
    setExportName,
  } = useDocument();
  const {
    layerStackRef,
    layerVersion,
    bumpLayers,
    restoreLayerSnapshot,
    commitCurrentBufferToActiveLayer,
  } = useLayerStack(docRef);
  const {
    brush,
    setBrush,
    brushRef,
    settings,
    setSettings,
    settingsRef,
    seed,
    setSeed,
    seedRef,
    applyMode,
    setApplyMode,
    applyModeRef,
    metaRecipeLocked,
    setMetaRecipeLocked,
    brushProcessing,
    setBrushProcessing,
    brushProgress,
    setBrushProgress,
    brushContext,
    setBrushContext,
    brushWorkerRef,
    brushJobGateRef,
    feedbackMemoryRef,
    pendingFeedbackMemoryRef,
    maskRef,
    lastBrushMaskRef,
    lastBrushDirectionRef,
    strokeRef,
  } = useBrush(docRef.current.width, docRef.current.height);
  const {
    retouchSettings,
    setRetouchSettings,
    retouchSettingsRef,
    cloneSource,
    setCloneSource,
    cloneSourcePickMode,
    setCloneSourcePickMode,
    feedbackMemoryVersion,
    setFeedbackMemoryVersion,
    retouchWorkerRef,
  } = useRetouch();
  const {
    exportOpen,
    setExportOpen,
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality,
    preserveTransparency,
    setPreserveTransparency,
    exportBackground,
    setExportBackground,
    embedProjectImage,
    setEmbedProjectImage,
    renderExportCanvas,
  } = useExport(docRef);
  const {
    projectOpen,
    setProjectOpen,
    customPresets,
    setCustomPresets,
    projectInputRef,
    presetInputRef,
  } = useProject();
  const {
    zoom,
    setZoom,
    zoomRef,
    pan,
    setPan,
    panRef,
    maskView,
    setMaskView,
    compareMode,
    setCompareMode,
    splitPosition,
    setSplitPosition,
    showOriginal,
    setShowOriginal,
    blinkPhase,
    setBlinkPhase,
    viewportRef,
    stageRef,
    cursorRef,
    pointerRafRef,
    cursorPendingRef,
    fitToScreen,
    screenToImage,
  } = useViewport(docRef);
  const {
    tool,
    setTool,
    algorithm,
    setAlgorithm,
    activePanel,
    setActivePanel,
    shortcutsOpen,
    setShortcutsOpen,
  } = useEditor();
  const {
    selectedByte,
    setSelectedByte,
    selectedPixels,
    setSelectedPixels,
    cursorInfo,
    setCursorInfo,
  } = usePixelState();
  const { notice, setNotice } = useNotice();
  const {
    historyRef,
    historyVersion,
    bumpHistory,
    commitHistory,
    commitPendingPreview,
    clearHistory: resetHistory,
    pendingPreview,
    setPendingPreview,
    historyOpen,
    toggleHistoryOpen,
    closeHistoryOpen,
  } = useHistory();
  const {
    moshProcessing,
    setMoshProcessing,
    moshProgress,
    setMoshProgress,
    moshRack,
    setMoshRack,
    moshSeed,
    setMoshSeed,
    moshPreviewEnabled,
    setMoshPreviewEnabled,
    moshPreviewStale,
    setMoshPreviewStale,
    setMoshPreviewVersion,
    moshRegionTool,
    setMoshRegionTool,
    moshDraftRegion,
    setMoshDraftRegion,
    moshWorkerRef,
    moshJobGateRef,
    moshPreviewBufferRef,
    moshPreviewSignatureRef,
  } = useMosh();
  const {
    imageBrushProcessing,
    setImageBrushProcessing,
    imageBrushProgress,
    setImageBrushProgress,
    imageBrushPerformance,
    setImageBrushPerformance,
    imageBrushSettings,
    setImageBrushSettings,
    imageBrushRack,
    setImageBrushRack,
    imageBrushSeed,
    setImageBrushSeed,
    imageBrushVariationNonce,
    setImageBrushVariationNonce,
    imageBrushLockSeed,
    setImageBrushLockSeed,
    imageBrushPresetId,
    setImageBrushPresetId,
    imageBrushLibrary,
    setImageBrushLibrary,
    activeImageBrushId,
    setActiveImageBrushId,
    processedBrushPreview,
    setProcessedBrushPreview,
    imageBrushWorkerRef,
    imageBrushPreviewWorkerRef,
    imageBrushPreviewGenerationRef,
    imageBrushRenderCountRef,
    imageBrushWorkerCountersRef,
    imageBrushJobGateRef,
    imageBrushStrokeRef,
    imageBrushSettingsRef,
    imageBrushLibraryRef,
    imageBrushRackRef,
    activeImageBrushIdRef,
    imageBrushEvolutionOffsetRef,
    pendingImageBrushEvolutionRef,
    imageBrushGhostSourceRef,
    imageBrushGhostVariantsRef,
    imageBrushLockedRandomizationRef,
  } = useImageBrush();
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageBrushOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panDragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const altDragRef = useRef<{ pointerId: number; start: Point; brush: BrushSettings } | null>(null);
  const regionDragRef = useRef<RegionDragState | null>(null);
  const spaceDownRef = useRef(false);
  const fileDropCounter = useRef(0);

  useEffect(() => {
    setImageBrushLibrary((library) =>
      library.map((asset) =>
        retrimImageBrushAsset(
          asset,
          imageBrushSettings.trimTransparent,
          imageBrushSettings.trimThreshold,
        ),
      ),
    );
  }, [imageBrushSettings.trimThreshold, imageBrushSettings.trimTransparent]);

  const imageBrushPreviewKey = useMemo(() => {
    const active = imageBrushLibrary.find((asset) => asset.id === activeImageBrushId);
    return active
      ? imageBrushFxCacheKey(active, imageBrushSettings, imageBrushRack, imageBrushSeed)
      : 'no-image-brush';
  }, [activeImageBrushId, imageBrushLibrary, imageBrushRack, imageBrushSeed, imageBrushSettings]);

  useEffect(() => {
    const active = imageBrushLibrary.find((asset) => asset.id === activeImageBrushId);
    imageBrushPreviewWorkerRef.current?.terminate();
    imageBrushPreviewWorkerRef.current = null;
    imageBrushGhostVariantsRef.current = [];
    imageBrushGhostSourceRef.current = null;
    if (!active) {
      setProcessedBrushPreview(null);
      imageBrushGhostSourceRef.current = null;
      return;
    }
    const generation = ++imageBrushPreviewGenerationRef.current;
    const jobId = `image-brush-preview-${generation}`;
    const worker = new Worker(new URL('./workers/imageBrushPreview.worker.ts', import.meta.url), {
      type: 'module',
    });
    imageBrushPreviewWorkerRef.current = worker;
    const acceptResult = (result: ImageBrushPreviewResult) => {
      if (
        result.generation !== imageBrushPreviewGenerationRef.current ||
        imageBrushPreviewWorkerRef.current !== worker
      ) {
        return;
      }
      setProcessedBrushPreview(result);
      const sources = result.variants.map((variant) => {
        const source = document.createElement('canvas');
        source.width = variant.width;
        source.height = variant.height;
        source
          .getContext('2d')
          ?.putImageData(new ImageData(variant.pixels, variant.width, variant.height), 0, 0);
        return source;
      });
      if (result.quality === 'full') {
        imageBrushGhostVariantsRef.current = sources;
        imageBrushGhostSourceRef.current = sources[0] ?? null;
      }
      if (result.diagnostics.noVisibleChange) {
        setNotice(
          'The active Image Brush FX rack produced almost no visible tip change. Increase Amount or Mix.',
        );
      }
    };
    const postPreview = (quality: 'draft' | 'full') => {
      const pixels = active.pixels.slice().buffer;
      worker.postMessage(
        {
          jobId,
          generation,
          quality,
          assetId: active.id,
          pixels,
          width: active.width,
          height: active.height,
          rack: imageBrushRack.map((item) => ({ ...item })),
          settings: {
            ...imageBrushSettings,
            customAnchor: { ...imageBrushSettings.customAnchor },
          },
          seed: imageBrushSeed,
        },
        [pixels],
      );
    };
    let fullTimer: number | null = null;
    worker.onmessage = (
      event: MessageEvent<
        ImageBrushPreviewResult | { type: 'error'; generation: number; message: string }
      >,
    ) => {
      if ('type' in event.data && event.data.type === 'error') {
        if (event.data.generation === imageBrushPreviewGenerationRef.current) {
          setNotice(event.data.message);
        }
        return;
      }
      const result = event.data as ImageBrushPreviewResult;
      acceptResult(result);
      if (result.quality === 'draft' && result.generation === generation) {
        fullTimer = window.setTimeout(() => postPreview('full'), 60);
      }
    };
    worker.onerror = () => {
      if (generation === imageBrushPreviewGenerationRef.current) {
        setNotice('Image Brush preview Worker failed safely; drawing remains available.');
      }
    };
    const draftTimer = window.setTimeout(() => postPreview('draft'), 24);
    return () => {
      window.clearTimeout(draftTimer);
      if (fullTimer !== null) window.clearTimeout(fullTimer);
      worker.terminate();
      if (imageBrushPreviewWorkerRef.current === worker) imageBrushPreviewWorkerRef.current = null;
    };
  }, [imageBrushPreviewKey]);

  const doc = docRef.current;
  const history = historyRef.current;
  const effectPreviewSource = useMemo(
    () => ({
      ...resizeRgba(doc.pixels, doc.width, doc.height, 180),
      version: documentVersion,
    }),
    [doc, documentVersion],
  );
  const retouchRestorePreviewSource = useMemo(() => {
    let pixels = doc.original;
    if (retouchSettings.restoreSource === 'lower-layer') {
      pixels = composeLayerStackBelowActive(layerStackRef.current, doc.original);
    } else if (retouchSettings.restoreSource === 'previous-history') {
      const latest = historyRef.current.undoEntries.at(-1);
      if (latest?.layerBefore) {
        pixels = composeLayerStack(restoreLayerStack(latest.layerBefore), doc.original);
      }
    }
    return {
      ...resizeRgba(pixels, doc.width, doc.height, 180),
      version: documentVersion + layerVersion + historyVersion,
    };
  }, [doc, documentVersion, historyVersion, layerVersion, retouchSettings.restoreSource]);
  const memoryEstimate =
    doc.pixels.byteLength * 3 +
    maskRef.current.byteLength +
    lastBrushMaskRef.current.data.byteLength +
    layerMemoryBytes(layerStackRef.current) +
    history.memoryBytes;
  const moshSignature = useMemo(
    () =>
      JSON.stringify({
        rack: moshRack,
        seed: moshSeed,
        documentVersion,
        selectedPixels,
        brushContextVersion: brushContext.version,
        brushDirection: brushContext.direction,
      }),
    [documentVersion, moshRack, moshSeed, selectedPixels, brushContext],
  );
  const canvasOverlays = useMemo(() => {
    const overlays: CanvasOverlayState[] = deriveMoshOverlays(moshRack, moshDraftRegion);
    return overlays.concat(deriveAdvancedBrushOverlays(algorithm, cloneSource));
  }, [algorithm, cloneSource, moshDraftRegion, moshRack]);

  const updateWorkingCanvas = useCallback((bounds?: Rectangle) => {
    const current = docRef.current;
    const canvas = workCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      setNotice('Canvas 2D context is unavailable.');
      return;
    }
    const data = imageDataFrom(current.pixels, current.width, current.height);
    if (bounds) {
      context.putImageData(data, 0, 0, bounds.x, bounds.y, bounds.width, bounds.height);
    } else {
      context.putImageData(data, 0, 0);
    }
  }, []);

  const runLayerOperation = useCallback(
    (label: string, mutate: (stack: LayerStack) => boolean | void) => {
      const current = docRef.current;
      const beforeSnapshot = snapshotLayerStack(layerStackRef.current);
      const beforePixels = current.pixels.slice();
      const result = mutate(layerStackRef.current);
      if (result === false) {
        setNotice(`${label} is unavailable for the current layer state.`);
        return;
      }
      current.pixels.set(composeLayerStack(layerStackRef.current, current.original));
      const patch = createPatch(0, beforePixels, current.pixels);
      commitHistory({
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label,
        patches: patch ? [patch] : [],
        timestamp: Date.now(),
        icon: 'image-brush',
        affectedBytes: patch?.after.byteLength ?? 0,
        layerBefore: beforeSnapshot,
        layerAfter: snapshotLayerStack(layerStackRef.current),
      });
      current.dirty = true;
      updateWorkingCanvas();
      bumpLayers();
      bumpDocument();
      setNotice(`${label} committed as one reversible History action.`);
    },
    [updateWorkingCanvas],
  );

  const displayWorkingBuffer = useCallback((pixels: Uint8ClampedArray) => {
    const current = docRef.current;
    const canvas = workCanvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context || pixels.length !== current.width * current.height * 4) return;
    context.putImageData(imageDataFrom(pixels, current.width, current.height), 0, 0);
  }, []);

  const commitMoshBuffer = useCallback(
    (pixels: Uint8ClampedArray, affectedPixels: number, completedEffects: number) => {
      const current = docRef.current;
      if (activeLayer(layerStackRef.current).locked) {
        setNotice('MOSH LAB cannot apply because the active glitch layer is locked.');
        return;
      }
      if (pixels.length !== current.pixels.length) {
        setNotice('MOSH LAB result size did not match the current document.');
        return;
      }
      const layerBefore = snapshotLayerStack(layerStackRef.current);
      current.pixels.set(pixels);
      const committed = commitCurrentBufferToActiveLayer(layerBefore, {
        x: 0,
        y: 0,
        width: current.width,
        height: current.height,
      });
      if (!committed.patches.length) {
        updateWorkingCanvas();
        setNotice('MOSH LAB rack completed without changing pixels.');
        return;
      }
      const enabled = moshRack.filter((card) => card.enabled);
      const names = enabled.map(
        (card) => moshEffectDefinitions.find((item) => item.id === card.effectId)!.name,
      );
      const first = enabled[0];
      let actionBounds: Rectangle = {
        x: 0,
        y: 0,
        width: current.width,
        height: current.height,
      };
      if (
        enabled.length > 0 &&
        enabled.every((card) => card.target === 'brush') &&
        lastBrushMaskRef.current.bounds
      ) {
        actionBounds = { ...lastBrushMaskRef.current.bounds };
      } else if (
        enabled.length > 0 &&
        enabled.every((card) => card.target === 'selection') &&
        selectedPixels.length > 0
      ) {
        const xs = selectedPixels.map((pixel) => pixel % current.width);
        const ys = selectedPixels.map((pixel) => Math.floor(pixel / current.width));
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        actionBounds = {
          x: left,
          y: top,
          width: Math.max(...xs) - left + 1,
          height: Math.max(...ys) - top + 1,
        };
      }
      commitHistory({
        id: `mosh-${Date.now()}`,
        label: names.length === 1 ? names[0]! : `MOSH LAB · ${names.length} effects`,
        patches: committed.patches,
        timestamp: Date.now(),
        icon: first
          ? moshEffectDefinitions.find((item) => item.id === first.effectId)!.icon
          : 'motion-field',
        affectedPixels,
        affectedBytes: affectedPixels * 4,
        detail: `${completedEffects} rack effect${completedEffects === 1 ? '' : 's'}`,
        bounds: actionBounds,
        layerBefore: committed.layerBefore,
        layerAfter: committed.layerAfter,
      });
      current.dirty = true;
      moshPreviewBufferRef.current = null;
      moshPreviewSignatureRef.current = '';
      setMoshPreviewStale(false);
      setMoshPreviewVersion((version) => version + 1);
      updateWorkingCanvas();
      bumpDocument();
      setNotice(
        `MOSH LAB applied atomically: ${affectedPixels.toLocaleString()} changed pixel(s), one history action.`,
      );
    },
    [commitCurrentBufferToActiveLayer, moshRack, selectedPixels, updateWorkingCanvas],
  );

  const cancelMosh = useCallback(() => {
    const jobId = moshJobGateRef.current.currentJobId;
    if (jobId) moshJobGateRef.current.cancel(jobId);
    moshWorkerRef.current?.terminate();
    moshWorkerRef.current = null;
    moshPreviewBufferRef.current = null;
    moshPreviewSignatureRef.current = '';
    setMoshPreviewStale(false);
    setMoshProcessing(false);
    setMoshProgress(null);
    setMoshPreviewVersion((version) => version + 1);
    updateWorkingCanvas();
    setNotice(
      jobId
        ? 'MOSH LAB Worker cancelled. Committed pixels were not changed.'
        : 'MOSH LAB preview cancelled.',
    );
  }, [updateWorkingCanvas]);

  const clearImageDependentMoshState = useCallback(() => {
    regionDragRef.current = null;
    setMoshDraftRegion(null);
    setMoshRegionTool(null);
    setMoshRack((rack) => clearMoshRegions(rack));
  }, []);

  const clearAdvancedBrushTransientState = useCallback(() => {
    feedbackMemoryRef.current = null;
    pendingFeedbackMemoryRef.current = null;
    setFeedbackMemoryVersion((version) => version + 1);
    setCloneSource(null);
    setCloneSourcePickMode(false);
  }, []);

  const changeAlgorithm = useCallback(
    (next: AlgorithmId) => {
      if (next === algorithm) return;
      const activeBrushJob = brushJobGateRef.current.currentJobId;
      if (activeBrushJob) brushJobGateRef.current.cancel(activeBrushJob);
      brushWorkerRef.current?.terminate();
      brushWorkerRef.current = null;
      retouchWorkerRef.current?.terminate();
      retouchWorkerRef.current = null;
      imageBrushWorkerRef.current?.terminate();
      imageBrushWorkerRef.current = null;
      imageBrushPreviewWorkerRef.current?.terminate();
      imageBrushPreviewWorkerRef.current = null;
      setBrushProcessing(false);
      setBrushProgress(null);
      if (pendingPreview) {
        const current = docRef.current;
        for (let index = pendingPreview.patches.length - 1; index >= 0; index -= 1) {
          const patch = pendingPreview.patches[index]!;
          current.pixels.set(patch.before, patch.start);
        }
        setPendingPreview(null);
        bumpDocument();
        updateWorkingCanvas();
      }
      setCloneSourcePickMode(false);
      if (algorithm === 'clone-corruption-brush') setCloneSource(null);
      if (algorithm === 'feedback-brush') {
        feedbackMemoryRef.current = null;
        pendingFeedbackMemoryRef.current = null;
        setFeedbackMemoryVersion((version) => version + 1);
      }
      setAlgorithm(next);
    },
    [algorithm, pendingPreview, updateWorkingCanvas],
  );

  const resetFeedbackMemory = useCallback(() => {
    feedbackMemoryRef.current = null;
    pendingFeedbackMemoryRef.current = null;
    setFeedbackMemoryVersion((version) => version + 1);
    setNotice('Feedback memory reset. Image pixels and History were not changed.');
  }, []);

  const changeMoshRack = useCallback(
    (next: MoshEffectCard[]) => {
      if (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId) cancelMosh();
      const owner = moshRegionTool?.ownerEffectInstanceId;
      if (
        owner &&
        !next.some(
          (card) =>
            card.instanceId === owner && card.effectId === 'motion-transfer' && card.enabled,
        )
      ) {
        regionDragRef.current = null;
        setMoshDraftRegion(null);
        setMoshRegionTool(null);
      }
      setMoshRack(next);
    },
    [cancelMosh, moshRegionTool],
  );

  const clearMotionTransferRegion = useCallback(
    (ownerEffectInstanceId: string, mode: 'source' | 'destination' | 'both') => {
      const preview = moshPreviewBufferRef.current;
      const activeJob = moshJobGateRef.current.currentJobId;
      if (activeJob) {
        moshJobGateRef.current.cancel(activeJob);
        moshWorkerRef.current?.terminate();
        moshWorkerRef.current = null;
        setMoshProcessing(false);
        setMoshProgress(null);
      }
      if (preview) {
        displayWorkingBuffer(preview);
        setMoshPreviewStale(true);
      }
      if (moshRegionTool?.ownerEffectInstanceId === ownerEffectInstanceId) {
        regionDragRef.current = null;
        setMoshDraftRegion(null);
        setMoshRegionTool(null);
      }
      setMoshRack((rack) => clearMoshRegions(rack, ownerEffectInstanceId, mode));
      setNotice(
        `${mode === 'both' ? 'Motion Transfer source and destination' : `Motion Transfer ${mode}`} cleared. ` +
          `${preview ? 'The last preview remains visible and is marked stale; Apply Last Preview or Cancel Preview. ' : ''}` +
          'Committed pixels and History were not changed.',
      );
    },
    [displayWorkingBuffer, moshRegionTool],
  );

  const startMoshJob = useCallback(
    (mode: 'preview' | 'apply') => {
      const enabled = moshRack.filter((card) => card.enabled);
      if (!enabled.length) {
        setNotice('Add or enable at least one MOSH LAB effect.');
        return;
      }
      if (!isMoshRackReady(moshRack)) {
        setNotice('Motion Transfer needs a valid source region before it can be applied.');
        return;
      }
      const activeBrushJob = brushJobGateRef.current.currentJobId;
      if (activeBrushJob) brushJobGateRef.current.cancel(activeBrushJob);
      brushWorkerRef.current?.terminate();
      brushWorkerRef.current = null;
      retouchWorkerRef.current?.terminate();
      retouchWorkerRef.current = null;
      imageBrushWorkerRef.current?.terminate();
      imageBrushWorkerRef.current = null;
      imageBrushPreviewWorkerRef.current?.terminate();
      imageBrushPreviewWorkerRef.current = null;
      setBrushProcessing(false);
      setBrushProgress(null);
      const previousJobId = moshJobGateRef.current.currentJobId;
      if (previousJobId) moshJobGateRef.current.cancel(previousJobId);
      moshWorkerRef.current?.terminate();

      const jobId = `mosh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const worker = new Worker(new URL('./workers/mosh.worker.ts', import.meta.url), {
        type: 'module',
      });
      const current = docRef.current;
      const source = current.pixels.slice();
      const selectionMask = new Uint8Array(current.width * current.height);
      for (const pixel of selectedPixels) {
        if (pixel >= 0 && pixel < selectionMask.length) selectionMask[pixel] = 255;
      }
      const brushMask = lastBrushMaskRef.current.data.slice();
      const brushMaskBounds = lastBrushMaskRef.current.bounds
        ? { ...lastBrushMaskRef.current.bounds }
        : undefined;
      moshWorkerRef.current = worker;
      moshJobGateRef.current.begin(jobId);
      setMoshProcessing(true);
      setMoshProgress(null);
      setNotice(`MOSH LAB Worker started: ${enabled.length} effect(s).`);

      worker.onmessage = (
        event: MessageEvent<{
          type: 'progress' | 'result' | 'error';
          progress?: MoshProgress;
          result?: {
            jobId: string;
            pixels: ArrayBuffer;
            affectedPixels: number;
            completedEffects: number;
          };
          jobId?: string;
          message?: string;
        }>,
      ) => {
        if (event.data.type === 'progress' && event.data.progress) {
          if (moshJobGateRef.current.isActive(event.data.progress.jobId)) {
            setMoshProgress(event.data.progress);
          }
          return;
        }
        if (event.data.type === 'error') {
          if (!event.data.jobId || !moshJobGateRef.current.isActive(event.data.jobId)) return;
          moshJobGateRef.current.cancel(event.data.jobId);
          worker.terminate();
          if (moshWorkerRef.current === worker) moshWorkerRef.current = null;
          setMoshProcessing(false);
          setMoshProgress(null);
          setNotice(`MOSH LAB failed safely: ${event.data.message ?? 'Worker error'}`);
          updateWorkingCanvas();
          return;
        }
        const result = event.data.result;
        if (!result || !moshJobGateRef.current.isActive(result.jobId)) return;
        moshJobGateRef.current.cancel(result.jobId);
        worker.terminate();
        if (moshWorkerRef.current === worker) moshWorkerRef.current = null;
        setMoshProcessing(false);
        setMoshProgress(null);
        const output = new Uint8ClampedArray(result.pixels);
        if (mode === 'preview') {
          moshPreviewBufferRef.current = output;
          moshPreviewSignatureRef.current = moshSignature;
          setMoshPreviewStale(false);
          setMoshPreviewVersion((version) => version + 1);
          displayWorkingBuffer(output);
          setNotice(
            `MOSH LAB preview ready: ${result.affectedPixels.toLocaleString()} changed pixel(s). Apply or Cancel.`,
          );
        } else {
          commitMoshBuffer(output, result.affectedPixels, result.completedEffects);
        }
      };

      const pixelBuffer = source.buffer;
      const selectionBuffer = selectionMask.buffer;
      const brushMaskBuffer = brushMask.buffer;
      worker.postMessage(
        {
          type: 'process',
          request: {
            jobId,
            width: current.width,
            height: current.height,
            pixels: pixelBuffer,
            rack: moshRack,
            seed: moshSeed,
            selectionMask: selectionBuffer,
            brushMask: brushMaskBuffer,
            brushMaskBounds,
            brushDirection: { ...lastBrushDirectionRef.current },
          },
        },
        [pixelBuffer, selectionBuffer, brushMaskBuffer],
      );
    },
    [
      commitMoshBuffer,
      displayWorkingBuffer,
      moshRack,
      moshSeed,
      moshSignature,
      selectedPixels,
      updateWorkingCanvas,
    ],
  );

  const applyMosh = useCallback(() => {
    const preview = moshPreviewBufferRef.current;
    if (preview && (moshPreviewStale || moshPreviewSignatureRef.current === moshSignature)) {
      commitMoshBuffer(
        preview,
        countChangedPixels(docRef.current.pixels, preview),
        moshRack.filter((card) => card.enabled).length,
      );
      return;
    }
    startMoshJob('apply');
  }, [commitMoshBuffer, moshPreviewStale, moshRack, moshSignature, startMoshJob]);

  useEffect(() => {
    if (!moshPreviewEnabled || !isMoshRackReady(moshRack)) return;
    const activeJob = moshJobGateRef.current.currentJobId;
    if (activeJob) moshJobGateRef.current.cancel(activeJob);
    moshWorkerRef.current?.terminate();
    moshWorkerRef.current = null;
    moshPreviewBufferRef.current = null;
    moshPreviewSignatureRef.current = '';
    setMoshPreviewStale(false);
    setMoshProcessing(false);
    setMoshProgress(null);
    updateWorkingCanvas();
    const timer = window.setTimeout(() => startMoshJob('preview'), 320);
    return () => window.clearTimeout(timer);
  }, [moshPreviewEnabled, moshSignature, moshRack, startMoshJob, updateWorkingCanvas]);

  useEffect(
    () => () => {
      moshWorkerRef.current?.terminate();
      moshWorkerRef.current = null;
      brushWorkerRef.current?.terminate();
      brushWorkerRef.current = null;
      retouchWorkerRef.current?.terminate();
      retouchWorkerRef.current = null;
      imageBrushWorkerRef.current?.terminate();
      imageBrushWorkerRef.current = null;
      imageBrushPreviewWorkerRef.current?.terminate();
      imageBrushPreviewWorkerRef.current = null;
    },
    [],
  );

  const updateOriginalCanvas = useCallback(() => {
    const current = docRef.current;
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    context?.putImageData(imageDataFrom(current.original, current.width, current.height), 0, 0);
  }, []);

  useLayoutEffect(() => {
    const current = docRef.current;
    for (const canvas of [
      baseCanvasRef.current,
      workCanvasRef.current,
      overlayCanvasRef.current,
      imageBrushOverlayCanvasRef.current,
      selectionCanvasRef.current,
    ]) {
      if (!canvas) continue;
      if (canvas.width !== current.width) canvas.width = current.width;
      if (canvas.height !== current.height) canvas.height = current.height;
    }
    updateOriginalCanvas();
    updateWorkingCanvas();
  }, [documentVersion, updateOriginalCanvas, updateWorkingCanvas]);

  useLayoutEffect(() => {
    const canvas = selectionCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(242, 190, 82, .82)';
    for (const pixel of selectedPixels) {
      if (pixel < 0 || pixel >= docRef.current.width * docRef.current.height) continue;
      context.fillRect(
        pixel % docRef.current.width,
        Math.floor(pixel / docRef.current.width),
        1,
        1,
      );
    }
  }, [documentVersion, selectedPixels]);

  useEffect(() => {
    if (compareMode !== 'blink') {
      setBlinkPhase(false);
      return;
    }
    const timer = window.setInterval(() => setBlinkPhase((value) => !value), 520);
    return () => window.clearInterval(timer);
  }, [compareMode]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitToScreen);
    return () => cancelAnimationFrame(frame);
  }, [documentVersion, fitToScreen]);

  const clearOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const clearImageBrushOverlay = useCallback(() => {
    const canvas = imageBrushOverlayCanvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawImageBrushGhost = useCallback(
    (point: Point, direction: Point) => {
      const canvas = imageBrushOverlayCanvasRef.current;
      const source = imageBrushGhostSourceRef.current;
      const active = imageBrushLibraryRef.current.find(
        (asset) => asset.id === activeImageBrushIdRef.current,
      );
      if (!canvas || !source || !active || activePanel !== 'image-brush' || tool !== 'brush') {
        clearImageBrushOverlay();
        return;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const current = imageBrushSettingsRef.current;
      const random = createSeededRandom(`${imageBrushSeed}:ghost`);
      const rotation = rotationForStamp(
        current.rotationMode,
        current.angle,
        direction,
        0,
        random.next(),
        current.randomRotation,
        0,
      );
      const scale = current.size / Math.max(1, active.width);
      const drawWidth = source.width * scale;
      const drawHeight = source.height * scale;
      const baseAnchor = anchorPoint(current.anchor, current.customAnchor);
      const paddingX = Math.max(0, (source.width - active.width) / 2);
      const paddingY = Math.max(0, (source.height - active.height) / 2);
      const anchorX = (paddingX + baseAnchor.x * active.width) * scale;
      const anchorY = (paddingY + baseAnchor.y * active.height) * scale;
      context.save();
      context.translate(point.x, point.y);
      context.rotate((rotation * Math.PI) / 180);
      context.globalAlpha = clamp(current.opacity * current.flow * 0.62, 0.12, 0.75);
      context.drawImage(source, -anchorX, -anchorY, drawWidth, drawHeight);
      if (current.showOutline) {
        context.globalAlpha = 0.95;
        context.strokeStyle = '#f1d08a';
        context.lineWidth = Math.max(1 / zoomRef.current, 0.7);
        context.setLineDash([4 / zoomRef.current, 3 / zoomRef.current]);
        context.strokeRect(-anchorX, -anchorY, drawWidth, drawHeight);
        context.beginPath();
        context.moveTo(-4 / zoomRef.current, 0);
        context.lineTo(4 / zoomRef.current, 0);
        context.moveTo(0, -4 / zoomRef.current);
        context.lineTo(0, 4 / zoomRef.current);
        context.stroke();
      }
      context.restore();
    },
    [activePanel, clearImageBrushOverlay, imageBrushSeed, tool],
  );

  const drawLiveImageBrushStamps = useCallback(
    (strokeId: string, stamps: StampPoint[]) => {
      const canvas = imageBrushOverlayCanvasRef.current;
      const source = imageBrushGhostSourceRef.current;
      const active = imageBrushLibraryRef.current.find(
        (asset) => asset.id === activeImageBrushIdRef.current,
      );
      if (!canvas || !source || !active || !stamps.length) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const current = imageBrushSettingsRef.current;
      const sources = imageBrushGhostVariantsRef.current.length
        ? imageBrushGhostVariantsRef.current
        : [source];
      const copies = Math.max(1, Math.round(current.stampsPerStep));
      const baseAnchor = anchorPoint(current.anchor, current.customAnchor);
      const paddingX = Math.max(0, (source.width - active.width) / 2);
      const paddingY = Math.max(0, (source.height - active.height) / 2);
      const anchorX = paddingX + baseAnchor.x * active.width;
      const anchorY = paddingY + baseAnchor.y * active.height;
      const quality = resolveImageBrushQuality(
        current.renderingQuality,
        docRef.current.width * docRef.current.height,
        active.width * active.height,
        stamps.length,
        imageBrushRackRef.current,
      );
      const liveSources = quality === 'realtime' ? [sources[0] ?? source] : sources;
      context.imageSmoothingEnabled = quality !== 'realtime';
      for (const stamp of stamps) {
        for (let copy = 0; copy < copies; copy += 1) {
          const flatIndex = stamp.index * copies + copy;
          if (flatIndex >= current.maxGeneratedStamps) return;
          const random = createSeededRandom(`${imageBrushSeed}:${strokeId}:layout:${flatIndex}`);
          const scatterMultiplier =
            current.mode === 'scatter' || current.mode === 'random-hose' ? 1 : 0;
          const position = {
            x:
              stamp.position.x +
              (random.next() * 2 - 1) * current.scatterX * current.size * scatterMultiplier,
            y:
              stamp.position.y +
              (random.next() * 2 - 1) * current.scatterY * current.size * scatterMultiplier,
          };
          const pressureSize = current.pressureSize
            ? current.minPressureSize + (1 - current.minPressureSize) * stamp.pressure
            : 1;
          const jitterScale = Math.max(0.08, 1 + (random.next() * 2 - 1) * current.scaleJitter);
          const scale = (current.size / Math.max(1, active.width)) * pressureSize * jitterScale;
          const pressureOpacity = current.pressureOpacity
            ? current.minPressureOpacity + (1 - current.minPressureOpacity) * stamp.pressure
            : 1;
          const opacity = clamp(
            current.opacity *
              current.flow *
              pressureOpacity *
              (1 - random.next() * current.opacityJitter),
            0.01,
            1,
          );
          const direction = current.followDirection
            ? stamp.direction
            : {
                x: Math.cos((current.fallbackAngle * Math.PI) / 180),
                y: Math.sin((current.fallbackAngle * Math.PI) / 180),
              };
          const rotation = rotationForStamp(
            current.rotationMode,
            current.angle,
            direction,
            flatIndex,
            random.next(),
            current.randomRotation,
            current.rotationJitter,
          );
          const flipX = random.next() < current.flipXChance ? -1 : 1;
          const flipY = random.next() < current.flipYChance ? -1 : 1;
          context.save();
          context.translate(position.x, position.y);
          context.rotate((rotation * Math.PI) / 180);
          context.scale(scale * flipX, scale * flipY);
          context.globalAlpha = opacity;
          context.globalCompositeOperation = current.blendMode as GlobalCompositeOperation;
          context.drawImage(
            liveSources[flatIndex % liveSources.length] ?? source,
            -anchorX,
            -anchorY,
          );
          context.restore();
        }
      }
    },
    [imageBrushSeed],
  );

  useEffect(() => {
    if (activePanel !== 'image-brush' || tool !== 'brush') clearImageBrushOverlay();
  }, [activePanel, clearImageBrushOverlay, tool]);

  const cancelImageBrushJob = useCallback((quiet = false) => {
    const jobId = imageBrushJobGateRef.current.currentJobId;
    if (jobId) {
      imageBrushJobGateRef.current.cancel(jobId);
      imageBrushWorkerCountersRef.current.cancelled += 1;
    }
    imageBrushWorkerRef.current?.terminate();
    imageBrushWorkerRef.current = null;
    setImageBrushProcessing(false);
    setImageBrushProgress(null);
    if (!quiet && jobId) {
      setNotice('Image Brush Worker cancelled. Committed pixels and History were not changed.');
    }
  }, []);

  const clearImageBrushAssetCaches = useCallback(() => {
    imageBrushPreviewGenerationRef.current += 1;
    imageBrushPreviewWorkerRef.current?.terminate();
    imageBrushPreviewWorkerRef.current = null;
    imageBrushGhostSourceRef.current = null;
    imageBrushGhostVariantsRef.current = [];
    setProcessedBrushPreview(null);
    clearImageBrushOverlay();
  }, [clearImageBrushOverlay]);

  const addImageBrushAssets = useCallback(
    (assets: ImageBrushAsset[]) => {
      if (!assets.length) return;
      const current = imageBrushLibraryRef.current;
      const existing = new Set(current.map((asset) => asset.id));
      const additions = assets.filter((asset) => !existing.has(asset.id));
      if (!additions.length) return;
      const next = [...current, ...additions];
      const nextActive = additions.at(-1)?.id ?? activeImageBrushIdRef.current;
      imageBrushLibraryRef.current = next;
      activeImageBrushIdRef.current = nextActive;
      setImageBrushLibrary(next);
      setActiveImageBrushId(nextActive);
      clearImageBrushAssetCaches();
    },
    [clearImageBrushAssetCaches],
  );

  const removeImageBrushAsset = useCallback(
    (id: string) => {
      const current = imageBrushLibraryRef.current;
      const removal = removeImageBrushAssetFromLibrary(current, activeImageBrushIdRef.current, id);
      if (!removal.removed.length) return;
      if (activeImageBrushIdRef.current === id) {
        cancelImageBrushJob(true);
        clearImageBrushAssetCaches();
      }
      imageBrushLibraryRef.current = removal.library;
      activeImageBrushIdRef.current = removal.activeAssetId;
      setImageBrushLibrary(removal.library);
      setActiveImageBrushId(removal.activeAssetId);
      setNotice(
        `Brush image removed. ${removal.library.length ? `${removal.library.length} remain.` : 'The library is empty.'}`,
      );
    },
    [cancelImageBrushJob, clearImageBrushAssetCaches],
  );

  const clearImageBrushLibrary = useCallback(() => {
    if (!imageBrushLibraryRef.current.length) return;
    cancelImageBrushJob(true);
    imageBrushLibraryRef.current = [];
    activeImageBrushIdRef.current = null;
    setImageBrushLibrary([]);
    setActiveImageBrushId(null);
    clearImageBrushAssetCaches();
    setNotice('Image Brush library cleared. Committed document pixels were preserved.');
  }, [cancelImageBrushJob, clearImageBrushAssetCaches]);

  const removeImageBrushDemoAssets = useCallback(() => {
    const current = imageBrushLibraryRef.current;
    const removal = removeImageBrushAssets(current, activeImageBrushIdRef.current, (asset) =>
      Boolean(asset.demo),
    );
    if (!removal.removed.length) return;
    if (removal.activeAssetId !== activeImageBrushIdRef.current) {
      cancelImageBrushJob(true);
      clearImageBrushAssetCaches();
    }
    imageBrushLibraryRef.current = removal.library;
    activeImageBrushIdRef.current = removal.activeAssetId;
    setImageBrushLibrary(removal.library);
    setActiveImageBrushId(removal.activeAssetId);
    setNotice(`${removal.removed.length} demo brush image(s) removed.`);
  }, [cancelImageBrushJob, clearImageBrushAssetCaches]);

  const startImageBrushJob = useCallback(
    (stroke: ImageBrushStrokeState) => {
      const activeId = activeImageBrushIdRef.current;
      const assets = imageBrushLibraryRef.current;
      const active = assets.find((asset) => asset.id === activeId);
      if (!active || !activeId || !stroke.stamps.length) return;
      cancelImageBrushJob(true);
      const sourceDocument = docRef.current;
      const current = sourceDocument;
      const capturedSettings = {
        ...imageBrushSettingsRef.current,
        customAnchor: { ...imageBrushSettingsRef.current.customAnchor },
      };
      const capturedRack = imageBrushRack.map((item) => ({ ...item }));
      const capturedPresetName =
        builtInImageBrushPresets.find((preset) => preset.id === imageBrushPresetId)?.name ??
        (imageBrushPresetId === 'custom' ? 'Custom' : 'User Preset');
      const preview = capturedSettings.previewStroke || applyModeRef.current === 'preview';
      const jobId = `image-brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const worker = new Worker(new URL('./workers/imageBrush.worker.ts', import.meta.url), {
        type: 'module',
      });
      imageBrushWorkerCountersRef.current.started += 1;
      let workerPostMs = 0;
      let workerTransferOutBytes = 0;
      imageBrushWorkerRef.current = worker;
      imageBrushJobGateRef.current.begin(jobId);
      setImageBrushProcessing(true);
      setImageBrushProgress({ jobId, phase: 'variants', percent: 0 });
      setNotice(`Image Brush Worker started with ${stroke.stamps.length} path stamp(s).`);

      const failSafely = (message: string) => {
        if (!imageBrushJobGateRef.current.isActive(jobId)) return;
        imageBrushJobGateRef.current.cancel(jobId);
        worker.terminate();
        if (imageBrushWorkerRef.current === worker) imageBrushWorkerRef.current = null;
        setImageBrushProcessing(false);
        setImageBrushProgress(null);
        updateWorkingCanvas();
        clearImageBrushOverlay();
        setNotice(`Image Brush Worker failed safely: ${message}`);
      };

      worker.onerror = () => failSafely('Worker runtime error.');
      worker.onmessage = (
        event: MessageEvent<{
          type: 'progress' | 'result' | 'error';
          progress?: ImageBrushProgress;
          result?: Omit<ImageBrushProcessResult, 'pixels'> & { pixels: ArrayBuffer };
          message?: string;
        }>,
      ) => {
        if (event.data.type === 'progress' && event.data.progress) {
          if (imageBrushJobGateRef.current.isActive(event.data.progress.jobId)) {
            setImageBrushProgress(event.data.progress);
          }
          return;
        }
        if (event.data.type === 'error') {
          failSafely(event.data.message ?? 'Unknown Worker error.');
          return;
        }
        const result = event.data.result;
        if (
          !result ||
          !imageBrushJobGateRef.current.isActive(result.jobId) ||
          docRef.current !== sourceDocument
        ) {
          imageBrushWorkerCountersRef.current.obsolete += 1;
          return;
        }
        imageBrushJobGateRef.current.cancel(result.jobId);
        worker.terminate();
        if (imageBrushWorkerRef.current === worker) imageBrushWorkerRef.current = null;
        setImageBrushProcessing(false);
        setImageBrushProgress(null);
        const output = new Uint8ClampedArray(result.pixels);
        const elapsedSeconds = Math.max(0.001, (performance.now() - stroke.startedAt) / 1000);
        setImageBrushPerformance({
          ...result.metrics,
          pathInterpolationMs: stroke.pathInterpolationMs,
          fullDocumentCopies: result.metrics.fullDocumentCopies,
          pointerEvents: stroke.pointerEvents,
          pointerEventsPerSecond: stroke.pointerEvents / elapsedSeconds,
          stampsGenerated: stroke.stamps.length,
          stampsPerSecond: result.stampCount / elapsedSeconds,
          firstFeedbackMs: Math.max(0, stroke.firstFeedbackAt - stroke.startedAt),
          pointerUpCommitMs: Math.max(0, performance.now() - stroke.pointerUpAt),
          workerPostMs,
          workerTransferOutBytes,
          workerTransferInBytes: output.byteLength,
          workerJobsStarted: imageBrushWorkerCountersRef.current.started,
          workerJobsCancelled: imageBrushWorkerCountersRef.current.cancelled,
          obsoleteJobsIgnored: imageBrushWorkerCountersRef.current.obsolete,
          reactRenders: Math.max(0, imageBrushRenderCountRef.current - stroke.reactRenderStart),
          liveFrames: stroke.liveFrames,
          delayedFrames: stroke.delayedFrames,
          maxLiveFrameMs: stroke.maxLiveFrameMs,
          quality: capturedSettings.renderingQuality,
        });
        if (output.length !== result.bounds.width * result.bounds.height * 4) {
          updateWorkingCanvas();
          clearImageBrushOverlay();
          setNotice('Image Brush local result size did not match its affected bounds.');
          return;
        }
        for (let row = 0; row < result.bounds.height; row += 1) {
          const source = row * result.bounds.width * 4;
          const destination = ((result.bounds.y + row) * current.width + result.bounds.x) * 4;
          current.pixels.set(
            output.subarray(source, source + result.bounds.width * 4),
            destination,
          );
        }
        const committed = commitCurrentBufferToActiveLayer(stroke.layerBefore, result.bounds);
        const patches = committed.patches;
        updateWorkingCanvas(result.bounds);
        clearImageBrushOverlay();
        if (!patches.length) {
          setNotice('Image Brush stroke completed without changing visible pixels.');
          return;
        }
        const action: HistoryAction = {
          id: result.jobId,
          label: `Image Brush · ${capturedPresetName} · ${result.stampCount} stamps`,
          patches,
          bounds: result.bounds,
          timestamp: Date.now(),
          icon: 'image-brush',
          affectedPixels: result.affectedPixels,
          affectedBytes: patches.reduce((total, patch) => total + patch.after.byteLength, 0),
          detail: `${active.name} · ${capturedSettings.mutationMode} · Worker atomic`,
          imageBrush: {
            assetName: active.name,
            stampCount: result.stampCount,
            mutationMode: capturedSettings.mutationMode,
            presetName: capturedPresetName,
            changedPixels: result.affectedPixels,
          },
          layerBefore: committed.layerBefore,
          layerAfter: committed.layerAfter,
        };
        current.dirty = true;
        if (preview) {
          pendingImageBrushEvolutionRef.current = result.nextEvolutionOffset;
          setPendingPreview(action);
          setNotice('Image Brush preview is active. Apply with Enter or cancel with Escape.');
        } else {
          imageBrushEvolutionOffsetRef.current = result.nextEvolutionOffset;
          commitHistory(action);
          setNotice(`${action.label} committed as one exact history action.`);
        }
        bumpDocument();
      };

      const requiredAssets =
        capturedSettings.mode === 'sequence' || capturedSettings.mode === 'random-hose'
          ? assets
          : [active];
      const sourceBounds = estimateImageBrushReadBounds(
        stroke.stamps,
        capturedSettings,
        requiredAssets,
        activeId,
        current.width,
        current.height,
      );
      const documentPixels = cropRgbaRegion(current.pixels, current.width, sourceBounds).buffer;
      const workerAssets = requiredAssets.map((asset) => ({
        id: asset.id,
        width: asset.width,
        height: asset.height,
        pixels: asset.pixels.slice().buffer,
      }));
      const transfers: Transferable[] = [
        documentPixels,
        ...workerAssets.map((asset) => asset.pixels),
      ];
      workerTransferOutBytes =
        documentPixels.byteLength +
        workerAssets.reduce((total, asset) => total + asset.pixels.byteLength, 0);
      const postStarted = performance.now();
      worker.postMessage(
        {
          type: 'process',
          request: {
            jobId,
            width: current.width,
            height: current.height,
            pixels: documentPixels,
            sourceBounds,
            assets: workerAssets,
            activeAssetId: activeId,
            stamps: stroke.stamps,
            settings: capturedSettings,
            rack: capturedRack,
            seed: imageBrushSeed,
            strokeId: stroke.strokeId,
            presetName: capturedPresetName,
            evolutionOffset:
              capturedSettings.resetEachStroke && !capturedSettings.continueBetweenStrokes
                ? 0
                : imageBrushEvolutionOffsetRef.current,
          },
        },
        transfers,
      );
      workerPostMs = performance.now() - postStarted;
    },
    [
      cancelImageBrushJob,
      clearImageBrushOverlay,
      commitCurrentBufferToActiveLayer,
      imageBrushPresetId,
      imageBrushRack,
      imageBrushSeed,
      updateWorkingCanvas,
    ],
  );

  const drawMaskStamp = useCallback(
    (point: Point, radius: number) => {
      if (maskView === 'hidden') return;
      const context = overlayCanvasRef.current?.getContext('2d');
      if (!context) return;
      const gradient = context.createRadialGradient(
        point.x,
        point.y,
        radius * brushRef.current.hardness,
        point.x,
        point.y,
        radius,
      );
      const center = maskView === 'red' ? 'rgba(199,55,48,.48)' : 'rgba(235,235,235,.58)';
      const edge = maskView === 'red' ? 'rgba(199,55,48,0)' : 'rgba(235,235,235,0)';
      gradient.addColorStop(0, center);
      gradient.addColorStop(1, edge);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    },
    [maskView],
  );

  const pressureFor = (event: PointerEvent | ReactPointerEvent): number => {
    if (!brushRef.current.pressure || event.pointerType === 'mouse') return 1;
    return event.pressure > 0 ? event.pressure : 1;
  };

  const imageBrushPressureFor = (event: PointerEvent | ReactPointerEvent): number => {
    const current = imageBrushSettingsRef.current;
    if (
      event.pointerType === 'mouse' ||
      (!current.pressureSize && !current.pressureOpacity && !current.pressureSpacing)
    ) {
      return 1;
    }
    return event.pressure > 0 ? event.pressure : 1;
  };

  const applyEffect = useCallback(
    (bounds: Rectangle, pressure: number, effectSeed: string, movement: Point): BytePatch[] => {
      const current = docRef.current;
      const activeAlgorithm = algorithms[algorithm];
      const writeBounds =
        tool === 'restore' || activeAlgorithm.family === 'pixel'
          ? bounds
          : structuralWriteBounds(
              bounds,
              current.width,
              current.height,
              algorithm,
              settingsRef.current,
            );
      const before = rowPatchesBefore(current.pixels, current.width, writeBounds);
      if (tool === 'restore') {
        const random = createSeededRandom(`${effectSeed}:restore`);
        for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
          for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
            const maskValue = maskRef.current[y * current.width + x]!;
            if (random.next() > maskValue * brushRef.current.strength * pressure) continue;
            const offset = pixelToByteOffset(x, y, current.width);
            current.pixels.set(current.original.subarray(offset, offset + 4), offset);
          }
        }
      } else {
        algorithms[algorithm].apply({
          pixels: current.pixels,
          originalPixels: current.original,
          width: current.width,
          height: current.height,
          mask: maskRef.current,
          bounds,
          writeBounds,
          strength: brushRef.current.strength,
          pressure,
          seed: effectSeed,
          settings: settingsRef.current,
          movement,
        });
      }
      current.dirty = true;
      const patches = finalizePatches(before, current.pixels);
      updateWorkingCanvas(writeBounds);
      return patches;
    },
    [algorithm, tool, updateWorkingCanvas],
  );

  const captureBrushContext = useCallback(
    (stroke: StrokeState) => {
      if (tool !== 'brush' || !stroke.bounds) return;
      const current = docRef.current;
      const bounds = { ...stroke.bounds };
      const persistentMask = new Uint8Array(bounds.width * bounds.height);
      let affectedPixels = 0;
      for (const index of stroke.touched) {
        const value = Math.round(clamp(maskRef.current[index]!, 0, 1) * 255);
        if (value <= 0) continue;
        const x = index % current.width;
        const y = Math.floor(index / current.width);
        if (
          x < bounds.x ||
          x >= bounds.x + bounds.width ||
          y < bounds.y ||
          y >= bounds.y + bounds.height
        ) {
          continue;
        }
        persistentMask[(y - bounds.y) * bounds.width + (x - bounds.x)] = value;
        affectedPixels += 1;
      }
      const magnitude = Math.hypot(stroke.movement.x, stroke.movement.y);
      const direction =
        magnitude > 0.0001
          ? { x: stroke.movement.x / magnitude, y: stroke.movement.y / magnitude }
          : lastBrushDirectionRef.current;
      lastBrushMaskRef.current = { data: persistentMask, bounds };
      lastBrushDirectionRef.current = { ...direction };
      setBrushContext((currentContext) => ({
        version: currentContext.version + 1,
        affectedPixels,
        direction: { ...direction },
      }));
    },
    [tool],
  );

  const cancelBrushJob = useCallback((quiet = false) => {
    const jobId = brushJobGateRef.current.currentJobId;
    if (jobId) brushJobGateRef.current.cancel(jobId);
    brushWorkerRef.current?.terminate();
    brushWorkerRef.current = null;
    retouchWorkerRef.current?.terminate();
    retouchWorkerRef.current = null;
    setBrushProcessing(false);
    setBrushProgress(null);
    if (!quiet && jobId) {
      setNotice('Brush Worker cancelled. Committed pixels and history were not changed.');
    }
  }, []);

  const startBrushJob = useCallback(
    (stroke: StrokeState, mask: Uint8Array, mode: ApplyMode) => {
      if (!stroke.bounds) return;
      cancelBrushJob(true);
      const current = docRef.current;
      const sourceDocument = current;
      const capturedAlgorithm = algorithm;
      const capturedTool = tool === 'restore' ? 'restore' : 'brush';
      const capturedSettings = { ...settingsRef.current };
      const capturedBrush = { ...brushRef.current };
      const capturedBounds = { ...stroke.bounds };
      const capturedMovement = { ...stroke.movement };
      const capturedCloneSource = cloneSource ? { ...cloneSource } : undefined;
      const capturedFeedbackMemory =
        capturedAlgorithm === 'feedback-brush' && feedbackMemoryRef.current
          ? feedbackMemoryRef.current.slice().buffer
          : undefined;
      if (mode === 'preview') pendingFeedbackMemoryRef.current = null;
      const jobId = `brush-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const worker = new Worker(new URL('./workers/brush.worker.ts', import.meta.url), {
        type: 'module',
      });
      const effectName =
        capturedTool === 'restore' ? 'Restore Original' : algorithms[capturedAlgorithm].name;
      brushWorkerRef.current = worker;
      brushJobGateRef.current.begin(jobId);
      setBrushProcessing(true);
      setBrushProgress({ jobId, effectName, percent: 0 });
      setNotice(`Brush Worker started: ${effectName}.`);

      const failSafely = (message: string) => {
        if (!brushJobGateRef.current.isActive(jobId)) return;
        brushJobGateRef.current.cancel(jobId);
        worker.terminate();
        if (brushWorkerRef.current === worker) brushWorkerRef.current = null;
        setBrushProcessing(false);
        setBrushProgress(null);
        updateWorkingCanvas();
        setNotice(`Brush Worker failed safely: ${message}`);
      };

      worker.onerror = () => failSafely('Worker runtime error.');
      worker.onmessage = (
        event: MessageEvent<{
          type: 'progress' | 'result' | 'error';
          progress?: BrushProgress;
          result?: {
            jobId: string;
            pixels: ArrayBuffer;
            writeBounds: Rectangle;
            affectedPixels: number;
          };
          jobId?: string;
          message?: string;
        }>,
      ) => {
        if (event.data.type === 'progress' && event.data.progress) {
          if (brushJobGateRef.current.isActive(event.data.progress.jobId)) {
            setBrushProgress(event.data.progress);
          }
          return;
        }
        if (event.data.type === 'error') {
          failSafely(event.data.message ?? 'Unknown Worker error.');
          return;
        }
        const result = event.data.result;
        if (
          !result ||
          !brushJobGateRef.current.isActive(result.jobId) ||
          docRef.current !== sourceDocument
        ) {
          return;
        }
        brushJobGateRef.current.cancel(result.jobId);
        worker.terminate();
        if (brushWorkerRef.current === worker) brushWorkerRef.current = null;
        setBrushProcessing(false);
        setBrushProgress(null);
        const output = new Uint8ClampedArray(result.pixels);
        if (output.length !== current.pixels.length) {
          updateWorkingCanvas();
          setNotice('Brush Worker result size did not match the current document.');
          return;
        }
        current.pixels.set(output);
        const committed = commitCurrentBufferToActiveLayer(stroke.layerBefore, result.writeBounds);
        const patches = committed.patches;
        updateWorkingCanvas(result.writeBounds);
        if (!patches.length) {
          if (capturedAlgorithm === 'feedback-brush') {
            pendingFeedbackMemoryRef.current = null;
          }
          setNotice(`${effectName} completed without changing pixels.`);
          return;
        }
        const action: HistoryAction = {
          id: result.jobId,
          label: capturedTool === 'restore' ? 'Restore stroke' : `${effectName} stroke`,
          patches,
          bounds: result.writeBounds,
          timestamp: Date.now(),
          icon: capturedTool === 'restore' ? 'restore' : algorithmIconIds[capturedAlgorithm],
          affectedPixels: result.affectedPixels,
          affectedBytes: patches.reduce((total, patch) => total + patch.after.byteLength, 0),
          detail: 'Worker · atomic commit',
          layerBefore: committed.layerBefore,
          layerAfter: committed.layerAfter,
        };
        current.dirty = true;
        if (mode === 'preview') {
          if (capturedAlgorithm === 'feedback-brush') {
            pendingFeedbackMemoryRef.current = output.slice();
          }
          setPendingPreview(action);
          setNotice('Worker preview is active. Apply with Enter or cancel with Escape.');
        } else {
          if (capturedAlgorithm === 'feedback-brush') {
            feedbackMemoryRef.current = output.slice();
            pendingFeedbackMemoryRef.current = null;
            setFeedbackMemoryVersion((version) => version + 1);
          }
          commitHistory(action);
          setNotice(`${action.label} committed atomically by Worker.`);
        }
        bumpDocument();
      };

      const pixels = current.pixels.slice().buffer;
      const maskBuffer = mask.buffer;
      const transfers: Transferable[] = [pixels, maskBuffer];
      if (capturedFeedbackMemory) transfers.push(capturedFeedbackMemory);
      worker.postMessage(
        {
          type: 'process',
          request: {
            jobId,
            width: current.width,
            height: current.height,
            pixels,
            mask: maskBuffer,
            maskBounds: capturedBounds,
            bounds: capturedBounds,
            algorithm: capturedAlgorithm,
            settings: capturedSettings,
            brush: capturedBrush,
            pressure: stroke.pressure,
            seed: `${seedRef.current}:commit:${stroke.stamp}`,
            movement: capturedMovement,
            cloneSource: capturedCloneSource,
            feedbackMemory: capturedFeedbackMemory,
            tool: capturedTool,
          },
        },
        transfers,
      );
    },
    [
      algorithm,
      cancelBrushJob,
      cloneSource,
      commitCurrentBufferToActiveLayer,
      tool,
      updateWorkingCanvas,
    ],
  );

  const compactMaskForStroke = useCallback((stroke: StrokeState): Uint8Array => {
    if (!stroke.bounds) return new Uint8Array(0);
    const current = docRef.current;
    const mask = new Uint8Array(stroke.bounds.width * stroke.bounds.height);
    for (const index of stroke.touched) {
      const x = index % current.width;
      const y = Math.floor(index / current.width);
      if (
        x < stroke.bounds.x ||
        x >= stroke.bounds.x + stroke.bounds.width ||
        y < stroke.bounds.y ||
        y >= stroke.bounds.y + stroke.bounds.height
      )
        continue;
      mask[(y - stroke.bounds.y) * stroke.bounds.width + x - stroke.bounds.x] = Math.round(
        clamp(maskRef.current[index]!, 0, 1) * 255,
      );
    }
    return mask;
  }, []);

  const commitLayerErase = useCallback(
    (stroke: StrokeState, mask: Uint8Array, label: string) => {
      if (!stroke.bounds) return;
      const current = docRef.current;
      const beforePixels = current.pixels.slice();
      const changed = eraseActiveLayerWithMask(
        layerStackRef.current,
        mask,
        stroke.bounds,
        brushRef.current.strength * stroke.pressure,
      );
      current.pixels.set(composeLayerStack(layerStackRef.current, current.original));
      const beforeRows = rowPatchesBefore(beforePixels, current.width, stroke.bounds);
      const patches = finalizePatches(beforeRows, current.pixels);
      const action: HistoryAction = {
        id: `retouch-layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label,
        patches,
        bounds: stroke.bounds,
        timestamp: Date.now(),
        icon: tool === 'eraser' ? 'eraser' : 'restore',
        affectedPixels: changed,
        affectedBytes: patches.reduce((total, patch) => total + patch.after.byteLength, 0),
        detail: 'Sparse active layer · atomic stroke',
        layerBefore: stroke.layerBefore,
        layerAfter: snapshotLayerStack(layerStackRef.current),
      };
      updateWorkingCanvas(stroke.bounds);
      if (!changed) {
        setNotice(`${label} found no active-layer pixels to remove.`);
        return;
      }
      current.dirty = true;
      if (applyModeRef.current === 'preview') {
        setPendingPreview(action);
        setNotice(`${label} preview is active. Apply or Cancel.`);
      } else {
        commitHistory(action);
        setNotice(`${label} committed as one sparse-layer History action.`);
      }
      bumpLayers();
      bumpDocument();
    },
    [tool, updateWorkingCanvas],
  );

  const startRetouchJob = useCallback(
    (stroke: StrokeState, mask: Uint8Array, mode: ApplyMode) => {
      if (!stroke.bounds || !isRetouchTool(tool) || tool === 'eraser') return;
      cancelBrushJob(true);
      const current = docRef.current;
      const sourceDocument = current;
      const capturedTool = tool;
      const capturedBounds = { ...stroke.bounds };
      const capturedSettings = { ...retouchSettingsRef.current };
      const capturedBrush = { ...brushRef.current };
      let sourcePixels: Uint8ClampedArray | undefined;
      const samplePixels =
        !capturedSettings.sampleMergedLayers && capturedTool !== 'restore'
          ? composeActiveLayerPixels(layerStackRef.current)
          : undefined;
      if (capturedTool === 'restore') {
        if (capturedSettings.restoreSource === 'original') sourcePixels = current.original.slice();
        else if (capturedSettings.restoreSource === 'lower-layer') {
          sourcePixels = composeLayerStackBelowActive(layerStackRef.current, current.original);
        } else {
          const latest = historyRef.current.undoEntries.at(-1);
          if (latest?.layerBefore) {
            sourcePixels = composeLayerStack(
              restoreLayerStack(latest.layerBefore),
              current.original,
            );
          } else {
            sourcePixels = current.pixels.slice();
            if (latest) {
              for (let index = latest.patches.length - 1; index >= 0; index -= 1) {
                const patch = latest.patches[index]!;
                sourcePixels.set(patch.before, patch.start);
              }
            }
          }
        }
      }
      const jobId = `retouch-${capturedTool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const worker = new Worker(new URL('./workers/retouch.worker.ts', import.meta.url), {
        type: 'module',
      });
      retouchWorkerRef.current = worker;
      brushJobGateRef.current.begin(jobId);
      setBrushProcessing(true);
      setBrushProgress({
        jobId,
        effectName: capturedTool[0]!.toUpperCase() + capturedTool.slice(1),
        percent: 0,
      });
      setNotice(
        `${capturedTool} Worker started on a ${capturedBounds.width}×${capturedBounds.height} dirty rectangle.`,
      );

      const fail = (message: string) => {
        if (!brushJobGateRef.current.isActive(jobId)) return;
        brushJobGateRef.current.cancel(jobId);
        worker.terminate();
        if (retouchWorkerRef.current === worker) retouchWorkerRef.current = null;
        setBrushProcessing(false);
        setBrushProgress(null);
        updateWorkingCanvas();
        setNotice(`${capturedTool} failed safely: ${message}`);
      };
      worker.onerror = () => fail('Worker runtime error.');
      worker.onmessage = (
        event: MessageEvent<{
          type: 'progress' | 'result' | 'error';
          progress?: RetouchProgress;
          result?: {
            jobId: string;
            pixels: ArrayBuffer;
            writeBounds: Rectangle;
            affectedPixels: number;
          };
          jobId?: string;
          message?: string;
        }>,
      ) => {
        if (event.data.type === 'progress' && event.data.progress) {
          if (brushJobGateRef.current.isActive(event.data.progress.jobId))
            setBrushProgress(event.data.progress);
          return;
        }
        if (event.data.type === 'error') {
          fail(event.data.message ?? 'Unknown Worker error.');
          return;
        }
        const result = event.data.result;
        if (
          !result ||
          !brushJobGateRef.current.isActive(result.jobId) ||
          docRef.current !== sourceDocument
        )
          return;
        brushJobGateRef.current.cancel(result.jobId);
        worker.terminate();
        if (retouchWorkerRef.current === worker) retouchWorkerRef.current = null;
        setBrushProcessing(false);
        setBrushProgress(null);
        current.pixels.set(new Uint8ClampedArray(result.pixels));
        const committed = commitCurrentBufferToActiveLayer(stroke.layerBefore, result.writeBounds);
        updateWorkingCanvas(result.writeBounds);
        if (!committed.patches.length) {
          setNotice(`${capturedTool} completed without changing pixels.`);
          return;
        }
        const icon = capturedTool === 'restore' ? 'restore' : capturedTool;
        const action: HistoryAction = {
          id: result.jobId,
          label: `${capturedTool[0]!.toUpperCase() + capturedTool.slice(1)} stroke`,
          patches: committed.patches,
          bounds: result.writeBounds,
          timestamp: Date.now(),
          icon,
          affectedPixels: result.affectedPixels,
          affectedBytes: committed.patches.reduce(
            (total, patch) => total + patch.after.byteLength,
            0,
          ),
          detail: 'Retouch Worker · local dirty rectangle · atomic commit',
          layerBefore: committed.layerBefore,
          layerAfter: committed.layerAfter,
        };
        current.dirty = true;
        if (mode === 'preview') {
          setPendingPreview(action);
          setNotice(`${action.label} preview is active. Apply or Cancel.`);
        } else {
          commitHistory(action);
          setNotice(`${action.label} committed.`);
        }
        bumpDocument();
      };

      const pixels = current.pixels.slice().buffer;
      const maskBuffer = mask.buffer;
      const transfers: Transferable[] = [pixels, maskBuffer];
      const sourceBuffer = sourcePixels?.buffer;
      if (sourceBuffer) transfers.push(sourceBuffer);
      const sampleBuffer = samplePixels?.buffer;
      if (sampleBuffer) transfers.push(sampleBuffer);
      worker.postMessage(
        {
          type: 'process',
          request: {
            jobId,
            width: current.width,
            height: current.height,
            pixels,
            samplePixels: sampleBuffer,
            sourcePixels: sourceBuffer,
            mask: maskBuffer,
            maskBounds: capturedBounds,
            path: stroke.path,
            tool: capturedTool,
            brush: capturedBrush,
            settings: capturedSettings,
          },
        },
        transfers,
      );
    },
    [cancelBrushJob, commitCurrentBufferToActiveLayer, tool, updateWorkingCanvas],
  );

  const stampAt = useCallback(
    (point: Point, pressure: number, movement: Point) => {
      const stroke = strokeRef.current;
      if (!stroke) return;
      const current = docRef.current;
      const currentBrush = brushRef.current;
      const pressureSize =
        currentBrush.minPressureSize + (1 - currentBrush.minPressureSize) * pressure;
      const radius = Math.max(1, (currentBrush.size * pressureSize) / 2);
      const stampRandom = createSeededRandom(`${seedRef.current}:stroke:${stroke.stamp}`);
      const scattered = {
        x: point.x + (stampRandom.next() - 0.5) * currentBrush.scatter * radius * 2,
        y: point.y + (stampRandom.next() - 0.5) * currentBrush.scatter * radius * 2,
      };
      const stamp = stampSoftBrush(
        maskRef.current,
        current.width,
        current.height,
        scattered,
        radius,
        currentBrush.hardness,
        currentBrush.opacity,
        algorithms[algorithm].family === 'pixel' ? currentBrush.density : 1,
        stampRandom,
        currentBrush.accumulate,
      );
      stamp.touched.forEach((index) => stroke.touched.add(index));
      stroke.bounds = unionRect(stroke.bounds, stamp.bounds);
      stroke.pressure = pressure;
      drawMaskStamp(scattered, radius);
      const useWorker = tool === 'brush' && algorithms[algorithm].family !== 'pixel';
      if (applyModeRef.current === 'continuous' && !useWorker && !isRetouchTool(tool)) {
        const strengthPressure =
          currentBrush.minPressureStrength + (1 - currentBrush.minPressureStrength) * pressure;
        stroke.patches.push(
          ...applyEffect(
            stamp.bounds,
            strengthPressure,
            `${seedRef.current}:stamp:${stroke.stamp}`,
            movement,
          ),
        );
      }
      stroke.movement = {
        x: stroke.movement.x + movement.x,
        y: stroke.movement.y + movement.y,
      };
      stroke.path.push({ x: point.x, y: point.y, pressure });
      stroke.last = point;
      stroke.stamp += 1;
    },
    [algorithm, applyEffect, drawMaskStamp, tool],
  );

  const commitStroke = useCallback(() => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    if (isRetouchTool(tool) && stroke.bounds) {
      const mask = compactMaskForStroke(stroke);
      maskRef.current = new Float32Array(maskRef.current.length);
      clearOverlay();
      strokeRef.current = null;
      if (
        tool === 'eraser' ||
        (tool === 'restore' && retouchSettingsRef.current.restoreSource === 'lower-layer')
      ) {
        commitLayerErase(
          stroke,
          mask,
          tool === 'eraser' ? 'Eraser stroke' : 'Restore from Lower Layer stroke',
        );
      } else {
        startRetouchJob(stroke, mask, applyModeRef.current);
      }
      return;
    }
    captureBrushContext(stroke);
    const useWorker = tool === 'brush' && algorithms[algorithm].family !== 'pixel';
    if (useWorker && stroke.bounds) {
      const mask = lastBrushMaskRef.current.data.slice();
      maskRef.current = new Float32Array(maskRef.current.length);
      clearOverlay();
      strokeRef.current = null;
      startBrushJob(stroke, mask, applyModeRef.current);
      return;
    }
    let patches = stroke.patches;
    if (applyModeRef.current !== 'continuous' && stroke.bounds) {
      patches = applyEffect(
        stroke.bounds,
        stroke.pressure,
        `${seedRef.current}:commit:${stroke.stamp}`,
        stroke.movement,
      );
    }
    const committed =
      patches.length && stroke.bounds
        ? commitCurrentBufferToActiveLayer(stroke.layerBefore, stroke.bounds)
        : null;
    if (committed) patches = committed.patches;
    const action: HistoryAction = {
      id: `${Date.now()}-${stroke.stamp}`,
      label: tool === 'restore' ? 'Restore stroke' : `${algorithms[algorithm].name} stroke`,
      patches,
      bounds: stroke.bounds ?? undefined,
      timestamp: Date.now(),
      icon: tool === 'restore' ? 'restore' : algorithmIconIds[algorithm],
      affectedPixels: stroke.touched.size,
      affectedBytes: patches.reduce((total, patch) => total + patch.after.byteLength, 0),
      layerBefore: committed?.layerBefore,
      layerAfter: committed?.layerAfter,
    };
    if (patches.length) {
      if (applyModeRef.current === 'preview') {
        setPendingPreview(action);
        setNotice('Preview is active. Apply with Enter or cancel with Escape.');
      } else {
        commitHistory(action);
        setNotice(`${action.label} committed.`);
      }
      bumpDocument();
    }
    for (const index of stroke.touched) maskRef.current[index] = 0;
    clearOverlay();
    strokeRef.current = null;
  }, [
    algorithm,
    applyEffect,
    captureBrushContext,
    clearOverlay,
    commitLayerErase,
    compactMaskForStroke,
    commitCurrentBufferToActiveLayer,
    startBrushJob,
    startRetouchJob,
    tool,
  ]);

  const applyPreview = useCallback(() => {
    if (!pendingPreview) return;
    if (pendingFeedbackMemoryRef.current) {
      feedbackMemoryRef.current = pendingFeedbackMemoryRef.current;
      pendingFeedbackMemoryRef.current = null;
      setFeedbackMemoryVersion((version) => version + 1);
    }
    if (pendingImageBrushEvolutionRef.current !== null) {
      imageBrushEvolutionOffsetRef.current = pendingImageBrushEvolutionRef.current;
      pendingImageBrushEvolutionRef.current = null;
    }
    commitPendingPreview();
    setNotice('Preview committed to history.');
  }, [commitPendingPreview, pendingPreview]);

  const cancelPreview = useCallback(() => {
    if (!pendingPreview) return;
    pendingFeedbackMemoryRef.current = null;
    pendingImageBrushEvolutionRef.current = null;
    const current = docRef.current;
    for (let index = pendingPreview.patches.length - 1; index >= 0; index -= 1) {
      const patch = pendingPreview.patches[index]!;
      current.pixels.set(patch.before, patch.start);
    }
    if (pendingPreview.layerBefore) restoreLayerSnapshot(pendingPreview.layerBefore);
    setPendingPreview(null);
    bumpDocument();
    updateWorkingCanvas();
    setNotice('Preview cancelled.');
  }, [pendingPreview, restoreLayerSnapshot, updateWorkingCanvas]);

  const beginPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = screenToImage(event.clientX, event.clientY);
    if (
      algorithm === 'clone-corruption-brush' &&
      (cloneSourcePickMode || event.altKey) &&
      event.button === 0 &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < doc.width &&
      point.y < doc.height
    ) {
      const size = clamp(Math.round(brushRef.current.size * 0.68), 24, 260);
      const x = clamp(Math.round(point.x - size / 2), 0, Math.max(0, doc.width - 1));
      const y = clamp(Math.round(point.y - size / 2), 0, Math.max(0, doc.height - 1));
      setCloneSource({
        x,
        y,
        width: Math.min(size, doc.width - x),
        height: Math.min(size, doc.height - y),
      });
      setCloneSourcePickMode(false);
      setNotice('Clone Corruption source captured. Paint elsewhere to corrupt-clone it.');
      return;
    }
    if (event.altKey && tool !== 'hand') {
      altDragRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        brush: { ...brushRef.current },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'hand' || spaceDownRef.current || event.button === 1) {
      panDragRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: { ...panRef.current },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (
      event.button !== 0 ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= doc.width ||
      point.y >= doc.height
    ) {
      return;
    }
    if (activeLayer(layerStackRef.current).locked) {
      setNotice(
        'The active glitch layer is locked. Unlock it or select another layer before painting.',
      );
      return;
    }
    if (activePanel === 'image-brush' && tool === 'brush') {
      const active = imageBrushLibraryRef.current.find(
        (asset) => asset.id === activeImageBrushIdRef.current,
      );
      if (!active) {
        setNotice('Load or select an Image Brush asset before drawing.');
        return;
      }
      cancelImageBrushJob(true);
      if (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId) cancelMosh();
      if (pendingPreview) cancelPreview();
      const pressure = imageBrushPressureFor(event);
      const begun = beginStampPath(point, pressure, imageBrushSettingsRef.current.fallbackAngle);
      clearImageBrushOverlay();
      const imageStroke: ImageBrushStrokeState = {
        pointerId: event.pointerId,
        strokeId: `stamp-stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path: begun.state,
        stamps: [begun.stamp],
        pendingSamples: [],
        pendingLiveStamps: [],
        liveRaf: null,
        startedAt: performance.now(),
        pointerUpAt: 0,
        firstFeedbackAt: 0,
        pointerEvents: 1,
        liveFrames: 1,
        delayedFrames: 0,
        maxLiveFrameMs: 0,
        pathInterpolationMs: 0,
        limitReached: false,
        reactRenderStart: imageBrushRenderCountRef.current,
        layerBefore: snapshotLayerStack(layerStackRef.current),
      };
      imageBrushStrokeRef.current = imageStroke;
      const feedbackStarted = performance.now();
      drawLiveImageBrushStamps(imageStroke.strokeId, [begun.stamp]);
      imageStroke.firstFeedbackAt = performance.now();
      imageStroke.maxLiveFrameMs = Math.max(
        imageStroke.maxLiveFrameMs,
        imageStroke.firstFeedbackAt - feedbackStarted,
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (brushJobGateRef.current.currentJobId) cancelBrushJob();
    if (activePanel === 'mosh' && moshRegionTool) {
      const initial = {
        x: Math.floor(point.x),
        y: Math.floor(point.y),
        width: 1,
        height: 1,
      };
      regionDragRef.current = {
        pointerId: event.pointerId,
        ownerEffectInstanceId: moshRegionTool.ownerEffectInstanceId,
        mode: moshRegionTool.mode,
        start: point,
        rectangle: initial,
      };
      setMoshDraftRegion({
        ownerEffectInstanceId: moshRegionTool.ownerEffectInstanceId,
        type: moshRegionTool.mode,
        bounds: initial,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId) cancelMosh();
    if (pendingPreview) cancelPreview();
    strokeRef.current = {
      pointerId: event.pointerId,
      last: point,
      bounds: null,
      touched: new Set(),
      patches: [],
      stamp: 0,
      pressure: pressureFor(event),
      movement: { x: 0, y: 0 },
      path: [{ x: point.x, y: point.y, pressure: pressureFor(event) }],
      layerBefore: snapshotLayerStack(layerStackRef.current),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    stampAt(point, pressureFor(event), { x: 0, y: 0 });
  };

  const scheduleCursorInfo = (point: Point) => {
    const inside =
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < docRef.current.width &&
      point.y < docRef.current.height;
    cursorPendingRef.current = {
      x: clamp(Math.floor(point.x), 0, docRef.current.width - 1),
      y: clamp(Math.floor(point.y), 0, docRef.current.height - 1),
      inside,
    };
    if (imageBrushStrokeRef.current) return;
    if (pointerRafRef.current !== null) return;
    pointerRafRef.current = requestAnimationFrame(() => {
      setCursorInfo(cursorPendingRef.current);
      pointerRafRef.current = null;
    });
  };

  const flushImageBrushSamples = (stroke: ImageBrushStrokeState) => {
    if (!stroke.pendingSamples.length) return;
    const interpolationStarted = performance.now();
    const current = imageBrushSettingsRef.current;
    const samples = stroke.pendingSamples.splice(0);
    for (const sample of samples) {
      const stamps = appendStampPath(
        stroke.path,
        sample.point,
        sample.pressure,
        spacingInPixels(current, sample.pressure),
        current.smoothing,
      );
      if (!stamps.length) continue;
      const remaining = Math.max(
        0,
        Math.floor(current.maxGeneratedStamps / Math.max(1, Math.round(current.stampsPerStep))) -
          stroke.stamps.length,
      );
      const accepted = stamps.slice(0, remaining);
      stroke.stamps.push(...accepted);
      stroke.pendingLiveStamps.push(...accepted);
      if (accepted.length < stamps.length) {
        stroke.limitReached = true;
        break;
      }
    }
    stroke.pathInterpolationMs += performance.now() - interpolationStarted;
  };

  const processImageBrushLiveFrame = (stroke: ImageBrushStrokeState) => {
    if (imageBrushStrokeRef.current !== stroke) return;
    const frameStarted = performance.now();
    stroke.liveRaf = null;
    flushImageBrushSamples(stroke);
    const current = imageBrushSettingsRef.current;
    const active = imageBrushLibraryRef.current.find(
      (asset) => asset.id === activeImageBrushIdRef.current,
    );
    const quality = resolveImageBrushQuality(
      current.renderingQuality,
      docRef.current.width * docRef.current.height,
      (active?.width ?? 1) * (active?.height ?? 1),
      stroke.stamps.length,
      imageBrushRackRef.current,
    );
    const configuredLimit = Math.max(1, current.maxLiveStampsPerFrame);
    const limit = quality === 'realtime' ? Math.min(12, configuredLimit) : configuredLimit;
    const live = stroke.pendingLiveStamps.splice(0, limit);
    drawLiveImageBrushStamps(stroke.strokeId, live);
    const frameMs = performance.now() - frameStarted;
    stroke.liveFrames += 1;
    stroke.maxLiveFrameMs = Math.max(stroke.maxLiveFrameMs, frameMs);
    if (frameMs > 20) stroke.delayedFrames += 1;
    if (stroke.pendingSamples.length || stroke.pendingLiveStamps.length) {
      stroke.liveRaf = requestAnimationFrame(() => processImageBrushLiveFrame(stroke));
    }
  };

  const scheduleImageBrushLiveFrame = (stroke: ImageBrushStrokeState) => {
    if (stroke.liveRaf !== null) return;
    stroke.liveRaf = requestAnimationFrame(() => processImageBrushLiveFrame(stroke));
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = screenToImage(event.clientX, event.clientY);
    scheduleCursorInfo(point);
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    const cursor = cursorRef.current;
    if (cursor && viewportRect) {
      const diameter = brushRef.current.size * zoomRef.current;
      cursor.style.width = `${diameter}px`;
      cursor.style.height = `${diameter}px`;
      cursor.style.transform = `translate(${event.clientX - viewportRect.left - diameter / 2}px, ${
        event.clientY - viewportRect.top - diameter / 2
      }px)`;
      cursor.style.opacity =
        cursorPendingRef.current.inside &&
        tool !== 'hand' &&
        !spaceDownRef.current &&
        activePanel !== 'image-brush'
          ? '1'
          : '0';
    }
    if (activePanel === 'image-brush' && !imageBrushStrokeRef.current) {
      const direction = {
        x: Math.cos((imageBrushSettingsRef.current.fallbackAngle * Math.PI) / 180),
        y: Math.sin((imageBrushSettingsRef.current.fallbackAngle * Math.PI) / 180),
      };
      if (cursorPendingRef.current.inside && tool === 'brush' && !spaceDownRef.current) {
        drawImageBrushGhost(point, direction);
      } else {
        clearImageBrushOverlay();
      }
    }
    const regionDrag = regionDragRef.current;
    if (regionDrag?.pointerId === event.pointerId) {
      const left = clamp(
        Math.floor(Math.min(regionDrag.start.x, point.x)),
        0,
        docRef.current.width - 1,
      );
      const top = clamp(
        Math.floor(Math.min(regionDrag.start.y, point.y)),
        0,
        docRef.current.height - 1,
      );
      const right = clamp(
        Math.ceil(Math.max(regionDrag.start.x, point.x)),
        left + 1,
        docRef.current.width,
      );
      const bottom = clamp(
        Math.ceil(Math.max(regionDrag.start.y, point.y)),
        top + 1,
        docRef.current.height,
      );
      const rectangle = { x: left, y: top, width: right - left, height: bottom - top };
      regionDrag.rectangle = rectangle;
      setMoshDraftRegion({
        ownerEffectInstanceId: regionDrag.ownerEffectInstanceId,
        type: regionDrag.mode,
        bounds: rectangle,
      });
      return;
    }
    const altDrag = altDragRef.current;
    if (altDrag?.pointerId === event.pointerId) {
      const dx = event.clientX - altDrag.start.x;
      const dy = event.clientY - altDrag.start.y;
      setBrush({
        ...altDrag.brush,
        size: clamp(altDrag.brush.size + dx * 1.4, 2, 600),
        strength: clamp(altDrag.brush.strength - dy / 220, 0.01, 1),
      });
      return;
    }
    const panDrag = panDragRef.current;
    if (panDrag?.pointerId === event.pointerId) {
      setPan({
        x: panDrag.origin.x + event.clientX - panDrag.start.x,
        y: panDrag.origin.y + event.clientY - panDrag.start.y,
      });
      return;
    }
    const imageStroke = imageBrushStrokeRef.current;
    if (imageStroke?.pointerId === event.pointerId) {
      const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [];
      const samples = nativeEvents.length ? nativeEvents : [event.nativeEvent];
      imageStroke.pointerEvents += samples.length;
      for (const sample of samples) {
        imageStroke.pendingSamples.push({
          point: screenToImage(sample.clientX, sample.clientY),
          pressure: imageBrushPressureFor(sample),
        });
      }
      scheduleImageBrushLiveFrame(imageStroke);
      return;
    }
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const distance = Math.hypot(point.x - stroke.last.x, point.y - stroke.last.y);
    const spacing = Math.max(1, (brushRef.current.size * brushRef.current.spacing) / 100);
    if (distance < spacing) return;
    const steps = Math.min(16, Math.max(1, Math.floor(distance / spacing)));
    const from = stroke.last;
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      stampAt(
        {
          x: from.x + (point.x - from.x) * ratio,
          y: from.y + (point.y - from.y) * ratio,
        },
        pressureFor(event),
        { x: point.x - from.x, y: point.y - from.y },
      );
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (imageBrushStrokeRef.current?.pointerId === event.pointerId) {
      const stroke = imageBrushStrokeRef.current;
      stroke.pointerUpAt = performance.now();
      flushImageBrushSamples(stroke);
      if (stroke.liveRaf !== null) cancelAnimationFrame(stroke.liveRaf);
      stroke.liveRaf = null;
      const liveLimit = Math.max(1, imageBrushSettingsRef.current.maxLiveStampsPerFrame);
      drawLiveImageBrushStamps(stroke.strokeId, stroke.pendingLiveStamps.splice(0, liveLimit));
      imageBrushStrokeRef.current = null;
      setCursorInfo(cursorPendingRef.current);
      startImageBrushJob(stroke);
      if (stroke.limitReached) {
        setNotice(
          `Image Brush reached the visible ${imageBrushSettingsRef.current.maxGeneratedStamps.toLocaleString()}-stamp safety limit. Increase Maximum generated stamps to preserve a longer section.`,
        );
      }
      return;
    }
    if (regionDragRef.current?.pointerId === event.pointerId) {
      const regionDrag = regionDragRef.current;
      regionDragRef.current = null;
      setMoshRack((rack) =>
        setMoshRegion(
          rack,
          regionDrag.ownerEffectInstanceId,
          regionDrag.mode,
          regionDrag.rectangle,
        ),
      );
      setMoshDraftRegion(null);
      setMoshRegionTool(null);
      setNotice(`${regionDrag.mode === 'source' ? 'Source' : 'Destination'} MOSH region defined.`);
      return;
    }
    if (panDragRef.current?.pointerId === event.pointerId) panDragRef.current = null;
    if (altDragRef.current?.pointerId === event.pointerId) altDragRef.current = null;
    if (strokeRef.current?.pointerId === event.pointerId) commitStroke();
  };

  const wheelCanvas = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const oldZoom = zoomRef.current;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = clamp(oldZoom * factor, 0.05, 8);
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const imagePoint = {
      x: (pointer.x - panRef.current.x) / oldZoom,
      y: (pointer.y - panRef.current.y) / oldZoom,
    };
    setZoom(nextZoom);
    setPan({
      x: pointer.x - imagePoint.x * nextZoom,
      y: pointer.y - imagePoint.y * nextZoom,
    });
  };

  const undo = useCallback(() => {
    if (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId) cancelMosh();
    if (brushJobGateRef.current.currentJobId) cancelBrushJob();
    if (imageBrushJobGateRef.current.currentJobId) cancelImageBrushJob();
    if (imageBrushJobGateRef.current.currentJobId) cancelImageBrushJob();
    if (pendingPreview) {
      cancelPreview();
      return;
    }
    const action = historyRef.current.undo(docRef.current.pixels);
    if (!action) return;
    if (action.layerBefore) restoreLayerSnapshot(action.layerBefore);
    docRef.current.dirty = true;
    updateWorkingCanvas();
    bumpHistory();
    bumpDocument();
    setNotice(`Undid ${action.label}.`);
  }, [
    cancelBrushJob,
    cancelImageBrushJob,
    cancelMosh,
    cancelPreview,
    pendingPreview,
    restoreLayerSnapshot,
    updateWorkingCanvas,
  ]);

  const redo = useCallback(() => {
    if (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId) cancelMosh();
    if (brushJobGateRef.current.currentJobId) cancelBrushJob();
    if (imageBrushJobGateRef.current.currentJobId) cancelImageBrushJob();
    const action = historyRef.current.redo(docRef.current.pixels);
    if (!action) return;
    if (action.layerAfter) restoreLayerSnapshot(action.layerAfter);
    docRef.current.dirty = true;
    updateWorkingCanvas();
    bumpHistory();
    bumpDocument();
    setNotice(`Redid ${action.label}.`);
  }, [cancelBrushJob, cancelImageBrushJob, cancelMosh, restoreLayerSnapshot, updateWorkingCanvas]);

  const undoToHistoryAction = useCallback(
    (actionId: string) => {
      if (pendingPreview) cancelPreview();
      if (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId) cancelMosh();
      if (brushJobGateRef.current.currentJobId) cancelBrushJob();
      if (imageBrushJobGateRef.current.currentJobId) cancelImageBrushJob();
      const actions = historyRef.current.undoTo(docRef.current.pixels, actionId);
      if (!actions.length) return;
      const finalAction = actions.at(-1);
      if (finalAction?.layerBefore) restoreLayerSnapshot(finalAction.layerBefore);
      docRef.current.dirty = true;
      updateWorkingCanvas();
      bumpHistory();
      bumpDocument();
      setNotice(
        `Returned to the selected history state by undoing ${actions.length} newer action(s).`,
      );
    },
    [
      cancelBrushJob,
      cancelImageBrushJob,
      cancelMosh,
      cancelPreview,
      pendingPreview,
      restoreLayerSnapshot,
      updateWorkingCanvas,
    ],
  );

  const clearHistory = useCallback(() => {
    resetHistory();
    setNotice('Undo/Redo history cleared. Image data was not changed.');
  }, [resetHistory]);

  const resetChanges = useCallback(() => {
    if (!window.confirm('Reset all RGBA changes and clear history?')) return;
    cancelMosh();
    cancelBrushJob(true);
    cancelImageBrushJob(true);
    imageBrushStrokeRef.current = null;
    imageBrushEvolutionOffsetRef.current = 0;
    pendingImageBrushEvolutionRef.current = null;
    clearAdvancedBrushTransientState();
    const current = docRef.current;
    current.pixels.set(current.original);
    layerStackRef.current = createLayerStack(current.width, current.height);
    bumpLayers();
    current.dirty = false;
    resetHistory();
    lastBrushMaskRef.current = { data: new Uint8Array(0), bounds: null };
    lastBrushDirectionRef.current = { x: 1, y: 0 };
    setBrushContext((context) => ({
      version: context.version + 1,
      affectedPixels: 0,
      direction: { x: 1, y: 0 },
    }));
    setMoshRack((rack) =>
      clearMoshRegions(
        rack.map((card) => (card.target === 'brush' ? { ...card, target: 'whole' } : card)),
      ),
    );
    regionDragRef.current = null;
    setMoshDraftRegion(null);
    setMoshRegionTool(null);
    setPendingPreview(null);
    updateWorkingCanvas();
    bumpDocument();
    bumpHistory();
    setNotice('All RGBA changes were reset.');
  }, [
    bumpHistory,
    cancelBrushJob,
    cancelImageBrushJob,
    cancelMosh,
    clearAdvancedBrushTransientState,
    resetHistory,
    updateWorkingCanvas,
  ]);

  const loadDocument = useCallback(
    async (file: File) => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setNotice('Unsupported format. Choose PNG, JPEG, or WebP.');
        return;
      }
      if (file.size > 120 * 1024 * 1024) {
        setNotice('The file exceeds the 120 MB safety limit.');
        return;
      }
      if (docRef.current.dirty && !window.confirm('Replace the image and discard unsaved changes?'))
        return;
      cancelMosh();
      cancelBrushJob(true);
      cancelImageBrushJob(true);
      imageBrushStrokeRef.current = null;
      imageBrushEvolutionOffsetRef.current = 0;
      pendingImageBrushEvolutionRef.current = null;
      clearAdvancedBrushTransientState();
      setPendingPreview(null);
      setProcessing(true);
      try {
        const bitmap = await createImageBitmap(file);
        if (bitmap.width * bitmap.height > 80_000_000) {
          bitmap.close();
          throw new Error('The decoded image is too large for the browser memory safety limit.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas 2D context is unavailable.');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const raw = new Uint8Array(await file.arrayBuffer());
        docRef.current = {
          width: canvas.width,
          height: canvas.height,
          original: data.slice(),
          pixels: data.slice(),
          fileName: file.name,
          mimeType: file.type,
          rawOriginal: raw,
          rawMutated: null,
          dirty: false,
        };
        layerStackRef.current = createLayerStack(canvas.width, canvas.height);
        bumpLayers();
        maskRef.current = new Float32Array(canvas.width * canvas.height);
        lastBrushMaskRef.current = { data: new Uint8Array(0), bounds: null };
        lastBrushDirectionRef.current = { x: 1, y: 0 };
        setBrushContext((context) => ({
          version: context.version + 1,
          affectedPixels: 0,
          direction: { x: 1, y: 0 },
        }));
        setMoshRack((rack) =>
          clearMoshRegions(
            rack.map((card) => (card.target === 'brush' ? { ...card, target: 'whole' } : card)),
          ),
        );
        regionDragRef.current = null;
        setMoshDraftRegion(null);
        setMoshRegionTool(null);
        resetHistory();
        setSelectedByte(0);
        setSelectedPixels([0]);
        setExportName(file.name.replace(/\.[^.]+$/, ''));
        bumpDocument();
        bumpHistory();
        setNotice(`${file.name} decoded locally at ${canvas.width} × ${canvas.height}.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Image decoding failed.');
      } finally {
        setProcessing(false);
      }
    },
    [
      bumpHistory,
      cancelBrushJob,
      cancelImageBrushJob,
      cancelMosh,
      clearAdvancedBrushTransientState,
      resetHistory,
    ],
  );

  const loadDemo = useCallback(() => {
    if (docRef.current.dirty && !window.confirm('Replace the image and discard unsaved changes?'))
      return;
    cancelMosh();
    cancelBrushJob(true);
    cancelImageBrushJob(true);
    imageBrushStrokeRef.current = null;
    imageBrushEvolutionOffsetRef.current = 0;
    pendingImageBrushEvolutionRef.current = null;
    clearAdvancedBrushTransientState();
    setPendingPreview(null);
    docRef.current = createDemoDocument();
    layerStackRef.current = createLayerStack(docRef.current.width, docRef.current.height);
    bumpLayers();
    maskRef.current = new Float32Array(docRef.current.width * docRef.current.height);
    lastBrushMaskRef.current = { data: new Uint8Array(0), bounds: null };
    lastBrushDirectionRef.current = { x: 1, y: 0 };
    setBrushContext((context) => ({
      version: context.version + 1,
      affectedPixels: 0,
      direction: { x: 1, y: 0 },
    }));
    setMoshRack((rack) =>
      clearMoshRegions(
        rack.map((card) => (card.target === 'brush' ? { ...card, target: 'whole' } : card)),
      ),
    );
    regionDragRef.current = null;
    setMoshDraftRegion(null);
    setMoshRegionTool(null);
    resetHistory();
    setExportName('signal-study-demo');
    setSelectedByte(0);
    setSelectedPixels([0]);
    bumpDocument();
    bumpHistory();
    setNotice('Generated demo image loaded.');
  }, [
    bumpHistory,
    cancelBrushJob,
    cancelImageBrushJob,
    cancelMosh,
    clearAdvancedBrushTransientState,
    resetHistory,
  ]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadDocument(file);
    event.target.value = '';
  };

  const selectCanvasPixel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    const point = screenToImage(event.clientX, event.clientY);
    if (point.x < 0 || point.y < 0 || point.x >= doc.width || point.y >= doc.height) return;
    setSelectedByte(pixelToByteOffset(Math.floor(point.x), Math.floor(point.y), doc.width));
    setSelectedPixels([Math.floor(point.y) * doc.width + Math.floor(point.x)]);
    setNotice(
      `Pixel ${Math.floor(point.x)}, ${Math.floor(point.y)} selected for selection-target effects.`,
    );
  };

  const selectImageBrushAsset = useCallback((id: string | null) => {
    activeImageBrushIdRef.current = id;
    setActiveImageBrushId(id);
  }, []);

  const restoreImageBrushDemos = useCallback(() => {
    const existing = new Set(imageBrushLibraryRef.current.map((asset) => asset.id));
    const additions = createDemoBrushAssets().filter((asset) => !existing.has(asset.id));
    if (!additions.length) {
      setNotice('All nine local Image Brush demo assets are already in the library.');
      return;
    }
    const next = [...imageBrushLibraryRef.current, ...additions];
    imageBrushLibraryRef.current = next;
    setImageBrushLibrary(next);
    if (!activeImageBrushIdRef.current) {
      const nextActive = additions[0]?.id ?? null;
      activeImageBrushIdRef.current = nextActive;
      setActiveImageBrushId(nextActive);
    }
    setNotice(`${additions.length} locally generated demo brush asset(s) added.`);
  }, []);

  const randomizeCurrentImageBrush = useCallback(
    (scope: ImageBrushRandomizeScope, forceNewVariation = false) => {
      let nextNonce =
        forceNewVariation || !imageBrushLockSeed
          ? imageBrushVariationNonce + 1
          : imageBrushVariationNonce;
      const replayKey = `${imageBrushSeed}:${scope}:${nextNonce}`;
      if (imageBrushLockSeed && imageBrushLockedRandomizationRef.current?.key === replayKey) {
        const replay = imageBrushLockedRandomizationRef.current;
        setImageBrushSettings({
          ...replay.settings,
          customAnchor: { ...replay.settings.customAnchor },
        });
        setImageBrushRack(replay.rack.map((item) => ({ ...item })));
        setImageBrushPresetId('custom');
        setNotice(
          `Image Brush reproduced the locked ${scope} recipe with seed ${imageBrushSeed}, variation ${nextNonce}.`,
        );
        return;
      }
      const changedFields = (candidate: ReturnType<typeof randomizeImageBrush>) => {
        const previous = imageBrushSettingsRef.current as unknown as Record<string, unknown>;
        const next = candidate.settings as unknown as Record<string, unknown>;
        const settingsChanged = Object.keys(next).reduce(
          (count, key) =>
            count + (JSON.stringify(next[key]) !== JSON.stringify(previous[key]) ? 1 : 0),
          0,
        );
        const rackChanged =
          JSON.stringify(candidate.rack) === JSON.stringify(imageBrushRack) ? 0 : 2;
        return settingsChanged + rackChanged;
      };
      let randomized = randomizeImageBrush(
        imageBrushSettingsRef.current,
        imageBrushRack,
        imageBrushSeed,
        scope,
        nextNonce,
      );
      for (
        let attempt = 0;
        !imageBrushLockSeed && changedFields(randomized) < 2 && attempt < 5;
        attempt += 1
      ) {
        nextNonce += 1;
        randomized = randomizeImageBrush(
          imageBrushSettingsRef.current,
          imageBrushRack,
          imageBrushSeed,
          scope,
          nextNonce,
        );
      }
      if (imageBrushLockSeed) {
        imageBrushLockedRandomizationRef.current = {
          key: replayKey,
          settings: {
            ...randomized.settings,
            customAnchor: { ...randomized.settings.customAnchor },
          },
          rack: randomized.rack.map((item) => ({ ...item })),
        };
      }
      setImageBrushVariationNonce(nextNonce);
      setImageBrushSettings(randomized.settings);
      setImageBrushRack(randomized.rack);
      setImageBrushPresetId('custom');
      setNotice(
        `Image Brush ${scope} recipe generated with seed ${imageBrushSeed}, variation ${nextNonce}. ` +
          `${randomized.rack.length} FX and multiple meaningful settings changed; the selected image and History were unchanged.`,
      );
    },
    [imageBrushLockSeed, imageBrushRack, imageBrushSeed, imageBrushVariationNonce],
  );

  const optimizeActiveImageBrush = useCallback(
    (maximumDimension: number | null) => {
      const activeId = activeImageBrushIdRef.current;
      const active = imageBrushLibraryRef.current.find((asset) => asset.id === activeId);
      if (!active) {
        setNotice('Select a stamp image before optimizing it.');
        return;
      }
      cancelImageBrushJob(true);
      imageBrushPreviewGenerationRef.current += 1;
      imageBrushPreviewWorkerRef.current?.terminate();
      imageBrushPreviewWorkerRef.current = null;
      imageBrushGhostSourceRef.current = null;
      imageBrushGhostVariantsRef.current = [];
      const optimized = optimizeImageBrushAsset(
        active,
        maximumDimension,
        imageBrushSettingsRef.current.trimTransparent,
        imageBrushSettingsRef.current.trimThreshold,
      );
      const next = imageBrushLibraryRef.current.map((asset) =>
        asset.id === active.id ? optimized : asset,
      );
      imageBrushLibraryRef.current = next;
      setImageBrushLibrary(next);
      setProcessedBrushPreview(null);
      const originalBytes = active.originalWidth * active.originalHeight * 4;
      const workingBytes = optimized.width * optimized.height * 4;
      const improvement = originalBytes / Math.max(1, workingBytes);
      setNotice(
        maximumDimension === null
          ? `Restored full-resolution stamp working data at ${optimized.width}×${optimized.height}.`
          : `Stamp optimized to ${optimized.width}×${optimized.height}; decoded working memory is ${improvement.toFixed(1)}× smaller. Original upload is preserved.`,
      );
    },
    [cancelImageBrushJob],
  );

  const testImageBrushOverlay = useCallback(
    (kind: 'stamp' | 'trail') => {
      const current = docRef.current;
      const count = kind === 'stamp' ? 1 : 10;
      const spacing = Math.max(12, imageBrushSettingsRef.current.size * 0.68);
      const totalWidth = (count - 1) * spacing;
      const start = {
        x: current.width / 2 - totalWidth / 2,
        y: current.height / 2,
      };
      const stamps: StampPoint[] = Array.from({ length: count }, (_, index) => ({
        position: { x: start.x + index * spacing, y: start.y },
        previousPosition: {
          x: start.x + Math.max(0, index - 1) * spacing,
          y: start.y,
        },
        direction: { x: 1, y: 0 },
        speed: spacing,
        pressure: 1,
        distance: index * spacing,
        index,
      }));
      clearImageBrushOverlay();
      drawLiveImageBrushStamps(`image-brush-test-${kind}`, stamps);
      setNotice(
        kind === 'stamp'
          ? 'Temporary isolated Image Brush stamp shown. Document and History are unchanged.'
          : 'Temporary ten-stamp Image Brush trail shown. Document and History are unchanged.',
      );
    },
    [clearImageBrushOverlay, drawLiveImageBrushStamps],
  );

  const processedBrushCanvas = useCallback((): HTMLCanvasElement => {
    const active = imageBrushLibraryRef.current.find(
      (asset) => asset.id === activeImageBrushIdRef.current,
    );
    const preview = processedBrushPreview;
    if (!active || !preview) throw new Error('No processed Image Brush is available.');
    const canvas = document.createElement('canvas');
    canvas.width = preview.width;
    canvas.height = preview.height;
    canvas
      .getContext('2d')
      ?.putImageData(new ImageData(preview.pixels, preview.width, preview.height), 0, 0);
    return canvas;
  }, [processedBrushPreview]);

  const downloadProcessedBrush = useCallback(async () => {
    try {
      const active = imageBrushLibraryRef.current.find(
        (asset) => asset.id === activeImageBrushIdRef.current,
      );
      const canvas = processedBrushCanvas();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('Processed brush encoding failed.')),
          'image/png',
        ),
      );
      triggerDownload(blob, `${active?.name ?? 'image-brush'}-processed.png`);
      setNotice('Processed Image Brush downloaded locally as transparent PNG.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Processed brush download failed.');
    }
  }, [processedBrushCanvas]);

  const copyProcessedBrush = useCallback(async () => {
    try {
      if (!('ClipboardItem' in window)) throw new Error('Clipboard image API is unavailable.');
      const canvas = processedBrushCanvas();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('Processed brush encoding failed.')),
          'image/png',
        ),
      );
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNotice('Processed transparent brush copied as PNG.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Processed brush copy failed.');
    }
  }, [processedBrushCanvas]);

  const renderOriginalCanvas = useCallback((): HTMLCanvasElement => {
    const current = docRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = current.width;
    canvas.height = current.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Original project canvas is unavailable.');
    context.putImageData(imageDataFrom(current.original, current.width, current.height), 0, 0);
    return canvas;
  }, []);

  const exportImage = async (copy = false) => {
    setProcessing(true);
    try {
      const canvas = renderExportCanvas();
      const mime = `image/${exportFormat}`;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('Image encoding failed.'))),
          mime,
          exportQuality,
        ),
      );
      if (copy) {
        if (!('ClipboardItem' in window)) throw new Error('Clipboard image API is unavailable.');
        const pngBlob =
          exportFormat === 'png'
            ? blob
            : await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob(
                  (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
                  'image/png',
                ),
              );
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        setNotice('Image copied to clipboard as PNG.');
      } else {
        triggerDownload(
          blob,
          `${exportName || 'image'}_glitched.${exportFormat === 'jpeg' ? 'jpg' : exportFormat}`,
        );
        docRef.current.dirty = false;
        setNotice(`${exportFormat.toUpperCase()} export created locally.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setProcessing(false);
    }
  };

  const projectRuns = () => {
    const current = docRef.current;
    return encodeProjectRuns(current.pixels, current.original);
  };

  const exportProject = () => {
    const current = docRef.current;
    const project = {
      version: 2,
      app: PRODUCT_NAME,
      image: {
        fileName: current.fileName,
        width: current.width,
        height: current.height,
        mimeType: current.mimeType,
        embedded: embedProjectImage ? renderOriginalCanvas().toDataURL('image/png') : null,
      },
      seed,
      algorithm,
      brush,
      settings,
      layerStack: serializeLayerStack(layerStackRef.current),
      changes: projectRuns(),
      imageBrush: serializeImageBrushProject({
        settings: imageBrushSettings,
        seed: imageBrushSeed,
        activePresetId: imageBrushPresetId,
        activeAssetId: activeImageBrushId,
        evolutionOffset: imageBrushEvolutionOffsetRef.current,
        rack: imageBrushRack,
        library: imageBrushLibrary,
      }),
    };
    triggerDownload(
      new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
      `${exportName || PRODUCT_NAME}.imgfuck.json`,
    );
    const embeddedBytes = imageBrushLibrary.reduce(
      (total, asset) => total + asset.originalPixels.byteLength,
      0,
    );
    setNotice(
      embeddedBytes > 16 * 1024 * 1024
        ? `Project JSON exported with ${formatBytes(embeddedBytes)} of embedded Image Brush RGBA assets.`
        : 'Project JSON exported with portable embedded Image Brush assets.',
    );
  };

  const importProject = async (file: File) => {
    try {
      const project = JSON.parse(await file.text()) as {
        image: { width: number; height: number; fileName: string; embedded?: string | null };
        seed: string;
        algorithm: AlgorithmId;
        brush: BrushSettings;
        settings: AlgorithmSettings;
        layerStack?: SerializedLayerStack;
        changes: ProjectRun[];
        imageBrush?: ImageBrushProjectData;
      };
      if (project.image.embedded) {
        const response = await fetch(project.image.embedded);
        const embedded = new File([await response.blob()], project.image.fileName, {
          type: 'image/png',
        });
        await loadDocument(embedded);
      } else if (
        project.image.width !== docRef.current.width ||
        project.image.height !== docRef.current.height
      ) {
        throw new Error('Load the matching source image before importing this project.');
      }
      cancelMosh();
      cancelImageBrushJob(true);
      clearImageDependentMoshState();
      clearAdvancedBrushTransientState();
      const current = docRef.current;
      applyProjectRuns(current.pixels, current.original, project.changes);
      if (project.layerStack) {
        const restoredLayers = deserializeLayerStack(project.layerStack);
        if (restoredLayers.width !== current.width || restoredLayers.height !== current.height) {
          throw new Error('Project layer dimensions do not match the source image.');
        }
        layerStackRef.current = restoredLayers;
        current.pixels.set(composeLayerStack(restoredLayers, current.original));
      } else {
        const migrated = createLayerStack(current.width, current.height);
        writeCompositeResultToActiveLayer(migrated, current.original, current.pixels, {
          x: 0,
          y: 0,
          width: current.width,
          height: current.height,
        });
        layerStackRef.current = migrated;
        current.pixels.set(composeLayerStack(migrated, current.original));
      }
      bumpLayers();
      current.dirty = true;
      setSeed(project.seed);
      const migratedAlgorithm = migrateAlgorithmSelection(project.algorithm, project.settings);
      setAlgorithm(migratedAlgorithm.algorithm);
      setBrush(project.brush);
      setSettings({ ...defaultAlgorithmSettings, ...migratedAlgorithm.settings });
      if (project.imageBrush) {
        const restored = restoreImageBrushProject(project.imageBrush);
        setImageBrushSettings(restored.settings);
        setImageBrushSeed(restored.seed);
        setImageBrushPresetId(restored.activePresetId);
        setImageBrushRack(restored.rack);
        setImageBrushLibrary(restored.library);
        setActiveImageBrushId(restored.activeAssetId);
        imageBrushEvolutionOffsetRef.current = restored.evolutionOffset;
      }
      resetHistory();
      updateWorkingCanvas();
      bumpDocument();
      setNotice('Project imported. History starts from the imported result.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Project import failed.');
    }
  };

  const applyPreset = (preset: Preset) => {
    changeAlgorithm(preset.algorithm);
    setBrush((current) => ({
      ...(preset.custom ? current : defaultBrush),
      ...preset.brush,
    }));
    setSettings((current) => ({
      ...(preset.custom ? current : defaultAlgorithmSettings),
      ...preset.settings,
    }));
    setNotice(`${preset.name} preset loaded.`);
  };

  const savePreset = () => {
    const name = window.prompt('Preset name', `Custom ${algorithms[algorithm].name}`);
    if (!name?.trim()) return;
    const preset: Preset = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      algorithm,
      brush,
      settings,
      custom: true,
    };
    const next = [...customPresets, preset];
    setCustomPresets(next);
    saveCustomPresets(next);
    setNotice(`${preset.name} saved in localStorage.`);
  };

  const deletePreset = (id: string) => {
    const next = customPresets.filter((preset) => preset.id !== id);
    setCustomPresets(next);
    saveCustomPresets(next);
  };

  const exportPresets = () => {
    triggerDownload(
      new Blob([JSON.stringify(customPresets, null, 2)], { type: 'application/json' }),
      'imgfuck-presets.json',
    );
  };

  const importPresets = async (file: File) => {
    try {
      const imported = JSON.parse(await file.text()) as Preset[];
      const clean = imported
        .filter((preset) => preset.id && preset.name && algorithms[preset.algorithm])
        .map(migratePreset)
        .map((preset) => ({ ...preset, id: `custom-${Date.now()}-${preset.id}`, custom: true }));
      const next = [...customPresets, ...clean];
      setCustomPresets(next);
      saveCustomPresets(next);
      setNotice(`${clean.length} preset(s) imported.`);
    } catch {
      setNotice('Preset JSON is invalid.');
    }
  };

  const randomGlitch = useCallback(() => {
    if (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId) cancelMosh();
    if (brushJobGateRef.current.currentJobId) cancelBrushJob();
    if (pendingPreview) cancelPreview();
    if (activeLayer(layerStackRef.current).locked) {
      setNotice('The active glitch layer is locked.');
      return;
    }
    const current = docRef.current;
    const random = createSeededRandom(`${seed}:random:${historyVersion}`);
    const point = { x: random.int(0, current.width - 1), y: random.int(0, current.height - 1) };
    strokeRef.current = {
      pointerId: -1,
      last: point,
      bounds: null,
      touched: new Set(),
      patches: [],
      stamp: 0,
      pressure: 1,
      movement: { x: 0, y: 0 },
      path: [{ x: point.x, y: point.y, pressure: 1 }],
      layerBefore: snapshotLayerStack(layerStackRef.current),
    };
    stampAt(point, 1, { x: random.int(-20, 20), y: random.int(-20, 20) });
    commitStroke();
  }, [
    cancelBrushJob,
    cancelImageBrushJob,
    cancelMosh,
    cancelPreview,
    commitStroke,
    historyVersion,
    pendingPreview,
    seed,
    stampAt,
  ]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const action = resolveEditorShortcut(event, typing);
      if (!action) return;
      event.preventDefault();
      if (action === 'escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (exportOpen) setExportOpen(false);
        else if (projectOpen) setProjectOpen(false);
        else if (cloneSourcePickMode) {
          setCloneSourcePickMode(false);
          setNotice('Clone source picker exited.');
        } else if (regionDragRef.current) {
          regionDragRef.current = null;
          setMoshDraftRegion(null);
          setNotice(
            'Unfinished Motion Transfer region cancelled. Press Escape again to exit the region tool.',
          );
        } else if (moshRegionTool) {
          setMoshDraftRegion(null);
          setMoshRegionTool(null);
          setNotice('Motion Transfer region tool exited.');
        } else if (imageBrushStrokeRef.current) {
          imageBrushStrokeRef.current = null;
          clearImageBrushOverlay();
          setNotice('Uncommitted Image Brush stroke discarded.');
        } else if (imageBrushJobGateRef.current.currentJobId) cancelImageBrushJob();
        else if (brushJobGateRef.current.currentJobId) cancelBrushJob();
        else if (moshJobGateRef.current.currentJobId || moshPreviewBufferRef.current) cancelMosh();
        else cancelPreview();
        return;
      }
      if (action === 'undo') undo();
      else if (action === 'redo') redo();
      else if (action === 'brush') {
        setTool('brush');
        setActivePanel('effect');
      } else if (action === 'hand') setTool('hand');
      else if (action === 'restore') {
        setTool('restore');
        setActivePanel('retouch');
      } else if (action === 'smudge') {
        setTool('smudge');
        setActivePanel('retouch');
      } else if (action === 'blur-retouch') {
        setTool('blur');
        setActivePanel('retouch');
      } else if (action === 'sharpen') {
        setTool('sharpen');
        setActivePanel('retouch');
      } else if (action === 'eraser') {
        setTool('eraser');
        setActivePanel('retouch');
      } else if (action === 'glitch') randomGlitch();
      else if (action === 'fit') fitToScreen();
      else if (action === 'zoom-100') setZoom(1);
      else if (action === 'brush-smaller')
        setBrush((value) => ({ ...value, size: clamp(value.size - 8, 2, 600) }));
      else if (action === 'brush-larger')
        setBrush((value) => ({ ...value, size: clamp(value.size + 8, 2, 600) }));
      else if (action === 'temporary-pan') spaceDownRef.current = true;
      else if (action === 'show-original') setShowOriginal(true);
      else if (action === 'apply-preview') applyPreview();
      else if (action === 'reset') resetChanges();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceDownRef.current = false;
      if (event.code === 'Backslash') setShowOriginal(false);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [
    applyPreview,
    cancelBrushJob,
    cancelImageBrushJob,
    cancelMosh,
    cancelPreview,
    clearImageBrushOverlay,
    exportOpen,
    fitToScreen,
    cloneSourcePickMode,
    moshRegionTool,
    projectOpen,
    randomGlitch,
    redo,
    resetChanges,
    shortcutsOpen,
    undo,
  ]);

  const updateBrush = <K extends keyof BrushSettings>(key: K, value: BrushSettings[K]) =>
    setBrush((current) => ({ ...current, [key]: value }));
  const updateSetting = <K extends keyof AlgorithmSettings>(key: K, value: AlgorithmSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const randomizeSelectedAdvancedBrush = (mode: 'balanced' | 'wild') => {
    if (!isAdvancedBrushId(algorithm)) return;
    const randomized = randomizeAdvancedBrush(algorithm, settings, brush, seed, mode);
    setSettings(randomized.settings);
    setBrush(randomized.brush);
    setNotice(
      `${algorithms[algorithm].name} ${mode} randomization loaded from seed. No pixels changed.`,
    );
  };

  const resetSelectedAdvancedBrush = () => {
    if (!isAdvancedBrushId(algorithm)) return;
    setSettings({ ...defaultAlgorithmSettings });
    setBrush({ ...defaultBrush });
    if (algorithm === 'feedback-brush') resetFeedbackMemory();
    setNotice(`${algorithms[algorithm].name} defaults restored. No pixels changed.`);
  };

  const applyQuickLevel = (level: 'subtle' | 'medium' | 'aggressive' | 'broken' | 'extreme') => {
    const levelIndex = ['subtle', 'medium', 'aggressive', 'broken', 'extreme'].indexOf(level);
    const structuralIntensity = [0.38, 0.68, 0.94, 1.2, 1.48][levelIndex]!;
    const microIntensity = [0.24, 0.42, 0.62, 0.82, 1][levelIndex]!;
    const strength = [0.5, 0.66, 0.8, 0.92, 1][levelIndex]!;
    const spill = (['local', 'small', 'small', 'medium', 'strong'] as const)[levelIndex]!;
    const overrides: Partial<AlgorithmSettings> = {
      structuralIntensity,
      microIntensity,
      spill,
      structuralDensity: [0.3, 0.48, 0.66, 0.84, 1][levelIndex]!,
    };
    if (algorithm === 'slice-displacement') {
      overrides.sliceCount = [1, 2, 3, 5, 7][levelIndex]!;
      overrides.sliceMaxOffset = [32, 58, 92, 138, 210][levelIndex]!;
      overrides.sliceMaxThickness = [10, 18, 28, 42, 64][levelIndex]!;
    } else if (algorithm === 'block-corruption' || algorithm === 'macroblock-shift') {
      overrides.macroblockMaxSize = [22, 34, 48, 68, 96][levelIndex]!;
      overrides.macroblockOffset = [28, 48, 74, 112, 170][levelIndex]!;
    } else if (algorithm === 'datamosh-smear') {
      overrides.datamoshLength = [56, 96, 150, 230, 340][levelIndex]!;
      overrides.datamoshPersistence = [0.42, 0.64, 0.84, 1.05, 1.3][levelIndex]!;
    } else if (algorithm === 'rgb-chunk-split') {
      overrides.rgbChunkOffset = [5, 10, 18, 30, 48][levelIndex]!;
      overrides.rgbRegionSize = [48, 72, 104, 150, 220][levelIndex]!;
    } else if (algorithm === 'scanline-tear-pro') {
      overrides.tearBandCount = [2, 3, 5, 8, 12][levelIndex]!;
      overrides.tearShift = [24, 52, 88, 132, 210][levelIndex]!;
    } else if (algorithm === 'codec-block-damage' || algorithm === 'compression-block-damage') {
      overrides.compressionQuantization = [0.3, 0.5, 0.7, 0.86, 1][levelIndex]!;
      overrides.compressionScramble = [0.08, 0.16, 0.28, 0.48, 0.72][levelIndex]!;
    } else if (algorithm === 'packet-loss') {
      overrides.packetLossDensity = [0.18, 0.34, 0.52, 0.75, 1][levelIndex]!;
    } else if (algorithm === 'tile-scramble') {
      overrides.tileShuffle = [0.2, 0.38, 0.62, 0.82, 1][levelIndex]!;
    } else if (algorithm === 'row-column-repeat') {
      overrides.repeatCount = [2, 4, 7, 11, 16][levelIndex]!;
    } else if (algorithm === 'structural-mixed') {
      overrides.structuralMixCount = [1, 2, 3, 4, 5][levelIndex]!;
    }
    setBrush((current) => ({ ...current, strength }));
    setSettings((current) => ({ ...current, ...overrides }));
    setNotice(`${level.toUpperCase()} level loaded for ${algorithms[algorithm].name}.`);
  };

  const layerStack = layerStackRef.current;
  const currentLayer = activeLayer(layerStack);
  const effectiveOriginal = showOriginal || blinkPhase;
  const isAnyProcessing = processing || moshProcessing || brushProcessing || imageBrushProcessing;
  const visibleHistoryEntries = [...history.undoEntries].reverse();
  const workClip = compareMode === 'split' ? `inset(0 ${100 - splitPosition}% 0 0)` : undefined;

  return (
    <main
      className={`app ${isAnyProcessing ? 'is-processing' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        fileDropCounter.current += 1;
        event.currentTarget.classList.add('dragging-file');
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        fileDropCounter.current -= 1;
        if (fileDropCounter.current <= 0) event.currentTarget.classList.remove('dragging-file');
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        fileDropCounter.current = 0;
        event.currentTarget.classList.remove('dragging-file');
        const file = event.dataTransfer.files[0];
        if (file) void loadDocument(file);
      }}
    >
      <TopBar
        doc={doc}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        onLoadDemo={loadDemo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        hasPendingPreview={Boolean(pendingPreview)}
        onUndo={undo}
        onRedo={redo}
        historyOpen={historyOpen}
        onToggleHistory={toggleHistoryOpen}
        compareMode={compareMode}
        onCycleCompare={() =>
          setCompareMode((value) =>
            value === 'off' ? 'split' : value === 'split' ? 'blink' : 'off',
          )
        }
        onOpenExport={() => setExportOpen(true)}
        helpMode={helpMode}
        helpPanelOpen={helpPanelOpen}
        onToggleHelp={toggleHelpPanel}
      />

      {historyOpen && (
        <HistoryPopover
          undoCount={history.undoCount}
          redoCount={history.redoCount}
          entries={visibleHistoryEntries}
          redoEntriesCount={history.redoEntries.length}
          canClear={history.canUndo || history.canRedo}
          onClose={closeHistoryOpen}
          onUndoTo={undoToHistoryAction}
          onClear={clearHistory}
        />
      )}

      <div className="workspace">
        <ToolRail
          tool={tool}
          onSelectTool={setTool}
          onSelectPanel={setActivePanel}
          onRandomGlitch={randomGlitch}
          onFitToScreen={fitToScreen}
          onZoom100={() => setZoom(1)}
          onResetChanges={resetChanges}
        />

        <CanvasWorkspace
          doc={doc}
          zoom={zoom}
          pan={pan}
          workClip={workClip}
          effectiveOriginal={effectiveOriginal}
          selectedByte={selectedByte}
          canvasOverlays={canvasOverlays}
          compareMode={compareMode}
          splitPosition={splitPosition}
          onSplitPositionChange={setSplitPosition}
          applyMode={applyMode}
          onApplyModeChange={setApplyMode}
          brushProcessing={brushProcessing}
          brushProgress={brushProgress}
          onCancelBrushJob={() => cancelBrushJob()}
          hasPendingPreview={Boolean(pendingPreview)}
          onApplyPreview={applyPreview}
          onCancelPreview={cancelPreview}
          maskView={maskView}
          onMaskViewChange={setMaskView}
          onFitToScreen={fitToScreen}
          tool={tool}
          algorithm={algorithm}
          moshRegionPicking={Boolean(moshRegionTool)}
          cloneSourcePicking={cloneSourcePickMode}
          viewportRef={viewportRef}
          stageRef={stageRef}
          baseCanvasRef={baseCanvasRef}
          workCanvasRef={workCanvasRef}
          overlayCanvasRef={overlayCanvasRef}
          imageBrushOverlayCanvasRef={imageBrushOverlayCanvasRef}
          selectionCanvasRef={selectionCanvasRef}
          cursorRef={cursorRef}
          onCanvasPointerDown={(event) => {
            selectCanvasPixel(event);
            if (!event.shiftKey) beginPointer(event);
          }}
          onCanvasPointerMove={movePointer}
          onCanvasPointerUp={endPointer}
          onCanvasPointerCancel={endPointer}
          onCanvasPointerLeave={() => {
            if (cursorRef.current) cursorRef.current.style.opacity = '0';
            clearImageBrushOverlay();
            scheduleCursorInfo({ x: -1, y: -1 });
          }}
          onCanvasWheel={wheelCanvas}
        />

        <aside className="inspector" data-active-panel={activePanel}>
          <InspectorTabs
            activePanel={activePanel}
            onSelect={(panel) => {
              setActivePanel(panel);
              if (panel === 'effect' || panel === 'image-brush') setTool('brush');
              if (panel === 'retouch' && !isRetouchTool(tool)) setTool('smudge');
            }}
          />

          <div className="inspector-scroll">
            {activePanel === 'effect' && (
              <EffectPanel
                algorithm={algorithm}
                algorithms={algorithms}
                algorithmList={algorithmList}
                legacyAlgorithmList={legacyAlgorithmList}
                algorithmDescriptions={algorithmDescriptions}
                effectPreviewSource={effectPreviewSource}
                settings={settings}
                seed={seed}
                brush={brush}
                onChangeAlgorithm={changeAlgorithm}
                onUpdateBrush={updateBrush}
                onUpdateSetting={updateSetting}
                onSeedChange={setSeed}
                onQuickLevel={applyQuickLevel}
                onRandomizeAdvancedBrush={randomizeSelectedAdvancedBrush}
                onResetAdvancedBrush={resetSelectedAdvancedBrush}
                onNotice={setNotice}
                cloneSource={cloneSource}
                cloneSourcePickMode={cloneSourcePickMode}
                feedbackMemoryReady={
                  feedbackMemoryVersion >= 0 && feedbackMemoryRef.current !== null
                }
                onPickCloneSource={() => {
                  setCloneSourcePickMode(true);
                  setNotice(
                    'Click the image to capture a Clone Corruption source region. Escape cancels the picker.',
                  );
                }}
                onClearCloneSource={() => {
                  setCloneSource(null);
                  setCloneSourcePickMode(false);
                  setNotice('Clone source cleared. Image pixels and History were not changed.');
                }}
                onResetFeedback={resetFeedbackMemory}
                metaRecipeLocked={metaRecipeLocked}
                onMetaRecipeLockChange={setMetaRecipeLocked}
                onNewMetaRecipe={() => {
                  if (metaRecipeLocked) {
                    setNotice(
                      'The Mixed Structural recipe is locked. Unlock it before generating a new recipe.',
                    );
                    return;
                  }
                  const nextSeed = createSeed();
                  setSeed(nextSeed);
                  setNotice(
                    `New Mixed Structural recipe generated with seed ${nextSeed}. No pixels changed.`,
                  );
                }}
                builtInPresets={builtInPresets}
                customPresets={customPresets}
                onApplyPreset={applyPreset}
                onDeletePreset={deletePreset}
                onSavePreset={savePreset}
                onExportPresets={exportPresets}
                onImportPresets={importPresets}
                presetInputRef={presetInputRef}
                layerStack={layerStack}
                layerVersion={layerVersion}
                currentLayer={currentLayer}
                original={doc.original}
                onSelectLayer={(id, name) => {
                  layerStackRef.current.activeLayerId = id;
                  bumpLayers();
                  setNotice(`${name} is now the active paint target.`);
                }}
                onRunLayerOperation={runLayerOperation}
              />
            )}

            {activePanel === 'retouch' && isRetouchTool(tool) && (
              <RetouchPanel
                tool={tool}
                onToolChange={setTool}
                previewSource={effectPreviewSource}
                restorePreviewSource={retouchRestorePreviewSource}
                brush={brush}
                onUpdateBrush={updateBrush}
                retouchSettings={retouchSettings}
                onRetouchSettingsChange={setRetouchSettings}
              />
            )}

            {activePanel === 'mosh' && (
              <Suspense fallback={<PanelLoading />}>
                <MoshLab
                  rack={moshRack}
                  seed={moshSeed}
                  previewEnabled={moshPreviewEnabled}
                  processing={moshProcessing}
                  progress={moshProgress}
                  hasSelection={selectedPixels.length > 0}
                  hasBrushMask={brushContext.affectedPixels > 0}
                  hasPreview={Boolean(moshPreviewBufferRef.current)}
                  previewStale={moshPreviewStale}
                  onRackChange={changeMoshRack}
                  onSeedChange={setMoshSeed}
                  onPreviewChange={(enabled) => {
                    setMoshPreviewEnabled(enabled);
                    if (
                      !enabled &&
                      (moshPreviewBufferRef.current || moshJobGateRef.current.currentJobId)
                    ) {
                      cancelMosh();
                    }
                  }}
                  onApply={applyMosh}
                  onCancel={cancelMosh}
                  onReset={() => {
                    cancelMosh();
                    setMoshRack([createMoshCard('pixel-sort')]);
                    regionDragRef.current = null;
                    setMoshDraftRegion(null);
                    setMoshRegionTool(null);
                    setNotice('MOSH LAB rack reset.');
                  }}
                  onPickRegion={(ownerEffectInstanceId, mode) => {
                    regionDragRef.current = null;
                    setMoshDraftRegion(null);
                    setMoshRegionTool({ ownerEffectInstanceId, mode });
                    setTool('brush');
                    setNotice(`Drag over the canvas to define the MOSH ${mode} region.`);
                  }}
                  onClearRegion={clearMotionTransferRegion}
                  onRemoveAppliedResult={() => {
                    const latest = historyRef.current.undoEntries.at(-1);
                    if (latest?.id.startsWith('mosh-')) undo();
                    else
                      setNotice(
                        'Remove Applied Result is available when the latest History action is a MOSH LAB apply. Older results can be removed from History or the active layer.',
                      );
                  }}
                />
              </Suspense>
            )}

            {activePanel === 'image-brush' && (
              <Suspense fallback={<PanelLoading />}>
                <ImageBrushPanel
                  library={imageBrushLibrary}
                  activeAssetId={activeImageBrushId}
                  settings={imageBrushSettings}
                  rack={imageBrushRack}
                  seed={imageBrushSeed}
                  activePresetId={imageBrushPresetId}
                  processedPreview={processedBrushPreview}
                  processing={imageBrushProcessing}
                  progress={imageBrushProgress}
                  performance={imageBrushPerformance}
                  onAddAssets={addImageBrushAssets}
                  onRemoveAsset={removeImageBrushAsset}
                  onClearLibrary={clearImageBrushLibrary}
                  onRemoveDemoAssets={removeImageBrushDemoAssets}
                  onActiveAssetChange={selectImageBrushAsset}
                  onSettingsChange={setImageBrushSettings}
                  onRackChange={setImageBrushRack}
                  onSeedChange={setImageBrushSeed}
                  onPresetChange={setImageBrushPresetId}
                  onRandomize={randomizeCurrentImageBrush}
                  randomizeNonce={imageBrushVariationNonce}
                  randomizeLockSeed={imageBrushLockSeed}
                  onRandomizeLockSeedChange={(locked) => {
                    imageBrushLockedRandomizationRef.current = null;
                    setImageBrushLockSeed(locked);
                  }}
                  onNewVariation={() => randomizeCurrentImageBrush('everything', true)}
                  onOptimizeAsset={optimizeActiveImageBrush}
                  onRestoreDemos={restoreImageBrushDemos}
                  onDownloadProcessed={() => void downloadProcessedBrush()}
                  onCopyProcessed={() => void copyProcessedBrush()}
                  onTestStamp={() => testImageBrushOverlay('stamp')}
                  onTestTrail={() => testImageBrushOverlay('trail')}
                  onCancelProcessing={() => cancelImageBrushJob()}
                  onNotice={setNotice}
                />
              </Suspense>
            )}

            {activePanel === 'raw' && (
              <FileCorruptionPanel
                key={`${doc.fileName}:${doc.width}x${doc.height}`}
                doc={doc}
                seed={seed}
                historyVersion={historyVersion}
                isAnyProcessing={isAnyProcessing}
                onNotice={setNotice}
                onProcessingChange={setProcessing}
              />
            )}
          </div>
        </aside>
      </div>

      <StatusBar
        notice={notice}
        isAnyProcessing={isAnyProcessing}
        moshProcessing={moshProcessing}
        moshProgress={moshProgress}
        cursorInfo={cursorInfo}
        doc={doc}
        zoom={zoom}
        undoCount={history.undoCount}
        redoCount={history.redoCount}
        historyMemoryBytes={history.memoryBytes}
        memoryEstimate={memoryEstimate}
      />

      <div className="drop-overlay">
        <FileImage size={34} />
        <strong>DROP IMAGE TO DECODE LOCALLY</strong>
        <span>PNG / JPEG / WEBP</span>
      </div>

      {isAnyProcessing && <div className="processing-line" />}

      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {exportOpen && (
        <ExportModal
          onClose={() => setExportOpen(false)}
          format={exportFormat}
          onFormatChange={setExportFormat}
          name={exportName}
          onNameChange={setExportName}
          quality={exportQuality}
          onQualityChange={setExportQuality}
          preserveTransparency={preserveTransparency}
          onPreserveTransparencyChange={setPreserveTransparency}
          background={exportBackground}
          onBackgroundChange={setExportBackground}
          docWidth={doc.width}
          docHeight={doc.height}
          onExport={(copy) => void exportImage(copy)}
          onOpenProject={() => {
            setExportOpen(false);
            setProjectOpen(true);
          }}
        />
      )}

      {projectOpen && (
        <ProjectModal
          onClose={() => setProjectOpen(false)}
          embedImage={embedProjectImage}
          onEmbedImageChange={setEmbedProjectImage}
          onImportClick={() => projectInputRef.current?.click()}
          onExport={exportProject}
          inputRef={projectInputRef}
          onFileChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importProject(file);
            event.target.value = '';
          }}
        />
      )}
    </main>
  );
}
