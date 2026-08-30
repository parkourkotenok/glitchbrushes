import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { HelpProvider } from './help/HelpContext';
import { recordPerformanceMeasure } from './utils/performance';
import './styles.css';
import './inspectorRedesign.css';

const moduleReadyAt = performance.now();
if (window.__GLITCH_BOOTSTRAP_AT__ !== undefined) {
  recordPerformanceMeasure('glitchbrushes:app-module-ready', window.__GLITCH_BOOTSTRAP_AT__);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelpProvider>
      <App />
    </HelpProvider>
  </StrictMode>,
);

requestAnimationFrame(() => {
  recordPerformanceMeasure('glitchbrushes:react-first-paint', moduleReadyAt);
});
