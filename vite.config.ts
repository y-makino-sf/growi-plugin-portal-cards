import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// classic変換により、カード内のJSXもGROWIから渡されたReactで生成します。
export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' })],
  build: {
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: 'client-entry.tsx' },
  },
  test: { environment: 'jsdom', clearMocks: true },
});