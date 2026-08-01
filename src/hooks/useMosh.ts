import { useRef, useState } from 'react';
import { MoshJobGate } from '../mosh/transaction';
import { createMoshCard, type MoshEffectCard, type MoshProgress } from '../mosh/types';
import type { Rectangle } from '../types';

export function useMosh() {
  const [moshProcessing, setMoshProcessing] = useState(false);
  const [moshProgress, setMoshProgress] = useState<MoshProgress | null>(null);
  const [moshRack, setMoshRack] = useState<MoshEffectCard[]>(() => [createMoshCard('pixel-sort')]);
  const [moshSeed, setMoshSeed] = useState('mosh-9A31');
  const [moshPreviewEnabled, setMoshPreviewEnabled] = useState(false);
  const [moshPreviewStale, setMoshPreviewStale] = useState(false);
  const [, setMoshPreviewVersion] = useState(0);
  const [moshRegionTool, setMoshRegionTool] = useState<{
    ownerEffectInstanceId: string;
    mode: 'source' | 'destination';
  } | null>(null);
  const [moshDraftRegion, setMoshDraftRegion] = useState<{
    ownerEffectInstanceId: string;
    type: 'source' | 'destination';
    bounds: Rectangle;
  } | null>(null);
  const moshWorkerRef = useRef<Worker | null>(null);
  const moshJobGateRef = useRef(new MoshJobGate());
  const moshPreviewBufferRef = useRef<Uint8ClampedArray | null>(null);
  const moshPreviewSignatureRef = useRef('');

  return {
    moshProcessing,
    setMoshProcessing,
    moshProgress,
    setMoshProgress,
    moshRack,
    setMoshRack,
    moshSeed,
    setMoshSeed,
    moshPreviewEnabled,
    setMoshPreviewEnabled,
    moshPreviewStale,
    setMoshPreviewStale,
    setMoshPreviewVersion,
    moshRegionTool,
    setMoshRegionTool,
    moshDraftRegion,
    setMoshDraftRegion,
    moshWorkerRef,
    moshJobGateRef,
    moshPreviewBufferRef,
    moshPreviewSignatureRef,
  };
}
