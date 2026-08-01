import { useEffect, useRef, useState } from 'react';
import type { BrushSettings } from '../types';
import type { EffectPreviewSource } from './EffectPreviewStage';
import type { RetouchSettings, RetouchTool } from '../retouch/types';

const COPY: Record<RetouchTool, { description: string; cost: string }> = {
  smudge: {
    description: 'Carries sampled color and structure along the stroke direction.',
    cost: 'medium',
  },
  blur: { description: 'Softens only pixels covered by the local brush mask.', cost: 'medium' },
  sharpen: {
    description: 'Raises local edge contrast while protecting small noise.',
    cost: 'medium',
  },
  restore: { description: 'Blends pixels back from the selected restore source.', cost: 'low' },
  eraser: {
    description: 'Removes pixels from the active glitch layer to transparency.',
    cost: 'low',
  },
};

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

function previewMask(
  width: number,
  height: number,
): { mask: Uint8Array; path: Array<{ x: number; y: number; pressure: number }> } {
  const mask = new Uint8Array(width * height);
  const path = Array.from({ length: 9 }, (_, index) => ({
    x: width * (0.2 + index * 0.075),
    y: height * (0.38 + Math.sin(index / 2) * 0.12),
    pressure: 0.55 + index / 20,
  }));
  const radius = Math.max(7, Math.round(Math.min(width, height) * 0.15));
  for (const point of path) {
    const left = Math.max(0, Math.floor(point.x - radius));
    const top = Math.max(0, Math.floor(point.y - radius));
    const right = Math.min(width, Math.ceil(point.x + radius));
    const bottom = Math.min(height, Math.ceil(point.y + radius));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const distance = Math.hypot(x - point.x, y - point.y) / radius;
        if (distance >= 1) continue;
        mask[y * width + x] = Math.max(mask[y * width + x]!, Math.round((1 - distance ** 2) * 255));
      }
    }
  }
  return { mask, path };
}

export function RetouchPreviewStage({
  tool,
  source,
  restoreSource,
  brush,
  settings,
}: {
  tool: RetouchTool;
  source: EffectPreviewSource;
  restoreSource: EffectPreviewSource;
  brush: BrushSettings;
  settings: RetouchSettings;
}) {
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const generationRef = useRef(0);
  const [metrics, setMetrics] = useState<{ changed: number; elapsed: number } | null>(null);

  useEffect(() => paint(beforeRef.current, source.pixels, source.width, source.height), [source]);

  useEffect(() => {
    const generation = ++generationRef.current;
    const worker = new Worker(new URL('../workers/retouch.worker.ts', import.meta.url), {
      type: 'module',
    });
    const timer = window.setTimeout(() => {
      const started = performance.now();
      const { mask, path } = previewMask(source.width, source.height);
      const pixels = source.pixels.slice().buffer;
      const sourcePixels = restoreSource.pixels.slice().buffer;
      worker.postMessage(
        {
          type: 'process',
          request: {
            jobId: `retouch-preview-${generation}`,
            width: source.width,
            height: source.height,
            pixels,
            sourcePixels,
            mask: mask.buffer,
            maskBounds: { x: 0, y: 0, width: source.width, height: source.height },
            path,
            tool,
            brush: {
              ...brush,
              size: Math.min(source.width, source.height) * 0.3,
              strength: Math.max(0.68, brush.strength),
            },
            settings,
          },
        },
        [pixels, sourcePixels, mask.buffer],
      );
      worker.onmessage = (
        event: MessageEvent<{
          type: 'result' | 'progress' | 'error';
          result?: { pixels: ArrayBuffer; affectedPixels: number };
        }>,
      ) => {
        if (
          generation !== generationRef.current ||
          event.data.type !== 'result' ||
          !event.data.result
        )
          return;
        paint(
          afterRef.current,
          new Uint8ClampedArray(event.data.result.pixels),
          source.width,
          source.height,
        );
        setMetrics({
          changed: event.data.result.affectedPixels,
          elapsed: performance.now() - started,
        });
      };
    }, 55);
    return () => {
      window.clearTimeout(timer);
      worker.terminate();
    };
  }, [brush, restoreSource, settings, source, tool]);

  return (
    <section className="retouch-preview-stage" data-retouch-preview={tool}>
      <header>
        <strong>REAL TOOL PREVIEW</strong>
        <span>{COPY[tool].cost} cost</span>
      </header>
      <div>
        <figure>
          <canvas ref={beforeRef} />
          <figcaption>BEFORE</figcaption>
        </figure>
        <figure>
          <canvas ref={afterRef} />
          <figcaption>AFTER</figcaption>
        </figure>
      </div>
      <p>{COPY[tool].description}</p>
      <small>
        {metrics
          ? `${metrics.changed.toLocaleString()} changed pixels · ${metrics.elapsed.toFixed(1)} ms`
          : 'Rendering in Worker…'}
      </small>
    </section>
  );
}
