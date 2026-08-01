import type { ChangeEvent, RefObject } from 'react';
import { Clipboard, Download, FileDown, FileUp } from 'lucide-react';
import { Modal } from './Modal';
import { SliderField } from './SliderField';
import { Toggle } from './ui/controls';
import { shortcuts } from '../utils/shortcutHelp';

interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <p className="shortcut-layout-note">
        Letter shortcuts follow physical key positions and work in both English and Russian keyboard
        layouts.
      </p>
      <div className="shortcut-grid">
        {shortcuts.map(([key, description]) => (
          <div key={key}>
            <kbd>{key}</kbd>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export type ExportFormat = 'png' | 'jpeg' | 'webp';

interface ExportModalProps {
  onClose: () => void;
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  name: string;
  onNameChange: (name: string) => void;
  quality: number;
  onQualityChange: (quality: number) => void;
  preserveTransparency: boolean;
  onPreserveTransparencyChange: (preserve: boolean) => void;
  background: string;
  onBackgroundChange: (background: string) => void;
  docWidth: number;
  docHeight: number;
  onExport: (copy: boolean) => void;
  onOpenProject: () => void;
}

export function ExportModal({
  onClose,
  format,
  onFormatChange,
  name,
  onNameChange,
  quality,
  onQualityChange,
  preserveTransparency,
  onPreserveTransparencyChange,
  background,
  onBackgroundChange,
  docWidth,
  docHeight,
  onExport,
  onOpenProject,
}: ExportModalProps) {
  return (
    <Modal title="Export image" onClose={onClose}>
      <div className="export-form">
        <label>
          <span>FORMAT</span>
          <select
            value={format}
            onChange={(event) => onFormatChange(event.target.value as ExportFormat)}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        <label>
          <span>FILE NAME</span>
          <input value={name} onChange={(event) => onNameChange(event.target.value)} />
        </label>
        {format !== 'png' && (
          <SliderField
            label="Encoding quality"
            value={quality}
            min={0.1}
            max={1}
            step={0.01}
            onChange={onQualityChange}
          />
        )}
        {format !== 'jpeg' && (
          <Toggle
            label="Preserve transparency"
            checked={preserveTransparency}
            onChange={onPreserveTransparencyChange}
          />
        )}
        {(format === 'jpeg' || !preserveTransparency) && (
          <label>
            <span>BACKGROUND COLOR</span>
            <input
              type="color"
              value={background}
              onChange={(event) => onBackgroundChange(event.target.value)}
            />
          </label>
        )}
        <p className="fine-print">
          Exports always keep the source pixel dimensions: {docWidth} × {docHeight}.
        </p>
        <div className="modal-actions">
          <button onClick={() => onExport(true)}>
            <Clipboard size={15} /> Copy PNG
          </button>
          <button className="primary" onClick={() => onExport(false)}>
            <Download size={15} /> Download
          </button>
        </div>
        <button className="link-button" onClick={onOpenProject}>
          <FileDown size={14} /> Project import / export
        </button>
      </div>
    </Modal>
  );
}

interface ProjectModalProps {
  onClose: () => void;
  embedImage: boolean;
  onEmbedImageChange: (embed: boolean) => void;
  onImportClick: () => void;
  onExport: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function ProjectModal({
  onClose,
  embedImage,
  onEmbedImageChange,
  onImportClick,
  onExport,
  inputRef,
  onFileChange,
}: ProjectModalProps) {
  return (
    <Modal title="Project data" onClose={onClose}>
      <div className="project-panel">
        <p>
          Project JSON stores settings and changed byte runs. The source image is omitted by default
          to keep the file small.
        </p>
        <Toggle
          label="Embed rendered image as base64"
          checked={embedImage}
          onChange={onEmbedImageChange}
        />
        <div className="modal-actions">
          <button onClick={onImportClick}>
            <FileUp size={15} /> Import project
          </button>
          <button className="primary" onClick={onExport}>
            <FileDown size={15} /> Export project
          </button>
        </div>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
        />
      </div>
    </Modal>
  );
}
