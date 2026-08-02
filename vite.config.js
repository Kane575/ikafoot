import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.PORT || 3002;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    // Le proxy garde le front et l'API sur la même origine en développement :
    // le cookie de session admin fonctionne donc exactement comme en production.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
