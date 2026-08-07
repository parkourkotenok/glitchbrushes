import { ToolGlyph } from '../brand/ToolGlyph';

export type InspectorPanelId = 'effect' | 'retouch' | 'mosh' | 'image-brush' | 'raw';

interface InspectorTabsProps {
  activePanel: InspectorPanelId;
  onSelect: (panel: InspectorPanelId) => void;
}

export function InspectorTabs({ activePanel, onSelect }: InspectorTabsProps) {
  return (
    <nav className="inspector-tabs">
      <button
        className={activePanel === 'effect' ? 'active' : ''}
        onClick={() => onSelect('effect')}
        data-panel="effect"
      >
        <ToolGlyph id="effect" size={17} /> <span>Effect</span>
      </button>
      <button
        className={activePanel === 'retouch' ? 'active' : ''}
        onClick={() => onSelect('retouch')}
        data-panel="retouch"
      >
        <ToolGlyph id="retouch" size={17} /> <span>Retouch</span>
      </button>
      <button
        className={activePanel === 'mosh' ? 'active' : ''}
        onClick={() => onSelect('mosh')}
        data-panel="mosh"
      >
        <ToolGlyph id="mosh" size={17} /> <span>Mosh Lab</span>
      </button>
      <button
        className={activePanel === 'image-brush' ? 'active' : ''}
        onClick={() => onSelect('image-brush')}
        data-panel="image-brush"
      >
        <ToolGlyph id="image-brush" size={17} /> <span>Image Brush</span>
      </button>
      <button
        className={activePanel === 'raw' ? 'active' : ''}
        onClick={() => onSelect('raw')}
        data-panel="raw"
      >
        <ToolGlyph id="raw" size={17} /> <span>File Corruption</span>
      </button>
    </nav>
  );
}
