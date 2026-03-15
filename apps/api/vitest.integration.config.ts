import { defineConfig } from 'vitest/config';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://sellgram:sellgram_pass@localhost:5433/sellgram_test';

export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    globalSetup: ['./src/test/integration-global-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DB_URL,
    },
  },
});
