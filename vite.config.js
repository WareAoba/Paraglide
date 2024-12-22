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
    exclude: ['react-contexify']
  },
  resolve: {
    extensions: ['.mjs', '.js', '.jsx', '.json', '.ts', '.tsx'],
    alias: {
        // React Contexify CSS 경로 재매핑
        'react-contexify/dist/ReactContexify.css': 'react-contexify/dist/ReactContexify.min.css'
      }
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: []
  },
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    target: 'esnext',  // 최신 브라우저 타겟팅
    minify: 'esbuild', // 더 빠른 압축
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          utils: ['./src/store/utils/'],
          styles: ['./src/CSS/']  // CSS 청크 분리
        },
        assetFileNames: 'assets/[hash][extname]', // 에셋 캐싱
        chunkFileNames: 'js/[name]-[hash].js',    // JS 청크 캐싱
        entryFileNames: 'js/[name]-[hash].js'     // 진입점 캐싱
      }
    },
    assetsInlineLimit: 4096, // 작은 에셋 인라인화
    cssCodeSplit: true,      // CSS 코드 분할
    sourcemap: false         // 프로덕션 소스맵 비활성화
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