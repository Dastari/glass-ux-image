import type { Geometry } from './geometry.js';
import type { Rect, Size } from './pyramid.js';
/** Shared decode/export ceiling, checked before allocating output pixels. */
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;
/** Invalid host or project geometry; rejected before rendering or allocation. */
export class GeometryError extends RangeError { override name = 'GeometryError'; }
const ensure = (valid: boolean, message: string) => { if (!valid) throw new GeometryError(message); };
/** Validate an output size, including fractional geometry before rounding to pixels. */
export function validateImageSize(size: Size): void {
  ensure(!!size && typeof size === "object" && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width >= 1 && size.height >= 1 && Math.round(size.width) * Math.round(size.height) <= MAX_IMAGE_PIXELS, 'Image dimensions must be finite, positive and within the 64 megapixel limit');
}
function rect(rect: Rect, crop = false) {
  validateImageSize(rect);
  ensure(Number.isFinite(rect.x) && Number.isFinite(rect.y) && Math.abs(rect.x) <= MAX_IMAGE_PIXELS && Math.abs(rect.y) <= MAX_IMAGE_PIXELS && (!crop || (rect.x >= 0 && rect.y >= 0)), 'Invalid geometry rectangle origin');
}
/** Check plain recipe geometry independently of decoded source dimensions. */
export function validateGeometry(g: Geometry): void {
  ensure(!!g && typeof g === "object", "Invalid geometry");
  ensure([0,90,180,270].includes(g.rotation), 'Invalid quarter turn');
  ensure(typeof g.flipX === 'boolean' && typeof g.flipY === 'boolean', 'Invalid geometry flips');
  if (g.angle !== undefined) ensure(Number.isFinite(g.angle) && Math.abs(g.angle) <= 180, 'Angle must be between -180 and 180 degrees');
  if (g.angleFit !== undefined) ensure(g.angleFit === 'expand' || g.angleFit === 'inset', 'Invalid angle fit');
  if(g.crop !== null && g.crop !== undefined) { ensure(typeof g.crop === "object", "Invalid crop"); rect(g.crop, true); }
  if (g.resize !== null && g.resize !== undefined) {
    ensure(typeof g.resize === "object", "Invalid resize");
    validateImageSize(g.resize);
    if (g.resize.dpi !== undefined) ensure(Number.isFinite(g.resize.dpi) && g.resize.dpi > 0 && g.resize.dpi <= 100000, 'Invalid print resolution');
  }
  if (g.canvas !== null && g.canvas !== undefined) {
    ensure(typeof g.canvas === "object", "Invalid canvas");
    rect(g.canvas.rect);
    if (g.canvas.fill !== null) ensure(Array.isArray(g.canvas.fill) && g.canvas.fill.length === 4 && g.canvas.fill.every(v => Number.isFinite(v) && v >= 0 && v <= 1), 'Invalid canvas fill');
  }
  if (g.distort !== null && g.distort !== undefined) {
    ensure(Array.isArray(g.distort) && g.distort.length === 4 && g.distort.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && Math.abs(v) <= MAX_IMAGE_PIXELS)), 'Invalid distortion quad');
    const xs=g.distort.map(p=>p[0]), ys=g.distort.map(p=>p[1]);
    validateImageSize({width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});
  }
}
