import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 4000}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${process.env.PORT || 4000}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
