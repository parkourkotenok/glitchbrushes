import { useRef, useState } from 'react';
import { loadCustomPresets } from '../presets';
import type { Preset } from '../types';

export function useProject() {
  const [projectOpen, setProjectOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => loadCustomPresets());
  const projectInputRef = useRef<HTMLInputElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);

  return {
    projectOpen,
    setProjectOpen,
    customPresets,
    setCustomPresets,
    projectInputRef,
    presetInputRef,
  };
}
