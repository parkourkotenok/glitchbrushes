import { useCallback, useState } from 'react';
import type { EditorDocument } from '../types';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export type DocRef = { current: EditorDocument };

export function useExport(docRef: DocRef) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [exportQuality, setExportQuality] = useState(0.9);
  const [preserveTransparency, setPreserveTransparency] = useState(true);
  const [exportBackground, setExportBackground] = useState('#ffffff');
  const [embedProjectImage, setEmbedProjectImage] = useState(false);

  const renderExportCanvas = useCallback((): HTMLCanvasElement => {
    const current = docRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = current.width;
    canvas.height = current.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Export canvas is unavailable.');
    const flatten = exportFormat === 'jpeg' || !preserveTransparency;
    if (flatten) {
      context.fillStyle = exportBackground;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const working = document.createElement('canvas');
    working.width = current.width;
    working.height = current.height;
    working
      .getContext('2d')
      ?.putImageData(new ImageData(current.pixels, current.width, current.height), 0, 0);
    context.drawImage(working, 0, 0);
    return canvas;
  }, [docRef, exportBackground, exportFormat, preserveTransparency]);

  return {
    exportOpen,
    setExportOpen,
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality,
    preserveTransparency,
    setPreserveTransparency,
    exportBackground,
    setExportBackground,
    embedProjectImage,
    setEmbedProjectImage,
    renderExportCanvas,
  };
}
