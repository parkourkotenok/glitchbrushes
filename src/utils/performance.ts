const SAMPLE_LIMIT = 120;
let publishTimer: ReturnType<typeof setTimeout> | null = null;

export interface GlitchBrushPerformanceDiagnostics {
  counts: Record<string, number>;
  samples: Record<string, number[]>;
  rafGaps: number[];
}

type PerformanceGlobal = typeof globalThis & {
  __glitchbrushPerformance?: GlitchBrushPerformanceDiagnostics;
};

export function performanceDiagnosticsEnabled(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('perf') === '1';
}

function diagnostics(): GlitchBrushPerformanceDiagnostics | null {
  if (!performanceDiagnosticsEnabled()) return null;
  const target = globalThis as PerformanceGlobal;
  target.__glitchbrushPerformance ??= { counts: {}, samples: {}, rafGaps: [] };
  return target.__glitchbrushPerformance;
}

function retainBounded(values: number[], value: number): void {
  values.push(value);
  if (values.length > SAMPLE_LIMIT) values.splice(0, values.length - SAMPLE_LIMIT);
}

function scheduleDiagnosticsPublish(state: GlitchBrushPerformanceDiagnostics): void {
  if (typeof document === 'undefined' || publishTimer !== null) return;
  publishTimer = setTimeout(() => {
    document.documentElement.setAttribute('data-glitchbrush-performance', JSON.stringify(state));
    publishTimer = null;
  }, 120);
}

export function recordPerformanceMeasure(name: string, startedAt: number): number {
  if (typeof performance === 'undefined') return 0;
  const duration = Math.max(0, performance.now() - startedAt);
  const state = diagnostics();
  if (state) {
    state.counts[name] = (state.counts[name] ?? 0) + 1;
    const samples = (state.samples[name] ??= []);
    retainBounded(samples, duration);
    scheduleDiagnosticsPublish(state);
  }
  if (performanceDiagnosticsEnabled() && typeof performance.measure === 'function') {
    performance.clearMeasures(name);
    performance.measure(name, { start: startedAt, duration });
  }
  return duration;
}

export function recordPerformanceEvent(name: string): void {
  recordPerformanceMeasure(name, performance.now());
}

export function startRafGapRecorder(): () => void {
  if (!performanceDiagnosticsEnabled() || typeof requestAnimationFrame === 'undefined') {
    return () => undefined;
  }
  let active = true;
  let frame = 0;
  let previous = performance.now();
  const tick = (now: number) => {
    if (!active) return;
    const state = diagnostics();
    if (state) {
      retainBounded(state.rafGaps, Math.max(0, now - previous));
      scheduleDiagnosticsPublish(state);
    }
    previous = now;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    active = false;
    cancelAnimationFrame(frame);
  };
}
