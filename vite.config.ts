import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**'],

    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/engine/**/*.ts', 'src/data/*Parser.ts', 'src/lib/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: { statements: 70, branches: 60, functions: 70, lines: 75 }
    }
  }
});
