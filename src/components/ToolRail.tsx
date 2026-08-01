import {
  Brush,
  Droplets,
  Eraser,
  Focus,
  Hand,
  Maximize2,
  MousePointer2,
  RefreshCcw,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import type { Tool } from '../types';

type ActivePanel = 'effect' | 'retouch' | 'mosh' | 'image-brush' | 'raw';

interface ToolRailProps {
  tool: Tool;
  onSelectTool: (tool: Tool) => void;
  onSelectPanel: (panel: ActivePanel) => void;
  onRandomGlitch: () => void;
  onFitToScreen: () => void;
  onZoom100: () => void;
  onResetChanges: () => void;
}

export function ToolRail({
  tool,
  onSelectTool,
  onSelectPanel,
  onRandomGlitch,
  onFitToScreen,
  onZoom100,
  onResetChanges,
}: ToolRailProps) {
  return (
    <aside className="tool-rail">
      <button
        className={tool === 'brush' ? 'active' : ''}
        onClick={() => {
          onSelectTool('brush');
          onSelectPanel('effect');
        }}
        title="Glitch Brush (B)"
      >
        <Brush size={20} />
        <span>B</span>
      </button>
      <button
        className={tool === 'hand' ? 'active' : ''}
        onClick={() => onSelectTool('hand')}
        title="Hand (H)"
      >
        <Hand size={20} />
        <span>H</span>
      </button>
      <div className="rail-rule" />
      <div className="rail-group-label">RETOUCH</div>
      <button
        className={tool === 'smudge' ? 'active' : ''}
        onClick={() => {
          onSelectTool('smudge');
          onSelectPanel('retouch');
        }}
        title="Smudge · physical S key (works on Cyrillic layout)"
      >
        <Droplets size={19} />
        <span>S</span>
      </button>
      <button
        className={tool === 'blur' ? 'active' : ''}
        onClick={() => {
          onSelectTool('blur');
          onSelectPanel('retouch');
        }}
        title="Blur · physical U key (works on Cyrillic layout)"
      >
        <Focus size={19} />
        <span>U</span>
      </button>
      <button
        className={tool === 'sharpen' ? 'active' : ''}
        onClick={() => {
          onSelectTool('sharpen');
          onSelectPanel('retouch');
        }}
        title="Sharpen · physical J key (works on Cyrillic layout)"
      >
        <WandSparkles size={19} />
        <span>J</span>
      </button>
      <button
        className={tool === 'restore' ? 'active' : ''}
        onClick={() => {
          onSelectTool('restore');
          onSelectPanel('retouch');
        }}
        title="Restore · physical E key (works on Cyrillic layout)"
      >
        <RefreshCcw size={19} />
        <span>E</span>
      </button>
      <button
        className={tool === 'eraser' ? 'active' : ''}
        onClick={() => {
          onSelectTool('eraser');
          onSelectPanel('retouch');
        }}
        title="Eraser · physical X key (works on Cyrillic layout)"
      >
        <Eraser size={19} />
        <span>X</span>
      </button>
      <div className="rail-rule" />
      <button onClick={onRandomGlitch} title="Random glitch (G)">
        <WandSparkles size={20} />
        <span>G</span>
      </button>
      <button onClick={onFitToScreen} title="Fit to screen (F)">
        <Maximize2 size={20} />
        <span>F</span>
      </button>
      <button onClick={onZoom100} title="100% zoom (1)">
        <MousePointer2 size={20} />
        <span>1</span>
      </button>
      <div className="rail-spacer" />
      <button onClick={onResetChanges} title="Reset all changes">
        <Trash2 size={19} />
      </button>
    </aside>
  );
}
