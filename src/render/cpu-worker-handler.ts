import type { Filter } from "../core/filter.js";
import { pixelsToRgba8 } from "../core/pixels.js";
import { composePrepared } from "./compose.js";
import { CpuSurfaces } from "./cpu-surfaces.js";
import type { CpuCompositionRequest } from "./cpu-worker-protocol.js";

/** For a host module worker: import the host's filters here, then transfer both returned buffers.
 * No DOM, worker globals, eval or duplicated kernels are needed by this handler.
 */
export function createCpuWorkerHandler(filters: readonly Filter<any>[]) {
  const registry = new Map(filters.map((filter) => [filter.id, filter]));
  const backend = new CpuSurfaces();
  return (data: CpuCompositionRequest) => {
    const surface = composePrepared(backend, {
      ...data,
      layers: data.layers.map((layer) => ({
        ...layer,
        filters: layer.filters.map(({ id, params }) => {
          const filter = registry.get(id);
          if (!filter) throw new Error(`CPU worker has no filter: ${id}`);
          return { filter, params };
        }),
      })),
    });
    try {
      const pixels = backend.read(surface),
        bytes = pixelsToRgba8(pixels);
      return { pixels, bytes };
    } finally {
      backend.release(surface);
    }
  };
}
