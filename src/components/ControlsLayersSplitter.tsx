import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import './ControlsLayersSplitter.css';

export const CONTROLS_LAYERS_SPLITTER_STORAGE_KEY = 'glitch-brushes.controls-pane-height.v1';
export const DEFAULT_CONTROLS_PANE_HEIGHT = 340;
export const MIN_CONTROLS_PANE_HEIGHT = 260;
export const MIN_LAYERS_PANE_HEIGHT = 140;
export const SPLITTER_HEIGHT = 12;

export interface ControlsPaneBounds {
  min: number;
  max: number;
}

/**
 * Keeps the editor dock contained even on a very short viewport. Below the
 * normal 412px minimum we share the available height rather than forcing a
 * page-level overflow.
 */
export function controlsPaneBounds(containerHeight: number): ControlsPaneBounds {
  const usableHeight = Math.max(0, Math.floor(containerHeight) - SPLITTER_HEIGHT);
  const minimumTotal = MIN_CONTROLS_PANE_HEIGHT + MIN_LAYERS_PANE_HEIGHT;
  if (usableHeight < minimumTotal) {
    const compactControls = Math.floor(usableHeight * 0.6);
    return { min: compactControls, max: compactControls };
  }
  return {
    min: MIN_CONTROLS_PANE_HEIGHT,
    max: usableHeight - MIN_LAYERS_PANE_HEIGHT,
  };
}

export function clampControlsPaneHeight(value: number, containerHeight: number): number {
  const { min, max } = controlsPaneBounds(containerHeight);
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function resolveStoredControlsPaneHeight(
  rawValue: string | null,
  containerHeight: number,
): number {
  const parsed = rawValue === null ? Number.NaN : Number(rawValue);
  const { min, max } = controlsPaneBounds(containerHeight);
  // A value that cannot fit is deliberately ignored instead of reviving a
  // stale large dock from a previous monitor/viewport.
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return clampControlsPaneHeight(DEFAULT_CONTROLS_PANE_HEIGHT, containerHeight);
  }
  return Math.round(parsed);
}

export function keyboardControlsPaneHeight(
  currentHeight: number,
  key: 'ArrowUp' | 'ArrowDown',
  shiftKey: boolean,
  containerHeight: number,
): number {
  const step = shiftKey ? 48 : 16;
  return clampControlsPaneHeight(
    currentHeight + (key === 'ArrowDown' ? step : -step),
    containerHeight,
  );
}

function readStoredHeight(): string | null {
  try {
    return window.localStorage.getItem(CONTROLS_LAYERS_SPLITTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistHeight(height: number) {
  try {
    window.localStorage.setItem(CONTROLS_LAYERS_SPLITTER_STORAGE_KEY, String(height));
  } catch {
    // Storage can be unavailable in private browsing; resizing must still work.
  }
}

interface ControlsLayersSplitterProps {
  containerRef: RefObject<HTMLElement | null>;
}

export function ControlsLayersSplitter({ containerRef }: ControlsLayersSplitterProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(DEFAULT_CONTROLS_PANE_HEIGHT);
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const setupFrameRef = useRef<number | null>(null);
  const pendingHeightRef = useRef<number | null>(null);

  const containerHeight = () => containerRef.current?.clientHeight ?? 0;
  const updateAriaValue = (height: number) => {
    const handle = handleRef.current;
    if (!handle) return;
    const { min, max } = controlsPaneBounds(containerHeight());
    handle.setAttribute('aria-valuemin', String(min));
    handle.setAttribute('aria-valuemax', String(max));
    handle.setAttribute('aria-valuenow', String(height));
  };
  const applyHeight = (value: number) => {
    const container = containerRef.current;
    if (!container) return 0;
    const height = clampControlsPaneHeight(value, container.clientHeight);
    heightRef.current = height;
    container.style.setProperty('--controls-pane-height', `${height}px`);
    updateAriaValue(height);
    return height;
  };
  const scheduleHeight = (value: number) => {
    pendingHeightRef.current = value;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      if (pendingHeightRef.current !== null) applyHeight(pendingHeightRef.current);
      pendingHeightRef.current = null;
    });
  };
  const flushHeight = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (pendingHeightRef.current !== null) applyHeight(pendingHeightRef.current);
    pendingHeightRef.current = null;
  };

  useLayoutEffect(() => {
    let observer: ResizeObserver | null = null;
    const initialize = () => {
      const container = containerRef.current;
      if (!container) {
        setupFrameRef.current = window.requestAnimationFrame(initialize);
        return;
      }
      setupFrameRef.current = null;
      applyHeight(resolveStoredControlsPaneHeight(readStoredHeight(), container.clientHeight));
      observer = new ResizeObserver(() => applyHeight(heightRef.current));
      observer.observe(container);
    };
    initialize();
    return () => {
      observer?.disconnect();
      if (setupFrameRef.current !== null) window.cancelAnimationFrame(setupFrameRef.current);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const commit = () => persistHeight(applyHeight(heightRef.current));
  const reset = () => persistHeight(applyHeight(DEFAULT_CONTROLS_PANE_HEIGHT));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: heightRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Moving down gives Controls more space; moving up gives Layers more space.
    scheduleHeight(drag.startHeight + event.clientY - drag.startY);
  };
  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    flushHeight();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    persistHeight(
      applyHeight(
        keyboardControlsPaneHeight(
          heightRef.current,
          event.key,
          event.shiftKey,
          containerHeight(),
        ),
      ),
    );
  };

  return (
    <div
      ref={handleRef}
      className="controls-layers-splitter"
      role="separator"
      aria-label="Resize Controls and Layers panels"
      aria-orientation="horizontal"
      aria-valuetext="Controls panel height"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onLostPointerCapture={finishPointer}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true" />
    </div>
  );
}
