import { describe, expect, it, vi } from "vitest";
import {
  BLEND_MODES,
  createImageDocument,
  createPixels,
  defineFilter,
  pixelsToRgba8,
  solidSource,
  type Filter,
  type PixelBuffer,
} from "../core/index.js";
import { adjust, NEUTRAL_ADJUST } from "../filters/adjust.js";
import { develop } from "../filters/develop/index.js";
import { effectFilters } from "../filters/effects/catalogue.js";
import { effectStack } from "../filters/effects/stack.js";
import { gaussianBlur } from "../filters/gaussian-blur.js";
import { sharpen } from "../filters/sharpen.js";
import {
  composePrepared,
  composePreparedLocal,
  type TileComposition,
} from "./compose.js";
import { CpuBackend } from "./cpu-backend.js";
import { CpuSurfaces } from "./cpu-surfaces.js";
import { CpuWorkerClient } from "./cpu-worker-client.js";
import { createCpuWorkerHandler } from "./cpu-worker-handler.js";
import {
  CPU_WORKER_FILTERS,
  type CpuCompositionRequest,
} from "./cpu-worker-protocol.js";
import { Renderer } from "./renderer.js";

const filters = [
  adjust,
  gaussianBlur,
  sharpen,
  develop,
  ...effectFilters,
  effectStack,
];
const compose = createCpuWorkerHandler(filters);
function pixels(): PixelBuffer {
  const image = createPixels(16, 12);
  for (let i = 0; i < image.data.length; i += 4) {
    const a = (((i * 7) % 255) + 1) / 256;
    image.data.set([a * 0.7, a * 0.3, a * 0.1, a], i);
  }
  return image;
}
function job(): TileComposition {
  return {
    width: 12,
    height: 8,
    precision: "full",
    scale: 1,
    layers: [
      {
        pixels: pixels(),
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
        filters: [
          {
            filter: adjust,
            params: { ...NEUTRAL_ADJUST, brightness: 23, warmth: -12 },
          },
          { filter: gaussianBlur, params: { sigma: 0.6 } },
          { filter: develop, params: { clarity: 12 } },
        ],
      },
    ],
  };
}
function request(job: TileComposition): CpuCompositionRequest {
  return {
    ...job,
    layers: job.layers.map((layer) => ({
      ...layer,
      filters: layer.filters.map(({ filter, params }) => ({
        id: filter.id,
        params,
      })),
    })),
  };
}

it("registers every built-in filter ID, without importing tools", () => {
  expect([...CPU_WORKER_FILTERS].sort()).toEqual(
    [...new Set(filters.map((f) => f.id))].sort(),
  );
});
it.each(BLEND_MODES)(
  "keeps every float and display byte identical for %s with padded filters and layers",
  async (mode) => {
    const tile = job();
    tile.layers.push({
      ...tile.layers[0]!,
      pixels: pixels(),
      filters: [
        {
          filter: effectStack,
          params: {
            entries: [
              {
                id: "a",
                filter: "glow",
                strength: 0.6,
                params: { amount: 0.7, radius: 1 },
              },
            ],
          },
        },
      ],
      blend: mode,
    });
    const backend = new CpuSurfaces(),
      surface = composePrepared(backend, tile);
    const original = backend.read(surface);
    backend.release(surface);
    const offThread = compose(structuredClone(request(tile)));
    expect(offThread.pixels.data).toEqual(original.data);
    expect(offThread.bytes).toEqual(pixelsToRgba8(original));
    const local = await composePreparedLocal(backend, tile, undefined, 0);
    expect(backend.read(local)).toEqual(original);
    backend.release(local);
    expect(backend.bytes).toBe(0);
  },
);
it("supports host filter definitions in a custom module worker handler", () => {
  const filter: Filter = {
    id: "host",
    padding: () => 0,
    passes: () => [
      {
        id: "host",
        glsl: "",
        uniforms: {},
        cpu: (s, t) => {
          t.data.set(s.data);
          t.data[0] = 2;
        },
      },
    ],
  };
  const tile = job();
  tile.layers[0]!.filters = [{ filter, params: {} }];
  const custom = createCpuWorkerHandler([filter]);
  expect(custom(request(tile)).pixels.data.some((value) => value > 0)).toBe(
    true,
  );
  expect(() => compose(request(tile))).toThrow(
    "CPU worker has no filter: host",
  );
});
it("releases all intermediate surfaces if a CPU kernel throws", () => {
  const tile = job();
  tile.layers[0]!.filters = [
    {
      filter: {
        id: "bad",
        padding: () => 0,
        passes: () => [
          {
            id: "bad",
            glsl: "",
            uniforms: {},
            cpu() {
              throw new Error("kernel");
            },
          },
        ],
      },
      params: {},
    },
  ];
  const backend = new CpuSurfaces();
  expect(() => composePrepared(backend, tile)).toThrow("kernel");
  expect(backend.bytes).toBe(0);
});

