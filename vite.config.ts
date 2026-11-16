import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@server': fileURLToPath(new URL('./src/server', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/src/server/**', '**/docs/**', '**/data/**', '**/scripts/**', '**/.git/**']
    },
    proxy: {
      '/api': 'http://127.0.0.1:4399',
      '/audio': 'http://127.0.0.1:4399'
    }
  },
  build: { outDir: 'dist/web', emptyOutDir: true }
});