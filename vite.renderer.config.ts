import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src/renderer',
  build: {
    emptyOutDir: true,
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
  },
});
