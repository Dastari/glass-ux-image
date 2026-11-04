import { homography, rectQuad, type LayerSpec, type Point, type Quad } from '../core/index.js';
import type { EditRecipe } from '../session/index.js';
import { createId } from '../core/id.js';

/** A transform handle: four corners and four edge midpoints, named by compass point on the unrotated layer. */
export type SelectHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
/** Each handle's place on the layer, in unit coordinates: (0, 0) is the layer's top left. */
export const SELECT_HANDLES: Readonly<Record<SelectHandle, Point>> = { nw: [0, 0], n: [.5, 0], ne: [1, 0], e: [1, .5], se: [1, 1], s: [.5, 1], sw: [0, 1], w: [0, .5] };
/** Corner handles in quad order: top left, top right, bottom right, bottom left. */
export const SELECT_CORNERS = ['nw', 'ne', 'se', 'sw'] as const satisfies readonly SelectHandle[];
const UNIT = rectQuad({ width: 1, height: 1 });

/** The average of a quad's corners. */
export function quadCentre(q: Quad): Point {
    return [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
}
/** Whether a point lies inside a convex or concave quad, by crossing count. */
export function quadContains(q: Quad, [x, y]: Point): boolean {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
        const [xi, yi] = q[i]!, [xj, yj] = q[j]!;
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
/**
 * The topmost visible layer under a point, as Photoshop's Move tool with Auto-Select picks it. The
 * whole layer box counts, so text is easy to pick between its letters. Layers draw in list order,
 * so the last one is on top.
 */
export function layerAt(layers: readonly LayerSpec[], point: Point, quadOf: (layer: LayerSpec) => Quad | null = layer => layer.quad): string | null {
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i]!, q = layer.visible ? quadOf(layer) : null;
        if (q && quadContains(q, point)) return layer.id;
    }
    return null;
}
/** Move every corner by the same amount. */
export function translateQuad(q: Quad, dx: number, dy: number): Quad {
    return q.map(([x, y]) => [x + dx, y + dy]) as unknown as Quad;
}
/** Turn a quad about a point, clockwise positive in a y-down space. */
export function rotateQuad(q: Quad, degrees: number, centre: Point = quadCentre(q)): Quad {
    const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return q.map(([x, y]) => { const u = x - centre[0], v = y - centre[1]; return [centre[0] + u * c - v * s, centre[1] + u * s + v * c]; }) as unknown as Quad;
}
/** The direction of the layer's top edge, in degrees in (-180, 180], clockwise positive. */
export function quadAngle(q: Quad): number {
    const a = Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) * 180 / Math.PI;
    return a === -180 ? 180 : a;
}
/** Lengths of the top and left edges: the layer's width and height as drawn. */
export function quadSize(q: Quad): { width: number; height: number } {
    return { width: Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), height: Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) };
}
/** The quad's axis-aligned bounds. */
export function quadBounds(q: Quad): { x: number; y: number; width: number; height: number } {
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
/** Where a handle sits on a quad, following any perspective in it. */
export function handlePoint(q: Quad, handle: SelectHandle): Point {
    const [u, v] = SELECT_HANDLES[handle];
    return homography(UNIT, q)(u, v) ?? quadCentre(q);
}

/** How a handle drag scales. */
export interface ScaleOptions {
    /** Keep the layer's proportions (Shift). An edge handle then scales both ways about the edge's middle. */
    keepAspect?: boolean;
    /** Scale about the centre rather than the opposite handle (Alt). */
    fromCentre?: boolean;
    /** Smallest edge length, in the quad's units. Default 1. */
    minSize?: number;
}
/**
 * Scale a quad by dragging one handle to a point, in the layer's own frame, so a turned or
 * perspective layer scales along its own edges. The opposite handle stays put, or the centre with
 * `fromCentre`. Scale never flips the layer: it stops at `minSize`.
 */
export function scaleQuad(q: Quad, handle: SelectHandle, pointer: Point, { keepAspect = false, fromCentre = false, minSize = 1 }: ScaleOptions = {}): Quad {
    const toUnit = homography(q, UNIT), fromUnit = homography(UNIT, q), p = toUnit(...pointer);
    if (!p) return q;
    const c = SELECT_HANDLES[handle], a: Point = fromCentre ? [.5, .5] : [1 - c[0], 1 - c[1]];
    const { width, height } = quadSize(q);
    const factor = (axis: 0 | 1) => c[axis] === a[axis] ? null : (p[axis] - a[axis]) / (c[axis] - a[axis]);
    let sx = factor(0), sy = factor(1);
    if (keepAspect) {
        const k = sx === null ? sy! : sy === null ? sx : Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
        sx = sy = k;
    }
    const least = (length: number) => length > 0 ? minSize / length : 1;
    sx = Math.max(sx ?? 1, least(width)); sy = Math.max(sy ?? 1, least(height));
    if (keepAspect) sx = sy = Math.max(sx, sy);
    return UNIT.map(([u, v]) => fromUnit(a[0] + (u - a[0]) * sx!, a[1] + (v - a[1]) * sy!) ?? [u, v]) as unknown as Quad;
}
/** Scale a quad about its centre by separate factors along its own edges. */
export function resizeQuad(q: Quad, sx: number, sy: number): Quad {
    const fromUnit = homography(UNIT, q);
    return UNIT.map(([u, v]) => fromUnit(.5 + (u - .5) * sx, .5 + (v - .5) * sy) ?? [u, v]) as unknown as Quad;
}
/** Snap an angle to the nearest multiple of a step, as Shift does while rotating. */
export function snapAngle(degrees: number, step = 15): number {
    return Math.round(degrees / step) * step;
}
/** Constrain a move to horizontal, vertical or a diagonal, as Shift does while dragging. */
export function constrainDelta(dx: number, dy: number): Point {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > ay * 2.414) return [dx, 0];
    if (ay > ax * 2.414) return [0, dy];
    const d = (ax + ay) / 2;
    return [Math.sign(dx) * d, Math.sign(dy) * d];
}
/**
 * The 270-degree wedge outside a corner where a drag rotates, as an outline: from the corner out
 * along one edge, round the outside, and back in along the other.
 */
