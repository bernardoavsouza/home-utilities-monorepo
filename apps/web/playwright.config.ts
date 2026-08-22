import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const repoRoot = path.resolve(__dirname, '../..');
const apiUrl = 'http://127.0.0.1:3001';
const webUrl = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
  },
  /**
   * Both apps, not just the web one: an e2e that cannot reach the API is not an
   * e2e. Playwright owns the whole stack, so nothing here ever points at a
   * deployed environment — CI boots the same two servers a developer runs.
   *
   * Locally these are the dev servers and an already-running one is reused. In CI
   * they are the built artifacts, which is what actually gets shipped.
   */
  webServer: [
    {
      command: isCI ? 'pnpm --filter api start:prod' : 'pnpm --filter api dev',
      // Liveness, not readiness: the API boots without Postgres (Prisma connects
      // lazily), and waiting on the database here would hide that.
      url: `${apiUrl}/v1/health`,
      reuseExistingServer: !isCI,
      cwd: repoRoot,
      timeout: 120_000,
    },
    {
      command: isCI ? 'pnpm --filter web start' : 'pnpm --filter web dev',
      url: webUrl,
      reuseExistingServer: !isCI,
      cwd: repoRoot,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
