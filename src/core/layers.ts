import type { BlendMode } from "./document.js";
import type { Quad } from "./warp.js";
import type { TileSource } from "./tile-source.js";
import type { LayerMask } from "./mask.js";

/** Plain-data layer, positioned in work space; bottom layers come first. */
export interface LayerSpec {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  quad: Quad;
  filters?: Readonly<Record<string, unknown>>;
  data?: unknown;
  asset?: string;
  /** Optional mask over the layer, painted by strokes with `mask: true` targeting this layer. */
  mask?: LayerMask;
}
/** A content-addressed blob and its optional decoded source. Hosts own transport and persistence. */
export interface Asset { id: string; blob?: Blob; source?: TileSource }
/** In-memory assets. Project adapters can enumerate entries and restore their original ids. */
export class AssetStore {
  #assets = new Map<string, Asset>();
  async add(blob: Blob, source?: TileSource): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const id = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2,"0")).join("");
    this.set({ id, blob, ...(source ? {source} : {}) });
    return id;
  }
  /** Register a decoded or restored asset. Blob-backed ids should be SHA-256 digests. */
  set(asset: Asset): void { this.#assets.set(asset.id, { ...this.#assets.get(asset.id), ...asset }); }
  get(id: string): Asset | undefined { return this.#assets.get(id); }
  delete(id: string): void { this.#assets.delete(id); }
  get entries(): readonly Asset[] { return [...this.#assets.values()]; }
}
export interface LayerContext { assets: AssetStore }
/** Kinds supply pixels only; the session applies positioning, filters, opacity and blending. */
export interface LayerKind {
  kind: string;
  source(spec: LayerSpec, context: LayerContext): TileSource;
}
/** Declare a source-producing layer kind for explicit session registration. */
export const defineLayerKind = (kind: LayerKind): LayerKind => kind;
/** Image layers reference an already decoded source in the session's asset store. */
export const imageLayerKind: LayerKind = {
  kind: "image",
  source(spec, {assets}) {
    const source = spec.asset && assets.get(spec.asset)?.source;
    if (!source) throw new Error(`Missing decoded image asset: ${spec.asset}`);
    return source;
  }
};
