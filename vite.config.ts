import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(__dirname, 'node_modules/.vite'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3002,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3002,
    strictPort: true,
  },
});