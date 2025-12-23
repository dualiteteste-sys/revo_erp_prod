import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const shouldUseWebServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // {
        //   name: 'firefox',
        //   use: { ...devices['Desktop Firefox'] },
        // },
        // {
        //   name: 'webkit',
        //   use: { ...devices['Desktop Safari'] },
        // },
    ],

    /* Run your local dev server before starting the tests */
    webServer: shouldUseWebServer
      ? {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        }
      : undefined,
});
