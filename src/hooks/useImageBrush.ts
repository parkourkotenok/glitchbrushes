import { useEffect, useRef, useState } from 'react';
import { MoshJobGate } from '../mosh/transaction';
import {
  defaultImageBrushSettings,
  type ImageBrushAsset,
  type ImageBrushFxItem,
  type ImageBrushPerformanceSnapshot,
  type ImageBrushPreviewResult,
  type ImageBrushProgress,
  type ImageBrushSettings,
  type StampPathState,
  type StampPoint,
} from '../imageBrush/types';
import type { LayerStackSnapshot, Point } from '../types';

export interface ImageBrushStrokeState {
  pointerId: number;
  strokeId: string;
  path: StampPathState;
  stamps: StampPoint[];
  pendingSamples: Array<{ point: Point; pressure: number }>;
  pendingLiveStamps: StampPoint[];
  liveRaf: number | null;
  startedAt: number;
  pointerUpAt: number;
  firstFeedbackAt: number;
  pointerEvents: number;
  liveFrames: number;
  delayedFrames: number;
  maxLiveFrameMs: number;
  pathInterpolationMs: number;
  limitReached: boolean;
  reactRenderStart: number;
  layerBefore: LayerStackSnapshot;
}

export interface ImageBrushGhostVariant {
  canvas: HTMLCanvasElement;
  contentWidth: number;
  contentHeight: number;
}

export function useImageBrush() {
  const [imageBrushProcessing, setImageBrushProcessing] = useState(false);
  const [imageBrushProgress, setImageBrushProgress] = useState<ImageBrushProgress | null>(null);
  const [imageBrushPerformance, setImageBrushPerformance] =
    useState<ImageBrushPerformanceSnapshot | null>(null);
  const [imageBrushSettings, setImageBrushSettings] = useState<ImageBrushSettings>(() => ({
    ...defaultImageBrushSettings,
    customAnchor: { ...defaultImageBrushSettings.customAnchor },
  }));
  const [imageBrushRack, setImageBrushRack] = useState<ImageBrushFxItem[]>([]);
  const [imageBrushSeed, setImageBrushSeed] = useState('stamp-4F21');
  const [imageBrushVariationNonce, setImageBrushVariationNonce] = useState(0);
  const [imageBrushLockSeed, setImageBrushLockSeed] = useState(false);
  const [imageBrushPresetId, setImageBrushPresetId] = useState('clean-repeat');
  const [imageBrushStrokeNonce, setImageBrushStrokeNonce] = useState(0);
  const [imageBrushLibrary, setImageBrushLibrary] = useState<ImageBrushAsset[]>([]);
  const [activeImageBrushId, setActiveImageBrushId] = useState<string | null>(null);
  const [processedBrushPreview, setProcessedBrushPreview] =
    useState<ImageBrushPreviewResult | null>(null);
  const imageBrushWorkerRef = useRef<Worker | null>(null);
  const imageBrushPreviewWorkerRef = useRef<Worker | null>(null);
  const imageBrushPreviewGenerationRef = useRef(0);
  const imageBrushRenderCountRef = useRef(0);
  imageBrushRenderCountRef.current += 1;
  const imageBrushWorkerCountersRef = useRef({
    started: 0,
    cancelled: 0,
    obsolete: 0,
  });
  const imageBrushJobGateRef = useRef(new MoshJobGate());
  const imageBrushStrokeRef = useRef<ImageBrushStrokeState | null>(null);
  const imageBrushSettingsRef = useRef(imageBrushSettings);
  const imageBrushLibraryRef = useRef(imageBrushLibrary);
  const imageBrushRackRef = useRef(imageBrushRack);
  const activeImageBrushIdRef = useRef(activeImageBrushId);
  const imageBrushEvolutionOffsetRef = useRef(0);
  const pendingImageBrushEvolutionRef = useRef<number | null>(null);
  const imageBrushGhostSourceRef = useRef<ImageBrushGhostVariant | null>(null);
  const imageBrushGhostVariantsRef = useRef<ImageBrushGhostVariant[]>([]);
  const imageBrushLockedRandomizationRef = useRef<{
    key: string;
    settings: ImageBrushSettings;
    rack: ImageBrushFxItem[];
  } | null>(null);

  useEffect(() => {
    imageBrushSettingsRef.current = imageBrushSettings;
  }, [imageBrushSettings]);
  useEffect(() => {
    imageBrushLibraryRef.current = imageBrushLibrary;
  }, [imageBrushLibrary]);
  useEffect(() => {
    imageBrushRackRef.current = imageBrushRack;
  }, [imageBrushRack]);
  useEffect(() => {
    activeImageBrushIdRef.current = activeImageBrushId;
  }, [activeImageBrushId]);

  return {
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
    imageBrushStrokeNonce,
    setImageBrushStrokeNonce,
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
  };
}
