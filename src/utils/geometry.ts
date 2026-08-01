import type { Point, Rectangle } from '../types';

export function pixelToByteOffset(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function unionRect(a: Rectangle | null, b: Rectangle): Rectangle {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

export function brushBounds(
  point: Point,
  radius: number,
  width: number,
  height: number,
): Rectangle {
  const x = clamp(Math.floor(point.x - radius), 0, width);
  const y = clamp(Math.floor(point.y - radius), 0, height);
  const right = clamp(Math.ceil(point.x + radius), 0, width);
  const bottom = clamp(Math.ceil(point.y + radius), 0, height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function mirrorCoordinate(value: number, size: number): number {
  if (size <= 1) return 0;
  const period = (size - 1) * 2;
  const normalized = ((value % period) + period) % period;
  return normalized >= size ? period - normalized : normalized;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
