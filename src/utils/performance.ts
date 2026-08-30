const EVENT_LIMIT = 500;
const RAF_SAMPLE_LIMIT = 500;
const LONG_TASK_SAMPLE_LIMIT = 64;
const LONG_TASK_METRIC = 'glitchbrushes:long-main-task';
const RAF_GAP_METRIC = 'glitchbrushes:raf-gap';

export type PerformanceMetadataValue = string | number | boolean;
export type PerformanceMetadata = Record<string, PerformanceMetadataValue>;

export interface GlitchBrushPerformanceEvent {
  seq: number;
  generation: number;
  at: number;
  name: string;
  duration: number;
  scope: string;
  metadata?: PerformanceMetadata;
}

export interface GlitchBrushPerformanceSummary {
  count: number;
  retained: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface GlitchBrushRafSummary extends GlitchBrushPerformanceSummary {
  dropped: number;
  gapsAtLeast25Ms: number;
  gapsAtLeast50Ms: number;
  gapsAtLeast100Ms: number;
}

export interface GlitchBrushPerformanceDiagnostics {
  schemaVersion: 1;
  generation: number;
  scope: string;
  seq: number;
  capacity: number;
  dropped: number;
  timeOrigin: number;
  capturedAt: number;
  counts: Record<string, number>;
  samples: Record<string, number[]>;
  summaries: Record<string, GlitchBrushPerformanceSummary>;
  events: GlitchBrushPerformanceEvent[];
  rafGaps: number[];
  raf: GlitchBrushRafSummary;
  capabilities: {
    longTasks: boolean;
  };
}

export interface GlitchBrushPerformanceApi {
  reset(scope?: string): void;
  snapshot(): GlitchBrushPerformanceDiagnostics;
  exportJson(): string;
}

interface RingBuffer<Value> {
  values: Value[];
  start: number;
}

type PerformanceGlobal = typeof globalThis & {
  __GLITCH_PERF__?: GlitchBrushPerformanceApi;
};

const PERFORMANCE_DIAGNOSTICS_ENABLED = (() => {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('perf') === '1';
})();

const LONG_TASKS_SUPPORTED =
  PERFORMANCE_DIAGNOSTICS_ENABLED &&
  typeof PerformanceObserver !== 'undefined' &&
  (PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false);

let generation = 0;
let currentScope = 'default';
let diagnosticsStartedAt = 0;
let sequence = 0;
let dropped = 0;
const eventRing: RingBuffer<GlitchBrushPerformanceEvent> = { values: [], start: 0 };
const counts: Record<string, number> = {};
const rafRing: RingBuffer<number> = { values: [], start: 0 };
const longTaskRing: RingBuffer<number> = { values: [], start: 0 };
let rafCount = 0;
let rafDropped = 0;
let rafMaximum = 0;
let rafAtLeast25Ms = 0;
let rafAtLeast50Ms = 0;
let rafAtLeast100Ms = 0;
let longTaskObserver: PerformanceObserver | null = null;

function pushRing<Value>(ring: RingBuffer<Value>, value: Value, limit: number): boolean {
  if (ring.values.length < limit) {
    ring.values.push(value);
    return false;
  }
  ring.values[ring.start] = value;
  ring.start = (ring.start + 1) % limit;
  return true;
}

function snapshotRing<Value>(ring: RingBuffer<Value>): Value[] {
  if (ring.start === 0) return [...ring.values];
  return [...ring.values.slice(ring.start), ...ring.values.slice(0, ring.start)];
}

function clearRing<Value>(ring: RingBuffer<Value>): void {
  ring.values.length = 0;
  ring.start = 0;
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.min(sorted.length - 1, index)] ?? 0;
}

function summarize(values: readonly number[], count = values.length): GlitchBrushPerformanceSummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count,
    retained: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
  };
}

function safeMetadata(metadata?: Record<string, unknown>): PerformanceMetadata | undefined {
  if (!metadata) return undefined;
  const safe: PerformanceMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' || typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function recordRafGap(gap: number): void {
  const duration = Math.max(0, gap);
  rafCount += 1;
  rafMaximum = Math.max(rafMaximum, duration);
  if (duration >= 25) rafAtLeast25Ms += 1;
  if (duration >= 50) rafAtLeast50Ms += 1;
  if (duration >= 100) rafAtLeast100Ms += 1;
  if (pushRing(rafRing, duration, RAF_SAMPLE_LIMIT)) rafDropped += 1;
  // Normal frames remain in the dedicated bounded rAF ring. Only actionable
  // gaps compete for space in the aggregate event timeline.
  if (duration >= 25) recordPerformanceSample(RAF_GAP_METRIC, duration);
}

function resetDiagnostics(scope = 'default'): void {
  generation += 1;
  currentScope = scope || 'default';
  diagnosticsStartedAt = typeof performance === 'undefined' ? 0 : performance.now();
  sequence = 0;
  dropped = 0;
  clearRing(eventRing);
  for (const key of Object.keys(counts)) delete counts[key];
  clearRing(rafRing);
  clearRing(longTaskRing);
  rafCount = 0;
  rafDropped = 0;
  rafMaximum = 0;
  rafAtLeast25Ms = 0;
  rafAtLeast50Ms = 0;
  rafAtLeast100Ms = 0;
  if (typeof performance !== 'undefined' && typeof performance.clearMeasures === 'function') {
    performance.clearMeasures();
  }
}

