/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps every asset path relative, so the build works at
// https://<user>.github.io/schema/ or any other subpath without changes.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // The startup bundle is React + Dexie + the YAML parser (~155 kB gzipped).
    // Export/import and sync load on demand. Raise this deliberately, not casually.
    chunkSizeWarningLimit: 560,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
