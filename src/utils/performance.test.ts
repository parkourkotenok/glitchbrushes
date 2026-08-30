import { afterEach, describe, expect, it, vi } from 'vitest';

type PerfGlobal = typeof globalThis & {
  __GLITCH_PERF__?: import('./performance').GlitchBrushPerformanceApi;
};

async function importEnabledPerformance() {
  vi.resetModules();
  vi.stubGlobal('location', { search: '?perf=1' });
  return import('./performance');
}

afterEach(() => {
  delete (globalThis as PerfGlobal).__GLITCH_PERF__;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('bounded performance diagnostics', () => {
  it('keeps one aggregate 500-event ring with sequence and dropped accounting', async () => {
    const performanceModule = await importEnabledPerformance();
    for (let index = 1; index <= 503; index += 1) {
      performanceModule.recordPerformanceSample('test:sample', index);
    }

    const snapshot = (globalThis as PerfGlobal).__GLITCH_PERF__!.snapshot();
    expect(snapshot.capacity).toBe(500);
    expect(snapshot.events).toHaveLength(500);
    expect(snapshot.events[0]!.seq).toBe(4);
    expect(snapshot.events.at(-1)!.seq).toBe(503);
    expect(snapshot.seq).toBe(503);
    expect(snapshot.dropped).toBe(3);
    expect(snapshot.counts['test:sample']).toBe(503);
    expect(snapshot.summaries['test:sample']).toMatchObject({ count: 503, retained: 500 });
  });

  it('calculates nearest-rank percentiles and exports a self-contained JSON snapshot', async () => {
    const performanceModule = await importEnabledPerformance();
    for (const duration of [1, 2, 3, 4, 100]) {
      performanceModule.recordPerformanceSample('test:latency', duration, {
        bytes: 64,
        regional: true,
        ignored: { large: 'object' },
      });
    }

    const api = (globalThis as PerfGlobal).__GLITCH_PERF__!;
    const snapshot = api.snapshot();
    expect(snapshot.summaries['test:latency']).toEqual({
      count: 5,
      retained: 5,
      p50: 3,
      p95: 100,
      p99: 100,
      max: 100,
    });
    expect(snapshot.events[0]!.metadata).toEqual({ bytes: 64, regional: true });
    expect(JSON.parse(api.exportJson())).toMatchObject({
      schemaVersion: 1,
      capacity: 500,
      counts: { 'test:latency': 5 },
    });
  });

  it('resets the timeline into a new isolated generation', async () => {
    const performanceModule = await importEnabledPerformance();
    performanceModule.recordPerformanceSample('before-reset', 12);
    const api = (globalThis as PerfGlobal).__GLITCH_PERF__!;
    const before = api.snapshot();
    api.reset('effect-short');
    const after = api.snapshot();

    expect(after.generation).toBe(before.generation + 1);
    expect(after.scope).toBe('effect-short');
    expect(after.seq).toBe(0);
    expect(after.dropped).toBe(0);
    expect(after.events).toEqual([]);
    expect(after.counts).toEqual({});
    expect(after.rafGaps).toEqual([]);
  });

  it('tracks bounded rAF samples and 25/50/100 ms gap buckets', async () => {
    let frameCallback: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const performanceModule = await importEnabledPerformance();
    const stop = performanceModule.startRafGapRecorder();

    frameCallback!(116);
    frameCallback!(146);
    frameCallback!(201);
    frameCallback!(321);
    stop();

    const snapshot = (globalThis as PerfGlobal).__GLITCH_PERF__!.snapshot();
    expect(snapshot.raf).toMatchObject({
      count: 4,
      retained: 4,
      p50: 30,
      p95: 120,
      p99: 120,
      max: 120,
      dropped: 0,
      gapsAtLeast25Ms: 3,
      gapsAtLeast50Ms: 2,
      gapsAtLeast100Ms: 1,
    });
    expect(snapshot.counts['glitchbrushes:raf-gap']).toBe(3);
  });

  it('reports Long Task support and stores observed tasks in the same bounded ring', async () => {
    let observerCallback: PerformanceObserverCallback | undefined;
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask'];
      constructor(callback: PerformanceObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
    }
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
    await importEnabledPerformance();

    observerCallback!(
      {
        getEntries: () => [
          { duration: 72, startTime: 15, entryType: 'longtask' } as PerformanceEntry,
        ],
      } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );

    const snapshot = (globalThis as PerfGlobal).__GLITCH_PERF__!.snapshot();
    expect(snapshot.capabilities.longTasks).toBe(true);
    expect(snapshot.summaries['glitchbrushes:long-main-task']).toMatchObject({
      count: 1,
      p50: 72,
      max: 72,
    });
    expect(snapshot.events[0]!.metadata).toEqual({ startTime: 15, entryType: 'longtask' });
  });

  it('retains rare Long Task durations after the shared event ring rolls over', async () => {
    let observerCallback: PerformanceObserverCallback | undefined;
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask'];
      constructor(callback: PerformanceObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
    }
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
    const performanceModule = await importEnabledPerformance();

    observerCallback!(
      {
        getEntries: () => [
          { duration: 144, startTime: 25, entryType: 'longtask' } as PerformanceEntry,
        ],
      } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );
    for (let index = 0; index < 520; index += 1) {
      performanceModule.recordPerformanceSample('busy:interaction', index);
    }

    const snapshot = (globalThis as PerfGlobal).__GLITCH_PERF__!.snapshot();
    expect(snapshot.events.some((event) => event.name === 'glitchbrushes:long-main-task')).toBe(
      false,
    );
    expect(snapshot.summaries['glitchbrushes:long-main-task']).toEqual({
      count: 1,
      retained: 1,
      p50: 144,
      p95: 144,
      p99: 144,
      max: 144,
    });
  });

  it('does not attribute buffered pre-reset Long Tasks to the new scenario', async () => {
    let observerCallback: PerformanceObserverCallback | undefined;
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask'];
      constructor(callback: PerformanceObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
    }
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
    const performanceModule = await importEnabledPerformance();
    const api = (globalThis as PerfGlobal).__GLITCH_PERF__!;
    api.reset('layers');

    observerCallback!(
      {
        getEntries: () => [
          { duration: 200, startTime: 0, entryType: 'longtask' } as PerformanceEntry,
        ],
      } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );

    expect(api.snapshot().summaries['glitchbrushes:long-main-task']).toBeUndefined();
    expect(api.snapshot().scope).toBe('layers');
  });

  it('does not install diagnostics when the cached query gate is disabled', async () => {
    vi.resetModules();
    vi.stubGlobal('location', { search: '' });
    const performanceModule = await import('./performance');
    performanceModule.recordPerformanceSample('disabled', 20);

    expect(performanceModule.performanceDiagnosticsEnabled()).toBe(false);
    expect((globalThis as PerfGlobal).__GLITCH_PERF__).toBeUndefined();
  });
});