export function rotateZone(q: Quad, corner: 0 | 1 | 2 | 3, reach: number): Point[] {
    const c = q[corner], unit = (p: Point): Point => { const l = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1; return [(p[0] - c[0]) / l, (p[1] - c[1]) / l]; };
    const a = unit(q[(corner + 1) % 4]!), b = unit(q[(corner + 3) % 4]!), at = (x: number, y: number): Point => [c[0] + (a[0] * x + b[0] * y) * reach, c[1] + (a[1] * x + b[1] * y) * reach];
    return [c, at(1, 0), at(1, -1), at(-1, -1), at(-1, 1), at(0, 1)];
}
/** The CSS resize cursor for a handle direction on screen, in degrees. */
export function resizeCursor(degrees: number): 'ew-resize' | 'nwse-resize' | 'ns-resize' | 'nesw-resize' {
    const sector = Math.round((((degrees % 180) + 180) % 180) / 45) % 4;
    return (['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const)[sector]!;
}
/**
 * A copy of a layer placed above it, with copies of the strokes painted on it and its mask, so it
 * looks the same. Returns the change to commit and the copy's id.
 */
export function layerCopy(recipe: Pick<EditRecipe, 'layers' | 'strokes'>, id: string, copyId: string, quad?: Quad): { change: Pick<EditRecipe, 'layers' | 'strokes'>; id: string } | null {
    const layers = recipe.layers ?? [], strokes = recipe.strokes ?? [], index = layers.findIndex(layer => layer.id === id);
    if (index < 0) return null;
    const copy: LayerSpec = { ...layers[index]!, id: copyId, ...(quad ? { quad } : {}) };
    const copied = strokes.filter(stroke => stroke.layer === id).map(stroke => ({ ...stroke, id: createId(), layer: copyId }));
    return { id: copyId, change: { layers: [...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)], strokes: [...strokes, ...copied] } };
}
/**
 * The visible layer above (1) or below (-1) one in the stack, stopping at the ends. With nothing
 * chosen, the top layer, as Photoshop's Alt+[ and Alt+] start from the top.
 */
export function neighbourLayer(layers: readonly LayerSpec[], id: string | null, step: 1 | -1): string | null {
    const shown = layers.filter(layer => layer.visible);
    if (!shown.length) return null;
    const index = shown.findIndex(layer => layer.id === id);
    if (index < 0) return shown.at(-1)!.id;
    return shown[Math.max(0, Math.min(shown.length - 1, index + step))]!.id;
}
