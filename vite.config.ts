import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // NOTE: manual vendor-chunk splitting was tried to cut build memory, but it
      // split React across chunks and blank-screened the app at runtime. The deploy
      // OOM is instead solved with server swap, so we keep Vite's safe default
      // chunking. Only skip the gzip-size report pass (harmless build speedup).
      chunkSizeWarningLimit: 1500,
      reportCompressedSize: false,
    },
  };
});
