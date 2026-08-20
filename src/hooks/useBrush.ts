import { useEffect, useRef, useState } from 'react';
import { MoshJobGate } from '../mosh/transaction';
import type { BrushProgress } from '../brush/engine';
import type {
  ApplyMode,
  AlgorithmSettings,
  BrushSettings,
  BytePatch,
  LayerStackSnapshot,
  Point,
  Rectangle,
} from '../types';
import { defaultAlgorithmSettings } from '../glitchAlgorithms';

export const defaultBrush: BrushSettings = {
  size: 118,
  hardness: 0.42,
  opacity: 0.88,
  strength: 0.72,
  density: 0.78,
  scatter: 0,
  spacing: 14,
  accumulate: true,
  pressure: true,
  minPressureSize: 0.22,
  minPressureStrength: 0.18,
};

export interface StrokeState {
  pointerId: number;
  last: Point;
  bounds: Rectangle | null;
  touched: Set<number>;
  patches: BytePatch[];
  stamp: number;
  pressure: number;
  movement: Point;
  path: Array<Point & { pressure: number }>;
  layerBefore: LayerStackSnapshot | null;
  sourceLayerId: string;
  sampleAllLayers: boolean;
  /** Separate processing buffer is allocated only for explicit single-layer sampling. */
  editPixels: Uint8ClampedArray | null;
  pendingRetouchSamples: Array<{ point: Point; pressure: number }>;
  retouchRaf: number | null;
  retouchEnded: boolean;
}

export interface PersistedBrushMask {
  data: Uint8Array;
  bounds: Rectangle | null;
}

export interface BrushContext {
  version: number;
  affectedPixels: number;
  direction: Point;
}

export function useBrush(width: number, height: number) {
  const [brush, setBrush] = useState<BrushSettings>(defaultBrush);
  const brushRef = useRef(brush);
  const [settings, setSettings] = useState<AlgorithmSettings>(defaultAlgorithmSettings);
  const settingsRef = useRef(settings);
  const [seed, setSeed] = useState('oxide-7F3A');
  const seedRef = useRef(seed);
  const [applyMode, setApplyMode] = useState<ApplyMode>('continuous');
  const applyModeRef = useRef(applyMode);
  const [metaRecipeLocked, setMetaRecipeLocked] = useState(false);
  const [brushProcessing, setBrushProcessing] = useState(false);
  const [brushProgress, setBrushProgress] = useState<BrushProgress | null>(null);
  const [brushContext, setBrushContext] = useState<BrushContext>({
    version: 0,
    affectedPixels: 0,
    direction: { x: 1, y: 0 },
  });

  const brushWorkerRef = useRef<Worker | null>(null);
  const brushJobGateRef = useRef(new MoshJobGate());
  const feedbackMemoryRef = useRef<Uint8ClampedArray | null>(null);
  const pendingFeedbackMemoryRef = useRef<Uint8ClampedArray | null>(null);
  const maskRef = useRef(new Float32Array(width * height));
  const lastBrushMaskRef = useRef<PersistedBrushMask>({
    data: new Uint8Array(0),
    bounds: null,
  });
  const lastBrushDirectionRef = useRef<Point>({ x: 1, y: 0 });
  const strokeRef = useRef<StrokeState | null>(null);

  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);
  useEffect(() => {
    applyModeRef.current = applyMode;
  }, [applyMode]);

  return {
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
  };
}
