import type { Point } from '../types';
import type {
  ImageBrushSettings,
  StampAnchor,
  StampPathState,
  StampPoint,
  StampRotationMode,
} from './types';

const EPSILON = 0.000001;

function normalize(vector: Point, fallback: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length > EPSILON ? { x: vector.x / length, y: vector.y / length } : { ...fallback };
}

export function spacingInPixels(
  settings: Pick<ImageBrushSettings, 'spacing' | 'spacingUnit' | 'size' | 'pressureSpacing'>,
  pressure = 1,
): number {
  const base =
    settings.spacingUnit === 'pixels' ? settings.spacing : (settings.size * settings.spacing) / 100;
  return Math.max(0.5, base * (settings.pressureSpacing ? 1.45 - pressure * 0.7 : 1));
}

export function beginStampPath(
  point: Point,
  pressure = 1,
  fallbackAngle = 0,
): { state: StampPathState; stamp: StampPoint } {
  const radians = (fallbackAngle * Math.PI) / 180;
  const direction = { x: Math.cos(radians), y: Math.sin(radians) };
  return {
    state: {
      lastInput: { ...point },
      lastStamp: { ...point },
      lastDirection: direction,
      remainder: 0,
      totalDistance: 0,
      nextIndex: 1,
      lastPressure: pressure,
    },
    stamp: {
      position: { ...point },
      previousPosition: { ...point },
      direction,
      speed: 0,
      pressure,
      distance: 0,
      index: 0,
    },
  };
}

export function appendStampPath(
  state: StampPathState,
  inputPoint: Point,
  pressure: number,
  spacing: number,
  smoothing = 0,
): StampPoint[] {
  const smooth = Math.max(0, Math.min(0.9, smoothing));
  const target = {
    x: inputPoint.x * (1 - smooth) + state.lastInput.x * smooth,
    y: inputPoint.y * (1 - smooth) + state.lastInput.y * smooth,
  };
  const from = state.lastInput;
  const delta = { x: target.x - from.x, y: target.y - from.y };
  const length = Math.hypot(delta.x, delta.y);
  state.lastInput = { ...target };
  if (length <= EPSILON) {
    state.lastPressure = pressure;
    return [];
  }
  const direction = normalize(delta, state.lastDirection);
  state.lastDirection = direction;
  const interval = Math.max(0.5, spacing);
  const stamps: StampPoint[] = [];
  let consumed = 0;
  let available = state.remainder + length;
  while (available + EPSILON >= interval) {
    const needed = interval - state.remainder;
    consumed += needed;
    const ratio = Math.min(1, consumed / length);
    const position = {
      x: from.x + delta.x * ratio,
      y: from.y + delta.y * ratio,
    };
    const stampPressure = state.lastPressure + (pressure - state.lastPressure) * ratio;
    state.totalDistance += needed;
    stamps.push({
      position,
      previousPosition: { ...state.lastStamp },
      direction,
      speed: length,
      pressure: stampPressure,
      distance: state.totalDistance,
      index: state.nextIndex,
    });
    state.nextIndex += 1;
    state.lastStamp = { ...position };
    state.remainder = 0;
    available -= interval;
  }
  state.remainder += Math.max(0, length - consumed);
  state.totalDistance += Math.max(0, length - consumed);
  state.lastPressure = pressure;
  return stamps;
}

export function rotationForStamp(
  mode: StampRotationMode,
  baseAngle: number,
  direction: Point,
  stampIndex: number,
  randomUnit: number,
  randomRotation: number,
  rotationJitter: number,
): number {
  const tangent = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  let rotation = baseAngle;
  if (mode === 'follow') rotation += tangent;
  else if (mode === 'perpendicular') rotation += tangent + 90;
  else if (mode === 'random') rotation += randomUnit * 360;
  else if (mode === 'alternate') rotation += stampIndex % 2 === 0 ? 0 : 180;
  else if (mode === 'spin') rotation += stampIndex * 22.5;
  rotation += (randomUnit * 2 - 1) * (randomRotation + rotationJitter);
  return rotation;
}

export function anchorPoint(anchor: StampAnchor, custom: Point): Point {
  if (anchor === 'top') return { x: 0.5, y: 0 };
  if (anchor === 'bottom') return { x: 0.5, y: 1 };
  if (anchor === 'left') return { x: 0, y: 0.5 };
  if (anchor === 'right') return { x: 1, y: 0.5 };
  if (anchor === 'custom') {
    return {
      x: Math.max(0, Math.min(1, custom.x)),
      y: Math.max(0, Math.min(1, custom.y)),
    };
  }
  return { x: 0.5, y: 0.5 };
}

export function dragStartsFromHandle(role: string | null): boolean {
  return role === 'drag-handle';
}
