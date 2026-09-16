import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: "http://localhost:4321",
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },

    /* Test against minor browsers on CI. */
    ...(process.env.CI
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
          {
            name: "Mobile Safari",
            use: { ...devices["iPhone 12"] },
          },
        ]
      : []),

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    // E2E_PERSIST_PATH: astro.config.mjs가 이 값을 어댑터의 persistState로 넘겨 dev 서버가
    // 개발용 실데이터 D1(.wrangler/state) 대신 E2E 픽스처 DB를 보게 한다. 이 경로에 스키마와
    // 픽스처를 심는 것은 scripts/seed-e2e.mjs이고, 그 스크립트는 playwright가 webServer를
    // 띄우기 전에 끝나 있어야 한다(package.json의 test:e2e 참고).
    env: { ASTRO_DEV_BACKGROUND: "0", E2E_PERSIST_PATH: ".wrangler/e2e-state" },
  },
});
