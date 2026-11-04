import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testMatch: "docs.spec.ts",
  outputDir: "test-results/docs",
  timeout: 120_000,
  // Hosted runners have few cores: the catalogue walk beside the guides starved their page loads.
  workers: process.env.CI ? 1 : 2,
  fullyParallel: true,
  reporter: [["list"]],
  // Catalogue content and syntax highlighters load asynchronously.
  expect: { timeout: process.env.CI ? 30_000 : 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4332/glass-ux-image/",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: "node scripts/serve-docs.mjs",
    url: "http://127.0.0.1:4332/glass-ux-image/",
    reuseExistingServer: false,
  },
});
