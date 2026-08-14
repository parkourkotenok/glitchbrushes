import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  Clipboard,
  Copy,
  Download,
  FileDown,
  FileUp,
  ImagePlus,
  Plus,
  RefreshCcw,
  Save,
  Shuffle,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { imageBrushFxLevelAmount, imageBrushFxStageCopy } from '../imageBrush/performance';
import {
  builtInImageBrushPresets,
  loadImageBrushPresets,
  saveImageBrushPresets,
  type ImageBrushRandomizeScope,
} from '../imageBrush/presets';
import {
  applyImageBrushGlitchAmount,
  describeCurrentImageBrush,
  imageBrushGlitchLevels,
} from '../imageBrush/simple';
import {
  createImageBrushFx,
  imageBrushFxDefinitions,
  type ImageBrushAsset,
  type ImageBrushFxId,
  type ImageBrushFxItem,
  type ImageBrushPreset,
  type ImageBrushProgress,
  type ImageBrushPreviewDiagnostics,
  type ImageBrushPerformanceSnapshot,
  type ImageBrushSettings,
} from '../imageBrush/types';
import { formatBytes } from '../utils/geometry';
import { helpSlug } from '../help/registry';
import type { ControlHelpOption } from '../help/types';
import { EffectIcon } from '../icons/effects';
import { HelpButton } from './HelpButton';
import { SliderField } from './SliderField';
import {
  effectiveImageBrushStages,
  imageBrushStageLabel,
  supportsImageBrushStages,
} from '../effects/sharedRegistry';

interface ProcessedBrushPreview {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  quality: 'draft' | 'full';
  diagnostics: ImageBrushPreviewDiagnostics;
  variants: Array<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
  }>;
  stroke: {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    stampCount: number;
    processingMs: number;
  };
}

interface ImageBrushPanelProps {
  initialInterfaceLevel?: 'simple' | 'advanced';
  library: ImageBrushAsset[];
  activeAssetId: string | null;
  settings: ImageBrushSettings;
  rack: ImageBrushFxItem[];
  seed: string;
  activePresetId: string;
  processedPreview: ProcessedBrushPreview | null;
  processing: boolean;
  progress: ImageBrushProgress | null;
  performance: ImageBrushPerformanceSnapshot | null;
  onAddAssets(assets: ImageBrushAsset[]): void;
  onRemoveAsset(id: string): void;
  onClearLibrary(): void;
  onRemoveDemoAssets(): void;
  onActiveAssetChange(id: string | null): void;
  onSettingsChange(settings: ImageBrushSettings): void;
  onRackChange(rack: ImageBrushFxItem[]): void;
  onSeedChange(seed: string): void;
  onPresetChange(id: string): void;
  onRandomize(scope: ImageBrushRandomizeScope): void;
  randomizeNonce: number;
  randomizeLockSeed: boolean;
  onRandomizeLockSeedChange(locked: boolean): void;
  onNewVariation(): void;
  onOptimizeAsset(maximumDimension: number | null): void;
  onRestoreDemos(): void;
  onDownloadProcessed(): void;
  onCopyProcessed(): void;
  onTestStamp(): void;
  onTestTrail(): void;
  onCancelProcessing(): void;
  onNotice(message: string): void;
}

const fxIcons: Record<ImageBrushFxId, Parameters<typeof EffectIcon>[0]['id']> = {
  slice: 'slice',
  macroblock: 'macroblock',
  'block-corruption': 'macroblock',
  datamosh: 'datamosh',
  'rgb-split': 'rgb-split',
  scanline: 'scanline',
  'packet-loss': 'packet-loss',
  compression: 'compression',
  'codec-block-damage': 'compression',
  'tile-scramble': 'tile-scramble',
  'row-repeat': 'row-repeat',
  'pixel-noise': 'pixel-noise',
  'bit-flip': 'bit-flip',
  palette: 'palette',
  'pixel-sort': 'pixel-sort',
  feedback: 'feedback',
  'motion-field': 'motion-field',
  'chroma-drift': 'chroma-drift',
  'dct-damage': 'dct-damage',
  'edge-melt': 'edge-melt',
  'flow-field': 'flow-field',
  'motion-transfer': 'motion-transfer',
};

const imageBrushFxHelpOptions: ControlHelpOption[] = imageBrushFxDefinitions.map((definition) => ({
  value: definition.id,
  label: definition.name,
  description: `${definition.description} Estimated ${definition.cost.replace('-', ' ')} processing cost.`,
}));

const mutationRecipeOptions = [
  ['clean', 'Clean'],
  ['mixed', 'Current FX stack'],
  ['slice', 'Slice Displacement'],
  ['block-corruption', 'Block Corruption'],
  ['rgb-split', 'RGB Chunk Split'],
  ['scanline', 'Scanline Tear'],
  ['codec-block-damage', 'Codec Block Damage'],
  ['pixel-sort', 'Pixel Sort'],
  ['feedback', 'Feedback Echo'],
  ['motion-field', 'Motion Field Mosh'],
  ['datamosh', 'Datamosh Smear'],
  ['chroma-drift', 'Chroma Drift'],
  ['flow-field', 'Flow Field Displace'],
] as const;

