import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Layers3,
  Lock,
  MoreHorizontal,
  Plus,
  Scaling,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  LAYER_TILE_SIZE,
  activeLayer,
  addLayer,
  clearActiveLayer,
  deleteActiveLayer,
  duplicateActiveLayer,
  mergeActiveLayerDown,
  moveActiveLayer,
  moveLayerToLayer,
  toggleSoloActiveLayer,
  type LayerStack,
  type SparseLayer,
} from '../layers/sparseLayers';
import type { LayerBlendMode } from '../types';

interface LayersDockProps {
  layerStack: LayerStack;
  layerVersion: number;
  currentLayer: { id: string; name: string; opacity: number; blendMode: LayerBlendMode };
  backgroundSelected: boolean;
  sampleAllLayers: boolean;
  onFlattenLayers(): void;
  onSelectBackground(): void;
  onUnlockBackground(): void;
  onBeginTransform(): void;
  onSampleAllLayersChange(value: boolean): void;
  onSelectLayer(id: string, name: string): void;
  onRunLayerOperation(label: string, mutate: (stack: LayerStack) => boolean | void): void;
}

function LayerThumbnail({
  layer,
  width,
  height,
  version,
}: {
  layer: SparseLayer;
  width: number;
  height: number;
  version: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min((canvas.width - 4) / width, (canvas.height - 4) / height);
    const offsetX = (canvas.width - width * scale) / 2;
    const offsetY = (canvas.height - height * scale) / 2;
    const preview = context.createImageData(canvas.width, canvas.height);
    for (let previewY = 0; previewY < canvas.height; previewY += 1) {
      for (let previewX = 0; previewX < canvas.width; previewX += 1) {
        const imageX = Math.floor((previewX - offsetX) / scale);
        const imageY = Math.floor((previewY - offsetY) / scale);
        if (imageX < 0 || imageY < 0 || imageX >= width || imageY >= height) continue;
        let source: Uint8ClampedArray | null = null;
        let sourceOffset = 0;
        const raster = layer.raster;
        if (
          raster &&
          imageX >= raster.x &&
          imageY >= raster.y &&
          imageX < raster.x + raster.width &&
          imageY < raster.y + raster.height
        ) {
          source = raster.pixels;
          sourceOffset = ((imageY - raster.y) * raster.width + imageX - raster.x) * 4;
        }
        const tileX = Math.floor(imageX / LAYER_TILE_SIZE);
        const tileY = Math.floor(imageY / LAYER_TILE_SIZE);
        const tile = layer.tiles.get(`${tileX}:${tileY}`);
        if (tile) {
          const localX = imageX - tileX * LAYER_TILE_SIZE;
          const localY = imageY - tileY * LAYER_TILE_SIZE;
          const tileOffset = (localY * tile.width + localX) * 4;
          if (tile.pixels[tileOffset + 3]) {
            source = tile.pixels;
            sourceOffset = tileOffset;
          }
        }
        if (!source) continue;
        const destination = (previewY * canvas.width + previewX) * 4;
        preview.data.set(source.subarray(sourceOffset, sourceOffset + 4), destination);
      }
    }
    context.putImageData(preview, 0, 0);
  }, [height, layer, version, width]);
  return <canvas ref={ref} width={34} height={28} aria-hidden="true" />;
}

function LayerOpacity({
  layerId,
  value,
  disabled,
  onCommit,
}: {
  layerId: string;
  value: number;
  disabled?: boolean;
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState(Math.round(value * 100));
  useEffect(() => setDraft(Math.round(value * 100)), [layerId, value]);
  const commit = () => {
    const next = draft / 100;
    if (Math.abs(next - value) > 0.001) onCommit(next);
  };
  return (
    <label className="layers-opacity">
      <span>Opacity</span>
      <input
        aria-label="Layer opacity"
        type="range"
        min={0}
        max={100}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End')
            commit();
        }}
        onBlur={commit}
      />
      <output>{draft}%</output>
    </label>
  );
}

