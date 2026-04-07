import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    setupFiles: ['tests/setup.js'],
    env: {
      NODE_ENV: 'development'
    },
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/main/**'],
    },
  },
});