function drawPreview(
  canvas: HTMLCanvasElement | null,
  pixels: Uint8ClampedArray | undefined,
  width: number,
  height: number,
): void {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!pixels || width <= 0 || height <= 0) return;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);
  const ratio = Math.min(canvas.width / width, canvas.height / height);
  const drawWidth = Math.max(1, width * ratio);
  const drawHeight = Math.max(1, height * ratio);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    source,
    (canvas.width - drawWidth) / 2,
    (canvas.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function decodeImageBrushFilesOffThread(
  files: File[],
  settings: Pick<ImageBrushSettings, 'trimTransparent' | 'trimThreshold'>,
): Promise<ImageBrushAsset[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/imageBrushAsset.worker.ts', import.meta.url), {
      type: 'module',
    });
    const jobId = `image-brush-assets-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const finish = () => worker.terminate();
    worker.onerror = () => {
      finish();
      reject(new Error('The off-thread brush image decoder failed.'));
    };
    worker.onmessage = (
      event: MessageEvent<
        | { jobId: string; type: 'result'; assets: ImageBrushAsset[] }
        | { jobId: string; type: 'error'; message: string }
      >,
    ) => {
      if (event.data.jobId !== jobId) return;
      finish();
      if (event.data.type === 'error') {
        reject(new Error(event.data.message));
      } else {
        resolve(event.data.assets);
      }
    };
    worker.postMessage({ jobId, files, settings, maximumDimension: 512 });
  });
}

function BrushThumbnail({ asset }: { asset: ImageBrushAsset }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => drawPreview(ref.current, asset.pixels, asset.width, asset.height), [asset]);
  return <canvas ref={ref} width={40} height={40} aria-label={`${asset.name} thumbnail`} />;
}

function LazyAdvancedDetails({
  summary,
  className = '',
  initiallyMounted,
  children,
}: {
  summary: string;
  className?: string;
  initiallyMounted: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(initiallyMounted);
  return (
    <details
      className={`image-brush-advanced-group ${className}`.trim()}
      onToggle={(event) => {
        setMounted(event.currentTarget.open);
      }}
    >
      <summary>{summary}</summary>
      {mounted ? children : null}
    </details>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  helpId,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
  helpId?: string;
}) {
  const resolvedHelpId = helpId ?? `image-brush.${helpSlug(label || 'toggle')}`;
  return (
    <label className="image-brush-toggle">
      <input
        data-tooltip-id={resolvedHelpId}
        data-tooltip-label={label}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
      <span>{label}</span>
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  helpId,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange(value: T): void;
  helpId?: string;
}) {
  const resolvedHelpId = helpId ?? `image-brush.${helpSlug(label)}`;
  return (
    <label className="image-brush-select">
      <span>
        {label}
        <HelpButton helpId={resolvedHelpId} label={label} value={value} />
      </span>
      <select
        data-help-id={resolvedHelpId}
        data-help-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map(([id, name]) => (
          <option value={id} key={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function mutationSummary(settings: ImageBrushSettings): [string, string] {
  if (settings.mutationMode === 'clean') {
    return ['The uploaded image is used without Stamp FX.', 'Every repeated copy stays clean.'];
  }
  if (settings.mutationMode === 'fixed') {
    return ['The image is processed once.', 'Every repeated copy uses the same corrupted result.'];
  }
  if (settings.mutationMode === 'progressive') {
    return [
      'Each new copy receives stronger structural corruption.',
      'The trail progresses from the start level to maximum damage.',
    ];
  }
  if (settings.mutationMode === 'per-stamp') {
    return [
      `The brush cycles through ${Math.min(settings.variantCount, settings.maxCachedVariants)} seeded variants.`,
      'The same seed reproduces the same sequence.',
    ];
  }
  if (settings.mutationMode === 'evolving') {
    return [
      'Each new copy mutates from the previous processed copy.',
      'Damage accumulates along the stroke.',
    ];
  }
  if (settings.mutationMode === 'random-stack') {
    return [
      'Each copy builds a new seeded effect subset and order.',
      'The recipe is procedural rather than selected from a variant pool.',
    ];
  }
  if (settings.mutationMode === 'alternating') {
    return [
      'Copies alternate between Recipe A and Recipe B.',
      'Interval and seeded random alternation control the pattern.',
    ];
  }
  if (settings.mutationMode === 'stroke-gradient') {
    return [
      'The effect changes with progress along the stroke.',
      'Start and end recipes blend from the first copy to the last.',
    ];
  }
  return [
    'The clean stamp sequence is rendered first.',
    'The complete local trail is then glitched as one connected region.',
  ];
}

export function ImageBrushPanel({
  initialInterfaceLevel,
  library,
  activeAssetId,
  settings,
  rack,
  seed,
  activePresetId,
  processedPreview,
  processing,
  progress,
  performance,
  onAddAssets,
  onRemoveAsset,
  onClearLibrary,
  onRemoveDemoAssets,
  onActiveAssetChange,
  onSettingsChange,
  onRackChange,
  onSeedChange,
  onPresetChange,
  onRandomize,
  randomizeNonce,
  randomizeLockSeed,
  onRandomizeLockSeedChange,
  onNewVariation,
  onOptimizeAsset,
  onRestoreDemos,
  onDownloadProcessed,
  onCopyProcessed,
  onTestStamp,
  onTestTrail,
  onCancelProcessing,
  onNotice,
}: ImageBrushPanelProps) {
  const active = library.find((asset) => asset.id === activeAssetId) ?? null;
  const previewRef = useRef<HTMLCanvasElement>(null);
  const liveStrokePreviewRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [addEffect, setAddEffect] = useState<ImageBrushFxId>('slice');
  const [contextAssetId, setContextAssetId] = useState<string | null>(null);
  const [optimizationSize, setOptimizationSize] = useState('auto');
  const [userPresets, setUserPresets] = useState<ImageBrushPreset[]>(() => loadImageBrushPresets());
  const allPresets = [...builtInImageBrushPresets, ...userPresets];
  const selectedPreset = allPresets.find((preset) => preset.id === activePresetId);
  const currentSummary = describeCurrentImageBrush(active, settings);
  const mutationCopy = mutationSummary(settings);
  const requiredFxStages = effectiveImageBrushStages(settings.fxStage, settings.mutationMode);
  const addEffectDefinition = imageBrushFxDefinitions.find((item) => item.id === addEffect);
  const addEffectCompatible = supportsImageBrushStages(addEffect, requiredFxStages);
  const enabledFx = rack.filter((item) => item.enabled);
  const estimatedCost = enabledFx.reduce<'low' | 'medium' | 'high' | 'very-high'>(
    (highest, item) => {
      const order = ['low', 'medium', 'high', 'very-high'] as const;
      const cost =
        imageBrushFxDefinitions.find((definition) => definition.id === item.effectId)?.cost ??
        'low';
      return order.indexOf(cost) > order.indexOf(highest) ? cost : highest;
    },
    'low',
  );
  const rgbAmount = enabledFx
    .filter((item) => item.effectId === 'rgb-split' || item.effectId === 'chroma-drift')
    .reduce((maximum, item) => Math.max(maximum, item.amount), 0);
  const glitchIndex =
    settings.glitchAmount === 'custom'
      ? Math.max(
          0,
          imageBrushGlitchLevels.findIndex((level) => level.id === 'strong'),
        )
      : Math.max(
          0,
          imageBrushGlitchLevels.findIndex((level) => level.id === settings.glitchAmount),
        );

  useEffect(() => {
    drawPreview(previewRef.current, active?.pixels, active?.width ?? 1, active?.height ?? 1);
  }, [active]);

  useEffect(() => {
    drawPreview(
      liveStrokePreviewRef.current,
      processedPreview?.stroke.pixels,
      processedPreview?.stroke.width ?? 1,
      processedPreview?.stroke.height ?? 1,
    );
  }, [processedPreview]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const accepted = files.filter((file) =>
        ['image/png', 'image/jpeg', 'image/webp'].includes(file.type),
      );
      if (!accepted.length) {
        onNotice('Image Brush accepts PNG, JPEG and WebP images.');
        return;
      }
      try {
        onNotice(
          `Preparing ${accepted.length} brush image${accepted.length === 1 ? '' : 's'} off the UI thread…`,
        );
        const decoded = await decodeImageBrushFilesOffThread(accepted, {
          trimTransparent: settings.trimTransparent,
          trimThreshold: settings.trimThreshold,
        });
        onAddAssets(decoded);
        onNotice(
          `${decoded.length} brush image${decoded.length === 1 ? '' : 's'} prepared locally at a responsive working resolution.`,
        );
      } catch (error) {
        onNotice(error instanceof Error ? error.message : 'Brush image decoding failed.');
      }
    },
    [onAddAssets, onNotice, settings.trimThreshold, settings.trimTransparent],
  );

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (!files.some((file) => file.type.startsWith('image/'))) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [addFiles]);

  useEffect(() => {
    if (!contextAssetId) return;
    const close = () => setContextAssetId(null);
    window.addEventListener('pointerdown', close, { once: true });
    window.addEventListener('blur', close, { once: true });
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [contextAssetId]);

  const update = <K extends keyof ImageBrushSettings>(key: K, value: ImageBrushSettings[K]) => {
    const affectsGlitch = new Set<keyof ImageBrushSettings>([
      'mutationAmount',
      'evolutionSpeed',
      'maxCorruption',
      'effectVariation',
      'seedEvolution',
      'feedbackAmount',
      'underlyingSampling',
      'decay',
      'structuralDrift',
      'fxStage',
      'alphaMode',
      'bleedAmount',
    ]).has(key);
    onSettingsChange({
      ...settings,
      [key]: value,
      glitchAmount: affectsGlitch ? 'custom' : settings.glitchAmount,
    });
    onPresetChange('custom');
  };

  const setGlitchAmount = (index: number) => {
    const level =
      imageBrushGlitchLevels[
        Math.max(0, Math.min(imageBrushGlitchLevels.length - 1, Math.round(index)))
      ]!;
    const next = applyImageBrushGlitchAmount(settings, rack, level.id, activePresetId);
    onSettingsChange(next.settings);
    onRackChange(next.rack);
  };

  const updateRack = (nextRack: ImageBrushFxItem[]) => {
    onRackChange(nextRack);
    if (settings.glitchAmount !== 'custom') {
      onSettingsChange({ ...settings, glitchAmount: 'custom' });
    }
    onPresetChange('custom');
  };

  const applyPreset = (preset: ImageBrushPreset) => {
    onSettingsChange({ ...preset.settings, customAnchor: { ...preset.settings.customAnchor } });
    onRackChange(preset.rack.map((item) => ({ ...item })));
    onPresetChange(preset.id);
    onNotice(`${preset.name} loaded without replacing the selected brush image.`);
  };

  const saveCurrentPreset = () => {
    const name = window.prompt('Image Brush preset name:', 'My Image Brush');
    if (!name?.trim()) return;
    const next: ImageBrushPreset = {
      id: `image-brush-user-${Date.now()}`,
      name: name.trim(),
      settings: { ...settings, customAnchor: { ...settings.customAnchor } },
      rack: rack.map((item) => ({ ...item })),
      custom: true,
    };
    const presets = [...userPresets, next];
    setUserPresets(presets);
    saveImageBrushPresets(presets);
    onPresetChange(next.id);
  };

  const renamePreset = () => {
    const current = userPresets.find((preset) => preset.id === activePresetId);
    if (!current) return;
    const name = window.prompt('Rename preset:', current.name);
    if (!name?.trim()) return;
    const presets = userPresets.map((preset) =>
      preset.id === current.id ? { ...preset, name: name.trim() } : preset,
    );
    setUserPresets(presets);
    saveImageBrushPresets(presets);
  };

  const deletePreset = () => {
    const current = userPresets.find((preset) => preset.id === activePresetId);
    if (!current || !window.confirm(`Delete preset "${current.name}"?`)) return;
    const presets = userPresets.filter((preset) => preset.id !== current.id);
    setUserPresets(presets);
    saveImageBrushPresets(presets);
    onPresetChange('custom');
  };

  const exportPreset = () => {
    const selected = allPresets.find((preset) => preset.id === activePresetId) ?? {
      id: 'custom',
      name: 'Custom Image Brush',
      settings,
      rack,
      custom: true,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.image-brush.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importPreset = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as ImageBrushPreset;
      if (!parsed?.settings || !Array.isArray(parsed.rack)) {
        throw new Error('Invalid Image Brush preset JSON.');
      }
      const next = { ...parsed, id: `image-brush-user-${Date.now()}`, custom: true };
      const presets = [...userPresets, next];
      setUserPresets(presets);
      saveImageBrushPresets(presets);
      applyPreset(next);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Preset import failed.');
    }
  };

  const duplicateAsset = (asset: ImageBrushAsset) => {
    onAddAssets([
      {
        ...asset,
        id: `image-brush-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${asset.name} copy`,
        fileName: `${asset.fileName.replace(/\.[^.]+$/, '')}-copy.${asset.fileName.split('.').at(-1) ?? 'png'}`,
        originalPixels: asset.originalPixels.slice(),
        pixels: asset.pixels.slice(),
        customAnchor: { ...asset.customAnchor },
        demo: false,
      },
    ]);
  };

  const customAnchorPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (settings.anchor !== 'custom') return;
    const rect = event.currentTarget.getBoundingClientRect();
    update('customAnchor', {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    });
  };

  const dropFiles = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingFiles(false);
    void addFiles([...event.dataTransfer.files]);
  };

  const workingBytes = active ? active.width * active.height * 4 : 0;
  const originalBytes = active ? active.originalWidth * active.originalHeight * 4 : 0;
  const optimizationImprovement = active && workingBytes > 0 ? originalBytes / workingBytes : 1;
  const applyOptimization = () => {
    if (!active) return;
    if (optimizationSize === 'original') {
      onOptimizeAsset(null);
      return;
    }
    const maximum =
      optimizationSize === 'auto'
        ? Math.max(
            64,
            Math.min(512, Math.pow(2, Math.ceil(Math.log2(Math.max(32, settings.size * 1.5))))),
          )
        : Number(optimizationSize);
    onOptimizeAsset(maximum);
  };

  return (
    <section
      className={`image-brush-lab image-brush-compact ${draggingFiles ? 'dragging-files' : ''}`}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
        setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
        if (event.currentTarget === event.target) setDraggingFiles(false);
      }}
      onDrop={dropFiles}
    >
      <header className="image-brush-head">
        <div>
          <span>LOCAL RGBA STAMP ENGINE</span>
          <strong>IMAGE BRUSH</strong>
          <p>Repeat and mutate raster tips along a distance-sampled path.</p>
        </div>
        <EffectIcon id="image-brush" size={28} />
      </header>

      {processing && progress && (
        <div className="image-brush-progress">
          <span>
            <EffectIcon id="image-brush" size={15} />
            <strong>{progress.phase.replace('-', ' ').toUpperCase()}</strong>
          </span>
          <i>
            <b style={{ width: `${progress.percent}%` }} />
          </i>
          <output>{progress.percent}%</output>
          {progress.detail && <small>{progress.detail}</small>}
          <button onClick={onCancelProcessing}>
            <X size={13} /> Cancel
          </button>
        </div>
      )}

      <section className="image-brush-compact-section image-brush-image-section">
        <header>
          <strong>IMAGE</strong>
          <span>{library.length} loaded</span>
        </header>
        <div className="image-brush-active-image">
          <div className="brush-checker">
            <canvas
              ref={previewRef}
              width={96}
              height={76}
              aria-label="Active brush image preview"
            />
          </div>
          <div>
            <strong>{active?.name ?? 'No brush image'}</strong>
            <span>
              {active
                ? `${active.width}×${active.height} · ${active.mimeType.replace('image/', '').toUpperCase()}`
                : 'Add PNG, JPEG or WebP'}
            </span>
            <div>
              <button
                data-tooltip="Choose another local image file."
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={12} /> {active ? 'Replace / add' : 'Add image'}
              </button>
              <button
                data-tooltip="Remove the selected brush image without changing committed canvas strokes."
                disabled={!active}
                onClick={() => active && onRemoveAsset(active.id)}
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>
        </div>
        <div className="image-brush-optimization">
          <div>
            <strong>Optimize Stamp Image</strong>
            <span>
              {active
                ? `Original ${active.originalWidth}×${active.originalHeight} / ${formatBytes(originalBytes)} · working ${active.width}×${active.height} / ${formatBytes(workingBytes)}`
                : 'Select an image to create a smaller editing buffer.'}
            </span>
            {active && optimizationImprovement > 1.01 && (
              <small>
                {optimizationImprovement.toFixed(1)}× less decoded stamp memory; the original upload
                is preserved.
              </small>
            )}
          </div>
          <label className="image-brush-select">
            <span>
              Working maximum
              <HelpButton
                helpId="image-brush.optimization"
                label="Working maximum"
                value={optimizationSize}
                options={[
                  {
                    value: 'auto',
                    label: 'Auto',
                    description:
                      'Chooses a power-of-two working size from the displayed stamp size while keeping the original upload.',
                  },
                  {
                    value: '64',
                    label: '64 px',
                    description: 'Fastest editing buffer for small stamps and expensive FX.',
                  },
                  {
                    value: '128',
                    label: '128 px',
                    description: 'Balanced working buffer for most repeated stamps.',
                  },
                  {
                    value: '256',
                    label: '256 px',
                    description: 'More source detail with higher FX and transfer cost.',
                  },
                  {
                    value: '512',
                    label: '512 px',
                    description: 'High-detail working tip for large displayed stamps.',
                  },
                  {
                    value: 'original',
                    label: 'Keep / restore original',
                    description: 'Uses the preserved uploaded pixels as the working tip.',
                  },
                ]}
              />
            </span>
            <select
              value={optimizationSize}
              onChange={(event) => setOptimizationSize(event.target.value)}
            >
              <option value="auto">Auto</option>
              <option value="64">64 px</option>
              <option value="128">128 px</option>
              <option value="256">256 px</option>
              <option value="512">512 px</option>
              <option value="original">Keep / restore original</option>
            </select>
          </label>
          <button disabled={!active} onClick={applyOptimization}>
            Optimize Stamp Image
          </button>
        </div>
        <input
          ref={fileInputRef}
          hidden
          multiple
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            void addFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        {library.length > 0 ? (
          <div className="image-brush-library-strip" aria-label="Brush image library">
            {library.map((asset) => (
              <article
                key={asset.id}
                className={asset.id === activeAssetId ? 'active' : ''}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextAssetId(asset.id);
                }}
              >
                <button
                  className="image-brush-library-select"
                  aria-label={`Select ${asset.name}`}
                  data-tooltip={`Use “${asset.name}” as the repeated brush image.`}
                  onClick={() => onActiveAssetChange(asset.id)}
                >
                  <BrushThumbnail asset={asset} />
                  <span>{asset.name}</span>
                </button>
                <button
                  className="image-brush-library-remove"
                  aria-label={`Remove ${asset.name}`}
                  data-tooltip={`Remove “${asset.name}” from this project library.`}
                  onClick={() => onRemoveAsset(asset.id)}
                >
                  <X size={11} />
                </button>
                {contextAssetId === asset.id && (
                  <div className="image-brush-library-context" role="menu">
                    <button
                      role="menuitem"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        setContextAssetId(null);
                        onRemoveAsset(asset.id);
                      }}
                    >
                      <Trash2 size={11} /> Remove image
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="image-brush-empty">
            Library is empty. Add an image or explicitly load demos.
          </div>
        )}
        <div className="image-brush-library-actions">
          <button onClick={() => fileInputRef.current?.click()}>
            <Plus size={12} /> Add image
          </button>
          <button onClick={onRestoreDemos}>
            <Sparkles size={12} /> Demo images
          </button>
          <button disabled={!library.some((asset) => asset.demo)} onClick={onRemoveDemoAssets}>
            Remove demos
          </button>
          <button disabled={!library.length} onClick={onClearLibrary}>
            <Trash2 size={12} /> Clear library
          </button>
        </div>
      </section>

      <section className="image-brush-compact-section">
        <header>
          <strong>STYLE</strong>
          <span>{selectedPreset?.name ?? 'Custom'}</span>
        </header>
        <label className="image-brush-select">
          <span>
            Style preset
            <HelpButton
              helpId="image-brush.preset"
              label="Style preset"
              value={activePresetId}
              options={[
                {
                  value: 'custom',
                  label: 'Custom',
                  description: 'Keeps the currently edited layout, mutation and Stamp FX settings.',
                },
                ...allPresets.map((preset) => ({
                  value: preset.id,
                  label: preset.name,
                  description: `Loads ${preset.name} layout, mutation, performance and Stamp FX settings without replacing the selected image.`,
                })),
              ]}
            />
          </span>
          <select
            data-help-id="image-brush.preset"
            value={activePresetId}
            onChange={(event) => {
              if (event.target.value === 'custom') {
                onPresetChange('custom');
                return;
              }
              const preset = allPresets.find((item) => item.id === event.target.value);
              if (preset) applyPreset(preset);
            }}
          >
            <option value="custom">Custom</option>
            {allPresets.map((preset) => (
              <option value={preset.id} key={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="image-brush-randomize-main"
          data-tooltip="Creates a new recipe. With Lock Seed off, every click increments the variation nonce."
          onClick={() => onRandomize('everything')}
        >
          <Shuffle size={12} /> Randomize style
        </button>
        <div className="image-brush-randomize-controls">
          <Toggle
            label="Lock Seed"
            checked={randomizeLockSeed}
            onChange={onRandomizeLockSeedChange}
          />
          <button onClick={onNewVariation}>
            <Sparkles size={12} /> New Variation
          </button>
        </div>
        <p className="image-brush-recipe-summary">
          {settings.mutationMode.replaceAll('-', ' ')} · {enabledFx.length} FX ·{' '}
          {settings.size < 64 ? 'small' : settings.size < 180 ? 'medium' : 'large'} stamps ·{' '}
          {rgbAmount < 0.25 ? 'low' : rgbAmount < 0.7 ? 'medium' : 'high'} RGB drift · variation{' '}
          {settings.effectVariation.toFixed(2)} · {estimatedCost.replace('-', ' ')} cost · seed{' '}
          {seed} / nonce {randomizeNonce}
        </p>
      </section>

      <section className="image-brush-compact-section image-brush-live-preview">
        <header>
          <strong>LIVE STROKE PREVIEW</strong>
          <span>
            {processedPreview
              ? `${processedPreview.quality} · ${processedPreview.stroke.stampCount} stamps`
              : active
                ? 'UPDATING'
                : 'IMAGE NEEDED'}
          </span>
        </header>
        <div className="image-brush-live-preview-stage brush-checker">
          <canvas
            ref={liveStrokePreviewRef}
            width={480}
            height={168}
            aria-label="Live Image Brush stroke preview"
          />
          {!active && <span>Add or select an image to preview the complete brush stroke.</span>}
        </div>
        <p>
          One bounded preview shows the current image, spacing, opacity, layout, mutation, Stamp FX,
          alpha and blend settings together. It renders off the main thread.
        </p>
        {processedPreview && (
          <small>
            {processedPreview.stroke.processingMs.toFixed(1)} ms ·{' '}
            {processedPreview.diagnostics.cacheVariants} cached variant
            {processedPreview.diagnostics.cacheVariants === 1 ? '' : 's'}
          </small>
        )}
      </section>

      <section
        className="image-brush-compact-section image-brush-essential"
        data-testid="image-brush-essential"
      >
        <header>
          <strong>ESSENTIAL CONTROLS</strong>
          <span>Always available</span>
        </header>
        <SliderField
          helpId="control.size"
          label="Size"
          value={settings.size}
          min={2}
          max={600}
          suffix=" px"
          defaultValue={96}
          onChange={(value) => update('size', value)}
        />
        <SliderField
          helpId="control.spacing"
          label="Spacing"
          value={settings.spacing}
          min={settings.spacingUnit === 'percent' ? 2 : 1}
          max={settings.spacingUnit === 'percent' ? 300 : 600}
          suffix={settings.spacingUnit === 'percent' ? '%' : ' px'}
          defaultValue={48}
          onChange={(value) => update('spacing', value)}
        />
        <SliderField
          helpId="control.opacity"
          label="Opacity"
          value={settings.opacity}
          min={0.01}
          max={1}
          step={0.01}
          defaultValue={1}
          onChange={(value) => update('opacity', value)}
        />
        <SliderField
          helpId="image-brush.glitch-amount"
          label="Glitch Amount"
          value={glitchIndex}
          min={0}
          max={imageBrushGlitchLevels.length - 1}
          step={1}
          displayValue={
            settings.glitchAmount === 'custom'
              ? 'Custom'
              : (imageBrushGlitchLevels[glitchIndex]?.label ?? 'Clean')
          }
          defaultValue={0}
          onChange={setGlitchAmount}
        />
        <SliderField
          helpId="control.variation"
          label="Variation"
          value={settings.effectVariation}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.35}
          onChange={(value) => update('effectVariation', value)}
        />
      </section>

      <section className="image-brush-compact-section image-brush-mutation-main">
        <header>
          <strong>MUTATION</strong>
          <span>{settings.mutationMode.replace('-', ' ')}</span>
        </header>
        <SelectField
          helpId="image-brush.mutation"
          label="Mutation mode"
          value={settings.mutationMode}
          onChange={(value) => update('mutationMode', value)}
          options={[
            ['clean', 'Clean Repeat'],
            ['fixed', 'Fixed Glitch'],
            ['progressive', 'Progressive Decay'],
            ['per-stamp', 'Random Per Stamp'],
            ['evolving', 'Evolving Chain'],
            ['random-stack', 'Random Effect Stack'],
            ['alternating', 'Alternating Modes'],
            ['stroke-gradient', 'Stroke Gradient'],
            ['whole-trail', 'Whole Trail Processing'],
          ]}
        />
        <div className="image-brush-mutation-summary">
          <strong>{mutationCopy[0]}</strong>
          <span>{mutationCopy[1]}</span>
        </div>
      </section>

      <section className="image-brush-current">
        <header>
          <strong>CURRENT BRUSH</strong>
          <span>{processing ? 'PROCESSING' : active ? 'READY' : 'IMAGE NEEDED'}</span>
        </header>
        {currentSummary.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div>
          <button disabled={!active || processing} onClick={onTestStamp}>
            Test stamp
          </button>
          <button disabled={!active || processing} onClick={onTestTrail}>
            Test trail
          </button>
          {processing && <button onClick={onCancelProcessing}>Cancel</button>}
        </div>
      </section>

      <section className="image-brush-compact-section">
        <header>
          <strong>STAMP FX</strong>
          <span>{rack.filter((item) => item.enabled).length} enabled</span>
        </header>
        <p className="image-brush-fx-summary">
          {rack.filter((item) => item.enabled).length
            ? rack
                .filter((item) => item.enabled)
                .map(
                  (item) =>
                    imageBrushFxDefinitions.find((definition) => definition.id === item.effectId)
                      ?.name,
                )
                .filter(Boolean)
                .join(' · ')
            : 'No Stamp FX. Clean Repeat keeps the uploaded image unchanged.'}
        </p>
        <LazyAdvancedDetails
          summary="Edit effect stack"
          className="image-brush-fx-editor"
          initiallyMounted={initialInterfaceLevel === 'advanced'}
        >
          <div className="image-brush-add-fx">
            <label className="image-brush-select">
              <span>
                Effect
                <HelpButton
                  helpId="image-brush.active-effect"
                  label="Effect"
                  value={addEffect}
                  options={imageBrushFxHelpOptions}
                />
              </span>
              <select
                value={addEffect}
                onChange={(event) => setAddEffect(event.target.value as ImageBrushFxId)}
              >
                {imageBrushFxDefinitions.map((definition) => (
                  <option
                    disabled={!supportsImageBrushStages(definition.id, requiredFxStages)}
                    key={definition.id}
                    value={definition.id}
                  >
                    {definition.name} В· {imageBrushStageLabel(definition.imageBrushStages)}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!addEffectCompatible}
              onClick={() => updateRack([...rack, createImageBrushFx(addEffect)])}
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {addEffectDefinition && !addEffectCompatible && (
            <p className="image-brush-compatibility-warning">
              {addEffectDefinition.name} supports{' '}
              {imageBrushStageLabel(addEffectDefinition.imageBrushStages)}; the current workflow
              requires {imageBrushStageLabel(requiredFxStages)}.
            </p>
          )}
          <div className="image-brush-fx-rack">
            {rack.map((item, index) => {
              const definition = imageBrushFxDefinitions.find(
                (entry) => entry.id === item.effectId,
              )!;
              const tooSmall = active
                ? Math.min(active.width, active.height) < definition.minSize
                : true;
              const incompatible = !supportsImageBrushStages(item.effectId, requiredFxStages);
              const unavailable = tooSmall || incompatible;
              return (
                <article
                  key={item.id}
                  className={`${item.enabled ? '' : 'bypassed'} ${unavailable ? 'unavailable' : ''}`}
                >
                  <header>
                    <span className="fx-order">{String(index + 1).padStart(2, '0')}</span>
                    <EffectIcon id={fxIcons[item.effectId]} size={14} />
                    <span>
                      <strong>{definition.name}</strong>
                      <small>{definition.cost} cost</small>
                    </span>
                    <Toggle
                      label=""
                      checked={item.enabled && !unavailable}
                      disabled={unavailable}
                      onChange={(enabled) =>
                        updateRack(
                          rack.map((entry) =>
                            entry.id === item.id ? { ...entry, enabled } : entry,
                          ),
                        )
                      }
                    />
                    <button
                      aria-label={`Remove ${definition.name}`}
                      onClick={() => updateRack(rack.filter((entry) => entry.id !== item.id))}
                    >
                      <X size={11} />
                    </button>
                  </header>
                  <div>
                    {incompatible && (
                      <p className="image-brush-compatibility-warning">
                        Disabled: this effect supports{' '}
                        {imageBrushStageLabel(definition.imageBrushStages)}, while the current
                        workflow requires {imageBrushStageLabel(requiredFxStages)}.
                      </p>
                    )}
                    <div className="image-brush-fx-levels">
                      {Object.entries(imageBrushFxLevelAmount).map(([level, amount]) => (
                        <button
                          key={level}
                          onClick={() =>
                            updateRack(
                              rack.map((entry) =>
                                entry.id === item.id ? { ...entry, amount } : entry,
                              ),
                            )
                          }
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <SliderField
                      label="Amount"
                      value={item.amount}
                      min={0.01}
                      max={1}
                      step={0.01}
                      onChange={(amount) =>
                        updateRack(
                          rack.map((entry) =>
                            entry.id === item.id ? { ...entry, amount } : entry,
                          ),
                        )
                      }
                    />
                    <SliderField
                      label="Mix"
                      value={item.mix}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(mix) =>
                        updateRack(
                          rack.map((entry) => (entry.id === item.id ? { ...entry, mix } : entry)),
                        )
                      }
                    />
                    <div className="image-brush-fx-order">
                      <button
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...rack];
                          [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                          updateRack(next);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        disabled={index === rack.length - 1}
                        onClick={() => {
                          const next = [...rack];
                          [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                          updateRack(next);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {!rack.length && (
              <div className="image-brush-empty">Add an effect to build a Stamp FX stack.</div>
            )}
          </div>
        </LazyAdvancedDetails>
      </section>

      <div className="image-brush-advanced-label">ADVANCED</div>

      <LazyAdvancedDetails
        summary="Stamp Layout"
        initiallyMounted={initialInterfaceLevel === 'advanced'}
      >
        <SelectField
          label="Brush mode"
          value={settings.mode}
          onChange={(value) => update('mode', value)}
          options={[
            ['stamp', 'Stamp'],
            ['trail', 'Trail'],
            ['scatter', 'Scatter'],
            ['sequence', 'Sequence'],
            ['random-hose', 'Random Hose'],
          ]}
        />
        <SelectField
          label="Spacing unit"
          value={settings.spacingUnit}
          onChange={(value) => update('spacingUnit', value)}
          options={[
            ['percent', '% width'],
            ['pixels', 'Pixels'],
          ]}
        />
        <SliderField
          label="Flow"
          value={settings.flow}
          min={0.01}
          max={1}
          step={0.01}
          defaultValue={1}
          onChange={(value) => update('flow', value)}
        />
        <SliderField
          label="Angle"
          value={settings.angle}
          min={-180}
          max={180}
          suffix="°"
          defaultValue={0}
          onChange={(value) => update('angle', value)}
        />
        <SelectField
          label="Rotation mode"
          value={settings.rotationMode}
          onChange={(value) => update('rotationMode', value)}
          options={[
            ['fixed', 'Fixed'],
            ['follow', 'Follow Stroke'],
            ['perpendicular', 'Perpendicular'],
            ['random', 'Random'],
            ['alternate', 'Alternate'],
            ['spin', 'Spin Along Stroke'],
          ]}
        />
        <SliderField
          label="Rotation jitter"
          value={settings.rotationJitter}
          min={0}
          max={180}
          suffix="°"
          defaultValue={0}
          onChange={(value) => update('rotationJitter', value)}
        />
        <SliderField
          label="Scale jitter"
          value={settings.scaleJitter}
          min={0}
          max={0.95}
          step={0.01}
          defaultValue={0}
          onChange={(value) => update('scaleJitter', value)}
        />
        {(settings.mode === 'scatter' || settings.mode === 'random-hose') && (
          <>
            <SliderField
              label="X scatter"
              value={settings.scatterX}
              min={0}
              max={3}
              step={0.01}
              defaultValue={0}
              onChange={(value) => update('scatterX', value)}
            />
            <SliderField
              label="Y scatter"
              value={settings.scatterY}
              min={0}
              max={3}
              step={0.01}
              defaultValue={0}
              onChange={(value) => update('scatterY', value)}
            />
            <SliderField
              label="Opacity jitter"
              value={settings.opacityJitter}
              min={0}
              max={0.95}
              step={0.01}
              defaultValue={0}
              onChange={(value) => update('opacityJitter', value)}
            />
            <SliderField
              label="Flip X chance"
              value={settings.flipXChance}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0}
              onChange={(value) => update('flipXChance', value)}
            />
            <SliderField
              label="Flip Y chance"
              value={settings.flipYChance}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0}
              onChange={(value) => update('flipYChance', value)}
            />
            <SliderField
              label="Stamps per step"
              value={settings.stampsPerStep}
              min={1}
              max={8}
              step={1}
              defaultValue={1}
              onChange={(value) => update('stampsPerStep', value)}
            />
          </>
        )}
        <SliderField
          label="Edge softness"
          value={settings.edgeSoftness}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0}
          onChange={(value) => update('edgeSoftness', value)}
        />
        <SliderField
          label="Stroke smoothing"
          value={settings.smoothing}
          min={0}
          max={0.9}
          step={0.01}
          defaultValue={0.25}
          onChange={(value) => update('smoothing', value)}
        />
        <SelectField
          label="Anchor"
          value={settings.anchor}
          onChange={(value) => update('anchor', value)}
          options={[
            ['center', 'Center'],
            ['top', 'Top'],
            ['bottom', 'Bottom'],
            ['left', 'Left'],
            ['right', 'Right'],
            ['custom', 'Custom'],
          ]}
        />
        {settings.anchor === 'custom' && (
          <div
            className="image-brush-custom-anchor"
            data-tooltip="Drag here to set the point that attaches the image to the path."
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              customAnchorPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                customAnchorPointer(event);
            }}
          >
            <i
              style={{
                left: `${settings.customAnchor.x * 100}%`,
                top: `${settings.customAnchor.y * 100}%`,
              }}
            />
          </div>
        )}
        <div className="image-brush-toggle-grid">
          <Toggle
            label="Follow direction"
            checked={settings.followDirection}
            onChange={(value) => update('followDirection', value)}
          />
          <Toggle
            label="Show stamp outline"
            checked={settings.showOutline}
            onChange={(value) => update('showOutline', value)}
          />
        </div>
      </LazyAdvancedDetails>

      <LazyAdvancedDetails
        summary="Mutation"
        initiallyMounted={initialInterfaceLevel === 'advanced'}
      >
        <SelectField
          helpId="image-brush.fx-stage"
          label="Processing stage"
          value={settings.fxStage}
          onChange={(value) => update('fxStage', value)}
          options={[
            ['before', 'Brush Tip'],
            ['each', 'Every Stamp'],
            ['after', 'Whole Trail'],
            ['before-after', 'Tip + Trail'],
          ]}
        />
        <p className="image-brush-inline-note">
          {imageBrushFxStageCopy[settings.fxStage].description}
        </p>
        {settings.mutationMode !== 'clean' && (
          <SliderField
            label="Mutation amount"
            value={settings.mutationAmount}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.45}
            onChange={(value) => update('mutationAmount', value)}
          />
        )}
        {settings.mutationMode === 'progressive' && (
          <>
            <SliderField
              helpId="control.start-glitch"
              label="Start Damage"
              value={settings.progressiveStart}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.08}
              onChange={(value) => update('progressiveStart', value)}
            />
            <SliderField
              helpId="control.end-glitch"
              label="End Damage"
              value={settings.progressiveEnd}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.92}
              onChange={(value) => update('progressiveEnd', value)}
            />
            <SelectField
              helpId="image-brush.evolution-curve"
              label="Progression curve"
              value={settings.evolutionCurve}
              onChange={(value) => update('evolutionCurve', value)}
              options={[
                ['constant', 'Constant'],
                ['linear', 'Linear'],
                ['ease-in', 'Ease In'],
                ['ease-out', 'Ease Out'],
                ['exponential', 'Exponential'],
                ['pulse', 'Pulse'],
                ['random-walk', 'Random Walk'],
              ]}
            />
            <SliderField
              label="Decay speed"
              value={settings.evolutionSpeed}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.45}
              onChange={(value) => update('evolutionSpeed', value)}
            />
            <SliderField
              label="Maximum Damage"
              value={settings.maxCorruption}
              min={0.05}
              max={1}
              step={0.01}
              defaultValue={0.82}
              onChange={(value) => update('maxCorruption', value)}
            />
            <SliderField
              label="Progressive key variants"
              value={settings.variantCount}
              min={2}
              max={24}
              step={1}
              defaultValue={8}
              onChange={(value) => update('variantCount', value)}
            />
            <Toggle
              label="Reset Each Stroke"
              checked={settings.resetEachStroke}
              onChange={(value) => update('resetEachStroke', value)}
            />
          </>
        )}
        {settings.mutationMode === 'per-stamp' && (
          <>
            <SliderField
              label="Variant pool"
              value={settings.variantCount}
              min={1}
              max={32}
              step={1}
              defaultValue={8}
              onChange={(value) => update('variantCount', value)}
            />
            <SliderField
              helpId="control.minimum-effects-per-stamp"
              label="Minimum Effects"
              value={settings.minimumEffects}
              min={1}
              max={10}
              step={1}
              defaultValue={1}
              onChange={(value) => update('minimumEffects', value)}
            />
            <SliderField
              helpId="control.maximum-effects-per-stamp"
              label="Maximum Effects"
              value={settings.maximumEffects}
              min={1}
              max={10}
              step={1}
              defaultValue={3}
              onChange={(value) => update('maximumEffects', value)}
            />
            <SliderField
              helpId="control.effect-variation"
              label="Diversity"
              value={settings.effectVariation}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.35}
              onChange={(value) => update('effectVariation', value)}
            />
            <div className="image-brush-effect-pool">
              <span>EFFECT POOL</span>
              {imageBrushFxDefinitions
                .filter((definition) => definition.imageBrushStages.includes('stamp'))
                .map((definition) => (
                  <button
                    className={settings.effectPool.includes(definition.id) ? 'active' : ''}
                    key={definition.id}
                    onClick={() =>
                      update(
                        'effectPool',
                        settings.effectPool.includes(definition.id)
                          ? settings.effectPool.filter((id) => id !== definition.id)
                          : [...settings.effectPool, definition.id],
                      )
                    }
                  >
                    {definition.name}
                  </button>
                ))}
            </div>
            <div className="image-brush-toggle-grid">
              <Toggle
                helpId="image-brush.lock-effect-pool"
                label="Use Current FX as Pool"
                checked={settings.lockEffectPool}
                onChange={(value) => update('lockEffectPool', value)}
              />
              <Toggle
                label="Allow repeated combinations"
                checked={settings.allowRepeatedCombinations}
                onChange={(value) => update('allowRepeatedCombinations', value)}
              />
            </div>
          </>
        )}
        {settings.mutationMode === 'evolving' && (
          <>
            <SliderField
              label="Mutation step"
              value={settings.evolutionSpeed}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.45}
              onChange={(value) => update('evolutionSpeed', value)}
            />
            <SliderField
              helpId="control.previous-stamp-carry"
              label="Previous stamp carry"
              value={settings.accumulation}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.68}
              onChange={(value) => update('accumulation', value)}
            />
            <SliderField
              label="Recovery"
              value={settings.recovery}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.08}
              onChange={(value) => update('recovery', value)}
            />
            <SliderField
              label="Maximum damage"
              value={settings.maxCorruption}
              min={0.05}
              max={1}
              step={0.01}
              defaultValue={0.82}
              onChange={(value) => update('maxCorruption', value)}
            />
            <SliderField
              label="Structural drift"
              value={settings.structuralDrift}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.24}
              onChange={(value) => update('structuralDrift', value)}
            />
            <SliderField
              label="Chroma drift"
              value={settings.chromaDrift}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.18}
              onChange={(value) => update('chromaDrift', value)}
            />
            <SliderField
              label="Alpha stability"
              value={settings.alphaStability}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.88}
              onChange={(value) => update('alphaStability', value)}
            />
          </>
        )}
        {settings.mutationMode === 'random-stack' && (
          <>
            <SliderField
              label="Minimum stack effects"
              value={settings.stackMinimumEffects}
              min={1}
              max={10}
              step={1}
              defaultValue={2}
              onChange={(value) => update('stackMinimumEffects', value)}
            />
            <SliderField
              label="Maximum stack effects"
              value={settings.stackMaximumEffects}
              min={1}
              max={10}
              step={1}
              defaultValue={4}
              onChange={(value) => update('stackMaximumEffects', value)}
            />
            <SliderField
              label="Minimum effect strength"
              value={settings.stackMinimumStrength}
              min={0.01}
              max={1}
              step={0.01}
              defaultValue={0.22}
              onChange={(value) => update('stackMinimumStrength', value)}
            />
            <SliderField
              label="Maximum effect strength"
              value={settings.stackMaximumStrength}
              min={0.01}
              max={1}
              step={0.01}
              defaultValue={0.86}
              onChange={(value) => update('stackMaximumStrength', value)}
            />
            <SliderField
              label="Visual coherence"
              value={settings.visualCoherence}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.52}
              onChange={(value) => update('visualCoherence', value)}
            />
            <Toggle
              label="Randomize effect order"
              checked={settings.stackRandomOrder}
              onChange={(value) => update('stackRandomOrder', value)}
            />
          </>
        )}
        {settings.mutationMode === 'alternating' && (
          <>
            <SelectField
              label="Recipe A"
              value={settings.recipeA}
              onChange={(value) => update('recipeA', value)}
              options={mutationRecipeOptions}
            />
            <SelectField
              label="Recipe B"
              value={settings.recipeB}
              onChange={(value) => update('recipeB', value)}
              options={mutationRecipeOptions}
            />
            <SliderField
              label="Alternating interval"
              value={settings.alternatingInterval}
              min={1}
              max={16}
              step={1}
              defaultValue={1}
              onChange={(value) => update('alternatingInterval', value)}
            />
            <SliderField
              label="Transition blend"
              value={settings.transitionBlend}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0}
              onChange={(value) => update('transitionBlend', value)}
            />
            <Toggle
              label="Random alternation"
              checked={settings.randomAlternation}
              onChange={(value) => update('randomAlternation', value)}
            />
          </>
        )}
        {settings.mutationMode === 'stroke-gradient' && (
          <>
            <SelectField
              label="Start recipe"
              value={settings.gradientStart}
              onChange={(value) => update('gradientStart', value)}
              options={mutationRecipeOptions}
            />
            <SelectField
              label="End recipe"
              value={settings.gradientEnd}
              onChange={(value) => update('gradientEnd', value)}
              options={mutationRecipeOptions}
            />
            <SelectField
              helpId="image-brush.evolution-curve"
              label="Progression curve"
              value={settings.evolutionCurve}
              onChange={(value) => update('evolutionCurve', value)}
              options={[
                ['constant', 'Constant'],
                ['linear', 'Linear'],
                ['ease-in', 'Ease In'],
                ['ease-out', 'Ease Out'],
                ['exponential', 'Exponential'],
                ['pulse', 'Pulse'],
                ['random-walk', 'Random Walk'],
              ]}
            />
          </>
        )}
        {settings.mutationMode === 'whole-trail' && (
          <>
            <p className="image-brush-inline-note">
              Trail FX:{' '}
              {rack
                .filter((item) => item.enabled)
                .map(
                  (item) =>
                    imageBrushFxDefinitions.find((definition) => definition.id === item.effectId)
                      ?.name,
                )
                .filter(Boolean)
                .join(' В· ') || 'none selected'}
              . The local stamp layer is built clean, then this compatible rack processes it once.
            </p>
            <SliderField
              label="Spill"
              value={settings.structuralDrift}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.24}
              onChange={(value) => update('structuralDrift', value)}
            />
            <SliderField
              label="Trail Mix"
              value={settings.mutationAmount}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.45}
              onChange={(value) => update('mutationAmount', value)}
            />
            <SelectField
              helpId="control.rendering-quality"
              label="Processing Quality"
              value={settings.renderingQuality}
              onChange={(value) => update('renderingQuality', value)}
              options={[
                ['auto', 'Auto'],
                ['realtime', 'Realtime'],
                ['balanced', 'Balanced'],
                ['high', 'High'],
              ]}
            />
          </>
        )}
        {settings.mutationMode === 'evolving' && (
          <Toggle
            label="Continue mutation between strokes"
            checked={settings.continueBetweenStrokes}
            onChange={(value) => update('continueBetweenStrokes', value)}
          />
        )}
        <div className="image-brush-seed">
          <label>
            <span>SEED</span>
            <input value={seed} onChange={(event) => onSeedChange(event.target.value)} />
          </label>
          <button
            onClick={() =>
              onSeedChange(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`)
            }
          >
            <Shuffle size={12} />
          </button>
          <button
            onClick={() =>
              navigator.clipboard.writeText(seed).then(
                () => onNotice('Image Brush seed copied.'),
                () => onNotice('Clipboard API unavailable.'),
              )
            }
          >
            <Clipboard size={12} />
          </button>
        </div>
      </LazyAdvancedDetails>

      <LazyAdvancedDetails
        summary="Whole Trail FX"
        initiallyMounted={initialInterfaceLevel === 'advanced'}
      >
        <p className="image-brush-inline-note">
          Whole Trail and Tip + Trail process one connected local stroke region after placement.
        </p>
        <SelectField
          helpId="image-brush.fx-stage"
          label="Processing stage"
          value={settings.fxStage}
          onChange={(value) => update('fxStage', value)}
          options={[
            ['before', 'Brush Tip'],
            ['each', 'Every Stamp'],
            ['after', 'Whole Trail'],
            ['before-after', 'Tip + Trail'],
          ]}
        />
        <SliderField
          label="Structural drift"
          value={settings.structuralDrift}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.24}
          onChange={(value) => update('structuralDrift', value)}
        />
      </LazyAdvancedDetails>

      <LazyAdvancedDetails
        summary="Alpha and Blending"
        initiallyMounted={initialInterfaceLevel === 'advanced'}
      >
        <SelectField
          label="Alpha mode"
          value={settings.alphaMode}
          onChange={(value) => update('alphaMode', value)}
          options={[
            ['preserve', 'Preserve Alpha'],
            ['inside', 'Glitch Inside Alpha'],
            ['bleed', 'Alpha Bleed'],
            ['corrupt', 'Corrupt Alpha'],
          ]}
        />
        {settings.alphaMode === 'bleed' && (
          <SliderField
            label="Bleed amount"
            value={settings.bleedAmount}
            min={1}
            max={32}
            suffix=" px"
            defaultValue={4}
            onChange={(value) => update('bleedAmount', value)}
          />
        )}
        <SelectField
          label="Blend mode"
          value={settings.blendMode}
          onChange={(value) => update('blendMode', value)}
          options={[
            ['normal', 'Normal'],
            ['multiply', 'Multiply'],
            ['screen', 'Screen'],
            ['overlay', 'Overlay'],
            ['difference', 'Difference'],
            ['lighten', 'Lighten'],
            ['darken', 'Darken'],
            ['hard-light', 'Hard Light'],
            ['color-dodge', 'Color Dodge'],
            ['exclusion', 'Exclusion'],
          ]}
        />
        <div className="image-brush-toggle-grid">
          <Toggle
            label="Trim transparent margins"
            checked={settings.trimTransparent}
            onChange={(value) => update('trimTransparent', value)}
          />
          <Toggle
            label="Preview before commit"
            checked={settings.previewStroke}
            onChange={(value) => update('previewStroke', value)}
          />
        </div>
        {settings.trimTransparent && (
          <SliderField
            label="Alpha threshold"
            value={settings.trimThreshold}
            min={0}
            max={64}
            step={1}
            defaultValue={2}
            onChange={(value) => update('trimThreshold', value)}
          />
        )}
      </LazyAdvancedDetails>

      <LazyAdvancedDetails
        summary="Pressure"
        initiallyMounted={initialInterfaceLevel === 'advanced'}
      >
        <div className="image-brush-toggle-grid">
          <Toggle
            label="Pressure → size"
            checked={settings.pressureSize}
            onChange={(value) => update('pressureSize', value)}
          />
          <Toggle
            label="Pressure → opacity"
            checked={settings.pressureOpacity}
            onChange={(value) => update('pressureOpacity', value)}
          />
          <Toggle
            label="Pressure → spacing"
            checked={settings.pressureSpacing}
            onChange={(value) => update('pressureSpacing', value)}
          />
        </div>
        {settings.pressureSize && (
          <SliderField
            label="Minimum pressure size"
            value={settings.minPressureSize}
            min={0.02}
            max={1}
            step={0.01}
            defaultValue={0.2}
            onChange={(value) => update('minPressureSize', value)}
          />
        )}
        {settings.pressureOpacity && (
          <SliderField
            label="Minimum pressure opacity"
            value={settings.minPressureOpacity}
            min={0.02}
            max={1}
            step={0.01}
            defaultValue={0.2}
            onChange={(value) => update('minPressureOpacity', value)}
          />
        )}
      </LazyAdvancedDetails>

      <LazyAdvancedDetails
        summary="Performance"
        initiallyMounted={initialInterfaceLevel === 'advanced'}
      >
        <SelectField
          helpId="control.rendering-quality"
          label="Rendering quality"
          value={settings.renderingQuality}
          onChange={(value) => update('renderingQuality', value)}
          options={[
            ['auto', 'Auto'],
            ['realtime', 'Realtime'],
            ['balanced', 'Balanced'],
            ['high', 'High'],
          ]}
        />
        <SliderField
          label="Live stamps / frame"
          value={settings.maxLiveStampsPerFrame}
          min={1}
          max={64}
          step={1}
          defaultValue={24}
          onChange={(value) => update('maxLiveStampsPerFrame', value)}
        />
        <SliderField
          label="Maximum generated stamps"
          value={settings.maxGeneratedStamps}
          min={100}
          max={20000}
          step={100}
          defaultValue={5000}
          onChange={(value) => update('maxGeneratedStamps', value)}
        />
        <SliderField
          label="Maximum cached variants"
          value={settings.maxCachedVariants}
          min={1}
          max={64}
          step={1}
          defaultValue={16}
          onChange={(value) => update('maxCachedVariants', value)}
        />
        {(settings.mutationMode === 'evolving' || settings.mutationMode === 'progressive') && (
          <SliderField
            label="Evolving preview variants"
            value={settings.maxLiveFxIterations}
            min={1}
            max={8}
            step={1}
            defaultValue={3}
            onChange={(value) => update('maxLiveFxIterations', value)}
          />
        )}
        {processedPreview && (
          <dl className="image-brush-compact-diagnostics">
            <dt>Tip preview</dt>
            <dd>
              {processedPreview.quality} · {processedPreview.diagnostics.processingMs.toFixed(1)} ms
            </dd>
            <dt>Difference</dt>
            <dd>{processedPreview.diagnostics.differencePercent.toFixed(2)}%</dd>
            <dt>Variants</dt>
            <dd>
              {processedPreview.diagnostics.cacheVariants} ·{' '}
              {formatBytes(processedPreview.diagnostics.cacheBytes)}
            </dd>
          </dl>
        )}
        {performance && (
          <dl className="image-brush-compact-diagnostics">
            <dt>Generated</dt>
            <dd>
              {performance.stampsGenerated} path · {performance.renderedStamps} rendered
            </dd>
            <dt>First feedback</dt>
            <dd>{performance.firstFeedbackMs.toFixed(1)} ms</dd>
            <dt>Live frame max</dt>
            <dd>{performance.maxLiveFrameMs.toFixed(1)} ms</dd>
            <dt>Commit</dt>
            <dd>{performance.pointerUpCommitMs.toFixed(1)} ms</dd>
            <dt>Worker transfer</dt>
            <dd>
              {formatBytes(performance.workerTransferOutBytes)} out ·{' '}
              {formatBytes(performance.workerTransferInBytes)} in
            </dd>
            <dt>React / Worker</dt>
            <dd>
              {performance.reactRenders} renders · {performance.workerJobsStarted} job(s)
            </dd>
            <dt>Full document</dt>
            <dd>{performance.fullDocumentCopies}</dd>
          </dl>
        )}
      </LazyAdvancedDetails>

      <LazyAdvancedDetails
        summary="Library and Project"
        initiallyMounted={initialInterfaceLevel === 'advanced'}
      >
        <div className="image-brush-library-project-actions">
          <button disabled={!active} onClick={() => active && duplicateAsset(active)}>
            <Copy size={12} /> Duplicate image
          </button>
          <button disabled={!active} onClick={onDownloadProcessed}>
            <Download size={12} /> Download tip
          </button>
          <button disabled={!active} onClick={onCopyProcessed}>
            <Clipboard size={12} /> Copy tip
          </button>
          <button onClick={saveCurrentPreset}>
            <Save size={12} /> Save preset
          </button>
          <button
            disabled={!userPresets.some((preset) => preset.id === activePresetId)}
            onClick={renamePreset}
          >
            Rename preset
          </button>
          <button
            disabled={!userPresets.some((preset) => preset.id === activePresetId)}
            onClick={deletePreset}
          >
            Delete preset
          </button>
          <button onClick={exportPreset}>
            <FileDown size={12} /> Export preset
          </button>
          <button onClick={() => presetInputRef.current?.click()}>
            <FileUp size={12} /> Import preset
          </button>
          <input
            ref={presetInputRef}
            hidden
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importPreset(file);
              event.target.value = '';
            }}
          />
        </div>
        <div className="image-brush-randomizers">
          <button onClick={() => onRandomize('layout')}>Randomize Layout</button>
          <button onClick={() => onRandomize('mutation')}>Randomize Mutation</button>
          <button onClick={() => onRandomize('fx')}>Randomize FX</button>
          <button onClick={() => onRandomize('everything')}>
            <Zap size={11} /> Randomize Everything
          </button>
        </div>
      </LazyAdvancedDetails>

      <footer className="image-brush-reset">
        <button
          onClick={() => {
            onRackChange([]);
            onPresetChange('custom');
            onNotice('Stamp FX rack cleared. The selected image was preserved.');
          }}
        >
          <Trash2 size={12} /> Clear FX
        </button>
        <button onClick={() => applyPreset(builtInImageBrushPresets[0]!)}>
          <RefreshCcw size={12} /> Reset controls
        </button>
      </footer>
    </section>
  );
}
