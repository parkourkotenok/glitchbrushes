/// <reference types="vite/client" />

interface Window {
  __GLITCH_BOOTSTRAP_AT__?: number;
  __GLITCH_PERF__?: import('./utils/performance').GlitchBrushPerformanceApi;
}

declare module '*?raw' {
  const source: string;
  export default source;
}
