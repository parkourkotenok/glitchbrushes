import { useEffect, useRef, useState } from 'react';
import { defaultRetouchSettings, type RetouchSettings } from '../retouch/types';
import type { Rectangle } from '../types';

export function useRetouch() {
  const [retouchSettings, setRetouchSettings] = useState<RetouchSettings>(defaultRetouchSettings);
  const retouchSettingsRef = useRef(retouchSettings);
  const [cloneSource, setCloneSource] = useState<Rectangle | null>(null);
  const [cloneSourcePickMode, setCloneSourcePickMode] = useState(false);
  const [feedbackMemoryVersion, setFeedbackMemoryVersion] = useState(0);
  const retouchWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    retouchSettingsRef.current = retouchSettings;
  }, [retouchSettings]);

  return {
    retouchSettings,
    setRetouchSettings,
    retouchSettingsRef,
    cloneSource,
    setCloneSource,
    cloneSourcePickMode,
    setCloneSourcePickMode,
    feedbackMemoryVersion,
    setFeedbackMemoryVersion,
    retouchWorkerRef,
  };
}
