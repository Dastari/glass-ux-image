import { expect, test } from "@playwright/test";
import type { RenderBackend } from "../src/render/index.js";

declare global {
  interface Window {
    __cpuWorkerProbe?: {
      requests: number;
      completed: number;
      ticks: number;
      cancelled: number;
    };
  }
}

test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const probe = (window.__cpuWorkerProbe = {
      requests: 0,
      completed: 0,
      ticks: 0,
      cancelled: 0,
    });
    const InstrumentedWorker = function (
      url: string | URL,
      options?: WorkerOptions,
    ) {
      const worker = new Original(url, options);
      if (!String(url).includes("cpu-worker")) return worker;
      let busy = false;
      worker.addEventListener("message", () => {
        probe.completed++;
        busy = false;
      });
      const post = worker.postMessage.bind(worker),
        terminate = worker.terminate.bind(worker);
      worker.postMessage = (
        message: unknown,
        transfer?: Transferable[] | StructuredSerializeOptions,
      ) => {
        probe.requests++;
        busy = true;
        const tick = () => {
          if (busy) {
            probe.ticks++;
            setTimeout(tick, 0);
          }
        };
        setTimeout(tick, 0);
        if (Array.isArray(transfer)) post(message, transfer);
        else post(message, transfer);
      };
      worker.terminate = () => {
        if (busy) probe.cancelled++;
        busy = false;
        terminate();
      };
      return worker;
    };
    InstrumentedWorker.prototype = Original.prototype;
    window.Worker = InstrumentedWorker as unknown as typeof Worker;
  });
});

test("the CPU backend runs expensive filters and blends in a worker while the main thread keeps ticking", async ({
  page,
}) => {
  await page.goto("/?kit=stage2&view=engine");
  await page.getByRole("button", { name: "CPU", exact: true }).click();
  await page.waitForFunction(
    () => window.__renderer?.backend.info.kind === "cpu",
  );
  await page.evaluate(() => window.__renderer!.settle());
  const probe = await page.evaluate(async () => {
    const renderer = window.__renderer!,
      backend = renderer.backend;
    // Any synchronous kernel/blend invocation is a regression, even if its output looks right.
    backend.runPass = () => {
      throw new Error("Filter ran on the main thread");
    };
    backend.blend = () => {
      throw new Error("Blend ran on the main thread");
    };
    Object.assign(window.__cpuWorkerProbe!, {
      requests: 0,
      completed: 0,
      ticks: 0,
    });
    window.__blur!(24);
    await renderer.settle();
    return {
      ...window.__cpuWorkerProbe!,
      pending: renderer.stats.pendingTiles,
    };
  });
  expect(probe.requests).toBeGreaterThan(0);
  expect(probe.completed).toBe(probe.requests);
  expect(probe.ticks).toBeGreaterThan(1);
  expect(probe.pending).toBe(0);
});

test("worker composition preserves the synchronous CPU saved PNG bytes", async ({
  page,
}) => {
  await page.goto("/?format=image/png&backend=cpu");
  await page.getByRole("radio", { name: "Brush", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__retouchDemo?.state.status === "ready" &&
      window.__retouchDemo.renderer,
  );
  const result = await page.evaluate(async () => {
    const session = window.__retouchDemo!;
    session.setGeometry({
      rotation: 90,
      crop: { x: 400, y: 800, width: 1000, height: 1000 },
      resize: { width: 300, height: 300 },
    });
    session.previewFilter("develop", { exposure: 0.5, contrast: 11 });
    session.commit();
    await session.renderer!.settle();
    const backend: RenderBackend = session.renderer!.backend;
    const first = new Uint8Array(
      await (
        await session.result().toBlob({ type: "image/png" })
      ).arrayBuffer(),
    );
    const offThread = backend.compose;
    backend.compose = undefined;
    try {
      const second = new Uint8Array(
        await (
          await session.result().toBlob({ type: "image/png" })
        ).arrayBuffer(),
      );
      return {
        length: first.length,
        same:
          first.length === second.length &&
          first.every((byte, i) => byte === second[i]),
        workers: window.__cpuWorkerProbe!.completed,
      };
    } finally {
      backend.compose = offThread;
    }
  });
  expect(result.workers).toBeGreaterThan(0);
  expect(result.length).toBeGreaterThan(1000);
  expect(result.same).toBe(true);
});

test("disposing the CPU renderer cancels active composition and rejects settle", async ({
  page,
}) => {
  await page.goto("/?kit=stage2&view=engine");
  await page.getByRole("button", { name: "CPU", exact: true }).click();
  await page.waitForFunction(
    () => window.__renderer?.backend.info.kind === "cpu",
  );
  await page.evaluate(() => window.__renderer!.settle());
  const before = await page.evaluate(() => window.__cpuWorkerProbe!.requests);
  await page.evaluate(() => window.__blur!(48));
  await page.waitForFunction(
    (count) => window.__cpuWorkerProbe!.requests > count,
    before,
  );
  const result = await page.evaluate(async () => {
    const renderer = window.__renderer!;
    const work = renderer.settle();
    renderer.dispose();
    try {
      await work;
      return { rejected: false, cancelled: window.__cpuWorkerProbe!.cancelled };
    } catch {
      return { rejected: true, cancelled: window.__cpuWorkerProbe!.cancelled };
    }
  });
  expect(result.rejected).toBe(true);
  expect(result.cancelled).toBeGreaterThan(0);
});
