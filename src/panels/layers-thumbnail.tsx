import { useEffect, useRef } from "react";
import { coarsestLevel, createPixels, levelSize, pixelsToRgba8, tileRect, tilesInRect, type PixelBuffer, type TileSource } from "../core/index.js";
import { useSessionState } from "../react/session-context.js";
import type { EditorSession } from "../session/index.js";

/** Read a source at the pyramid level nearest `maxEdge`, without blocking a frame. */
export async function readThumbnail(source: TileSource, maxEdge: number, signal?: AbortSignal): Promise<PixelBuffer> {
  const level = Math.min(coarsestLevel(source), Math.max(0, Math.floor(Math.log2(Math.max(source.width, source.height) / maxEdge))));
  const size = levelSize(source, level), out = createPixels(size.width, size.height);
  for (const tile of tilesInRect(source, level, { x: 0, y: 0, width: size.width, height: size.height })) {
    signal?.throwIfAborted();
    const pixels = await source.readTile(tile, signal), rect = tileRect(source, tile);
    for (let row = 0; row < rect.height; row++) out.data.set(pixels.data.subarray(row * pixels.width * 4, (row * pixels.width + rect.width) * 4), ((rect.y + row) * size.width + rect.x) * 4);
  }
  return out;
}

/** Display bytes for a thumbnail: colour for pixels, grey coverage for a mask. */
export function thumbnailBytes(pixels: PixelBuffer, part: "pixels" | "mask"): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixels.data.length);
  if (part === "pixels") { pixelsToRgba8(pixels, out); return out; }
  for (let i = 0; i < out.length; i += 4) { const v = pixels.data[i + 3]! * 255; out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255; }
  return out;
}

/** Props for a session-bound layer or mask thumbnail. */
export interface LayerThumbnailProps {
  /** The session holding the layer. */
  session: EditorSession;
  /** Layer id. */
  id: string;
  /** The layer's pixels, or its mask's coverage in grey. */
  part: "pixels" | "mask";
}

/**
 * A small picture of a layer or its mask, redrawn shortly after its strokes or spec change.
 * Decorative: the row it sits in carries the name.
 */
export function LayerThumbnail({ session, id, part }: LayerThumbnailProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { draft, status } = useSessionState(session);
  const spec = draft.layers?.find(layer => layer.id === id);
  const mine = (draft.strokes ?? []).filter(stroke => stroke.layer === id && Boolean(stroke.mask) === (part === "mask"));
  const last = mine.at(-1);
  useEffect(() => {
    if (status !== "ready" || !spec) return;
    const controller = new AbortController();
    // Wait out a burst of edits, then read the coarse level only.
    const timer = setTimeout(async () => {
      try {
        const parts = session.layerSources(id), source = part === "mask" ? parts?.mask : parts?.pixels;
        if (!source) return;
        await source.idle?.(controller.signal);
        const pixels = await readThumbnail(source, 96, controller.signal), element = canvas.current;
        if (!element || controller.signal.aborted) return;
        element.width = pixels.width; element.height = pixels.height;
        element.getContext("2d")?.putImageData(new ImageData(thumbnailBytes(pixels, part), pixels.width, pixels.height), 0, 0);
      } catch { /* A thumbnail that cannot be read keeps its last picture. */ }
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [session, id, part, spec, status, mine.length, last]);
  return <canvas ref={canvas} className="gi-layer-thumb-canvas" width={1} height={1} aria-hidden />;
}
