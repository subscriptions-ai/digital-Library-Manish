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
      // Split the (previously ~4.8MB) single bundle into vendor chunks. This lowers
      // peak memory during the rollup render/minify phase, which was OOM-killing the
      // deploy build ("transforming..." -> exit 255) on the memory-limited container.
      chunkSizeWarningLimit: 1500,
      // Skip the gzip-size report pass — saves build time & a little memory.
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('three')) return 'three';
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'pdf';
            if (id.includes('framer-motion') || id.includes('/motion/')) return 'motion';
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts';
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('/scheduler/')) return 'react-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
});
