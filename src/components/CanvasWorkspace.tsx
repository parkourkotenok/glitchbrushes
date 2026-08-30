import type { CSSProperties, RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { Check, X } from 'lucide-react';
import { EffectIcon, algorithmIconIds } from '../icons/effects';
import type { AlgorithmId, CanvasOverlayState, MaskView, Point, Tool } from '../types';
import type { BrushProgress } from '../brush/engine';
import { isRetouchTool } from '../retouch/tools';
import { LayerTransformOverlay, type LayerTransformSession } from './LayerTransformOverlay';

interface CanvasWorkspaceProps {
  doc: { width: number; height: number };
  zoom: number;
  pan: Point;
  workClip: string | undefined;
  effectiveOriginal: boolean;
  canvasOverlays: CanvasOverlayState[];
  compareMode: 'off' | 'split' | 'blink';
  splitPosition: number;
  onSplitPositionChange: (value: number) => void;
  brushProcessing: boolean;
  brushProgress: BrushProgress | null;
  onCancelBrushJob: () => void;
  hasPendingPreview: boolean;
  onApplyPreview: () => void;
  onCancelPreview: () => void;
  maskView: MaskView;
  onMaskViewChange: (view: MaskView) => void;
  onFitToScreen: () => void;
  tool: Tool;
  algorithm: AlgorithmId;
  moshRegionPicking: boolean;
  cloneSourcePicking: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  baseCanvasRef: RefObject<HTMLCanvasElement | null>;
  workCanvasRef: RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  imageBrushOverlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  selectionCanvasRef: RefObject<HTMLCanvasElement | null>;
  cursorRef: RefObject<HTMLDivElement | null>;
  layerTransform: LayerTransformSession | null;
  onApplyLayerTransform(bounds: import('../types').Rectangle): void;
  onCancelLayerTransform(): void;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerLostCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerLeave: () => void;
  onCanvasWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
}

export function CanvasWorkspace({
  doc,
  zoom,
  pan,
  workClip,
  effectiveOriginal,
  canvasOverlays,
  compareMode,
  splitPosition,
  onSplitPositionChange,
  brushProcessing,
  brushProgress,
  onCancelBrushJob,
  hasPendingPreview,
  onApplyPreview,
  onCancelPreview,
  maskView,
  onMaskViewChange,
  onFitToScreen,
  tool,
  algorithm,
  moshRegionPicking,
  cloneSourcePicking,
  viewportRef,
  stageRef,
  baseCanvasRef,
  workCanvasRef,
  overlayCanvasRef,
  imageBrushOverlayCanvasRef,
  selectionCanvasRef,
  cursorRef,
  layerTransform,
  onApplyLayerTransform,
  onCancelLayerTransform,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasPointerCancel,
  onCanvasPointerLostCapture,
  onCanvasPointerLeave,
  onCanvasWheel,
}: CanvasWorkspaceProps) {
  return (
    <section className="canvas-column" id="editor-canvas" tabIndex={-1}>
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-center">
          {brushProcessing && brushProgress && (
            <div className="brush-worker-progress">
              <EffectIcon
                id={
                  isRetouchTool(tool)
                    ? tool === 'restore'
                      ? 'restore'
                      : tool
                    : algorithmIconIds[algorithm]
                }
                size={14}
              />
              <span>{brushProgress.effectName}</span>
              <i>
                <b style={{ width: `${brushProgress.percent}%` }} />
              </i>
              <output>{brushProgress.percent}%</output>
              <button onClick={onCancelBrushJob}>
                <X size={13} /> Cancel Worker
              </button>
            </div>
          )}
          {hasPendingPreview && (
            <>
              <button className="success" onClick={onApplyPreview}>
                <Check size={14} /> Apply
              </button>
              <button onClick={onCancelPreview}>
                <X size={14} /> Cancel
              </button>
            </>
          )}
        </div>
        <div className="canvas-toolbar-right">
          <label
            className="processing-mask-toggle"
            title="Optional diagnostic overlay. It never changes committed pixels."
          >
            <input
              type="checkbox"
              checked={maskView !== 'hidden'}
              onChange={(event) => onMaskViewChange(event.target.checked ? 'red' : 'hidden')}
            />
            <span>Show processing mask</span>
          </label>
          {maskView !== 'hidden' && (
            <select
              aria-label="Processing mask appearance"
              value={maskView}
              onChange={(event) => onMaskViewChange(event.target.value as MaskView)}
            >
              <option value="red">Red</option>
              <option value="mono">Monochrome</option>
            </select>
          )}
          <button className="zoom-readout" onClick={onFitToScreen}>
            {Math.round(zoom * 100)}%
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`canvas-viewport tool-${tool} ${moshRegionPicking ? 'mosh-region-picking' : ''} ${cloneSourcePicking ? 'clone-source-picking' : ''}`}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerCancel}
        onLostPointerCapture={onCanvasPointerLostCapture}
        onPointerLeave={onCanvasPointerLeave}
        onWheel={onCanvasWheel}
      >
        <div className="viewport-grid" />
        <div
          ref={stageRef}
          className={`canvas-stage ${layerTransform ? 'transforming-layer' : ''}`}
          style={{
            width: doc.width,
            height: doc.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <canvas ref={baseCanvasRef} className="image-canvas base-canvas" />
          <canvas
            ref={workCanvasRef}
            className="image-canvas work-canvas"
            style={{
              opacity: effectiveOriginal ? 0 : 1,
              mixBlendMode: 'normal',
              clipPath: workClip,
            }}
          />
          <canvas ref={overlayCanvasRef} className="image-canvas overlay-canvas" />
          <canvas
            ref={imageBrushOverlayCanvasRef}
            className="image-canvas image-brush-overlay-canvas"
          />
          <canvas ref={selectionCanvasRef} className="image-canvas selection-canvas" />
          {canvasOverlays.map((overlay) => {
            if (!overlay.bounds) return null;
            const destination = overlay.type === 'destination-region';
            const clone = overlay.type === 'clone-source';
            return (
              <div
                key={`${overlay.ownerEffectInstanceId}:${overlay.type}`}
                className={`mosh-region-overlay ${clone ? 'clone-source' : destination ? 'destination' : 'source'}`}
                data-overlay-owner={overlay.ownerEffectInstanceId}
                data-overlay-type={overlay.type}
                style={{
                  left: overlay.bounds.x,
                  top: overlay.bounds.y,
                  width: overlay.bounds.width,
                  height: overlay.bounds.height,
                }}
              >
                <span>{clone ? 'CLONE SOURCE' : destination ? 'DESTINATION' : 'SOURCE'}</span>
              </div>
            );
          })}
          {layerTransform && (
            <LayerTransformOverlay
              session={layerTransform}
              zoom={zoom}
              canvasWidth={doc.width}
              canvasHeight={doc.height}
              onApply={onApplyLayerTransform}
              onCancel={onCancelLayerTransform}
            />
          )}
        </div>
        <div ref={cursorRef} className="brush-cursor" />
        {compareMode === 'split' && (
          <div className="split-control" style={{ left: `${splitPosition}%` }}>
            <input
              aria-label="Before and after split"
              type="range"
              min={0}
              max={100}
              value={splitPosition}
              style={{ '--range-progress': `${splitPosition}%` } as CSSProperties}
              onChange={(event) => onSplitPositionChange(Number(event.target.value))}
            />
            <span>BEFORE</span>
            <i />
            <span>AFTER</span>
          </div>
        )}
      </div>
    </section>
  );
}
