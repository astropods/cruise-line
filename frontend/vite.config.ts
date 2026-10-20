import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mockApi } from './dev/mock-api';

// `bun run dev:mock` serves fake API responses from dev/mock-api.ts instead
// of proxying to the agent, so the UI runs with no backend at all.
const mock = process.env.MOCK_API === '1';

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(mock ? [mockApi()] : [])],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: mock ? 5174 : 5173,
    proxy: mock ? undefined : {
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
