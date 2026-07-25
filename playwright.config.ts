import { defineConfig, devices } from '@playwright/test';

const chromiumChannel = process.env.CI ? 'chromium' : 'chrome';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:15173',
    channel: chromiumChannel,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'storefront',
      testMatch: '**/storefront-e2e/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'storefront-mobile',
      testMatch: '**/storefront-e2e/*.spec.ts',
      use: { ...devices['iPhone 13'], browserName: 'chromium', channel: chromiumChannel },
    },
    {
      name: 'admin',
      testMatch: '**/admin-e2e/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
