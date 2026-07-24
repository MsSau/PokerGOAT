import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vitest/config';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Proxies to server.ts (run via `npm run server` / `npm run dev:all`)
      // so GEMINI_API_KEY never has to be exposed to the client bundle —
      // see server.ts's file header for the full reasoning.
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.API_PORT || 8787}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      // Deterministic engines under src/lib/ are plain TS, no DOM needed.
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
