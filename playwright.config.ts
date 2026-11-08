import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1360, height: 860 },
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      // PW_CHANNEL=chrome pour utiliser le Chrome installé plutôt que le Chromium de Playwright.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 860 }, channel: process.env.PW_CHANNEL || undefined }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
