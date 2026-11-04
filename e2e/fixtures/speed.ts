import type { Page } from "@playwright/test";

/**
 * Frame-time limits in these tests are set on the reference machine (the development server where the suite was
 * written, under SwiftShader). A hosted runner can be several times slower, which says nothing about the code. This
 * measures a fixed workload on the page's main thread and returns how much slower than the reference it ran, never
 * less than 1, so a limit only relaxes on a slower machine. Tests print the factor beside their result.
 */
const REFERENCE_MS = 11;

export async function slowdown(page: Page): Promise<number> {
  const best = await page.evaluate(() => {
    const run = () => {
      const start = performance.now(), data = new Float32Array(1 << 18);
      let sum = 0;
      for (let pass = 0; pass < 24; pass++) for (let i = 0; i < data.length; i++) { data[i] = Math.sqrt(i * pass + data[i]!); sum += data[i]!; }
      return [performance.now() - start, sum] as const;
    };
    let fastest = Infinity;
    for (let n = 0; n < 5; n++) fastest = Math.min(fastest, run()[0]);
    return fastest;
  });
  return Math.max(1, best / REFERENCE_MS);
}
