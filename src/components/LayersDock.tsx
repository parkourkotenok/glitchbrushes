import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Layers3,
  Lock,
  MoreHorizontal,
  Plus,
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
  toggleSoloActiveLayer,
  type LayerStack,
  type SparseLayer,
} from '../layers/sparseLayers';
import type { LayerBlendMode } from '../types';

interface LayersDockProps {
  layerStack: LayerStack;
  layerVersion: number;
  currentLayer: { id: string; name: string; opacity: number; blendMode: LayerBlendMode };
  originalSelected: boolean;
  onFlattenLayers(): void;
  onSelectOriginal(): void;
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
    context.imageSmoothingEnabled = true;
    for (const tile of layer.tiles.values()) {
      const source = document.createElement('canvas');
      source.width = tile.width;
      source.height = tile.height;
      source
        .getContext('2d')
        ?.putImageData(new ImageData(tile.pixels, tile.width, tile.height), 0, 0);
      context.drawImage(
        source,
        offsetX + tile.tileX * LAYER_TILE_SIZE * scale,
        offsetY + tile.tileY * LAYER_TILE_SIZE * scale,
        tile.width * scale,
        tile.height * scale,
      );
    }
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
  originalSelected,
  onFlattenLayers,
  onSelectOriginal,
  onSelectLayer,
  onRunLayerOperation,
}: LayersDockProps) {
  return (
    <section className="layers-dock" aria-label="Layers">
      <header>
        <span>
          <Layers3 size={14} /> Layers
        </span>
        <small>{layerStack.layers.length}</small>
      </header>

      <div className="layers-properties-bar">
        <select
          aria-label="Layer blend mode"
          value={currentLayer.blendMode}
          disabled={originalSelected}
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
          disabled={originalSelected}
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
            const selected = !originalSelected && item.id === layerStack.activeLayerId;
            return (
              <div className={`layer-stack-row ${selected ? 'active' : ''}`} key={item.id}>
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
                    <small>{item.blendMode === 'source-over' ? 'Normal' : item.blendMode}</small>
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
          <div className={`layer-stack-row original-layer ${originalSelected ? 'active' : ''}`}>
            <span className="layer-visibility">
              <Eye size={14} />
            </span>
            <button
              className="layer-select-button"
              aria-pressed={originalSelected}
              onClick={onSelectOriginal}
            >
              <span className="layer-thumbnail original-thumbnail" />
              <span className="layer-row-copy">
                <strong>Original</strong>
                <small>Background</small>
              </span>
            </button>
            <span className="layer-lock-button">
              <Lock size={13} />
            </span>
          </div>
        </div>
      </div>

      <footer className="layers-toolbar" aria-label="Layer actions">
        <button
          aria-label="Add layer"
          title="Add layer"
          onClick={() =>
            onRunLayerOperation('Add glitch layer', (stack) => {
              const layer = addLayer(stack);
              onSelectLayer(layer.id, layer.name);
            })
          }
        >
          <Plus size={15} />
        </button>
        <button
          aria-label="Duplicate layer"
          title="Duplicate layer"
          disabled={originalSelected}
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
          disabled={originalSelected}
          onClick={() => onRunLayerOperation('Move layer up', (stack) => moveActiveLayer(stack, 1))}
        >
          <ChevronUp size={15} />
        </button>
        <button
          aria-label="Move layer down"
          title="Move layer down"
          disabled={originalSelected}
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
              disabled={originalSelected}
              onClick={() => onRunLayerOperation('Clear active layer', clearActiveLayer)}
            >
              Clear layer
            </button>
            <button
              disabled={originalSelected}
              onClick={() => onRunLayerOperation('Merge layer down', mergeActiveLayerDown)}
            >
              Merge down
            </button>
            <button
              disabled={originalSelected}
              onClick={() => onRunLayerOperation('Solo active layer', toggleSoloActiveLayer)}
            >
              {layerStack.soloLayerId ? 'Exit solo' : 'Solo layer'}
            </button>
            <button onClick={onFlattenLayers}>Flatten visible</button>
          </div>
        </details>
        <button
          className="layers-delete"
          disabled={originalSelected || layerStack.layers.length <= 1}
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
