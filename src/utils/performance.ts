export function recordPerformanceMeasure(name: string, startedAt: number): void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return;
  performance.clearMeasures(name);
  performance.measure(name, {
    start: startedAt,
    duration: Math.max(0, performance.now() - startedAt),
  });
}
