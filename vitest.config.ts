import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    execArgv: ['--no-warnings=ExperimentalWarning'],
    testTimeout: 30000,
  },
});
