import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // Coverage is measured against the core business-logic modules these
      // tests exercise (pure logic + orchestration), not the whole Next app.
      include: [
        'lib/agents/**/*.ts',
        'lib/agent-orchestration.ts',
        'lib/workflow-generator.ts',
        'lib/canvas-normalize.ts',
        'lib/encryption.ts',
        'lib/onboarding-multi.ts',
        'lib/onboarding-labels.ts',
        'lib/strip-internal-tags.ts',
        'lib/sync-decision.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
