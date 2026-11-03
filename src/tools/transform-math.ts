import type { Point, Quad, Rect, Size } from '../core/index.js';
/** Canvas anchor, in image space (never mirrored with chrome). */
export type CanvasAnchor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** New canvas relative to the current cropped picture. */
export function anchoredCanvas(size: Size, next: Size, anchor: CanvasAnchor): Rect {
    return { x: (size.width - next.width) * (anchor % 3) / 2, y: (size.height - next.height) * Math.floor(anchor / 3) / 2, width: next.width, height: next.height };
}
/** Degrees required to level a horizon, independent of the direction it was drawn. */
export function horizonAngle(a: Point, b: Point): number {
    let angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    if (angle > 90)
        angle -= 180;
    if (angle < -90)
        angle += 180;
    return -angle;
}
/** An angle in degrees folded into (-180, 180]. */
export function wrapAngle(degrees: number): number {
    const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
    return wrapped === -180 ? 180 : wrapped;
}
/**
 * How far a line drawn on screen leans from the nearest axis, in degrees, clockwise positive. A line
 * within 45 degrees of level is measured against the horizontal, any other against the vertical.
 */
export function lineLean(a: Point, b: Point): { axis: 'horizontal' | 'vertical'; lean: number } {
    const tilt = -horizonAngle(a, b) || 0;
    return Math.abs(tilt) <= 45 ? { axis: 'horizontal', lean: tilt } : { axis: 'vertical', lean: tilt > 0 ? tilt - 90 : tilt + 90 };
}
/** The free angle that makes a line on screen level or plumb, given the angle already applied. */
export function levelAngle(angle: number, a: Point, b: Point): number {
    return Math.round(wrapAngle(angle - lineLean(a, b).lean) * 100) / 100;
}
/** Affine scale, rotation and skew about the quad's centre, followed by translation. */
export function transformQuad(quad: Quad, scaleX = 1, scaleY = 1, angle = 0, skew = 0, dx = 0, dy = 0): Quad {
    const cx = quad.reduce((n, p) => n + p[0], 0) / 4, cy = quad.reduce((n, p) => n + p[1], 0) / 4;
    const r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), k = Math.tan(skew * Math.PI / 180);
    return quad.map(([x, y]) => { const u = (x - cx) * scaleX + (y - cy) * k, v = (y - cy) * scaleY; return [cx + u * c - v * s + dx, cy + u * s + v * c + dy]; }) as unknown as Quad;
}
/** Reject collapsed or crossed quadrilaterals before they reach the homography solver. */
export function validQuad(q: Quad): boolean {
    const crosses = q.map((p, i) => { const b = q[(i + 1) % 4]!, c = q[(i + 2) % 4]!; return (b[0] - p[0]) * (c[1] - b[1]) - (b[1] - p[1]) * (c[0] - b[0]); });
    return q.every(p => p.every(Number.isFinite)) && (crosses.every(v => v > 1e-4) || crosses.every(v => v < -1e-4));
}
/** Convert the colour picker's sRGB hex into linear premultiplied fill pixels. */
export function canvasFill(hex: string): [
    number,
    number,
    number,
    number
] {
    const values = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255), a = values[3] ?? 1;
    const linear = (v: number) => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * a;
    return [linear(values[0]!), linear(values[1]!), linear(values[2]!), a];
}
