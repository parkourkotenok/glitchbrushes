import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // The two heaviest interactive tabs (MoshLab, ImageBrushPanel) are loaded
    // lazily and code-split into their own chunks, keeping the initial bundle
    // below the warning threshold without silencing meaningful growth.
    chunkSizeWarningLimit: 550,
  },
});