export function LayersDock({
  layerStack,
  layerVersion,
  currentLayer,
  backgroundSelected,
  sampleAllLayers,
  onFlattenLayers,
  onSelectBackground,
  onUnlockBackground,
  onBeginTransform,
  onSampleAllLayersChange,
  onSelectLayer,
  onRunLayerOperation,
}: LayersDockProps) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const beginLayerDrag = (event: DragEvent<HTMLElement>, layerId: string) => {
    event.stopPropagation();
    setDraggedLayerId(layerId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-glitchbrush-layer', layerId);
  };
  const dropLayer = (event: DragEvent<HTMLElement>, targetLayerId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const layerId = draggedLayerId || event.dataTransfer.getData('application/x-glitchbrush-layer');
    setDraggedLayerId(null);
    if (!layerId || layerId === targetLayerId) return;
    onRunLayerOperation('Reorder layers', (stack) =>
      moveLayerToLayer(stack, layerId, targetLayerId),
    );
  };
  return (
    <section className="layers-dock" aria-label="Layers">
      <header>
        <span>
          <Layers3 size={14} /> Layers
        </span>
        <small>{layerStack.layers.length}</small>
      </header>

      <div className="layers-properties-bar">
        <button
          type="button"
          className={`layers-sample-all ${sampleAllLayers ? 'active' : ''}`}
          aria-pressed={sampleAllLayers}
          title="Use the visible composite as the effect source"
          onClick={() => onSampleAllLayersChange(!sampleAllLayers)}
        >
          All Layers
        </button>
        <select
          aria-label="Layer blend mode"
          value={currentLayer.blendMode}
          disabled={backgroundSelected}
          onChange={(event) => {
            const blendMode = event.target.value as LayerBlendMode;
            onRunLayerOperation('Change layer blend mode', (stack) => {
              activeLayer(stack).blendMode = blendMode;
            });
          }}
        >
          <option value="source-over">Normal</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
          <option value="difference">Difference</option>
        </select>
        <LayerOpacity
          layerId={currentLayer.id}
          value={currentLayer.opacity}
          disabled={backgroundSelected}
          onCommit={(opacity) =>
            onRunLayerOperation('Change layer opacity', (stack) => {
              activeLayer(stack).opacity = opacity;
            })
          }
        />
      </div>

      <div className="layers-dock-scroll">
        <div className="layer-stack" data-layer-version={layerVersion}>
          {[...layerStack.layers].reverse().map((item) => {
            const selected = !backgroundSelected && item.id === layerStack.activeLayerId;
            return (
              <div
                className={`layer-stack-row ${selected ? 'active' : ''} ${draggedLayerId === item.id ? 'dragging' : ''}`}
                key={item.id}
                onDragOver={(event) => {
                  if (!draggedLayerId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => dropLayer(event, item.id)}
              >
                <button
                  type="button"
                  className="layer-drag-handle"
                  draggable
                  aria-label={`Move ${item.name}`}
                  title="Drag to reorder layer"
                  onDragStart={(event) => beginLayerDrag(event, item.id)}
                  onDragEnd={(event) => {
                    event.stopPropagation();
                    setDraggedLayerId(null);
                  }}
                >
                  <GripVertical size={13} />
                </button>
                <button
                  className="layer-visibility"
                  aria-label={item.visible ? `Hide ${item.name}` : `Show ${item.name}`}
                  title={item.visible ? 'Hide layer' : 'Show layer'}
                  onClick={() =>
                    onRunLayerOperation('Toggle layer visibility', (stack) => {
                      const target = stack.layers.find((candidate) => candidate.id === item.id);
                      if (!target) return false;
                      target.visible = !target.visible;
                    })
                  }
                >
                  {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  className="layer-select-button"
                  onClick={() => onSelectLayer(item.id, item.name)}
                >
                  <span className="layer-thumbnail brush-checker">
                    <LayerThumbnail
                      layer={item}
                      width={layerStack.width}
                      height={layerStack.height}
                      version={layerVersion}
                    />
                  </span>
                  <span className="layer-row-copy">
                    <strong>{item.name}</strong>
                    <small>
                      Layer · {item.blendMode === 'source-over' ? 'Normal' : item.blendMode}
                    </small>
                  </span>
                </button>
                <button
                  className="layer-lock-button"
                  aria-label={item.locked ? `Unlock ${item.name}` : `Lock ${item.name}`}
                  title={item.locked ? 'Unlock layer' : 'Lock layer'}
                  onClick={() =>
                    onRunLayerOperation(item.locked ? 'Unlock layer' : 'Lock layer', (stack) => {
                      const target = stack.layers.find((candidate) => candidate.id === item.id);
                      if (!target) return false;
                      target.locked = !target.locked;
                    })
                  }
                >
                  {item.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              </div>
            );
          })}
          {layerStack.backgroundVisible && (
            <div className={`layer-stack-row original-layer ${backgroundSelected ? 'active' : ''}`}>
              <span className="layer-drag-handle" aria-hidden="true" />
              <span className="layer-visibility">
                <Eye size={14} />
              </span>
              <button
                className="layer-select-button"
                aria-pressed={backgroundSelected}
                onClick={onSelectBackground}
              >
                <span className="layer-thumbnail original-thumbnail" />
                <span className="layer-row-copy">
                  <strong>Background</strong>
                  <small>White canvas · locked until promoted</small>
                </span>
              </button>
              <button
                type="button"
                className="layer-lock-button"
                aria-label="Unlock Background"
                title="Convert Background to an editable layer"
                onClick={onUnlockBackground}
              >
                <Lock size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="layers-toolbar" aria-label="Layer actions">
        <button
          aria-label="Transform layer"
          title="Transform layer"
          disabled={backgroundSelected}
          onClick={onBeginTransform}
        >
          <Scaling size={14} />
        </button>
        <button
          aria-label="Add layer"
          title="Add layer"
          onClick={() =>
            onRunLayerOperation('Add layer', (stack) => {
              const layer = addLayer(stack, undefined, 'image');
              onSelectLayer(layer.id, layer.name);
            })
          }
        >
          <Plus size={15} />
        </button>
        <button
          aria-label="Duplicate layer"
          title="Duplicate layer"
          disabled={backgroundSelected}
          onClick={() =>
            onRunLayerOperation('Duplicate layer', (stack) => {
              duplicateActiveLayer(stack);
            })
          }
        >
          <Copy size={14} />
        </button>
        <button
          aria-label="Move layer up"
          title="Move layer up"
          disabled={backgroundSelected}
          onClick={() => onRunLayerOperation('Move layer up', (stack) => moveActiveLayer(stack, 1))}
        >
          <ChevronUp size={15} />
        </button>
        <button
          aria-label="Move layer down"
          title="Move layer down"
          disabled={backgroundSelected}
          onClick={() =>
            onRunLayerOperation('Move layer down', (stack) => moveActiveLayer(stack, -1))
          }
        >
          <ChevronDown size={15} />
        </button>
        <details className="layers-more">
          <summary aria-label="More layer actions" title="More layer actions">
            <MoreHorizontal size={16} />
          </summary>
          <div>
            <button
              disabled={backgroundSelected}
              onClick={() => onRunLayerOperation('Clear active layer', clearActiveLayer)}
            >
              Clear layer
            </button>
            <button
              disabled={backgroundSelected}
              onClick={() => onRunLayerOperation('Merge layer down', mergeActiveLayerDown)}
            >
              Merge down
            </button>
            <button
              disabled={backgroundSelected}
              onClick={() => onRunLayerOperation('Solo active layer', toggleSoloActiveLayer)}
            >
              {layerStack.soloLayerId ? 'Exit solo' : 'Solo layer'}
            </button>
            <button onClick={onFlattenLayers}>Flatten visible</button>
          </div>
        </details>
        <button
          className="layers-delete"
          disabled={backgroundSelected || layerStack.layers.length <= 1}
          aria-label="Delete layer"
          title="Delete layer"
          onClick={() => onRunLayerOperation('Delete active layer', deleteActiveLayer)}
        >
          <Trash2 size={14} />
        </button>
      </footer>
    </section>
  );
}