function fakeWorker() {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as null | ((event: { data: unknown }) => void),
    onerror: null as
      null | ((event: { message: string; preventDefault(): void }) => void),
    onmessageerror: null as null | (() => void),
  };
}
describe("bounded worker client", () => {
  it("has one active request and aborts running kernels by terminating the worker", async () => {
    const worker = fakeWorker(),
      next = fakeWorker(),
      factory = vi.fn().mockReturnValueOnce(worker).mockReturnValueOnce(next);
    const client = new CpuWorkerClient(factory),
      controller = new AbortController(),
      reason = new Error("stop");
    const work = client.run(job(), controller.signal),
      rejected = expect(work).rejects.toBe(reason);
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    const second = client.run(job());
    expect(worker.postMessage).toHaveBeenCalledOnce();
    controller.abort(reason);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(next.postMessage).toHaveBeenCalledOnce());
    const reply = {
      pixels: createPixels(12, 8),
      bytes: new Uint8ClampedArray(12 * 8 * 4),
    };
    next.onmessage!({ data: reply });
    await expect(second).resolves.toBe(reply);
    client.dispose();
  });
  it("rejects a queued cancellation immediately without sending another tile", async () => {
    const worker = fakeWorker(),
      client = new CpuWorkerClient(() => worker as unknown as Worker);
    const first = client.run(job());
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    const controller = new AbortController(),
      queued = client.run(job(), controller.signal);
    const rejected = expect(queued).rejects.toThrow("queued");
    controller.abort(new Error("queued"));
    await rejected;
    worker.onmessage!({
      data: {
        pixels: createPixels(12, 8),
        bytes: new Uint8ClampedArray(12 * 8 * 4),
      },
    });
    await first;
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledOnce();
    client.dispose();
  });
  it.each([
    "error",
    "messageerror",
    "postMessage",
    "reply",
    "invalid",
    "dispose",
  ] as const)("rejects %s instead of hanging", async (kind) => {
    const worker = fakeWorker();
    if (kind === "postMessage")
      worker.postMessage.mockImplementation(() => {
        throw new Error("clone");
      });
    const client = new CpuWorkerClient(() => worker as unknown as Worker),
      work = client.run(job());
    const rejected = expect(work).rejects.toBeInstanceOf(Error);
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    if (kind === "error")
      worker.onerror!({ message: "dead", preventDefault() {} });
    if (kind === "messageerror") worker.onmessageerror!();
    if (kind === "invalid") worker.onmessage!({ data: null });
    if (kind === "reply") worker.onmessage!({ data: { error: "bad kernel" } });
    if (kind === "dispose") client.dispose();
    await rejected;
    client.dispose();
  });
});

