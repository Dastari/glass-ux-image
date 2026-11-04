import { afterEach, expect, it, vi } from "vitest";
import {
  createImageDocument,
  createPixels,
  defineFilter,
  pixelsToRgba8,
  solidSource,
} from "../core/index.js";
import { gaussianBlur } from "../filters/gaussian-blur.js";
import {
  composePrepared,
  composePreparedLocal,
  type TileComposition,
} from "./compose.js";
import { CpuBackend } from "./cpu-backend.js";
import { CpuSurfaces } from "./cpu-surfaces.js";
import { createCpuWorkerHandler } from "./cpu-worker-handler.js";
import type { CpuCompositionRequest } from "./cpu-worker-protocol.js";
import { Renderer } from "./renderer.js";

function job(): TileComposition {
  const pixels = createPixels(16, 12);
  for (let i = 0; i < pixels.data.length; i += 4)
    pixels.data.set([i / 10000, 0.2, 0.1, 0.6], i);
  return {
    width: 12,
    height: 8,
    precision: "full",
    scale: 1,
    layers: [
      {
        pixels,
        padding: 2,
        blend: "normal",
        opacity: 0.8,
        frame: {
          x: -2,
          y: -2,
          width: 16,
          height: 12,
          documentWidth: 40,
          documentHeight: 30,
        },
        filters: [{ filter: gaussianBlur, params: { sigma: 0.6 } }],
      },
    ],
  };
}
function reference(tile: TileComposition) {
  const backend = new CpuSurfaces(),
    surface = composePrepared(backend, tile);
  const result = backend.read(surface);
  backend.release(surface);
  expect(backend.bytes).toBe(0);
  return result;
}
function fakeWorker() {
  return {
    postMessage:
      vi.fn<
        (request: CpuCompositionRequest, transfer: Transferable[]) => void
      >(),
    terminate: vi.fn(),
    onmessage: null as null | ((event: { data: unknown }) => void),
    onerror: null as
      null | ((event: { message: string; preventDefault(): void }) => void),
    onmessageerror: null as null | (() => void),
  };
}
const handler = createCpuWorkerHandler([gaussianBlur]);
afterEach(() => vi.unstubAllGlobals());

it("permanently falls back when CSP blocks worker construction, including unfiltered tiles", async () => {
  const factory = vi.fn(function () {
    throw new Error("CSP worker-src none");
  });
  vi.stubGlobal("Worker", factory);
  const backend = new CpuBackend();
  try {
    for (const filtered of [false, true]) {
      const tile = job();
      if (!filtered) tile.layers[0]!.filters = [];
      const surface = await backend.compose(tile);
      expect(backend.read(surface)).toEqual(reference(tile));
      backend.release(surface);
    }
    expect(factory).toHaveBeenCalledOnce();
    expect(backend.bytes).toBe(0);
  } finally {
    backend.dispose();
  }
});

it.each([
  "load",
  "crash",
  "messageerror",
  "invalid",
  "reply",
  "postMessage",
] as const)(
  "recovers from worker %s after input transfer and retires the worker permanently",
  async (kind) => {
    const worker = fakeWorker(),
      tile = job(),
      expected = reference(tile);
    const factory = vi.fn(function () {
      return worker;
    });
    vi.stubGlobal("Worker", factory);
    let detached = false;
    worker.postMessage.mockImplementation((request, transfer) => {
      structuredClone(request, { transfer });
      detached = request.layers[0]!.pixels.data.byteLength === 0;
      if (kind === "postMessage") throw new Error("send failed");
      queueMicrotask(() => {
        if (kind === "load" || kind === "crash")
          worker.onerror!({ message: kind, preventDefault() {} });
        if (kind === "messageerror") worker.onmessageerror!();
        if (kind === "invalid") worker.onmessage!({ data: null });
        if (kind === "reply")
          worker.onmessage!({ data: { error: "worker kernel failed" } });
      });
    });
    const backend = new CpuBackend();
    try {
      // For the crash case, make the first job succeed, then crash during the next job.
      if (kind === "crash") {
        worker.postMessage.mockImplementationOnce((request, transfer) => {
          const received = structuredClone(request, { transfer });
          queueMicrotask(() => worker.onmessage!({ data: handler(received) }));
        });
        const first = await backend.compose(job());
        backend.release(first);
      }
      const surface = await backend.compose(tile);
      expect(detached).toBe(true);
      expect(tile.layers[0]!.pixels.data.byteLength).toBeGreaterThan(0);
      expect(backend.read(surface)).toEqual(expected);
      backend.release(surface);
      const next = await backend.compose(job());
      expect(pixelsToRgba8(backend.read(next))).toEqual(
        pixelsToRgba8(expected),
      );
      backend.release(next);
      expect(factory).toHaveBeenCalledOnce();
      expect(worker.postMessage).toHaveBeenCalledTimes(
        kind === "crash" ? 2 : 1,
      );
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(backend.bytes).toBe(0);
    } finally {
      backend.dispose();
    }
  },
);

