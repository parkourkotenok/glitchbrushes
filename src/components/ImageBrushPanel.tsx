import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Copy,
  ChevronDown,
  FileDown,
  FileUp,
  ImagePlus,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Save,
  Shuffle,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { imageBrushFxLevelAmount } from '../imageBrush/performance';
import {
  builtInImageBrushPresets,
  loadImageBrushPresets,
  saveImageBrushPresets,
  type ImageBrushRandomizeScope,
} from '../imageBrush/presets';
import {
  applyImageBrushGlitchAmount,
  applyImageBrushStyleKeepingEssentials,
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
import { performanceDiagnosticsEnabled } from '../utils/performance';
import { helpSlug } from '../help/registry';
import type { ControlHelpOption } from '../help/types';
import { EffectIcon } from '../icons/effects';
import { HelpButton } from './HelpButton';
import { ImageBrushEssentialControls } from './ImageBrushEssentialControls';
import { SliderField } from './SliderField';
import {
  effectiveImageBrushStages,
  imageBrushStageLabel,
  supportsImageBrushStages,
} from '../effects/sharedRegistry';
import { decodeImageBrushFilesOffThread } from '../imageBrush/decode';

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
  onActiveAssetChange(id: string | null): void;
  onSettingsChange(settings: ImageBrushSettings): void;
  onRackChange(rack: ImageBrushFxItem[]): void;
  onSeedChange(seed: string): void;
  onPresetChange(id: string): void;
  onRandomize(scope: ImageBrushRandomizeScope): void;
  randomizeLockSeed: boolean;
  onRandomizeLockSeedChange(locked: boolean): void;
  onOptimizeAsset(maximumDimension: number | null): void;
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
  'pixel-embroidery': 'pixel-embroidery',
  'xerox-decay': 'xerox-decay',
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

type ImageBrushTab = 'placement' | 'evolution' | 'fx';

function useDismissiblePopover(
  open: boolean,
  setOpen: (open: boolean) => void,
  triggerRef: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const close = (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(true);
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>('button, select, input')?.focus(),
    );
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, panelRef, setOpen, triggerRef]);
}

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
  ariaLabel,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
  helpId?: string;
  ariaLabel?: string;
}) {
  const resolvedHelpId = helpId ?? `image-brush.${helpSlug(label || 'toggle')}`;
  return (
    <label className="image-brush-toggle">
      <input
        data-tooltip-id={resolvedHelpId}
        data-tooltip-label={label}
        type="checkbox"
        aria-label={ariaLabel}
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
  onActiveAssetChange,
  onSettingsChange,
  onRackChange,
  onSeedChange,
  onPresetChange,
  onRandomize,
  randomizeLockSeed,
  onRandomizeLockSeedChange,
  onOptimizeAsset,
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
  const tabsId = useId();
  const sourceTriggerRef = useRef<HTMLButtonElement>(null);
  const sourcePopoverRef = useRef<HTMLDivElement>(null);
  const assetMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const assetMenuRef = useRef<HTMLDivElement>(null);
  const styleMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const randomizeTriggerRef = useRef<HTMLButtonElement>(null);
  const randomizeMenuRef = useRef<HTMLDivElement>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [randomizeMenuOpen, setRandomizeMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ImageBrushTab>(() => {
    if (typeof sessionStorage === 'undefined') return 'placement';
    const saved = sessionStorage.getItem('glitchbrushes:image-brush-tab');
    return saved === 'evolution' || saved === 'fx' ? saved : 'placement';
  });
  const [addEffect, setAddEffect] = useState<ImageBrushFxId>('slice');
  const [optimizationSize, setOptimizationSize] = useState('auto');
  const [userPresets, setUserPresets] = useState<ImageBrushPreset[]>(() => loadImageBrushPresets());
  const diagnosticsEnabled = performanceDiagnosticsEnabled();
  const allPresets = [...builtInImageBrushPresets, ...userPresets];
  const selectedPreset = allPresets.find((preset) => preset.id === activePresetId);
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

  useDismissiblePopover(sourcePickerOpen, setSourcePickerOpen, sourceTriggerRef, sourcePopoverRef);
  useDismissiblePopover(assetMenuOpen, setAssetMenuOpen, assetMenuTriggerRef, assetMenuRef);
  useDismissiblePopover(styleMenuOpen, setStyleMenuOpen, styleMenuTriggerRef, styleMenuRef);
  useDismissiblePopover(
    randomizeMenuOpen,
    setRandomizeMenuOpen,
    randomizeTriggerRef,
    randomizeMenuRef,
  );

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem('glitchbrushes:image-brush-tab', activeTab);
  }, [activeTab]);

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
    const styled = applyImageBrushStyleKeepingEssentials(
      settings,
      {
        ...preset.settings,
        customAnchor: { ...preset.settings.customAnchor },
      },
      preset.rack,
      preset.id,
    );
    onSettingsChange(styled.settings);
    onRackChange(styled.rack);
    onPresetChange(preset.id);
    onNotice(`${preset.name} loaded. Essential size, spacing, opacity and orientation were kept.`);
  };

  const saveCurrentPreset = () => {
    const name = window.prompt('Style name:', 'My Image Brush');
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
    const name = window.prompt('Rename style:', current.name);
    if (!name?.trim()) return;
    const presets = userPresets.map((preset) =>
      preset.id === current.id ? { ...preset, name: name.trim() } : preset,
    );
    setUserPresets(presets);
    saveImageBrushPresets(presets);
  };

  const deletePreset = () => {
    const current = userPresets.find((preset) => preset.id === activePresetId);
    if (!current || !window.confirm(`Delete style "${current.name}"?`)) return;
    const presets = userPresets.filter((preset) => preset.id !== current.id);
    setUserPresets(presets);
    saveImageBrushPresets(presets);
    onPresetChange('custom');
  };

  const exportPreset = () => {
    const selected = allPresets.find((preset) => preset.id === activePresetId) ?? {
      id: 'custom',
      name: 'Custom Image Brush Style',
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
        throw new Error('Invalid Image Brush style JSON.');
      }
      const next = { ...parsed, id: `image-brush-user-${Date.now()}`, custom: true };
      const presets = [...userPresets, next];
      setUserPresets(presets);
      saveImageBrushPresets(presets);
      applyPreset(next);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Style import failed.');
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
        <strong>Image Brush</strong>
        <EffectIcon id="image-brush" size={22} aria-hidden="true" />
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

      <section className="image-brush-compact-section image-brush-source-section">
        <header>
          <strong>Source</strong>
          <span>
            {library.length} image{library.length === 1 ? '' : 's'}
          </span>
        </header>
        <div className="image-brush-source-row">
          <div className="brush-checker image-brush-source-thumbnail">
            <canvas
              ref={previewRef}
              width={72}
              height={58}
              aria-label="Active brush image preview"
            />
          </div>
          <div className="image-brush-source-copy">
            <strong>{active?.name ?? 'No brush image'}</strong>
            <span>{active ? `${active.width}×${active.height}` : 'PNG, JPEG or WebP'}</span>
          </div>
          <button
            ref={sourceTriggerRef}
            className="image-brush-source-choose"
            aria-expanded={sourcePickerOpen}
            aria-haspopup="dialog"
            onClick={() => setSourcePickerOpen((value) => !value)}
          >
            Choose
          </button>
          <button
            ref={assetMenuTriggerRef}
            className="icon-button"
            aria-label="Source image actions"
            aria-expanded={assetMenuOpen}
            aria-haspopup="dialog"
            onClick={() => setAssetMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </div>
        {sourcePickerOpen && (
          <div
            ref={sourcePopoverRef}
            className="image-brush-popover image-brush-source-popover"
            role="dialog"
            aria-label="Choose brush image"
          >
            <div className="image-brush-library-strip" aria-label="Brush image library">
              {library.map((asset) => (
                <button
                  key={asset.id}
                  className={`image-brush-library-select ${asset.id === activeAssetId ? 'active' : ''}`}
                  aria-pressed={asset.id === activeAssetId}
                  onClick={() => {
                    onActiveAssetChange(asset.id);
                    setSourcePickerOpen(false);
                    requestAnimationFrame(() => sourceTriggerRef.current?.focus());
                  }}
                >
                  <BrushThumbnail asset={asset} />
                  <span>{asset.name}</span>
                </button>
              ))}
            </div>
            {!library.length && <p className="image-brush-empty">Preparing the astronaut demo…</p>}
            <div className="image-brush-popover-actions">
              <button onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={13} aria-hidden="true" /> Add image
              </button>
              <button
                className="danger"
                disabled={!library.some((asset) => !asset.demo)}
                onClick={onClearLibrary}
              >
                Clear custom images
              </button>
            </div>
          </div>
        )}
        {assetMenuOpen && (
          <div
            ref={assetMenuRef}
            className="image-brush-popover image-brush-menu"
            role="dialog"
            aria-label="Source image actions"
          >
            <button
              disabled={!active}
              onClick={() => active && duplicateAsset(active)}
            >
              <Copy size={13} aria-hidden="true" /> Duplicate image
            </button>
            <button
              disabled={!active || Boolean(active?.demo)}
              className="danger"
              onClick={() => {
                if (active && !active.demo) onRemoveAsset(active.id);
                setAssetMenuOpen(false);
              }}
            >
              <Trash2 size={13} aria-hidden="true" /> Remove image
            </button>
            <div className="menu-separator" />
            <label className="image-brush-select">
              <span>Working size</span>
              <select
                value={optimizationSize}
                onChange={(event) => setOptimizationSize(event.target.value)}
              >
                <option value="auto">Automatic</option>
                <option value="64">64 px</option>
                <option value="128">128 px</option>
                <option value="256">256 px</option>
                <option value="512">512 px</option>
                <option value="original">Restore original</option>
              </select>
            </label>
            <button disabled={!active} onClick={applyOptimization}>
              Apply working size
            </button>
            {diagnosticsEnabled && active && (
              <small>
                {formatBytes(originalBytes)} source · {formatBytes(workingBytes)} working ·{' '}
                {optimizationImprovement.toFixed(1)}×
              </small>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          hidden
          multiple
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Add brush images"
          onChange={(event) => {
            void addFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </section>

      <section className="image-brush-compact-section image-brush-style-section">
        <header>
          <strong>Style</strong>
          <span>{selectedPreset?.name ?? 'Custom'}</span>
        </header>
        <div className="image-brush-style-row">
          <select
            aria-label="Image Brush style"
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
            <optgroup label="Built-in">
              {builtInImageBrushPresets.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
            {userPresets.length > 0 && (
              <optgroup label="My styles">
                {userPresets.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Custom">
              <option value="custom">Current custom settings</option>
            </optgroup>
          </select>
          <div className="image-brush-split-button">
            <button
              className="image-brush-randomize-main"
              data-tooltip="Creates a balanced variation while keeping Size, Spacing, Opacity and Orientation."
              onClick={() => onRandomize('balanced')}
            >
              <Shuffle size={13} aria-hidden="true" /> Randomize brush
            </button>
            <button
              ref={randomizeTriggerRef}
              aria-label="More randomize options"
              aria-haspopup="dialog"
              aria-expanded={randomizeMenuOpen}
              onClick={() => setRandomizeMenuOpen((value) => !value)}
            >
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </div>
          <button
            ref={styleMenuTriggerRef}
            className="icon-button"
            aria-label="Style actions"
            aria-haspopup="menu"
            aria-expanded={styleMenuOpen}
            onClick={() => setStyleMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </div>
        {randomizeMenuOpen && (
          <div
            ref={randomizeMenuRef}
            className="image-brush-popover image-brush-menu image-brush-randomize-menu"
            role="dialog"
            aria-label="Randomize brush"
          >
            <button onClick={() => onRandomize('everything')}>
              Randomize whole brush
            </button>
            <button onClick={() => onRandomize('layout')}>
              Randomize placement only
            </button>
            <button onClick={() => onRandomize('mutation')}>
              Randomize evolution only
            </button>
            <button onClick={() => onRandomize('fx')}>
              Randomize FX only
            </button>
            <button onClick={() => onRandomize('wild')}>
              <Zap size={12} aria-hidden="true" /> Wild variation
            </button>
            <div className="menu-separator" />
            <Toggle
              label="Lock recipe"
              checked={randomizeLockSeed}
              onChange={onRandomizeLockSeedChange}
            />
            <label className="image-brush-seed-inline">
              <span>Repeatable result</span>
              <input value={seed} onChange={(event) => onSeedChange(event.target.value)} />
            </label>
          </div>
        )}
        {styleMenuOpen && (
          <div
            ref={styleMenuRef}
            className="image-brush-popover image-brush-menu image-brush-style-menu"
            role="menu"
            aria-label="Style actions"
          >
            <button role="menuitem" onClick={saveCurrentPreset}>
              <Save size={13} aria-hidden="true" /> Save current as new style
            </button>
            <button
              role="menuitem"
              disabled={!userPresets.some((preset) => preset.id === activePresetId)}
              onClick={renamePreset}
            >
              Rename current style
            </button>
            <button
              role="menuitem"
              className="danger"
              disabled={!userPresets.some((preset) => preset.id === activePresetId)}
              onClick={deletePreset}
            >
              Delete current style
            </button>
            <div className="menu-separator" />
            <button role="menuitem" onClick={() => presetInputRef.current?.click()}>
              <FileUp size={13} aria-hidden="true" /> Import style
            </button>
            <button role="menuitem" onClick={exportPreset}>
              <FileDown size={13} aria-hidden="true" /> Export style
            </button>
          </div>
        )}
        <input
          ref={presetInputRef}
          hidden
          type="file"
          accept="application/json"
          aria-label="Import Image Brush style"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importPreset(file);
            event.target.value = '';
          }}
        />
      </section>

      <section className="image-brush-compact-section image-brush-live-preview">
        <header>
          <strong>Preview</strong>
          <span>{processedPreview ? 'Ready' : active ? 'Updating' : 'Image needed'}</span>
        </header>
        <div className="image-brush-live-preview-stage brush-checker">
          <canvas
            ref={liveStrokePreviewRef}
            width={480}
            height={168}
            aria-label="Live Image Brush stroke preview"
          />
          {!active && <span>Choose an image to preview the brush.</span>}
        </div>
        {diagnosticsEnabled && processedPreview && (
          <small>
            {processedPreview.stroke.processingMs.toFixed(1)} ms ·{' '}
            {processedPreview.diagnostics.cacheVariants} cached variant
            {processedPreview.diagnostics.cacheVariants === 1 ? '' : 's'}
          </small>
        )}
      </section>

      <ImageBrushEssentialControls
        settings={settings}
        glitchIndex={glitchIndex}
        onUpdate={update}
        onOrientationChange={(rotationMode) => {
          onSettingsChange({
            ...settings,
            angle: 0,
            rotationMode,
            followDirection: rotationMode === 'follow',
            randomRotation: 0,
            rotationJitter: 0,
            flipXChance: 0,
            flipYChance: 0,
          });
          onPresetChange('custom');
        }}
        onGlitchAmountChange={setGlitchAmount}
      />

      <div
        className="image-brush-workflow-tabs"
        role="tablist"
        aria-label="Image Brush controls"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const tabs: ImageBrushTab[] = ['placement', 'evolution', 'fx'];
          const index = tabs.indexOf(activeTab);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          setActiveTab(tabs[next]!);
          requestAnimationFrame(() =>
            document.getElementById(`${tabsId}-tab-${tabs[next]}`)?.focus(),
          );
        }}
      >
        {(['placement', 'evolution', 'fx'] as const).map((tab) => (
          <button
            id={`${tabsId}-tab-${tab}`}
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`${tabsId}-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'fx' ? 'FX' : `${tab[0]!.toUpperCase()}${tab.slice(1)}`}
          </button>
        ))}
      </div>

      <section
        id={`${tabsId}-panel-evolution`}
        className="image-brush-tab-panel image-brush-evolution-panel"
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-evolution`}
        hidden={activeTab !== 'evolution'}
      >
        <header>
          <strong>Evolution</strong>
          <span>{settings.mutationMode.replace('-', ' ')}</span>
        </header>
        <label className="image-brush-select">
          <span>Evolution mode</span>
          <select
            value={settings.mutationMode}
            onChange={(event) =>
              update('mutationMode', event.target.value as ImageBrushSettings['mutationMode'])
            }
          >
            <optgroup label="Basic">
              <option value="clean">Clean Repeat</option>
              <option value="fixed">Fixed Glitch</option>
            </optgroup>
            <optgroup label="Evolution">
              <option value="progressive">Progressive Decay</option>
              <option value="evolving">Evolving Chain</option>
              <option value="stroke-gradient">Stroke Gradient</option>
            </optgroup>
            <optgroup label="Variation">
              <option value="per-stamp">Random Per Stamp</option>
              <option value="random-stack">Random Effect Stack</option>
              <option value="alternating">Alternating Modes</option>
            </optgroup>
            <optgroup label="Trail">
              <option value="whole-trail">Whole Trail Processing</option>
            </optgroup>
          </select>
        </label>
        <p className="image-brush-inline-note">{mutationCopy[0]}</p>
      </section>

      <section
        id={`${tabsId}-panel-fx`}
        className="image-brush-tab-panel image-brush-fx-panel"
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-fx`}
        hidden={activeTab !== 'fx'}
      >
        <header>
          <strong>FX</strong>
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
        <div className="image-brush-fx-editor">
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
                    {definition.experimental ? 'NEW · ' : ''}
                    {definition.name} · {imageBrushStageLabel(definition.imageBrushStages)}
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
                      <strong>
                        {definition.name}
                        {definition.experimental && <em className="new-effect-badge">NEW</em>}
                      </strong>
                      <small>{definition.cost} cost</small>
                    </span>
                    <Toggle
                      label=""
                      ariaLabel={`${item.enabled ? 'Disable' : 'Enable'} ${definition.name}`}
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
                      <X size={11} aria-hidden="true" />
                    </button>
                  </header>
                  <details className="image-brush-fx-details">
                    <summary>
                      Amount {Math.round(item.amount * 100)}% · Mix {Math.round(item.mix * 100)}%
                    </summary>
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
                      {item.effectId === 'pixel-embroidery' && (
                        <div className="image-brush-experimental-fx-controls">
                          <SliderField
                            label="Grid Size"
                            value={item.embroideryGridSize ?? 7}
                            min={3}
                            max={24}
                            suffix=" px"
                            onChange={(embroideryGridSize) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id ? { ...entry, embroideryGridSize } : entry,
                                ),
                              )
                            }
                          />
                          <label className="image-brush-select">
                            <span>Stitch Type</span>
                            <select
                              value={item.embroideryStitchType ?? 'cross-stitch'}
                              onChange={(event) =>
                                updateRack(
                                  rack.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          embroideryStitchType: event.target.value as NonNullable<
                                            ImageBrushFxItem['embroideryStitchType']
                                          >,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              <option value="cross-stitch">Cross Stitch</option>
                              <option value="diagonal-stitch">Diagonal Stitch</option>
                              <option value="bead">Bead</option>
                              <option value="square">Square</option>
                            </select>
                          </label>
                          <SliderField
                            label="Palette Levels"
                            value={item.embroideryPaletteLevels ?? 8}
                            min={2}
                            max={32}
                            onChange={(embroideryPaletteLevels) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, embroideryPaletteLevels }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Thread Angle"
                            value={item.embroideryThreadAngle ?? 0}
                            min={-180}
                            max={180}
                            suffix="°"
                            onChange={(embroideryThreadAngle) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, embroideryThreadAngle }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Missing Stitches"
                            value={item.embroideryMissingStitches ?? 0.08}
                            min={0}
                            max={0.8}
                            step={0.01}
                            onChange={(embroideryMissingStitches) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, embroideryMissingStitches }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Thread Jitter"
                            value={item.embroideryThreadJitter ?? 0.12}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(embroideryThreadJitter) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, embroideryThreadJitter }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Background Transparency"
                            value={item.embroideryBackgroundTransparency ?? 0.9}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(embroideryBackgroundTransparency) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, embroideryBackgroundTransparency }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </div>
                      )}
                      {item.effectId === 'xerox-decay' && (
                        <div className="image-brush-experimental-fx-controls">
                          <SliderField
                            label="Threshold"
                            value={item.xeroxThreshold ?? 0.54}
                            min={0.05}
                            max={0.95}
                            step={0.01}
                            onChange={(xeroxThreshold) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id ? { ...entry, xeroxThreshold } : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Toner Loss"
                            value={item.xeroxTonerLoss ?? 0.28}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(xeroxTonerLoss) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id ? { ...entry, xeroxTonerLoss } : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Speckle"
                            value={item.xeroxSpeckle ?? 0.22}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(xeroxSpeckle) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id ? { ...entry, xeroxSpeckle } : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Edge Erosion"
                            value={item.xeroxEdgeErosion ?? 0.2}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(xeroxEdgeErosion) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id ? { ...entry, xeroxEdgeErosion } : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Banding"
                            value={item.xeroxBanding ?? 0.14}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(xeroxBanding) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id ? { ...entry, xeroxBanding } : entry,
                                ),
                              )
                            }
                          />
                          <SliderField
                            label="Black Crush"
                            value={item.xeroxBlackCrush ?? 0.36}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(xeroxBlackCrush) =>
                              updateRack(
                                rack.map((entry) =>
                                  entry.id === item.id ? { ...entry, xeroxBlackCrush } : entry,
                                ),
                              )
                            }
                          />
                          <label className="image-brush-select">
                            <span>Color Mode</span>
                            <select
                              value={item.xeroxColorMode ?? 'mono'}
                              onChange={(event) =>
                                updateRack(
                                  rack.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          xeroxColorMode: event.target.value as NonNullable<
                                            ImageBrushFxItem['xeroxColorMode']
                                          >,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              <option value="mono">Mono</option>
                              <option value="duotone">Duotone</option>
                            </select>
                          </label>
                        </div>
                      )}
                      <div className="image-brush-fx-order">
                        <button
                          aria-label={`Move ${definition.name} earlier`}
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
                          aria-label={`Move ${definition.name} later`}
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
                  </details>
                </article>
              );
            })}
            {!rack.length && (
              <div className="image-brush-empty">Add an effect to build a Stamp FX stack.</div>
            )}
          </div>
          <button
            className="image-brush-clear-fx"
            disabled={!rack.length}
            onClick={() => {
              onRackChange([]);
              onPresetChange('custom');
              onNotice('Stamp FX cleared. The selected image was preserved.');
            }}
          >
            <Trash2 size={12} aria-hidden="true" /> Clear FX
          </button>
        </div>
      </section>

      <section
        id={`${tabsId}-panel-placement`}
        className="image-brush-tab-panel image-brush-placement-panel"
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-placement`}
        hidden={activeTab !== 'placement'}
      >
        <header>
          <strong>Placement</strong>
          <span>{settings.mode.replace('-', ' ')}</span>
        </header>
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
            role="slider"
            tabIndex={0}
            aria-label="Custom anchor position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(settings.customAnchor.x * 100)}
            aria-valuetext={`${Math.round(settings.customAnchor.x * 100)}% horizontal, ${Math.round(settings.customAnchor.y * 100)}% vertical`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              customAnchorPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                customAnchorPointer(event);
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 0.02;
              const delta = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              }[event.key];
              if (!delta) return;
              event.preventDefault();
              update('customAnchor', {
                x: Math.max(0, Math.min(1, settings.customAnchor.x + delta[0])),
                y: Math.max(0, Math.min(1, settings.customAnchor.y + delta[1])),
              });
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
        </div>
      </section>

      <div className="image-brush-evolution-fields" hidden={activeTab !== 'evolution'}>
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
                    {definition.experimental && <em className="new-effect-badge">NEW</em>}
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
          </>
        )}
        {settings.mutationMode === 'evolving' && (
          <Toggle
            label="Continue mutation between strokes"
            checked={settings.continueBetweenStrokes}
            onChange={(value) => update('continueBetweenStrokes', value)}
          />
        )}
      </div>

      <details className="image-brush-master-advanced">
        <summary>Advanced</summary>
        <div className="image-brush-master-advanced-body">
          <LazyAdvancedDetails summary="Alpha and blending" initiallyMounted={false}>
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
          </LazyAdvancedDetails>

          <LazyAdvancedDetails summary="Source image settings" initiallyMounted={false}>
            <Toggle
              label="Trim transparent margins"
              checked={settings.trimTransparent}
              onChange={(value) => update('trimTransparent', value)}
            />
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

          <LazyAdvancedDetails summary="Pressure" initiallyMounted={false}>
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

          {diagnosticsEnabled && (
            <LazyAdvancedDetails summary="Developer diagnostics" initiallyMounted={false}>
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
              <div className="image-brush-diagnostic-actions">
                <button disabled={!active || processing} onClick={onTestStamp}>
                  Test stamp
                </button>
                <button disabled={!active || processing} onClick={onTestTrail}>
                  Test trail
                </button>
                {processing && <button onClick={onCancelProcessing}>Cancel processing</button>}
              </div>
              <div className="image-brush-toggle-grid">
                <Toggle
                  label="Show stamp outline"
                  checked={settings.showOutline}
                  onChange={(value) => update('showOutline', value)}
                />
                <Toggle
                  label="Preview before commit"
                  checked={settings.previewStroke}
                  onChange={(value) => update('previewStroke', value)}
                />
              </div>
              {processedPreview && (
                <dl className="image-brush-compact-diagnostics">
                  <dt>Tip preview</dt>
                  <dd>
                    {processedPreview.quality} ·{' '}
                    {processedPreview.diagnostics.processingMs.toFixed(1)} ms
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
                  <dt>Pointer up → result</dt>
                  <dd>{performance.pointerUpToResultMs.toFixed(1)} ms</dd>
                  <dt>Adopt / layer / canvas</dt>
                  <dd>
                    {performance.resultAdoptionMs.toFixed(1)} /{' '}
                    {performance.layerCommitMs.toFixed(1)} / {performance.canvasUploadMs.toFixed(1)}{' '}
                    ms
                  </dd>
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
          )}
          <button
            className="image-brush-reset-controls"
            onClick={() => applyPreset(builtInImageBrushPresets[0]!)}
          >
            <RefreshCcw size={12} aria-hidden="true" /> Reset controls
          </button>
        </div>
      </details>
    </section>
  );
}
