import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'output/playwright/test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'output/playwright/report' }]],
  testDir: './e2e',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8081',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'CI=1 npx expo start --web --port 8081',
    reuseExistingServer: true,
    timeout: 120_000,
    url: 'http://127.0.0.1:8081',
  },
});
