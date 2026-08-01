import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from '../utils/geometry';
import type { EditorDocument, MaskView, Point } from '../types';

export type DocRef = { current: EditorDocument };

export function useViewport(docRef: DocRef) {
  const [zoom, setZoom] = useState(0.7);
  const zoomRef = useRef(zoom);
  const [pan, setPan] = useState<Point>({ x: 40, y: 35 });
  const panRef = useRef(pan);
  const [maskView, setMaskView] = useState<MaskView>('hidden');
  const [compareMode, setCompareMode] = useState<'off' | 'split' | 'blink'>('off');
  const [splitPosition, setSplitPosition] = useState(50);
  const [showOriginal, setShowOriginal] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pointerRafRef = useRef<number | null>(null);
  const cursorPendingRef = useRef({ x: 0, y: 0, inside: false });

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const current = docRef.current;
    const availableWidth = Math.max(120, viewport.clientWidth - 72);
    const availableHeight = Math.max(120, viewport.clientHeight - 72);
    const nextZoom = clamp(
      Math.min(availableWidth / current.width, availableHeight / current.height),
      0.05,
      4,
    );
    const nextPan = {
      x: (viewport.clientWidth - current.width * nextZoom) / 2,
      y: (viewport.clientHeight - current.height * nextZoom) / 2,
    };
    setZoom(nextZoom);
    setPan(nextPan);
  }, [docRef]);

  const screenToImage = useCallback((clientX: number, clientY: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  return {
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
  };
}
