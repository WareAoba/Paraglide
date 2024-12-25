import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173
      }
  },
  optimizeDeps: {
    include: ['@electron/remote'],
    exclude: ['electron']
  },
  resolve: {
    extensions: ['.mjs', '.js', '.jsx', '.json', '.ts', '.tsx'],
    alias: {
        '@': path.resolve(__dirname, 'src')
      }
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: []
  },
  base: './',  // 상대 경로로 변경
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react';
            return 'vendor';
          }
        }
      }
    }
  },
  css: {
    devSourcemap: false,
    postcss: {
      map: false
    },
    preprocessorOptions: {
      map: false
    }
  }
});