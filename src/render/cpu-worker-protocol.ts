import type { PixelBuffer } from "../core/pixels.js";
import type { TileComposition } from "./compose.js";

export interface CpuCompositionRequest extends Omit<TileComposition, "layers"> {
  layers: Array<
    Omit<TileComposition["layers"][number], "filters"> & {
      filters: Array<{ id: string; params: unknown }>;
    }
  >;
}
export type CpuCompositionReply =
  { pixels: PixelBuffer; bytes: Uint8ClampedArray } | { error: string };

// Only identifiers cross the boundary. Kernels are imported normally in the worker: no eval,
// function stringification or second implementation of a filter's TypeScript pass.
export const CPU_WORKER_FILTERS = new Set([
  "adjust",
  "gaussian-blur",
  "sharpen",
  "develop",
  "effects-stack",
  "motion-blur",
  "radial-blur",
  "lens-blur",
  "tilt-shift",
  "unsharp-mask",
  "high-pass",
  "detail-enhancement",
  "oil-painting",
  "pencil-sketch",
  "watercolour",
  "cartoon",
  "sepia",
  "film-grain",
  "faded",
  "bloom",
  "glow",
  "lens-flare",
  "vignette",
  "pixelate",
  "mosaic",
  "halftone",
  "add-noise",
  "reduce-noise",
  "remove-grain",
  "posterise",
  "threshold",
  "solarise",
  "emboss",
  "lut-grading",
]);
