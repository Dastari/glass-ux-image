import { expect, test, type Page } from "@playwright/test";
import { expectTiming } from "./fixtures/speed.js";
import type { Renderer } from "glass-ux-image/render";

declare global {
  interface Window {
    __renderer?: Renderer;
    __blur?: (sigma: number) => void;
  }
}

/** Drive the renderer for a set time from inside the page and report how long frames took. */
const motion = (page: Page, kind: "pan" | "zoom", milliseconds: number) =>
  page.evaluate(
    ([action, duration]) =>
      new Promise<{ frames: number; p50: number; p95: number; worst: number }>((done) => {
        const renderer = window.__renderer!;
        const gaps: number[] = [];
        const started = performance.now();
        let last = started;
        const step = (now: number) => {
          gaps.push(now - last);
          last = now;
          const phase = (now - started) / 400;
          if (action === "pan") renderer.panBy(Math.sin(phase) * 24, Math.cos(phase) * 16);
          else {
            const { view } = renderer;
            const factor = 1 + Math.sin(phase) * 0.025;
            renderer.setView({ ...view, zoom: Math.min(2, Math.max(0.15, view.zoom * factor)) });
          }
          if (now - started < (duration as number)) requestAnimationFrame(step);
          else {
            const sorted = gaps.slice(1).sort((a, b) => a - b);
            const at = (share: number) => sorted[Math.floor(sorted.length * share)]!;
            done({ frames: sorted.length, p50: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1]! });
          }
        };
        requestAnimationFrame(step);
      }),
    [kind, milliseconds],
  );

const settle = (page: Page) => page.evaluate(() => window.__renderer!.settle());

async function open(page: Page, backend: "WebGL2" | "CPU") {
  await page.goto("/?kit=stage2&view=engine");
  await page.getByRole("button", { name: backend, exact: true }).click();
  await page.waitForFunction((kind) => window.__renderer?.backend.info.kind === kind, backend === "CPU" ? "cpu" : "webgl2");
  await settle(page);
}

test.use({ viewport: { width: 1440, height: 900 } });

for (const backend of ["WebGL2", "CPU"] as const) {
  test(`${backend}: pans and zooms 6000 × 4000 without stalling`, async ({ page }) => {
    await open(page, backend);
    const pan = await motion(page, "pan", 3000);
    const zoom = await motion(page, "zoom", 3000);
    console.log(`${backend} pan`, pan);
    console.log(`${backend} zoom`, zoom);
    console.log(`${backend} stats`, await page.evaluate(() => window.__renderer!.stats));
    // Software GL on a server, so these catch stalls rather than prove 60 frames a second.
    expectTiming(`${backend} pan, frame p95`, pan.p95, 120);
    expectTiming(`${backend} zoom, frame p95`, zoom.p95, 120);
  });
}

/** Change the blur every frame, as dragging its slider does, and time the frames. */
const scrub = (page: Page, zoom: number) =>
  page.evaluate(
    (level) =>
      new Promise<{ frames: number; p50: number; p95: number; worst: number }>((done) => {
        const renderer = window.__renderer!;
        const { view } = renderer;
        renderer.setView({ ...view, zoom: level, centerX: 3000, centerY: 1800 });
        const apply = window.__blur!;
        const gaps: number[] = [];
        const started = performance.now();
        let last = started;
        const step = (now: number) => {
          gaps.push(now - last);
          last = now;
          apply(4 + (Math.sin((now - started) / 300) + 1) * 8);
          if (now - started < 2500) requestAnimationFrame(step);
          else {
            const sorted = gaps.slice(1).sort((a, b) => a - b);
            const at = (share: number) => sorted[Math.floor(sorted.length * share)]!;
            done({ frames: sorted.length, p50: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1]! });
          }
        };
        requestAnimationFrame(step);
      }),
    zoom,
  );

for (const backend of ["WebGL2", "CPU"] as const) {
  test(`${backend}: timing while the blur is dragged`, async ({ page }) => {
    await open(page, backend);
    console.log(`${backend} blur drag, fit:`, await scrub(page, 0.186));
    console.log(`${backend} blur drag, 100%:`, await scrub(page, 1));
  });
}

test("reads a fraction of the document, so memory follows the view", async ({ page }) => {
  await open(page, "WebGL2");
  await page.evaluate(() => {
    const renderer = window.__renderer!;
    renderer.setView({ ...renderer.view, zoom: 1, centerX: 3000, centerY: 2000 });
  });
  await settle(page);
  const { tileReads, decodedBytes } = await page.evaluate(() => window.__renderer!.stats);
  console.log(`At 100%: ${tileReads} tiles read, ${Math.round(decodedBytes / 1048576)} MB decoded, of 384 MB`);
  // Level 0 alone is 384 tiles and 384 MB. Staying under a quarter includes the fit view it came from.
  expect(tileReads).toBeLessThan(96);
  expect(decodedBytes).toBeLessThan(96 * 1024 * 1024);
});

test("moves to the CPU backend when the GPU context is lost, and keeps drawing", async ({ page }) => {
  await open(page, "WebGL2");
  await page.evaluate(() => {
    const canvas = window.__renderer!.backend.canvas;
    canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await page.waitForFunction(() => window.__renderer?.backend.info.kind === "cpu");
  await settle(page);
  expect(await page.locator(".stage canvas").count()).toBe(1);
  const lit = await page.evaluate(() => {
    const canvas = window.__renderer!.backend.canvas;
    const pixel = canvas.getContext("2d")!.getImageData(canvas.width / 2, canvas.height / 3, 1, 1).data;
    return pixel[0]! + pixel[1]! + pixel[2]!;
  });
  expect(lit).toBeGreaterThan(60);
});

test("pans and zooms from the keyboard", async ({ page }) => {
  await open(page, "WebGL2");
  await page.getByRole("application").focus();
  const before = await page.evaluate(() => window.__renderer!.view);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  const after = await page.evaluate(() => window.__renderer!.view);
  expect(after.centerX).toBeGreaterThan(before.centerX);
  expect(after.zoom).toBeGreaterThan(before.zoom);
  await page.keyboard.press("0");
  expect((await page.evaluate(() => window.__renderer!.view)).zoom).toBeCloseTo(before.zoom);
});

test("the blur control changes the picture and Reset restores it", async ({ page }) => {
  await open(page, "WebGL2");
  const shot = () => page.locator(".stage").screenshot();
  const sharp = await shot();
  const slider = page.getByRole("slider", { name: "Gaussian blur" });
  await slider.focus();
  for (let i = 0; i < 24; i++) await page.keyboard.press("ArrowRight");
  await settle(page);
  expect((await shot()).equals(sharp)).toBe(false);
  await page.getByRole("button", { name: "Reset" }).click();
  await settle(page);
  await expect.poll(async () => (await shot()).equals(sharp)).toBe(true);
});

test("shows the image on load", async ({ page }) => {
  await open(page, "WebGL2");
  await page.screenshot({ path: "test-results/demo-webgl2.png" });
  await expect(page.getByTestId("status")).toContainText("6000 × 4000");
  await expect(page.getByTestId("status")).toContainText("Up to date");
});
