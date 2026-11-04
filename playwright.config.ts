import { defineConfig } from "@playwright/test";

const own=process.env.GI_OWN_PORT;
const url=`http://127.0.0.1:${own ?? process.env.GI_E2E_PORT ?? "4331"}`;

export default defineConfig({
  outputDir: own ? `/tmp/gi-results-${own}` : "test-results",
  testDir: "e2e",
  testIgnore: "docs.spec.ts",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: url },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } },
    },
    // Firefox and WebKit run the cross-browser spec when asked: GI_BROWSERS=firefox,webkit. CI installs them.
    ...(process.env.GI_BROWSERS ?? "").split(",").filter((name) => name === "firefox" || name === "webkit").map((name) => ({
      name,
      testMatch: "cross-browser.spec.ts",
      use: { browserName: name as "firefox" | "webkit" },
    })),
  ],
  webServer: { command: own ? "node scripts/serve-demo.mjs" : `pnpm --filter glass-ux-image-demo exec vite preview --host 127.0.0.1 --port ${process.env.GI_E2E_PORT ?? "4331"} --strictPort`, url, reuseExistingServer: false },
});
