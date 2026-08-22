import { describe, expect, it } from 'vitest';
import splitterSource from './ControlsLayersSplitter.tsx?raw';
import {
  clampControlsPaneHeight,
  controlsPaneBounds,
  DEFAULT_CONTROLS_PANE_HEIGHT,
  keyboardControlsPaneHeight,
  resolveStoredControlsPaneHeight,
} from './ControlsLayersSplitter';

describe('ControlsLayersSplitter sizing', () => {
  it('clamps controls while preserving the Layers minimum', () => {
    expect(controlsPaneBounds(700)).toEqual({ min: 260, max: 548 });
    expect(clampControlsPaneHeight(100, 700)).toBe(260);
    expect(clampControlsPaneHeight(900, 700)).toBe(548);
  });

  it('uses the default when a stored height cannot fit this viewport', () => {
    expect(resolveStoredControlsPaneHeight('700', 700)).toBe(DEFAULT_CONTROLS_PANE_HEIGHT);
    expect(resolveStoredControlsPaneHeight('not-a-number', 700)).toBe(DEFAULT_CONTROLS_PANE_HEIGHT);
    expect(resolveStoredControlsPaneHeight('420', 700)).toBe(420);
  });

  it('contains both panes rather than expanding a short viewport', () => {
    expect(controlsPaneBounds(300)).toEqual({ min: 172, max: 172 });
    expect(clampControlsPaneHeight(340, 300)).toBe(172);
  });

  it('moves with keyboard steps and clamps at the pane bounds', () => {
    expect(keyboardControlsPaneHeight(340, 'ArrowDown', false, 700)).toBe(356);
    expect(keyboardControlsPaneHeight(340, 'ArrowUp', true, 700)).toBe(292);
    expect(keyboardControlsPaneHeight(260, 'ArrowUp', false, 700)).toBe(260);
  });

  it('keeps the pointer, persistence, reset, and viewport-clamp contracts in the component', () => {
    expect(splitterSource).toContain('setPointerCapture(event.pointerId)');
    expect(splitterSource).toContain('requestAnimationFrame');
    expect(splitterSource).toContain('localStorage.setItem');
    expect(splitterSource).toContain('onDoubleClick={reset}');
    expect(splitterSource).toContain('new ResizeObserver');
    expect(splitterSource).toContain('drag.startHeight + event.clientY - drag.startY');
  });
});
