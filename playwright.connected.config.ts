import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 10_000 },
  outputDir: 'output/playwright/connected-test-results',
  reporter: [['list']],
  testDir: './e2e-connected',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8082',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: [
      'CI=1',
      'EXPO_PUBLIC_KIN_ENVIRONMENT=development',
      'EXPO_PUBLIC_KIN_PUBLIC_URL=http://127.0.0.1:8082',
      'EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321',
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJconnected-e2e-public-key',
      'npx expo start --web --port 8082 --clear',
    ].join(' '),
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:8082',
  },
});
