import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlgorithmId, AlgorithmSettings } from '../types';

export interface EffectPreviewSource {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  version: number;
}

interface EffectPreviewStageProps {
  algorithm: AlgorithmId;
  source: EffectPreviewSource;
  settings: AlgorithmSettings;
  seed: string;
  description?: string;
  estimatedCost?: string;
}

interface PreviewResult {
  algorithm: AlgorithmId;
  after: Uint8ClampedArray;
  difference: Uint8ClampedArray;
  changedPixels: number;
  elapsedMs: number;
}

const previewCache = new Map<string, PreviewResult>();

function rememberPreview(key: string, value: PreviewResult): void {
  previewCache.delete(key);
  previewCache.set(key, value);
  while (previewCache.size > 24) previewCache.delete(previewCache.keys().next().value!);
}

function paint(
  canvas: HTMLCanvasElement | null,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  canvas.width = width;
  canvas.height = height;
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
}

export function EffectPreviewStage({
  algorithm,
  source,
  settings,
  seed,
  description,
  estimatedCost,
}: EffectPreviewStageProps) {
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const differenceRef = useRef<HTMLCanvasElement>(null);
  const generationRef = useRef(0);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [status, setStatus] = useState<'waiting' | 'rendering' | 'ready' | 'error'>('waiting');
  const previewKey = useMemo(
    () =>
      `${source.version}:${source.width}x${source.height}:${algorithm}:${seed}:${JSON.stringify(settings)}`,
    [algorithm, seed, settings, source.height, source.version, source.width],
  );

  useEffect(() => {
    paint(beforeRef.current, source.pixels, source.width, source.height);
  }, [source]);

  useEffect(() => {
    const generation = ++generationRef.current;
    const cached = previewCache.get(previewKey);
    if (cached) {
      setResult(cached);
      setStatus('ready');
      return;
    }
    const worker = new Worker(new URL('../workers/effectPreview.worker.ts', import.meta.url), {
      type: 'module',
    });
    const jobId = `effect-preview-${generation}-${Date.now()}`;
    const timer = window.setTimeout(() => {
      setStatus('rendering');
      const pixels = source.pixels.slice().buffer;
      worker.postMessage(
        {
          jobId,
          algorithm,
          pixels,
          width: source.width,
          height: source.height,
          settings,
          seed,
        },
        [pixels],
      );
    }, 45);
    worker.onmessage = (
      event: MessageEvent<{
        jobId: string;
        algorithm: AlgorithmId;
        after?: ArrayBuffer;
        difference?: ArrayBuffer;
        changedPixels?: number;
        elapsedMs?: number;
        error?: string;
      }>,
    ) => {
      if (generation !== generationRef.current || event.data.jobId !== jobId) return;
      if (event.data.error || !event.data.after || !event.data.difference) {
        setStatus('error');
        return;
      }
      const next: PreviewResult = {
        algorithm: event.data.algorithm,
        after: new Uint8ClampedArray(event.data.after),
        difference: new Uint8ClampedArray(event.data.difference),
        changedPixels: event.data.changedPixels ?? 0,
        elapsedMs: event.data.elapsedMs ?? 0,
      };
      rememberPreview(previewKey, next);
      setResult(next);
      setStatus('ready');
    };
    worker.onerror = () => {
      if (generation === generationRef.current) setStatus('error');
    };
    return () => {
      window.clearTimeout(timer);
      worker.terminate();
    };
  }, [algorithm, previewKey, seed, settings, source]);

  useEffect(() => {
    if (!result || result.algorithm !== algorithm) return;
    paint(afterRef.current, result.after, source.width, source.height);
    paint(differenceRef.current, result.difference, source.width, source.height);
  }, [algorithm, result, source.height, source.width]);

  return (
    <section
      className="shared-effect-preview"
      data-preview-effect={algorithm}
      data-preview-status={status}
    >
      <header>
        <strong>REAL EFFECT PREVIEW</strong>
        <span>
          {status === 'ready' && result
            ? `${result.changedPixels.toLocaleString()} px · ${result.elapsedMs.toFixed(1)} ms`
            : status === 'error'
              ? 'Preview unavailable'
              : 'Rendering in Worker…'}
        </span>
      </header>
      <div className="shared-effect-preview-grid">
        <figure>
          <canvas ref={beforeRef} />
          <figcaption>BEFORE</figcaption>
        </figure>
        <figure>
          <canvas ref={afterRef} />
          <figcaption>AFTER</figcaption>
        </figure>
        <figure>
          <canvas ref={differenceRef} />
          <figcaption>DIFFERENCE</figcaption>
        </figure>
      </div>
      {(description || estimatedCost) && (
        <footer>
          {description && <span>{description}</span>}
          {estimatedCost && <strong>{estimatedCost} COST</strong>}
        </footer>
      )}
    </section>
  );
}
