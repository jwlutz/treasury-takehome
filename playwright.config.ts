import { defineConfig } from '@playwright/test';

// e2e specs are named *.e2e.ts so vitest (which owns *.test.ts) never picks them up.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:4020' },
  webServer: {
    command: 'npx next dev -p 4020',
    url: 'http://localhost:4020',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
