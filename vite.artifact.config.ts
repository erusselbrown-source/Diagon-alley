import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** Single-bundle build of Cauldron Chaos for hosting as a standalone page (see scripts/build-artifact.mjs). */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-artifact',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      input: resolve(import.meta.dirname, 'potions.html'),
      output: { codeSplitting: false },
    },
  },
});
