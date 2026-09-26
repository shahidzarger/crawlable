import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    /*
     * Per-file override: a component test declares
     * `// @vitest-environment jsdom` at the top. Node stays the default
     * because it is faster and because most of this suite is pure logic.
     */
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
  },
  // The component test uses JSX. tsconfig's "jsx": "preserve" is for Next's
  // compiler, not for esbuild, so the automatic runtime is set here or
  // "React is not defined" at render time.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
