import { useCallback, useRef, useState } from 'react';
import type { EditorDocument } from '../types';

/**
 * The real demo image is decoded asynchronously immediately after mount.  Keep
 * the document used during that hand-off deliberately tiny: constructing the
 * previous 1120×720 procedural "signal study" blocked the UI before the demo
 * request could even start, and briefly displayed an unrelated image.
 */
export function createDemoDocument(): EditorDocument {
  const width = 1;
  const height = 1;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const background = new Uint8ClampedArray(width * height * 4);
  background.fill(255);
  return {
    width,
    height,
    background,
    original: pixels.slice(),
    pixels,
    fileName: 'loading-demo-image.png',
    mimeType: 'image/png',
    dirty: false,
  };
}

export function useDocument() {
  const docRef = useRef<EditorDocument>(null!);
  if (!docRef.current) docRef.current = createDemoDocument();
  const [documentVersion, setDocumentVersion] = useState(0);
  const [documentSurfaceVersion, setDocumentSurfaceVersion] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [exportName, setExportName] = useState('glitch-brushes');

  const bumpDocument = useCallback(() => {
    setDocumentVersion((version) => version + 1);
  }, []);

  const bumpDocumentSurface = useCallback(() => {
    setDocumentVersion((version) => version + 1);
    setDocumentSurfaceVersion((version) => version + 1);
  }, []);

  return {
    docRef,
    documentVersion,
    documentSurfaceVersion,
    bumpDocument,
    bumpDocumentSurface,
    processing,
    setProcessing,
    exportName,
    setExportName,
  };
}
