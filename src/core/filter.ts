import type { PixelBuffer } from "./pixels.js";

/** A filter surface's location, including padding, in this pyramid level's pixels. */
export interface FilterFrame { x: number; y: number; width: number; height: number; documentWidth: number; documentHeight: number }
/** RGBA float data, addressed with texelFetch on the GPU. */
export interface DataTexture { width: number; height: number; data: Float32Array }
/** Additional immutable buffers supplied to a CPU pass, keyed by sampler name. */
export interface FilterContext { inputs: Readonly<Record<string, PixelBuffer>>; textures: Readonly<Record<string, DataTexture>> }

/**
 * One rendering pass, written once for each backend. `glsl` declares its uniforms and defines
 * `vec4 filterPixel(ivec2 p)`, reading `uSource` with `texelFetch`. `cpu` must produce the same
 * pixels: the conformance suite renders both and compares them.
 */
export interface FilterPass {
  /** Stable across parameter changes, so backends can reuse the compiled program. */
  id: string;
  /** Fragment-kernel source defining filterPixel and any uniforms. */
  glsl: string;
  /** Uniform values for this pass, keyed exactly as declared in glsl. */
  uniforms: Readonly<Record<string, number | readonly number[]>>;
  /** Keep this result for later passes within this filter. */
  save?: string;
  /** Sampler name to saved result name. */
  inputs?: Readonly<Record<string, string>>;
  /** Immutable lookup tables uploaded as named GPU samplers and passed to CPU kernels. */
  textures?: Readonly<Record<string, DataTexture>>;
  /** Write every output pixel from source and optional saved inputs. Do not mutate source. */
  cpu(source: PixelBuffer, target: PixelBuffer, context: FilterContext): void;
}

export interface Filter<P = unknown> {
  id: string;
  /** Full-float surfaces for discontinuous kernels whose decisions amplify half-float rounding. */
  precision?: "half" | "full";
  /** Pixels needed around a region at `scale`, the level's fraction of full resolution. */
  padding(params: P, scale: number): number;
  /** The passes to run in order, each reading the last one's result. Empty means no change. */
  passes(params: P, scale: number, frame: FilterFrame): FilterPass[];
}

/** One filter on a layer. Non-destructive: the layer's source pixels never change. */
export interface LayerFilter<P = any> {
  filter: Filter<P>;
  params: P;
}

const definitions = new WeakMap<Filter<any>, { id: string; padding: Filter<any>["padding"]; passes: Filter<any>["passes"] }>();

/** Internal provenance guard: a wrapped or mutated definition must use its supplied kernel. */
export const isFilterDefinition = (filter: Filter<any>) => {
  const original = definitions.get(filter);
  return original?.id === filter.id && original.padding === filter.padding && original.passes === filter.passes;
};

/** Tie a filter's parameter type to its definition. */
export const defineFilter = <P>(filter: Filter<P>): Filter<P> => {
  definitions.set(filter, { id: filter.id, padding: filter.padding, passes: filter.passes });
  return filter;
};
