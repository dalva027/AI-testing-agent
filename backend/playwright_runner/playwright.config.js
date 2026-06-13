// Configuration for the isolated runner that executes AI-generated test specs.
// The backend writes specs into ./tests and invokes `npx playwright test`.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
});
