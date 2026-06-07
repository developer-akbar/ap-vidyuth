import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4201',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    // Strip all console.* and debugger statements from production builds
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-i18n':     ['react-i18next', 'i18next', 'i18next-browser-languagedetector'],
          'vendor-qr':       ['qrcode.react'],
          'vendor-dayjs':    ['dayjs'],
        }
      }
    },
    esbuildOptions: {
      drop: ['console', 'debugger'],
    }
  }
});