function snapshotDiagnostics(): GlitchBrushPerformanceDiagnostics {
  const events = snapshotRing(eventRing).map((event) => ({
    ...event,
    metadata: event.metadata ? { ...event.metadata } : undefined,
  }));
  const samples: Record<string, number[]> = {};
  for (const event of events) (samples[event.name] ??= []).push(event.duration);
  // Long Tasks are rare and diagnostically important. Keep their durations in a
  // tiny dedicated ring so a busy Layers/React scenario cannot evict the only
  // blocking task from the shared event timeline before snapshot().
  if (counts[LONG_TASK_METRIC]) samples[LONG_TASK_METRIC] = snapshotRing(longTaskRing);
  const summaries = Object.fromEntries(
    Object.keys(counts).map((name) => [name, summarize(samples[name] ?? [], counts[name])]),
  );
  const rafGaps = snapshotRing(rafRing);
  return {
    schemaVersion: 1,
    generation,
    scope: currentScope,
    seq: sequence,
    capacity: EVENT_LIMIT,
    dropped,
    timeOrigin: typeof performance === 'undefined' ? 0 : performance.timeOrigin,
    capturedAt: typeof performance === 'undefined' ? 0 : performance.now(),
    counts: { ...counts },
    samples,
    summaries,
    events,
    rafGaps,
    raf: {
      ...summarize(rafGaps, rafCount),
      max: rafMaximum,
      dropped: rafDropped,
      gapsAtLeast25Ms: rafAtLeast25Ms,
      gapsAtLeast50Ms: rafAtLeast50Ms,
      gapsAtLeast100Ms: rafAtLeast100Ms,
    },
    capabilities: {
      longTasks: LONG_TASKS_SUPPORTED,
    },
  };
}

export function performanceDiagnosticsEnabled(): boolean {
  return PERFORMANCE_DIAGNOSTICS_ENABLED;
}

export function recordPerformanceSample(
  name: string,
  duration: number,
  metadata?: Record<string, unknown>,
): number {
  const normalizedDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED) return normalizedDuration;
  counts[name] = (counts[name] ?? 0) + 1;
  const event: GlitchBrushPerformanceEvent = {
    seq: ++sequence,
    generation,
    at: typeof performance === 'undefined' ? 0 : performance.now(),
    name,
    duration: normalizedDuration,
    scope: currentScope,
    metadata: safeMetadata(metadata),
  };
  if (pushRing(eventRing, event, EVENT_LIMIT)) dropped += 1;
  return normalizedDuration;
}

export function recordPerformanceMeasure(
  name: string,
  startedAt: number,
  metadata?: Record<string, unknown>,
): number {
  if (typeof performance === 'undefined') return 0;
  const duration = Math.max(0, performance.now() - startedAt);
  recordPerformanceSample(name, duration, metadata);
  if (PERFORMANCE_DIAGNOSTICS_ENABLED && typeof performance.measure === 'function') {
    performance.clearMeasures(name);
    performance.measure(name, { start: startedAt, duration });
  }
  return duration;
}

export function recordPerformanceEvent(
  name: string,
  metadata?: Record<string, unknown>,
): void {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED) return;
  recordPerformanceSample(name, 0, metadata);
}

export function startRafGapRecorder(): () => void {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED || typeof requestAnimationFrame === 'undefined') {
    return () => undefined;
  }
  let active = true;
  let frame = 0;
  let previous = performance.now();
  let observedGeneration = generation;
  const tick = (now: number) => {
    if (!active) return;
    if (observedGeneration === generation) recordRafGap(now - previous);
    else observedGeneration = generation;
    previous = now;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    active = false;
    cancelAnimationFrame(frame);
  };
}

function installLongTaskObserver(): void {
  if (!LONG_TASKS_SUPPORTED || longTaskObserver) return;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // `buffered: true` may deliver startup entries after a scenario reset.
        // Do not contaminate the new generation with tasks that started earlier.
        if (entry.startTime < diagnosticsStartedAt) continue;
        pushRing(longTaskRing, entry.duration, LONG_TASK_SAMPLE_LIMIT);
        recordPerformanceSample(LONG_TASK_METRIC, entry.duration, {
          startTime: entry.startTime,
          entryType: entry.entryType,
        });
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    longTaskObserver = null;
  }
}

if (PERFORMANCE_DIAGNOSTICS_ENABLED) {
  const api: GlitchBrushPerformanceApi = {
    reset: resetDiagnostics,
    snapshot: snapshotDiagnostics,
    exportJson: () => JSON.stringify(snapshotDiagnostics()),
  };
  (globalThis as PerformanceGlobal).__GLITCH_PERF__ = api;
  installLongTaskObserver();
}
