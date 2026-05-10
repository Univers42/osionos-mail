import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const mailBridgeTarget = process.env.VITE_MAIL_BRIDGE_URL || 'http://localhost:4100';

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
    proxy: {
      '/auth': mailBridgeTarget,
      '/api/auth': mailBridgeTarget,
      '/mail/bridge': mailBridgeTarget,
      '/api/mail/bridge': mailBridgeTarget,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3002,
    strictPort: true,
  },
});