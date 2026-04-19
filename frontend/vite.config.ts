import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api/chat': {
        target: 'http://localhost:3002',
        timeout: 600000,
        // SSE requires these settings to prevent buffering
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['connection'] = 'keep-alive';
          });
        },
      },
      '/api': {
        target: 'http://localhost:3002',
        timeout: 120000,
      },
    },
  },
});
