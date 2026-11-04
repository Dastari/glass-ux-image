/* tokens:allow-file Converts composited image pixels to display colours. */
import { isFilterDefinition } from "../core/filter.js";
import { pixelsToRgba8 } from "../core/index.js";
import { composePreparedLocal, type TileComposition } from "./compose.js";
import { CpuWorkerClient } from "./cpu-worker-client.js";
import { CPU_WORKER_FILTERS } from "./cpu-worker-protocol.js";
import { CpuSurfaces, CpuSurface } from "./cpu-surfaces.js";
import type { BackendInfo, Draw, PresentOptions, Surface } from "./types.js";

const css = ([r, g, b]: readonly [number, number, number]) =>
  `rgb(${r * 255} ${g * 255} ${b * 255})`;

/** Everything in TypeScript, so it runs where WebGL2 does not and in tests without a browser. */
export class CpuBackend extends CpuSurfaces {
  override readonly info: BackendInfo;
  #canvas?: HTMLCanvasElement;
  #worker?: CpuWorkerClient;
  #customWorker: boolean;
  #lifetime = new AbortController();

  constructor(
    options: {
      fallbackReason?: string;
      /** Override the module worker for a bundler or host filters (see createCpuWorkerHandler). */
      worker?: () => Worker;
    } = {},
  ) {
    super();
    this.info = {
      kind: "cpu",
      ...(options.fallbackReason
        ? { fallbackReason: options.fallbackReason }
        : {}),
    };
    this.#customWorker = !!options.worker;
    if (options.worker || typeof Worker !== "undefined")
      this.#worker = new CpuWorkerClient(
        options.worker ??
          (() =>
            new Worker(new URL("./cpu-worker.js", import.meta.url), {
              type: "module",
            })),
      );
  }

  override get canvas() {
    this.#canvas ??= document.createElement("canvas");
    return this.#canvas;
  }

  /** Built-in tiles execute off-thread. Headless runtimes and host closures use budgeted tasks.
   * Hosts with custom filters can supply a module worker importing those same definitions.
   */
  async compose(job: TileComposition, signal?: AbortSignal): Promise<Surface> {
    const lifetime = this.#lifetime.signal;
    signal = signal ? AbortSignal.any([signal, lifetime]) : lifetime;
    signal.throwIfAborted();
    const worker = this.#worker;
    if (worker) {
      try {
        let supported = this.#customWorker;
        if (!supported) {
          const filters = job.layers.flatMap((layer) =>
            layer.filters.map(({ filter }) => filter),
          );
          supported = filters.every(
            (filter) =>
              CPU_WORKER_FILTERS.has(filter.id) && isFilterDefinition(filter),
          );
          if (supported && filters.length) {
            // An unchanged defineFilter() object can still be a host definition reusing a built-in ID.
            // Load the exact exports lazily so unused filter kernels stay out of the entry bundle.
            const { cpuWorkerFilters } =
              await import("./cpu-worker-filters.js");
            supported = filters.every(
              (filter) =>
                cpuWorkerFilters.includes(filter) && isFilterDefinition(filter),
            );
          }
        }
        signal.throwIfAborted();
        if (supported) {
          const { pixels, bytes } = await worker.run(job, signal);
          signal.throwIfAborted();
          return this.wrap(pixels, bytes);
        }
      } catch {
        // Cancellation is expected during editing/disposal and must not disable a healthy worker.
        signal.throwIfAborted();
        // CSP, module load errors and mid-job crashes all permanently retire this worker path.
        if (this.#worker === worker) {
          this.#worker = undefined;
          worker.dispose();
        }
      }
    }
    return composePreparedLocal(this, job, signal);
  }

  override resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  override present(
    draws: readonly Draw[],
    { background, pixelated }: PresentOptions,
  ) {
    const context = this.canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.imageSmoothingEnabled = !pixelated;
    context.fillStyle = css(background);
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const { surface, source: s, target: t } of draws) {
      context.drawImage(
        this.#picture(surface as CpuSurface),
        s.x,
        s.y,
        s.width,
        s.height,
        t.x,
        t.y,
        t.width,
        t.height,
      );
    }
  }

  #picture(surface: CpuSurface) {
    if (surface.picture) return surface.picture;
    const picture = new OffscreenCanvas(surface.width, surface.height);
    const bytes = (surface.displayBytes ??
      pixelsToRgba8(surface.pixels)) as ImageDataArray;
    picture
      .getContext("2d")!
      .putImageData(new ImageData(bytes, surface.width, surface.height), 0, 0);
    surface.picture = picture;
    return picture;
  }

  override onLost(_listener: (reason: string) => void) {
    return () => {};
  }

  override dispose() {
    this.#lifetime.abort(new Error("CPU backend disposed"));
    this.#worker?.dispose();
    this.#worker = undefined;
  }
}
