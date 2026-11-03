import { useRef, useState, useEffect } from 'react';
import { IconExpand } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { Segmented } from 'glass-ux/segmented';
import { Button } from 'glass-ux/button';
import { useCanvasMapping } from '../canvas/image-canvas.js';
import { geometryMessages } from '../messages/geometry.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import type { Quad } from '../core/index.js';
import { GeometryApply, GeometryNumber } from './transform-controls.js';
import { PanelGroup } from '../react/panel-layout.js';
import { previewQuad, shownQuad, targetDelta, targetQuad, targetId } from './transform-target.js';
import { transformQuad, validQuad } from './transform-math.js';
import { TransformTarget } from './move.js';
export { transformQuad, validQuad } from './transform-math.js';
type Mode = 'scale' | 'rotate' | 'skew' | 'distort';
function TransformPanel() { const s = useEditorContext(); useSessionState(s); const m = useMessages(geometryMessages), [values, setValues] = useState({ scaleX: 100, scaleY: 100, angle: 0, skew: 0 }), initial = useRef<Quad | null>(null); const target = targetId(s); useEffect(() => { initial.current = null; setValues({ scaleX: 100, scaleY: 100, angle: 0, skew: 0 }); }, [s.state.recipe, target]); if (!s.state.sourceSize)
    return null; const q = targetQuad(s), mode = (s.state.toolData.transformMode as Mode | undefined) ?? 'scale'; return <div className="gi-panel" onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();s.commit({}, {label:m.transform});}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();s.revert();}}}><PanelGroup><TransformTarget /><Segmented aria-label={m.transform} size="sm" collapse="menu" value={mode} onValueChange={v => s.setToolData('transformMode', v)} options={(['scale', 'rotate', 'skew', 'distort'] as const).map(v => ({ value: v, label: m[v] }))}/></PanelGroup><PanelGroup><div className="gi-panel-pair gi-panel-grid">{(['scaleX', 'scaleY', 'angle', 'skew'] as const).map(k => <GeometryNumber key={k} layout="field" unit={k === 'scaleX' || k === 'scaleY' ? '%' : '°'} label={m[k]} value={values[k]} min={k === 'scaleX' || k === 'scaleY' ? 1 : k === 'skew' ? -80 : -180} max={k === 'skew' ? 80 : k === 'angle' ? 180 : 10000} onChange={v => { initial.current ??= q; const next = { ...values, [k]: v }; setValues(next); const quad = transformQuad(initial.current, next.scaleX / 100, next.scaleY / 100, next.angle, next.skew); if (validQuad(quad))
    previewQuad(s, quad); }}/>)}</div></PanelGroup><PanelGroup label={m.corners}><div className="gi-geometry-corners"><span aria-hidden="true"/><span className="gi-panel-label" aria-hidden="true">{m.x}</span><span className="gi-panel-label" aria-hidden="true">{m.y}</span>{q.map((p, i) => <div key={i} className="gi-geometry-coordinates"><span className="gi-panel-label">{[m.topLeft, m.topRight, m.bottomRight, m.bottomLeft][i]}</span>{(['x', 'y'] as const).map((axis, j) => <GeometryNumber key={axis} layout="bare" label={`${[m.topLeft, m.topRight, m.bottomRight, m.bottomLeft][i]} ${m[axis]}`} value={p[j]!} onChange={v => { const next = q.map((point, n) => n === i ? point.map((c, k) => k === j ? v : c) : point) as unknown as Quad; if (validQuad(next))
    previewQuad(s, next); }}/>)}</div>)}</div></PanelGroup><GeometryApply label={m.transform}/></div>; }
function TransformOverlay() {
    const s = useEditorContext();
    useSessionState(s);
    const map = useCanvasMapping(), m = useMessages(geometryMessages), drag = useRef<{
        i: number;
        x: number;
        y: number;
        q: Quad;
        mode: Mode;
        scale: number;
    } | null>(null);
    if (!s.state.sourceSize)
        return null;
    const q = targetQuad(s), shown = shownQuad(s).map(([x, y]) => map.toScreen({ x, y, width: 0, height: 0 })), mode = (s.state.toolData.transformMode as Mode | undefined) ?? 'scale';
    const change = (start: Quad, i: number, dx: number, dy: number, kind: Mode) => { let next: Quad; if (kind === 'distort')
        next = start.map((p, n) => n === i ? [p[0] + dx, p[1] + dy] : p) as unknown as Quad;
    else if (kind === 'rotate')
        next = transformQuad(start, 1, 1, dx);
    else if (kind === 'skew')
        next = transformQuad(start, 1, 1, 0, Math.max(-80, Math.min(80, dx)));
    else {
        const opposite = start[(i + 2) % 4]!, p = start[i]!, sx = Math.abs(p[0] - opposite[0]) > 1e-4 ? Math.max(.01, 1 + dx / (p[0] - opposite[0])) : 1, sy = Math.abs(p[1] - opposite[1]) > 1e-4 ? Math.max(.01, 1 + dy / (p[1] - opposite[1])) : 1;
        next = start.map(([x, y]) => [opposite[0] + (x - opposite[0]) * sx, opposite[1] + (y - opposite[1]) * sy]) as unknown as Quad;
    } if (validQuad(next))
        previewQuad(s, next); };
    return <div className="gi-geometry-overlay" onKeyDown={e => { if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        s.commit({}, { label: m.transform });
    }
    else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        s.revert();
    } }}><svg className="gi-geometry-overlay" aria-hidden="true"><polygon className="gi-transform-outline" points={shown.map(p => `${p.x},${p.y}`).join(' ')}/></svg>{shown.map((p, i) => <Button key={i} className="gi-transform-handle" data-canvas-tool="" aria-label={`${m[mode]} ${[m.topLeft, m.topRight, m.bottomRight, m.bottomLeft][i]}`} style={{ left: p.x, top: p.y }} onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { i, x: e.clientX, y: e.clientY, q, mode, scale: map.scale }; }} onPointerMove={e => { const d = drag.current; if (d) {
        const [x, y] = targetDelta(s, (e.clientX - d.x) / d.scale, (e.clientY - d.y) / d.scale);
        change(d.q, d.i, x, y, d.mode);
    } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; s.revert(); }} onKeyDown={e => { const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]; if (delta) {
        e.preventDefault();
        e.stopPropagation();
        const n = e.shiftKey ? 10 : 1;
        change(q, i, delta[0]! * n, delta[1]! * n, mode);
    } }}>◇</Button>)}</div>;
}
/** Scale, rotate, skew or distort the base or a layer. Enter applies; Escape abandons the draft. */
export const transform = defineTool({ id: 'transform', group: 'geometry', messages: geometryMessages, label: m => m.transform, icon: <IconExpand />, Panel: TransformPanel, Overlay: TransformOverlay, reset: r => ({ geometry: { ...r.geometry, distort: null } }) });
