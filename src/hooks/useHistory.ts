import { useCallback, useRef, useState } from 'react';
import { PatchHistory } from '../history/PatchHistory';
import type { HistoryAction } from '../types';

export function useHistory() {
  const historyRef = useRef(new PatchHistory(50));
  const [historyVersion, setHistoryVersionState] = useState(0);
  const [historyOpen, setHistoryOpenState] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<HistoryAction | null>(null);

  const bumpHistory = useCallback(() => {
    setHistoryVersionState((version) => version + 1);
  }, []);

  const commitHistory = useCallback((action: HistoryAction) => {
    historyRef.current.push(action);
    setHistoryVersionState((version) => version + 1);
  }, []);

  const commitPendingPreview = useCallback(() => {
    if (!pendingPreview) return;
    historyRef.current.push(pendingPreview);
    setPendingPreview(null);
    setHistoryVersionState((version) => version + 1);
  }, [pendingPreview]);

  const clearHistory = useCallback(() => {
    historyRef.current.clear();
    setHistoryVersionState((version) => version + 1);
  }, []);

  const toggleHistoryOpen = useCallback(() => {
    setHistoryOpenState((open) => !open);
  }, []);

  const closeHistoryOpen = useCallback(() => {
    setHistoryOpenState(false);
  }, []);

  return {
    historyRef,
    historyVersion,
    bumpHistory,
    commitHistory,
    commitPendingPreview,
    clearHistory,
    pendingPreview,
    setPendingPreview,
    historyOpen,
    toggleHistoryOpen,
    closeHistoryOpen,
  };
}
