import { useCallback, useRef, useState } from 'react';
import type { EditorDocument } from '../types';
import { pixelToByteOffset } from '../utils/geometry';

export function createDemoDocument(): EditorDocument {
  const width = 1120;
  const height = 720;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelToByteOffset(x, y, width);
      const band = Math.floor(x / 140) % 2;
      const grid = x % 56 < 2 || y % 56 < 2;
      const circle = Math.hypot(x - width * 0.72, y - height * 0.48) < 180;
      const diagonal = Math.abs(y - (x * 0.42 + 80)) < 44;
      pixels[offset] = grid ? 56 : circle ? 207 : diagonal ? 177 : 36 + (x / width) * 86;
      pixels[offset + 1] = grid
        ? 58
        : circle
          ? 73 + (y / height) * 80
          : diagonal
            ? 172
            : 44 + (y / height) * 90;
      pixels[offset + 2] = grid ? 61 : circle ? 62 : diagonal ? 125 : 54 + band * 18;
      pixels[offset + 3] = 255;
    }
  }
  return {
    width,
    height,
    original: pixels.slice(),
    pixels,
    fileName: 'signal-study-demo.png',
    mimeType: 'image/png',
    rawOriginal: null,
    rawMutated: null,
    dirty: false,
  };
}

export function useDocument() {
  const docRef = useRef<EditorDocument>(null!);
  if (!docRef.current) docRef.current = createDemoDocument();
  const [documentVersion, setDocumentVersion] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [exportName, setExportName] = useState('signal-study-demo');

  const bumpDocument = useCallback(() => {
    setDocumentVersion((version) => version + 1);
  }, []);

  return {
    docRef,
    documentVersion,
    bumpDocument,
    processing,
    setProcessing,
    exportName,
    setExportName,
  };
}
