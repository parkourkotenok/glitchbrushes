import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { Rectangle } from '../types';

export interface LayerTransformSession {
  layerId: string;
  name: string;
  bounds: Rectangle;
  pixels: Uint8ClampedArray;
  opacity: number;
}

interface Props {
  session: LayerTransformSession;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  onApply(bounds: Rectangle): void;
  onCancel(): void;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

export function LayerTransformOverlay({
  session,
  zoom,
  canvasWidth,
  canvasHeight,
  onApply,
  onCancel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bounds, setBounds] = useState(session.bounds);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    corner?: Corner;
    clientX: number;
    clientY: number;
    bounds: Rectangle;
  } | null>(null);

  useEffect(() => setBounds(session.bounds), [session]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.putImageData(
      new ImageData(session.pixels, session.bounds.width, session.bounds.height),
      0,
      0,
    );
  }, [session]);

  const begin = (
    event: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
    corner?: Corner,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, corner, clientX: event.clientX, clientY: event.clientY, bounds };
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - drag.clientX) / Math.max(zoom, 0.01);
    const dy = (event.clientY - drag.clientY) / Math.max(zoom, 0.01);
    if (drag.mode === 'move') {
      setBounds({
        ...drag.bounds,
        x: Math.max(-drag.bounds.width + 4, Math.min(canvasWidth - 4, drag.bounds.x + dx)),
        y: Math.max(-drag.bounds.height + 4, Math.min(canvasHeight - 4, drag.bounds.y + dy)),
      });
      return;
    }
    const corner = drag.corner!;
    const fromLeft = corner.endsWith('w');
    const fromTop = corner.startsWith('n');
    let width = Math.max(4, drag.bounds.width + (fromLeft ? -dx : dx));
    let height = Math.max(4, drag.bounds.height + (fromTop ? -dy : dy));
    // Photoshop-style default: preserve aspect ratio. Shift temporarily enables free scaling.
    if (!event.shiftKey) {
      const widthScale = width / drag.bounds.width;
      const heightScale = height / drag.bounds.height;
      const scale =
        Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale;
      width = Math.max(4, drag.bounds.width * scale);
      height = Math.max(4, drag.bounds.height * scale);
    }
    setBounds({
      x: fromLeft ? drag.bounds.x + drag.bounds.width - width : drag.bounds.x,
      y: fromTop ? drag.bounds.y + drag.bounds.height - height : drag.bounds.y,
      width,
      height,
    });
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    dragRef.current = null;
  };

  return (
    <div
      className="layer-transform-overlay"
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
      onPointerDown={(event) => begin(event, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <canvas
        ref={canvasRef}
        width={session.bounds.width}
        height={session.bounds.height}
        style={{ opacity: session.opacity }}
      />
      {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
        <button
          key={corner}
          type="button"
          className={`layer-transform-handle ${corner}`}
          aria-label={`Resize ${corner}`}
          onPointerDown={(event) => begin(event, 'resize', corner)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ))}
      <div className="layer-transform-actions" onPointerDown={(event) => event.stopPropagation()}>
        <span>{session.name} · ratio locked · Shift = free</span>
        <button type="button" onClick={() => onApply(bounds)} aria-label="Apply transform">
          <Check size={13} />
        </button>
        <button type="button" onClick={onCancel} aria-label="Cancel transform">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