class Headless extends CpuBackend {
  override get canvas() {
    return { width: 40, height: 30 } as HTMLCanvasElement;
  }
  override resize() {}
  override present() {}
}
it("does not resubmit an unchanged viewport while tiles are pending, or after settle", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const source = solidSource({ width: 40, height: 30 }, [0.3, 0.2, 0.1, 1]);
  const doc = createImageDocument(source);
  doc.addLayer({ source });
  const backend = new Headless(),
    present = vi.spyOn(backend, "present"),
    renderer = new Renderer({ document: doc, backend });
  renderer.setView({
    width: 40,
    height: 30,
    centerX: 20,
    centerY: 15,
    zoom: 1,
  });
  await renderer.settle();
  present.mockClear();
  const layer = doc.addLayer({
    source: {
      ...source,
      readTile: async (tile) => {
        await gate;
        return source.readTile(tile);
      },
    },
  });
  for (let i = 0; i < 20; i++) renderer.frame();
  expect(present).not.toHaveBeenCalled();
  release();
  await renderer.settle();
  expect(present).toHaveBeenCalledOnce();
  for (let i = 0; i < 20; i++) renderer.frame();
  expect(present).toHaveBeenCalledOnce();
  doc.updateLayer(layer.id, { opacity: 0.4 });
  await renderer.settle();
  expect(present).toHaveBeenCalledTimes(2);
  renderer.dispose();
  doc.dispose();
});
it("discards stale worker results and cancels on document edits and disposal", async () => {
  const source = solidSource({ width: 40, height: 30 }, [1, 0, 0, 1]);
  const doc = createImageDocument(source);
  doc.addLayer({ source });
  const backend = new Headless();
  const jobs: Array<{
    resolve: (surface: ReturnType<CpuBackend["allocate"]>) => void;
    signal?: AbortSignal;
  }> = [];
  backend.compose = (_job, signal) =>
    new Promise((resolve) => jobs.push({ resolve, signal }));
  const renderer = new Renderer({ document: doc, backend });
  renderer.setView({
    width: 40,
    height: 30,
    centerX: 20,
    centerY: 15,
    zoom: 1,
  });
  renderer.frame();
  await new Promise((resolve) => setTimeout(resolve, 0));
  renderer.frame();
  expect(jobs).toHaveLength(1);
  for (let i = 0; i < 10; i++) renderer.frame();
  expect(jobs).toHaveLength(1);
  doc.invalidate({ x: 0, y: 0, width: 40, height: 30 });
  expect(jobs[0]!.signal!.aborted).toBe(true);
  jobs[0]!.resolve(backend.allocate(44, 34));
  await Promise.resolve();
  await Promise.resolve();
  expect(renderer.readTile({ level: 0, x: 0, y: 0 })).toBeUndefined();
  expect(backend.bytes).toBe(0);
  renderer.frame();
  await new Promise((resolve) => setTimeout(resolve, 0));
  renderer.frame();
  expect(jobs).toHaveLength(2);
  renderer.dispose();
  expect(jobs[1]!.signal!.aborted).toBe(true);
  jobs[1]!.resolve(backend.allocate(44, 34));
  await Promise.resolve();
  await Promise.resolve();
  expect(backend.bytes).toBe(0);
  doc.dispose();
});

it.each([false, true])(
  "does not substitute a built-in kernel for a wrapped definition (defineFilter: %s)",
  async (registered) => {
    const worker = fakeWorker();
    vi.stubGlobal(
      "Worker",
      vi.fn(function () {
        return worker;
      }),
    );
    const backend = new CpuBackend(),
      tile = job();
    const wrapped = {
      ...gaussianBlur,
      passes: () => [
        {
          id: "changed",
          glsl: "",
          uniforms: {},
          cpu: (_s: PixelBuffer, t: PixelBuffer) => {
            t.data.fill(0.125);
          },
        },
      ],
    };
    tile.layers[0]!.filters = [
      {
        filter: registered ? defineFilter(wrapped) : wrapped,
        params: { sigma: 0.6 },
      },
    ];
    try {
      const surface = await backend.compose(tile);
      expect(worker.postMessage).not.toHaveBeenCalled();
      expect(backend.read(surface).data[0]).toBeCloseTo(0.1);
      backend.release(surface);
    } finally {
      backend.dispose();
      vi.unstubAllGlobals();
    }
  },
);

it("returns unclipped working floats separately from display bytes for output-edge conversion", () => {
  const tile = job(),
    layer = tile.layers[0]!;
  layer.filters = [];
  layer.opacity = 1;
  for (let i = 0; i < layer.pixels.data.length; i += 4)
    layer.pixels.data.set([1.5, -0.125, 0.5, 1], i);
  const result = compose(request(tile));
  expect(Array.from(result.pixels.data.subarray(0, 4))).toEqual([
    1.5, -0.125, 0.5, 1,
  ]);
  expect(result.bytes[0]).toBe(255);
  expect(result.bytes[1]).toBe(0);
});

it("yields to tasks between warm-cache headless CPU frame budgets", async () => {
  const source = solidSource({ width: 600, height: 600 }, [0.3, 0.2, 0.1, 1]);
  const doc = createImageDocument(source),
    layer = doc.addLayer({ source });
  const renderer = new Renderer({
    document: doc,
    backend: new Headless(),
    frameBudgetMs: 0,
  });
  renderer.setView({
    width: 600,
    height: 600,
    centerX: 300,
    centerY: 300,
    zoom: 1,
  });
  await renderer.settle();
  doc.updateLayer(layer.id, { opacity: 0.5 });
  let taskRan = false;
  const timer = setTimeout(() => {
    taskRan = true;
  }, 0);
  try {
    await renderer.settle();
    expect(taskRan).toBe(true);
  } finally {
    clearTimeout(timer);
    renderer.dispose();
    doc.dispose();
  }
});
