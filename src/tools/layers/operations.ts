import { retryRead } from "../../core/async.js";
import { createImageDocument, createPixels, geometryMapping, rectQuad, tileRect, TileCache, TileCacheBudget, TILE_GUTTER, type LayerSpec, type Quad, type TileSource, type ImageDocument } from "../../core/index.js";
import { composeDocument, composeTile, CpuBackend } from "../../render/index.js";
import { encodeImage } from "../../io/index.js";
import type { EditorSession } from "../../session/index.js";
import { createId } from "../../core/id.js";

/** Decode an image into the host session's asset store, then commit a labelled layer action.
 * Returns null when the host refuses the action. */
export async function addImageLayer(session: EditorSession, blob: Blob, name: string, label: string): Promise<string | null> {
  const source = await session.decodeImage(blob);
  const asset = await session.assets.add(blob, source);
  session.signal.throwIfAborted();
  const id = createId();
  const layer: LayerSpec = { id, name, kind: "image", asset, visible: true, opacity: 1, blend: "normal", quad: rectQuad(source) };
  session.commit({ layers: [...(session.state.recipe.layers ?? []), layer] }, { label });
  return session.state.recipe.layers?.some(layer => layer.id === id) ? id : null;
}

/** Copy a layer above itself, with its mask and its pixel and mask strokes, as one labelled step.
 * Returns the copy's id, or null when the host refuses it. */
export function duplicateLayer(session: EditorSession, id: string, label: string): string | null {
  const { layers = [], strokes = [] } = session.state.recipe, index = layers.findIndex(layer => layer.id === id);
  if (index < 0) return null;
  const copy: LayerSpec = { ...layers[index]!, id: createId() };
  const copied = strokes.filter(stroke => stroke.layer === id).map(stroke => ({ ...stroke, id: createId(), layer: copy.id }));
  session.commit({ layers: [...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)], strokes: [...strokes, ...copied] }, { label });
  return session.state.recipe.layers?.some(layer => layer.id === copy.id) ? copy.id : null;
}

/** Delete a layer and the strokes aimed at it, as one labelled step. */
export function removeLayer(session: EditorSession, id: string, label: string): void {
  const { layers = [], strokes = [] } = session.state.recipe;
  session.commit({ layers: layers.filter(layer => layer.id !== id), strokes: strokes.filter(stroke => stroke.layer !== id) }, { label });
}

/** Flatten the full-resolution visible picture to a clean base through the session export path.
 * Crop, resize, filters, strokes and layers are baked; undo restores source and recipe together. */
export async function flattenImage(session: EditorSession, label: string): Promise<void> {
  await session.flatten({ label });
}

/** Bake a range's current appearance, including its interactions with the lower backdrop.
 * Merge down keeps the base independently editable and discards output outside the canvas.
 * A null id invokes full-picture flatten for backwards compatibility. */
export async function mergeLayerRange(session: EditorSession, id: string | null, label: string): Promise<void> {
  if (id === null) { await flattenImage(session, label); return; }
  const recipe = session.state.recipe, layers = recipe.layers ?? [], shown = session.document;
  if (!shown || !session.state.sourceSize) return;
  const end = id === null ? layers.length : layers.findIndex(layer => layer.id === id) + 1;
  const start = id === null ? 0 : end - 2;
  if (start < 0 || end - start < 2) return;
  const range = layers.slice(start, end), ids = new Set(range.map(layer => layer.id));
  const lowerIds = new Set(layers.slice(0, start).map(layer => layer.id));
  const lower = createImageDocument(shown), combined = createImageDocument(shown), alpha = createImageDocument(shown);
  for (const layer of shown.layers) {
    if (layer.id === shown.layers[0]!.id || lowerIds.has(layer.id)) { lower.addLayer(layer); combined.addLayer(layer); }
    if (ids.has(layer.id)) { combined.addLayer(layer); alpha.addLayer(layer); }
  }
  const backend = new CpuBackend(), caches = new Map<TileSource, TileCache>(), budget = new TileCacheBudget(256 * 1024 * 1024);
  const cacheFor = (source: TileSource) => {
    let cache = caches.get(source);
    if (!cache) { cache = new TileCache(source, budget); caches.set(source, cache); }
    return cache;
  };
  // Derive a normal source-over layer with the range's aggregate coverage. Unlike simply
  // compositing the range over transparency, this preserves multiply and other backdrop modes.
  const baked: TileSource = { width: shown.width, height: shown.height, async readTile(tile) {
    const read = async (document: ImageDocument) => {
      let surface = composeTile(backend, document, tile, cacheFor);
      for (let attempt=0;!surface;attempt++) { await retryRead(attempt,session.signal); await Promise.all([...caches.values()].map(cache => cache.idle(session.signal))); surface = composeTile(backend, document, tile, cacheFor); }
      try { return backend.read(surface); } finally { backend.release(surface); }
    };
    const below = await read(lower), final = await read(combined), coverage = await read(alpha);
    const rect = tileRect(shown, tile), out = createPixels(rect.width, rect.height);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const from = ((y + TILE_GUTTER) * final.width + x + TILE_GUTTER) * 4, to = (y * out.width + x) * 4;
      const a = coverage.data[from + 3]!;
      for (let c = 0; c < 3; c++) out.data[to + c] = Math.max(0, final.data[from + c]! - below.data[from + c]! * (1 - a));
      out.data[to + 3] = a;
    }
    return out;
  } };
  const document = createImageDocument(shown); document.addLayer({ source: baked });
  try {
    const { width, height, bytes } = await composeDocument(backend, document, {signal:session.signal});
    const blob = await encodeImage(bytes, width, height, { type: "image/png" });
    const source = await session.decodeImage(blob), asset = await session.assets.add(blob, source);
    session.signal.throwIfAborted();
    if (session.state.recipe !== recipe) throw new Error("Layers changed during merge");
    const mapping = geometryMapping(session.state.sourceSize, recipe.geometry);
    const quad = rectQuad({ width, height }).map(point => mapping.toWork(...point)) as unknown as Quad;
    if (quad.some(point => !point)) throw new Error("Layer geometry is not invertible");
    const merged: LayerSpec = { id: createId(), name: range[0]!.name, kind: "image", asset,
      visible: true, opacity: 1, blend: "normal", quad };
    // The range's strokes and masks are baked into the merged pixels.
    session.commit({ layers: [...layers.slice(0, start), merged, ...layers.slice(end)], strokes: (recipe.strokes ?? []).filter(stroke => stroke.layer === undefined || !ids.has(stroke.layer)) }, { label });
  } finally {
    for (const cache of caches.values()) cache.dispose();
    for (const doc of [document, lower, combined, alpha]) doc.dispose();
    backend.dispose();
  }
}
