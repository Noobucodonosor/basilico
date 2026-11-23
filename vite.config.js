import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readStaticDataVersion() {
  try {
    const manifestPath = path.resolve(__dirname, 'public', 'data', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (m?.version) return String(m.version);
    }
  } catch (_) {}
  return String(Date.now());
}

export default defineConfig({
  base: process.env.VITE_STATIC_MODE === 'true' ? (process.env.VITE_BASE_PATH || './') : '/',
  define: {
    __CIBO_DATA_VERSION__: JSON.stringify(readStaticDataVersion())
  },
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    target: 'esnext'
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
