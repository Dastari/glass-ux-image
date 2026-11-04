import { abortable } from "../core/async.js";
import type { TileComposition } from "./compose.js";
import type {
  CpuCompositionReply,
  CpuCompositionRequest,
} from "./cpu-worker-protocol.js";

/** One active tile per backend bounds copies and worker memory. Cancel terminates a running kernel. */
export class CpuWorkerClient {
  #worker?: Worker;
  #queue = Promise.resolve();
  #stop?: (reason: unknown) => void;
  #disposed = false;
  #failure?: { reason: unknown };
  constructor(private readonly factory: () => Worker) {}

  run(
    job: TileComposition,
    signal?: AbortSignal,
  ): Promise<Exclude<CpuCompositionReply, { error: string }>> {
    const work = this.#queue.then(() => {
      signal?.throwIfAborted();
      if (this.#disposed) throw new Error("CPU backend disposed");
      if (this.#failure) throw this.#failure.reason;
      return new Promise<Exclude<CpuCompositionReply, { error: string }>>(
        (resolve, reject) => {
          let worker: Worker;
          try {
            worker = this.#worker ??= this.factory();
          } catch (error) {
            this.#failure = { reason: error };
            reject(error);
            return;
          }
          const finish = () => {
            signal?.removeEventListener("abort", abort);
            this.#stop = undefined;
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
          };
          const fail = (reason: unknown) => {
            if (!signal?.aborted && !this.#disposed) this.#failure = { reason };
            finish();
            worker.terminate();
            this.#worker = undefined;
            reject(reason);
          };
          const abort = () => fail(signal!.reason);
          this.#stop = fail;
          worker.onerror = (event) => {
            event.preventDefault();
            fail(new Error(event.message || "CPU worker failed"));
          };
          worker.onmessageerror = () =>
            fail(new Error("CPU worker reply could not be read"));
          worker.onmessage = ({ data }: MessageEvent<CpuCompositionReply>) => {
            if (!data || typeof data !== "object") {
              fail(new Error("Invalid CPU worker reply"));
              return;
            }
            if ("error" in data) {
              fail(new Error(data.error));
              return;
            }
            const { pixels, bytes } = data;
            if (
              !pixels ||
              pixels.width !== job.width ||
              pixels.height !== job.height ||
              !(pixels.data instanceof Float32Array) ||
              pixels.data.length !== job.width * job.height * 4 ||
              !(bytes instanceof Uint8ClampedArray) ||
              bytes.length !== pixels.data.length
            ) {
              fail(new Error("Invalid CPU worker pixels"));
              return;
            }
            finish();
            resolve(data);
          };
          signal?.addEventListener("abort", abort, { once: true });
          // Keep the prepared inputs intact for local recovery if a worker dies after transfer.
          // Only one active tile is copied; cached source tiles are never transferred.
          const request: CpuCompositionRequest = {
            ...job,
            layers: job.layers.map((layer) => ({
              ...layer,
              pixels: { ...layer.pixels, data: layer.pixels.data.slice() },
              filters: layer.filters.map(({ filter, params }) => ({
                id: filter.id,
                params,
              })),
            })),
          };
          try {
            worker.postMessage(
              request,
              request.layers.map(
                (layer) => layer.pixels.data.buffer as ArrayBuffer,
              ),
            );
          } catch (error) {
            fail(error);
          }
        },
      );
    });
    this.#queue = work.then(
      () => {},
      () => {},
    );
    return abortable(work, signal);
  }

  dispose() {
    this.#disposed = true;
    this.#stop?.(new Error("CPU backend disposed"));
    this.#worker?.terminate();
    this.#worker = undefined;
  }
}
