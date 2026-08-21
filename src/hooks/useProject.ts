import { useRef, useState } from 'react';

export function useProject() {
  const [projectOpen, setProjectOpen] = useState(false);
  const projectInputRef = useRef<HTMLInputElement>(null);

  return {
    projectOpen,
    setProjectOpen,
    projectInputRef,
  };
}
