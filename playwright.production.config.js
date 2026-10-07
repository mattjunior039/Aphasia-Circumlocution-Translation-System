import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production",
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5196", channel: "chrome" },
  webServer: {
    command: "npm run preview -- --port 5196 --strictPort",
    url: "http://127.0.0.1:5196",
    reuseExistingServer: false
  }
});
