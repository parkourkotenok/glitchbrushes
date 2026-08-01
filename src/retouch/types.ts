import type { BrushSettings, Point, Rectangle } from '../types';

export type RetouchTool = 'smudge' | 'blur' | 'sharpen' | 'restore' | 'eraser';
export type RestoreSource = 'original' | 'lower-layer' | 'previous-history';

export interface RetouchSettings {
  smudgePickup: number;
  smudgeWetness: number;
  smudgePressureStrength: boolean;
  blurRadius: number;
  blurIterations: number;
  blurEdgeProtection: number;
  sharpenRadius: number;
  sharpenThreshold: number;
  sharpenProtectNoise: number;
  sampleMergedLayers: boolean;
  restoreSource: RestoreSource;
}

export const defaultRetouchSettings: RetouchSettings = {
  smudgePickup: 0.72,
  smudgeWetness: 0.48,
  smudgePressureStrength: true,
  blurRadius: 7,
  blurIterations: 2,
  blurEdgeProtection: 0.34,
  sharpenRadius: 3,
  sharpenThreshold: 8,
  sharpenProtectNoise: 0.42,
  sampleMergedLayers: true,
  restoreSource: 'original',
};

export interface RetouchPathPoint extends Point {
  pressure: number;
}

export interface RetouchProcessRequest {
  jobId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  samplePixels?: ArrayBuffer;
  sourcePixels?: ArrayBuffer;
  mask: ArrayBuffer;
  maskBounds: Rectangle;
  path: RetouchPathPoint[];
  tool: RetouchTool;
  brush: BrushSettings;
  settings: RetouchSettings;
}

export interface RetouchProgress {
  jobId: string;
  effectName: string;
  percent: number;
}

export interface RetouchProcessResult {
  jobId: string;
  pixels: Uint8ClampedArray;
  writeBounds: Rectangle;
  affectedPixels: number;
}
