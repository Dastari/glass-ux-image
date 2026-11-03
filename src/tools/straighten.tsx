import { useRef, type PointerEvent } from 'react';
import { IconRotateCcw } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { Slider } from 'glass-ux/slider';
import { PanelGroup, PanelHint } from '../react/panel-layout.js';
import { useCanvasMapping } from '../canvas/image-canvas.js';
import { geometryMessages } from '../messages/geometry.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import { GeometryNumber } from './transform-controls.js';
import { horizonAngle } from './transform-math.js';
import { clampCrop, workSize } from '../core/index.js';
function StraightenPanel() { const s = useEditorContext(), { draft } = useSessionState(s), m = useMessages(geometryMessages); const preview = (angle: number) => s.preview({ geometry: { ...s.state.draft.geometry, angle, angleFit: 'inset' } }), commit = () => s.commit({}, { label: m.straighten }); return <div className="gi-panel"><PanelGroup label={m.angle}><div className="gi-panel-inline gi-panel-slider"><Slider aria-label={m.angle} size="sm" origin={0} min={-45} max={45} step={.1} unit="°" value={draft.geometry.angle ?? 0} onValueChange={v => typeof v === 'number' && preview(v)} onValueCommitted={commit}/><GeometryNumber layout="bare" label={m.angle} value={draft.geometry.angle ?? 0} min={-180} max={180} unit="°" onChange={preview} onCommit={commit}/></div><PanelHint>{m.horizon}</PanelHint></PanelGroup></div>; }
function StraightenOverlay() { const s = useEditorContext(), { size } = useSessionState(s), map = useCanvasMapping(), m = useMessages(geometryMessages), start = useRef<[
    number,
    number
] | null>(null), line = useRef<SVGLineElement>(null); if (!size)
    return null; const box = map.toScreen({ x: 0, y: 0, ...size }); const point = (e: PointerEvent) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [
    number,
    number
]; }; const end = (e: PointerEvent) => { if (!start.current)
    return; const p = point(e), a = start.current; start.current = null; line.current?.setAttribute('visibility', 'hidden'); if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 4)
    return; const angle = Math.max(-180, Math.min(180, (s.state.draft.geometry.angle ?? 0) + horizonAngle(a, p))); s.commit({ geometry: { ...s.state.draft.geometry, angle, angleFit: 'inset' } }, { label: m.straighten }); }; return <svg className="gi-geometry-overlay gi-horizon" data-canvas-tool="" aria-label={m.horizon} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); line.current?.setAttribute('visibility', 'visible'); }} onPointerMove={e => { if (!start.current || !line.current)
    return; const p = point(e); for (const [k, v] of Object.entries({ x1: start.current[0], y1: start.current[1], x2: p[0], y2: p[1] }))
    line.current.setAttribute(k, String(v)); }} onPointerUp={end} onPointerCancel={() => { start.current = null; line.current?.setAttribute('visibility', 'hidden'); }}><g className="gi-geometry-grid">{[1, 2].map(n => <g key={n}><line x1={box.x + box.width * n / 3} x2={box.x + box.width * n / 3} y1={box.y} y2={box.y + box.height}/><line x1={box.x} x2={box.x + box.width} y1={box.y + box.height * n / 3} y2={box.y + box.height * n / 3}/></g>)}</g><line ref={line} className="gi-horizon-line" visibility="hidden"/></svg>; }
/** Level a horizon with inset bounds and a rule-of-thirds guide. */
export const straighten = defineTool({ id: 'straighten', group: 'geometry', messages: geometryMessages, label: m => m.straighten, icon: <IconRotateCcw />, Panel: StraightenPanel, Overlay: StraightenOverlay, reset: (r, s) => ({ geometry: { ...r.geometry, angle: 0, ...(r.geometry.crop && s.state.sourceSize ? { crop: clampCrop(r.geometry.crop, workSize(s.state.sourceSize, { ...r.geometry, angle: 0 })) } : {}) } }) });
