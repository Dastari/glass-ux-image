import { CpuBackend } from "./cpu-backend.js";
import type { BackendKind, RenderBackend } from "./types.js";
import { WebGL2Backend } from "./webgl2-backend.js";

export interface BackendOptions {
  /** `auto` takes the best available. Naming a backend throws if it cannot start. */
  prefer?: "auto" | BackendKind;
}

/** Start the best backend this browser allows. `info.fallbackReason` says why, if it is not the GPU. */
export function createRenderBackend({ prefer = "auto" }: BackendOptions = {}): RenderBackend {
  if (prefer === "cpu") return new CpuBackend();
  try {
    return new WebGL2Backend();
  } catch (error) {
    if (prefer === "webgl2") throw error;
    return new CpuBackend({ fallbackReason: error instanceof Error ? error.message : String(error) });
  }
}