it("uses a matching custom worker even when its filter reuses a built-in ID", async () => {
  const custom = defineFilter({
    ...gaussianBlur,
    passes: () => [
      {
        id: "custom",
        glsl: "",
        uniforms: {},
        cpu: (_s: unknown, t: ReturnType<typeof createPixels>) =>
          t.data.fill(0.125),
      },
    ],
  });
  const run = createCpuWorkerHandler([custom]),
    worker = fakeWorker();
  worker.postMessage.mockImplementation((request, transfer) => {
    const received = structuredClone(request, { transfer });
    queueMicrotask(() => worker.onmessage!({ data: run(received) }));
  });
  const backend = new CpuBackend({ worker: () => worker as unknown as Worker }),
    tile = job();
  tile.layers[0]!.filters = [{ filter: custom, params: { sigma: 0.6 } }];
  try {
    const surface = await backend.compose(tile);
    expect(worker.postMessage).toHaveBeenCalledOnce();
    expect(backend.read(surface)).toEqual(reference(tile));
    expect(backend.read(surface).data[0]).toBeCloseTo(0.1);
    backend.release(surface);
  } finally {
    backend.dispose();
  }
});

it.each([1, 2])(
  "yields locally and releases saved surfaces when cancelled after pass %s",
  async (cancelAfter) => {
    const backend = new CpuSurfaces(),
      tile = job(),
      controller = new AbortController();
    const blur = tile.layers[0]!.filters[0]!;
    tile.layers[0]!.filters = [
      {
        filter: {
          ...gaussianBlur,
          passes(params, scale, frame) {
            const passes = gaussianBlur.passes(params, scale, frame);
            passes[0]!.save = "original";
            return passes;
          },
        },
        params: blur.params,
      },
    ];
    const runPass = backend.runPass.bind(backend);
    const pass = vi.spyOn(backend, "runPass").mockImplementation((...args) => {
      runPass(...args);
      if (pass.mock.calls.length === cancelAfter)
        setTimeout(() => controller.abort(new Error("cancel local")), 0);
    });
    // Zero budget makes each operation a separate task, so the timer runs before the next operation.
    await expect(
      composePreparedLocal(backend, tile, controller.signal, 0),
    ).rejects.toThrow("cancel local");
    expect(pass).toHaveBeenCalledTimes(cancelAfter);
    expect(backend.bytes).toBe(0);
  },
);

class Headless extends CpuBackend {
  override get canvas() {
    return { width: 40, height: 30 } as HTMLCanvasElement;
  }
  override resize() {}
  override present() {}
}
it("the renderer settles after worker failure and can compose subsequent edits", async () => {
  vi.stubGlobal(
    "Worker",
    vi.fn(function () {
      throw new Error("blocked");
    }),
  );
  const source = solidSource({ width: 40, height: 30 }, [0.3, 0.2, 0.1, 1]);
  const doc = createImageDocument(source),
    layer = doc.addLayer({ source });
  const errors = vi.fn(),
    backend = new Headless(),
    renderer = new Renderer({ document: doc, backend, onError: errors });
  try {
    await renderer.settle();
    expect(renderer.readTile({ level: 0, x: 0, y: 0 })!.data[3]).toBe(1);
    doc.updateLayer(layer.id, { opacity: 0.5 });
    await renderer.settle();
    expect(renderer.stats.pendingTiles).toBe(0);
    expect(renderer.readTile({ level: 0, x: 0, y: 0 })!.data[3]).toBe(0.5);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    renderer.dispose();
    doc.dispose();
  }
});
