import type { LayerFilter } from "./filter.js";
import type { Rect, Size } from "./pyramid.js";
import type { TileSource } from "./tile-source.js";

/** Blend functions use straight linear RGB, then Porter–Duff source-over alpha. */
export const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "soft-light", "hard-light", "darken", "lighten", "difference", "exclusion", "colour-dodge", "colour-burn", "hue", "saturation", "colour", "luminosity"] as const;
export type BlendMode = typeof BLEND_MODES[number];

export interface RasterLayer {
  /** Stable layer identity within the document. */
  id: string;
  /** Host-visible layer name. */
  name: string;
  /** Pixel source matching the document dimensions. */
  source: TileSource;
  /** Whether this layer participates in composition. */
  visible: boolean;
  /** 0–1. */
  opacity: number;
  /** Linear-light source-over blending function. */
  blend: BlendMode;
  /** Ordered non-destructive filters applied before blending. */
  filters: LayerFilter<any>[];
}

export type LayerInit = Pick<RasterLayer, "source"> & Partial<Omit<RasterLayer, "source">>;

export interface ImageDocument extends Size {
  /** Bottom first. */
  readonly layers: readonly RasterLayer[];
  /** Goes up with every change, so renderers can tell composed tiles are stale. */
  readonly revision: number;
  /** Append a layer above existing layers and notify subscribers. */
  addLayer(layer: LayerInit): RasterLayer;
  /** Patch layer presentation or filters and invalidate composed tiles. */
  updateLayer(id: string, patch: Partial<Omit<RasterLayer, "id" | "source">>): void;
  /** Remove a layer and its source subscription. Does not dispose a host-owned source. */
  removeLayer(id: string): void;
  /** Calls back after every change. Returns the function that stops it. */
  subscribe(listener: (rect?: Rect) => void): () => void;
  /** Source changes in document coordinates; unlike structural changes these retain other tiles. */
  invalidate(rect: Rect): void;
  /** Stop listening to sources. */
  dispose(): void;
}

/** Create an empty layered document of the given size. Add sources with addLayer and dispose subscriptions when finished. */
/** Create an empty layered document of the given size. Add sources with addLayer and dispose subscriptions when finished. */
export function createImageDocument(size: Size): ImageDocument {
  if (size.width < 1 || size.height < 1) throw new RangeError("A document needs at least one pixel");
  let layers: RasterLayer[] = [];
  let revision = 0;
  let nextId = 1;
  const listeners = new Set<(rect?: Rect) => void>();
  const stops = new Map<string, () => void>();
  const changed = (rect?: Rect) => {
    revision++;
    for (const listener of listeners) listener(rect);
  };

  return {
    width: size.width,
    height: size.height,
    get layers() {
      return layers;
    },
    get revision() {
      return revision;
    },
    addLayer(init) {
      if (init.source.width !== size.width || init.source.height !== size.height) {
        throw new RangeError("A layer's source must match its document's size");
      }
      const id = init.id ?? `layer-${nextId++}`;
      const layer: RasterLayer = { id, name: id, visible: true, opacity: 1, blend: "normal", filters: [], ...init };
      stops.set(id, layer.source.invalidated?.(rect => changed(rect)) ?? (() => {}));
      layers = [...layers, layer];
      changed();
      return layer;
    },
    updateLayer(id, patch) {
      layers = layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer));
      changed();
    },
    removeLayer(id) {
      stops.get(id)?.(); stops.delete(id);
      layers = layers.filter((layer) => layer.id !== id);
      changed();
    },
    invalidate: changed,
    dispose() { for(const stop of stops.values()) stop(); stops.clear(); listeners.clear(); },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
