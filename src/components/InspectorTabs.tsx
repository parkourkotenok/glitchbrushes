import { Droplets, SlidersHorizontal } from 'lucide-react';
import { EffectIcon } from '../icons/effects';

export type InspectorPanelId = 'effect' | 'retouch' | 'mosh' | 'image-brush';

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
      >
        <SlidersHorizontal size={15} /> Effect
      </button>
      <button
        className={activePanel === 'retouch' ? 'active' : ''}
        onClick={() => onSelect('retouch')}
      >
        <Droplets size={15} /> Retouch
      </button>
      <button className={activePanel === 'mosh' ? 'active' : ''} onClick={() => onSelect('mosh')}>
        <EffectIcon id="motion-field" size={15} /> Mosh Lab
      </button>
      <button
        className={activePanel === 'image-brush' ? 'active' : ''}
        onClick={() => onSelect('image-brush')}
      >
        <EffectIcon id="image-brush" size={15} /> Image Brush
      </button>
    </nav>
  );
}
