import { TILE_SIZE } from "./pixels.js";
import { coarsestLevel, tilesInRect, type Rect, type Size, type TileAddress } from "./pyramid.js";

/** Smallest supported canvas pixels per document pixel. */
export const MIN_ZOOM = 1 / 64;
/** Largest supported canvas pixels per document pixel. */
export const MAX_ZOOM = 64;

/** Where the document sits on screen. `zoom` is device pixels per document pixel. */
export interface Viewport {
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  zoom: number;
  /** The document point at the centre of the canvas. */
  centerX: number;
  centerY: number;
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Zoom and centre that show the whole document with `margin` device pixels around it. */
export function fitViewport(document: Size, canvas: Size, margin = 0): Viewport {
  const room = { width: Math.max(1, canvas.width - margin * 2), height: Math.max(1, canvas.height - margin * 2) };
  return {
    ...canvas,
    zoom: clampZoom(Math.min(room.width / document.width, room.height / document.height)),
    centerX: document.width / 2,
    centerY: document.height / 2,
  };
}

/** Map viewport CSS pixels to unmirrored document coordinates using the current camera. */
export function screenToDocument(view: Viewport, x: number, y: number) {
  return { x: view.centerX + (x - view.width / 2) / view.zoom, y: view.centerY + (y - view.height / 2) / view.zoom };
}

/** Project document coordinates into viewport CSS pixels using the current camera. */
export function documentToScreen(view: Viewport, x: number, y: number) {
  return { x: (x - view.centerX) * view.zoom + view.width / 2, y: (y - view.centerY) * view.zoom + view.height / 2 };
}

/** Zoom by `factor`, keeping the document point under the screen point `(x, y)` where it is. */
export function zoomAt(view: Viewport, factor: number, x: number, y: number): Viewport {
  const zoom = clampZoom(view.zoom * factor);
  const anchor = screenToDocument(view, x, y);
  return {
    ...view,
    zoom,
    centerX: anchor.x - (x - view.width / 2) / zoom,
    centerY: anchor.y - (y - view.height / 2) / zoom,
  };
}

/** Move the document by a distance in device pixels. */
export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, centerX: view.centerX - dx / view.zoom, centerY: view.centerY - dy / view.zoom };
}

/** The pyramid level to draw: the coarsest one still holding at least one pixel per device pixel. */
export function levelForZoom(document: Size, zoom: number): number {
  const level = zoom >= 1 ? 0 : Math.floor(Math.log2(1 / zoom));
  return Math.min(level, coarsestLevel(document));
}

/** The document rectangle the canvas shows, in level 0 pixels. */
export function visibleRect(view: Viewport): Rect {
  const topLeft = screenToDocument(view, 0, 0);
  return { x: topLeft.x, y: topLeft.y, width: view.width / view.zoom, height: view.height / view.zoom };
}

/** Tiles the canvas shows at `level`, nearest the centre first. */
export function visibleTiles(document: Size, view: Viewport, level: number): TileAddress[] {
  const rect = visibleRect(view);
  const scale = 2 ** -level;
  const tiles = tilesInRect(document, level, { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale });
  const size = TILE_SIZE * 2 ** level;
  const distance = ({ x, y }: TileAddress) => Math.hypot((x + 0.5) * size - view.centerX, (y + 0.5) * size - view.centerY);
  return tiles.sort((a, b) => distance(a) - distance(b));
}
