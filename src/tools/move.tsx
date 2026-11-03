import { useRef } from 'react';
import { IconMove } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { Select } from 'glass-ux/select';
import { useCanvasMapping } from '../canvas/image-canvas.js';
import { geometryMessages } from '../messages/geometry.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import type { Quad } from '../core/index.js';
import { GeometryNumber } from './transform-controls.js';
import { PanelPair } from '../react/panel-layout.js';
import { previewQuad, shownQuad, targetDelta, targetId, targetQuad } from './transform-target.js';
import { transformQuad } from './transform-math.js';
/** Target selector shared by the geometry tools. */
export function TransformTarget({ base = true }: {
    /** Include the base picture as a selectable transform target. */
    base?: boolean;
}) { const s = useEditorContext(), { draft } = useSessionState(s), m = useMessages(geometryMessages); return <Select size="sm" aria-label={m.layer} value={targetId(s)} onValueChange={id => { s.revert(); s.setToolData('geometryTarget', id); }} options={[...(base ? [{ value: '', label: m.base }] : []), ...(draft.layers ?? []).map(l => ({ value: l.id, label: l.name }))]}/>; }
function MovePanel() { const s = useEditorContext(); useSessionState(s); const m = useMessages(geometryMessages), id = targetId(s), q = s.state.sourceSize ? targetQuad(s) : null; return <div className="gi-panel"><TransformTarget base={false}/>{id && q && <PanelPair>{(['x', 'y'] as const).map((axis, i) => <GeometryNumber key={axis} layout="field" label={m[axis]} value={q[0][i]!} onChange={v => { previewQuad(s, transformQuad(q, 1, 1, 0, 0, i === 0 ? v - q[0][0] : 0, i === 1 ? v - q[0][1] : 0)); s.commit({}, { label: m.move }); }}/>)}</PanelPair>}</div>; }
function MoveOverlay() { const s = useEditorContext(); useSessionState(s); const map = useCanvasMapping(), m = useMessages(geometryMessages), drag = useRef<{
    x: number;
    y: number;
    q: Quad;
} | null>(null); if (!s.state.sourceSize || !targetId(s))
    return null; const q = shownQuad(s).map(([x, y]) => map.toScreen({ x, y, width: 0, height: 0 })), xs = q.map(p => p.x), ys = q.map(p => p.y); return <div data-canvas-tool="" className="gi-move-box" role="group" tabIndex={0} aria-label={m.move} style={{ left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }} onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, q: targetQuad(s) }; }} onPointerMove={e => { const d = drag.current; if (d) {
    const [x, y] = targetDelta(s, (e.clientX - d.x) / map.scale, (e.clientY - d.y) / map.scale);
    previewQuad(s, transformQuad(d.q, 1, 1, 0, 0, x, y));
} }} onPointerUp={() => { if (drag.current) {
    drag.current = null;
    s.commit({}, { label: m.move });
} }} onPointerCancel={() => { drag.current = null; s.revert(); }} onKeyDown={e => { const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]; if (delta) {
    e.preventDefault();
    e.stopPropagation();
    const n = e.shiftKey ? 10 : 1;
    const [x, y] = targetDelta(s, delta[0]! * n, delta[1]! * n);
    previewQuad(s, transformQuad(targetQuad(s), 1, 1, 0, 0, x, y));
    s.commit({}, { label: m.move });
}
else if (e.key === 'Escape') {
    s.revert();
} }}/>; }
/** Reposition image-space layer quads by dragging or arrow-key nudging. */
export const move = defineTool({ id: 'move', group: 'geometry', messages: geometryMessages, label: m => m.move, icon: <IconMove />, shortcut: 'v', Panel: MovePanel, Overlay: MoveOverlay, enter(s) { if (!targetId(s) && s.state.draft.layers?.length)
        s.setToolData('geometryTarget', s.state.draft.layers.at(-1)!.id); } });
