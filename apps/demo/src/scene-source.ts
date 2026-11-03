import type { PixelBuffer, Size, TileAddress, TileSource } from "glass-ux-image/core";
import type { SceneRequest } from "./scene-worker";

const WORKERS = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));

/** A tile source served by worker threads, the shape a real decoder or remote document takes. */
export function sceneSource(size: Size): TileSource {
  const workers = Array.from({ length: WORKERS }, () => new Worker(new URL("./scene-worker.ts", import.meta.url), { type: "module" }));
  const waiting = new Map<number, (pixels: PixelBuffer) => void>();
  for (const worker of workers) {
    worker.onmessage = ({ data }: MessageEvent<{ id: number; pixels: PixelBuffer }>) => {
      waiting.get(data.id)?.(data.pixels);
      waiting.delete(data.id);
    };
  }
  let next = 0;
  return {
    ...size,
    readTile: (tile: TileAddress) =>
      new Promise<PixelBuffer>((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        const request: SceneRequest = { id, size, tile };
        workers[id % WORKERS]!.postMessage(request);
      }),
  };
}
