import { geometryMapping, rectQuad, turnedSize, type Quad } from '../core/index.js';
import type { EditorSession } from '../session/index.js';
/** Selected transform target. The empty string means the base image. */
export function targetId(s: EditorSession): string { return (s.state.toolData.geometryTarget as string | undefined) ?? ''; }
export function targetQuad(s: EditorSession): Quad { const id = targetId(s), g = s.state.draft.geometry; return s.state.draft.layers?.find(l => l.id === id)?.quad ?? g.distort ?? rectQuad(turnedSize(s.state.sourceSize!, g.rotation)); }
export function previewQuad(s: EditorSession, quad: Quad) { const id = targetId(s); if (id)
    s.preview({ layers: s.state.draft.layers?.map(l => l.id === id ? { ...l, quad } : l) ?? [] });
else
    s.preview({ geometry: { ...s.state.draft.geometry, distort: quad } }); }
/** Project target corners into the final output, through all current geometry. */
export function shownQuad(s: EditorSession): Quad {
    const source = s.state.sourceSize!, g = s.state.draft.geometry, mapping = geometryMapping(source, g);
    if (targetId(s))
        return targetQuad(s).map(p => mapping.fromWork(...p)!) as unknown as Quad;
    const bare = geometryMapping(source, { rotation: g.rotation, flipX: g.flipX, flipY: g.flipY, crop: null });
    return rectQuad(turnedSize(source, g.rotation)).map(p => { const original = bare.toSource(...p)!; return s.fromSource(...original)!; }) as unknown as Quad;
}
/** Convert an output-space delta into the target's coordinate system. */
export function targetDelta(s: EditorSession, dx: number, dy: number): [
    number,
    number
] { const g = s.state.draft.geometry, m = geometryMapping(s.state.sourceSize!, g), a = m.toWork(0, 0)!, b = m.toWork(dx, dy)!; let x = b[0] - a[0], y = b[1] - a[1]; if (!targetId(s)) {
    const r = (g.angle ?? 0) * Math.PI / 180, c = Math.cos(r), sin = Math.sin(r);
    [x, y] = [x * c + y * sin, -x * sin + y * c];
} return [x, y]; }
