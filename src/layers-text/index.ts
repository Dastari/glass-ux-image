import type { LayerKind } from "../core/layers.js";
import { createTextSource, type TextSourceOptions, type TextTileSource } from "./rasteriser.js";
import type { TextSpec } from "./spec.js";
export * from "./spec.js";
export * from "./layout.js";
export * from "./canvas.js";
export * from "./rasteriser.js";
export * from "./fonts.js";

/** Bounded number of source snapshots retained by a kind. Each has its own byte-limited tile cache. */
export interface TextLayerKindOptions extends TextSourceOptions {
  /** Maximum retained spec snapshots. Each source has a separate byte limit. Default eight. */
  maxSources?: number;
}
/** Put TextSpec in LayerSpec.data; the pipeline positions the complete bitmap through its quad.
 * Equal spec snapshots share a source, including across layer ids. Changed data gets a fresh source.
 * Hosts replacing font faces must recreate this kind (or invalidate retained text sources).
 */
export function createTextLayerKind(options: TextLayerKindOptions = {}): LayerKind {
  const limit = options.maxSources ?? 8;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Invalid text source cache limit");
  const sources = new Map<string, TextTileSource>();
  return {
    kind: "text",
    source(spec) {
      if (!spec.data || typeof spec.data !== "object") throw new TypeError("Text layer requires TextSpec data");
      const key = JSON.stringify(spec.data);
      const hit = sources.get(key);
      if (hit) { sources.delete(key); sources.set(key, hit); return hit; }
      const source = createTextSource(spec.data as TextSpec, options);
      if (sources.size >= limit) sources.delete(sources.keys().next().value!);
      sources.set(key, source);
      return source;
    },
  };
}
/** Structurally compatible with defineLayerKind; opt-in, without registration side effects. */
export const textLayerKind: LayerKind = /* @__PURE__ */ createTextLayerKind();
