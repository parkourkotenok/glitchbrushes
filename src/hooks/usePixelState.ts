import { useState } from 'react';

export interface CursorInfo {
  x: number;
  y: number;
  inside: boolean;
}

export function usePixelState() {
  const [selectedByte, setSelectedByte] = useState(0);
  const [selectedPixels, setSelectedPixels] = useState<number[]>([0]);
  const [cursorInfo, setCursorInfo] = useState<CursorInfo>({ x: 0, y: 0, inside: false });

  return {
    selectedByte,
    setSelectedByte,
    selectedPixels,
    setSelectedPixels,
    cursorInfo,
    setCursorInfo,
  };
}
