import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { HelpProvider } from './help/HelpContext';
import './styles.css';
import './styles/tokens.css';
import './styles/surfaces.css';
import './styles/controls.css';
import './styles/brand.css';
import './styles/layout.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelpProvider>
      <App />
    </HelpProvider>
  </StrictMode>,
);
