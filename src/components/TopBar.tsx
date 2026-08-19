import type { ChangeEvent, RefObject } from 'react';
import {
  Download,
  Eye,
  FileImage,
  FileUp,
  HelpCircle,
  History,
  Image as ImageIcon,
  Redo2,
  ScanLine,
  Undo2,
} from 'lucide-react';
interface TopBarProps {
  doc: {
    fileName: string;
    width: number;
    height: number;
    mimeType: string;
    dirty: boolean;
  };
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadDemo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasPendingPreview: boolean;
  onUndo: () => void;
  onRedo: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  compareMode: 'off' | 'split' | 'blink';
  onCycleCompare: () => void;
  onOpenExport: () => void;
  helpMode: boolean;
  helpPanelOpen: boolean;
  onToggleHelp: () => void;
  onGoHome: () => void;
}

export function TopBar({
  doc,
  fileInputRef,
  onFileChange,
  onLoadDemo,
  canUndo,
  canRedo,
  hasPendingPreview,
  onUndo,
  onRedo,
  historyOpen,
  onToggleHistory,
  compareMode,
  onCycleCompare,
  onOpenExport,
  helpMode,
  helpPanelOpen,
  onToggleHelp,
  onGoHome,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="brand"
        onClick={onGoHome}
        aria-label="Return to the Parkour Kotenok tool picker"
      >
        <div className="brand-mark">
          <ScanLine size={18} />
        </div>
        <div>
          <strong>GLITCH BRUSHES</strong>
          <span>PARKOUR KOTENOK / LOCAL GLITCH INSTRUMENT</span>
        </div>
      </button>
      <div className="topbar-file">
        <FileImage size={15} />
        <div>
          <strong>{doc.fileName}</strong>
          <span>
            {doc.width} × {doc.height} / {doc.mimeType.replace('image/', '').toUpperCase()}
          </span>
        </div>
        {doc.dirty && <i title="Unsaved changes" />}
      </div>
      <div className="topbar-actions">
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileChange}
        />
        <button onClick={() => fileInputRef.current?.click()} aria-label="Open image">
          <FileUp size={15} /> Open
        </button>
        <button onClick={onLoadDemo} aria-label="Load demo image">
          <ImageIcon size={15} /> Demo
        </button>
        <span className="toolbar-separator" />
        <button
          disabled={!canUndo && !hasPendingPreview}
          onClick={onUndo}
          title="Undo — Ctrl+Z"
          aria-label="Undo"
        >
          <Undo2 size={15} />
        </button>
        <button
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo — Ctrl+Shift+Z / Ctrl+Y"
          aria-label="Redo"
        >
          <Redo2 size={15} />
        </button>
        <button
          className={historyOpen ? 'active' : ''}
          onClick={onToggleHistory}
          title="History"
          aria-label="Open history"
        >
          <History size={15} />
        </button>
        <span className="toolbar-separator" />
        <button className={compareMode !== 'off' ? 'active' : ''} onClick={onCycleCompare}>
          <Eye size={15} /> Compare
        </button>
        <button className="primary" onClick={onOpenExport}>
          <Download size={15} /> Export
        </button>
        <button
          className={`icon-button ${helpMode || helpPanelOpen ? 'active' : ''}`}
          onClick={onToggleHelp}
          title="Contextual help and Help Mode"
          aria-label="Open contextual help"
        >
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  );
}
