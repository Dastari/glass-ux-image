import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from 'glass-ux/button';
import { IconRotateCcw, IconRotateCw } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { numberFormat, useLocale } from 'glass-ux/locale';
import { Segmented } from 'glass-ux/segmented';
import { Slider } from 'glass-ux/slider';
import { PanelActions, PanelGroup, PanelHint } from '../react/panel-layout.js';
import { useCanvasMapping } from '../canvas/image-canvas.js';
import { clampCrop, geometryMapping, rotateGeometry, workSize, type Geometry, type Point } from '../core/index.js';
import { geometryMessages } from '../messages/geometry.js';
import { imageEditorMessages } from '../react/messages.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import type { EditorSession } from '../session/index.js';
import { FillEdges, fillEdgesAction } from './fill-edges.js';
import { GeometryNumber } from './transform-controls.js';
import { levelAngle, lineLean, wrapAngle } from './transform-math.js';

/** A measuring line in source pixels, so it stays on the feature it was drawn along as the picture turns. */
export interface AngleLine { a: Point; b: Point }
/** Tool data key holding the angle finder's line. */
export const ANGLE_LINE = 'rotate.line';

type Fit = NonNullable<Geometry['angleFit']>;
const fitOf = (session: EditorSession): Fit => session.state.draft.geometry.angleFit ?? 'expand';
const lineOf = (session: EditorSession) => session.state.toolData[ANGLE_LINE] as AngleLine | undefined;
const round = (degrees: number) => Math.round(degrees * 10) / 10;

/** Show a free angle while dragging; `commitAngle` records it. */
function previewAngle(session: EditorSession, angle: number) {
    session.preview({ geometry: { ...session.state.draft.geometry, angle: wrapAngle(angle), angleFit: fitOf(session) } });
}
function commitAngle(session: EditorSession, label: string, angle?: number) {
    session.commit(angle === undefined ? {} : { geometry: { ...session.state.draft.geometry, angle: wrapAngle(angle), angleFit: fitOf(session) } }, { label });
}
/** Turn the angle finder's line level or plumb, whichever it is closer to. */
function levelToLine(session: EditorSession, label: string) {
    const line = lineOf(session), size = session.state.sourceSize;
    if (!line || !size) return;
    // Measure where the line shows now: through quarter turns, flips and the angle already applied.
    const mapping = geometryMapping(size, session.state.draft.geometry), a = mapping.fromSource(...line.a), b = mapping.fromSource(...line.b);
    if (a && b) commitAngle(session, label, levelAngle(session.state.draft.geometry.angle ?? 0, a, b));
}

const degrees = (locale: string, value: number, signed = false) => `${numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, ...(signed ? { signDisplay: 'exceptZero' as const } : {}) }).format(value)}°`;

function RotatePanel() {
    const session = useEditorContext(), { draft, toolData } = useSessionState(session), m = useMessages(geometryMessages), base = useMessages(imageEditorMessages), locale = useLocale();
    const angle = draft.geometry.angle ?? 0, fit = draft.geometry.angleFit ?? 'expand', line = toolData[ANGLE_LINE] as AngleLine | undefined;
    const commit = () => commitAngle(session, base.rotate);
    const turn = (d: -1 | 1) => { if (session.state.sourceSize)
        session.commit({ geometry: rotateGeometry(session.state.draft.geometry, session.state.sourceSize, d) }, { label: base.rotate }); };
    const lean = (() => {
        const size = session.state.sourceSize;
        if (!line || !size) return null;
        const mapping = geometryMapping(size, draft.geometry), a = mapping.fromSource(...line.a), b = mapping.fromSource(...line.b);
        return a && b ? lineLean(a, b).lean : null;
    })();
    return <div className="gi-panel">
      <PanelGroup label={m.angle}>
        <div className="gi-panel-inline gi-panel-slider"><Slider aria-label={m.angle} size="sm" origin={0} min={-45} max={45} step={.1} unit="°" value={Math.max(-45, Math.min(45, angle))} onValueChange={v => typeof v === 'number' && previewAngle(session, v)} onValueCommitted={commit}/><GeometryNumber layout="bare" label={m.angle} value={angle} min={-180} max={180} unit="°" onChange={v => previewAngle(session, v)} onCommit={commit}/></div>
        <div className="gi-panel-buttons">{([-1, 1] as const).map(d => <Button key={d} size="sm" variant="secondary" icon={d === 1 ? <IconRotateCw /> : <IconRotateCcw />} onClick={() => turn(d)}>{d === 1 ? base.rotateRight : base.rotateLeft}</Button>)}</div>
      </PanelGroup>
      <PanelGroup label={m.edges}>
        <Segmented aria-label={m.edges} size="sm" value={fit} onValueChange={(next: Fit) => session.commit({ geometry: { ...session.state.draft.geometry, angleFit: next } }, { label: base.rotate })} options={[{ value: 'expand', label: m.showAll }, { value: 'inset', label: m.cropToFill }]}/>
        {fit === 'expand' && <FillEdges />}
      </PanelGroup>
      <PanelGroup label={m.angleFinder}>
        <PanelHint>{m.measureHint}</PanelHint>
        {lean !== null && <p className="gi-rotate-reading"><span>{m.lineAngle}</span><output>{degrees(locale, round(lean), true)}</output></p>}
        <PanelActions start={line ? <Button size="sm" variant="ghost" onClick={() => session.setToolData(ANGLE_LINE, undefined)}>{m.clearLine}</Button> : undefined}>
          <Button size="sm" variant="primary" disabledReason={line ? undefined : m.measureHint} onClick={() => levelToLine(session, m.levelLine)}>{m.levelLine}</Button>
        </PanelActions>
      </PanelGroup>
    </div>;
}

/** Ticks every degree near level and plumb, every five elsewhere; longer every five and fifteen. */
function dialTicks(cx: number, cy: number, r: number) {
    let d = '';
    for (let n = 0; n < 360; n++) {
        const tilt = ((n + 90) % 180) - 90, near = Math.abs(tilt) <= 45 || Math.abs(Math.abs(tilt) - 90) <= 20;
        if (n % 5 && !near) continue;
        const length = n % 15 === 0 ? 14 : n % 5 === 0 ? 9 : 5, t = n * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
        d += `M${cx + c * r} ${cy + s * r}L${cx + c * (r - length)} ${cy + s * (r - length)}`;
    }
    return d;
}

/** Fine alignment grid over the picture, about every 48 CSS pixels with stronger thirds. */
function gridPaths(x: number, y: number, w: number, h: number) {
    const columns = Math.max(3, Math.round(w / 48)), rows = Math.max(3, Math.round(h / 48));
    let fine = '', thirds = '';
    for (let i = 1; i < columns; i++) fine += `M${x + w * i / columns} ${y}V${y + h}`;
    for (let i = 1; i < rows; i++) fine += `M${x} ${y + h * i / rows}H${x + w}`;
    for (const i of [1, 2]) thirds += `M${x + w * i / 3} ${y}V${y + h}M${x} ${y + h * i / 3}H${x + w}`;
    return { fine, thirds };
}

type Drag = { kind: 'dial'; centre: Point; from: number; angle: number } | { kind: 'line'; end: 'a' | 'b'; fixed: Point } | null;

/**
 * A protractor over the picture: a dial centred on it reads and sets the free angle, and a line
 * dragged along any straight edge reads how far that edge leans, with one press to level it.
 */
function RotateOverlay() {
    const session = useEditorContext(), { draft, size, sourceSize, toolData } = useSessionState(session), map = useCanvasMapping();
    const m = useMessages(geometryMessages), base = useMessages(imageEditorMessages), locale = useLocale();
    const drag = useRef<Drag>(null), keyed = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [drawing, setDrawing] = useState<{ a: Point; b: Point } | null>(null);
    // Arrow-key turns made in quick succession become one history step.
    const flush = () => { if (keyed.current) { clearTimeout(keyed.current); keyed.current = null; commitAngle(session, base.rotate); } };
    const flushRef = useRef(flush);
    flushRef.current = flush;
    // History commands record a pending key turn first, so Undo removes it rather than the step before.
    useEffect(() => { const release = session.holdDraft(() => flushRef.current()); return () => { release(); flushRef.current(); }; }, [session]);
    if (!size || !sourceSize) return null;
    const mapping = geometryMapping(sourceSize, draft.geometry);
    const toScreen = (p: Point): Point | null => { const d = mapping.fromSource(p[0], p[1]); if (!d) return null; const r = map.toScreen({ x: d[0], y: d[1], width: 0, height: 0 }); return [r.x, r.y]; };
    const toSource = (p: Point): Point | null => { const d = map.toDocument(p[0], p[1]); return mapping.toSource(d.x, d.y); };
    const picture = map.toScreen({ x: 0, y: 0, ...size });
    const cx = picture.x + picture.width / 2, cy = picture.y + picture.height / 2;
    const r = Math.max(64, Math.min(picture.width, picture.height) * .38);
    const angle = draft.geometry.angle ?? 0, t = angle * Math.PI / 180, ux = Math.cos(t), uy = Math.sin(t);
    const labelEvery = r >= 170 ? 15 : r >= 110 ? 30 : 0;
    const grid = gridPaths(picture.x, picture.y, picture.width, picture.height);
    const stored = toolData[ANGLE_LINE] as AngleLine | undefined;
    const line = drawing ?? (stored ? (() => { const a = toScreen(stored.a), b = toScreen(stored.b); return a && b ? { a, b } : null; })() : null);
    const lean = line && Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]) >= 6 ? lineLean(line.a, line.b) : null;
    const local = (event: PointerEvent<Element>): Point => { const box = (event.currentTarget.closest('.gi-rotate') ?? event.currentTarget).getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };
    const polar = (p: Point, c: Point) => Math.atan2(p[1] - c[1], p[0] - c[0]) * 180 / Math.PI;

    const startDial = (event: PointerEvent<SVGElement>) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { kind: 'dial', centre: [cx, cy], from: polar(local(event), [cx, cy]), angle };
    };
    const startLine = (event: PointerEvent<SVGSVGElement>) => {
        if (event.button !== 0) return;
        const p = local(event);
        if (p[0] < picture.x || p[1] < picture.y || p[0] > picture.x + picture.width || p[1] > picture.y + picture.height) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { kind: 'line', end: 'b', fixed: p };
        setDrawing({ a: p, b: p });
    };
    const startEnd = (end: 'a' | 'b') => (event: PointerEvent<SVGElement>) => {
        if (!line) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { kind: 'line', end, fixed: end === 'a' ? line.b : line.a };
        setDrawing(line);
    };
    const move = (event: PointerEvent<SVGElement>) => {
        const active = drag.current;
        if (!active) return;
        const p = local(event);
        if (active.kind === 'dial') {
            const next = active.angle + wrapAngle(polar(p, active.centre) - active.from);
            previewAngle(session, event.shiftKey ? Math.round(next) : round(next));
        }
        else setDrawing(active.end === 'b' ? { a: active.fixed, b: p } : { a: p, b: active.fixed });
    };
    const end = (event: PointerEvent<SVGElement>) => {
        const active = drag.current;
        drag.current = null;
        if (!active) return;
        if (active.kind === 'dial') { commitAngle(session, base.rotate); return; }
        const p = local(event), shown = active.end === 'b' ? { a: active.fixed, b: p } : { a: p, b: active.fixed };
        setDrawing(null);
        // A click is not a line; a click on an existing line's end keeps the line as it was.
        if (Math.hypot(shown.b[0] - shown.a[0], shown.b[1] - shown.a[1]) < 6) return;
        const a = toSource(shown.a), b = toSource(shown.b);
        if (a && b) session.setToolData(ANGLE_LINE, { a, b } satisfies AngleLine);
    };
    const cancel = () => {
        if (drag.current?.kind === 'dial') session.revert();
        drag.current = null;
        setDrawing(null);
    };
    const onKeyDown = (event: KeyboardEvent<SVGElement>) => {
        const step = event.shiftKey ? 1 : .1;
        const next = ({ ArrowRight: angle + step, ArrowUp: angle + step, ArrowLeft: angle - step, ArrowDown: angle - step, Home: 0 } as Record<string, number>)[event.key];
        if (next === undefined) return;
        event.preventDefault();
        if (keyed.current) clearTimeout(keyed.current);
        keyed.current = setTimeout(flush, 600);
        previewAngle(session, round(next));
    };

    const labels: { x: number; y: number; text: string }[] = [];
    if (labelEvery) for (let n = 0; n < 360; n += labelEvery) {
        const tilt = ((n + 90) % 180) - 90, a = n * Math.PI / 180, at = r - 28;
        labels.push({ x: cx + Math.cos(a) * at, y: cy + Math.sin(a) * at, text: String(Math.abs(tilt === -90 ? 90 : tilt)) });
    }
    const wedge = Math.abs(angle) >= .05 && Math.abs(angle) <= 180 ? (() => {
        const w = Math.min(r * .45, 96), end = [cx + ux * w, cy + uy * w];
        return `M${cx} ${cy}L${cx + w} ${cy}A${w} ${w} 0 ${Math.abs(angle) > 180 ? 1 : 0} ${angle > 0 ? 1 : 0} ${end[0]} ${end[1]}Z`;
    })() : null;
    const knob: Point = [cx + ux * r, cy + uy * r];
    const reading: Point = [cx + ux * (r + 30), cy + uy * (r + 30)];
    const middle: Point | null = line ? [(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2] : null;

    return <div className="gi-rotate" data-canvas-tool="">
      <svg className="gi-geometry-overlay gi-rotate-surface" onPointerDown={startLine} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}>
        <g className="gi-rotate-grid" aria-hidden="true"><path className="gi-rotate-shade" d={grid.fine + grid.thirds}/><path className="gi-rotate-fine" d={grid.fine}/><path className="gi-rotate-thirds" d={grid.thirds}/></g>
        <g className="gi-rotate-dial" aria-hidden="true">
          <circle className="gi-rotate-shade" cx={cx} cy={cy} r={r}/>
          <path className="gi-rotate-shade" d={dialTicks(cx, cy, r)}/>
          <circle className="gi-rotate-ring" cx={cx} cy={cy} r={r}/>
          <path className="gi-rotate-ticks" d={dialTicks(cx, cy, r)}/>
          {labels.map(({ x, y, text }, i) => <text key={i} className="gi-rotate-label" x={x} y={y}>{text}</text>)}
          <path className="gi-rotate-axis" d={`M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}`}/>
          {wedge && <path className="gi-rotate-wedge" d={wedge}/>}
          <path className="gi-rotate-shade" d={`M${cx - ux * (r + 10)} ${cy - uy * (r + 10)}L${cx + ux * (r + 10)} ${cy + uy * (r + 10)}`}/>
          <path className="gi-rotate-needle" d={`M${cx - ux * (r + 10)} ${cy - uy * (r + 10)}L${cx + ux * (r + 10)} ${cy + uy * (r + 10)}`}/>
          <circle className="gi-rotate-hub" cx={cx} cy={cy} r={3}/>
        </g>
        <circle className="gi-rotate-grip" cx={cx} cy={cy} r={r} onPointerDown={startDial}/>
        <g className="gi-rotate-knob" role="slider" tabIndex={0} aria-label={m.dial} aria-valuemin={-180} aria-valuemax={180} aria-valuenow={angle} aria-valuetext={degrees(locale, angle, true)} onPointerDown={startDial} onKeyDown={onKeyDown} onBlur={flush}>
          <circle className="gi-rotate-knob-target" cx={knob[0]} cy={knob[1]} r={16}/>
          <circle className="gi-rotate-knob-face" cx={knob[0]} cy={knob[1]} r={7}/>
        </g>
        {line && <g className="gi-rotate-line" data-drawing={drawing ? '' : undefined}>
          <path className="gi-rotate-shade" d={`M${line.a[0]} ${line.a[1]}L${line.b[0]} ${line.b[1]}`}/>
          <path className="gi-rotate-measure" d={`M${line.a[0]} ${line.a[1]}L${line.b[0]} ${line.b[1]}`}/>
          {(['a', 'b'] as const).map(e => <g key={e} className="gi-rotate-end" onPointerDown={startEnd(e)}><circle className="gi-rotate-knob-target" cx={line[e][0]} cy={line[e][1]} r={16}/><circle className="gi-rotate-end-face" cx={line[e][0]} cy={line[e][1]} r={5}/></g>)}
        </g>}
      </svg>
      {/* logical:allow picture space does not mirror */}
      <span className="gi-rotate-chip" aria-hidden="true" style={{ left: reading[0], top: reading[1] }}>{degrees(locale, angle, true)}</span>
      {/* logical:allow picture space does not mirror */}
      {lean && middle && !drawing && <div className="gi-rotate-chip gi-rotate-chip-line" style={{ left: middle[0], top: middle[1] }}>
        <span><span className="gi-rotate-chip-name">{m.lineAngle}</span> {degrees(locale, round(lean.lean), true)}</span>
        <Button size="xs" variant="primary" onClick={() => levelToLine(session, m.levelLine)}>{m.levelLine}</Button>
      </div>}
      {/* logical:allow picture space does not mirror */}
      {lean && middle && drawing && <span className="gi-rotate-chip gi-rotate-chip-line" aria-hidden="true" style={{ left: middle[0], top: middle[1] }}>{degrees(locale, round(lean.lean), true)}</span>}
    </div>;
}

/** Undo every turn: free angle to zero and quarter turns back to upright, keeping any crop inside the picture. */
function resetRotation(geometry: Geometry, session: EditorSession): Geometry {
    const size = session.state.sourceSize;
    let next: Geometry = { ...geometry, angle: 0 };
    if (size) {
        for (let n = 0; n < 3 && next.rotation !== 0; n++) next = rotateGeometry(next, size, -1);
        if (next.crop) next = { ...next, crop: clampCrop(next.crop, workSize(size, next)) };
    }
    return next;
}

/**
 * Rotate by any angle on a protractor over the picture, or in quarter turns. Its angle finder
 * measures a line drawn along any straight edge and levels the picture to it.
 */
export const rotate = defineTool({
    id: 'rotate', group: 'geometry', label: m => m.rotate, icon: <IconRotateCw />, shortcut: 'r', standalone: true,
    Panel: RotatePanel, Overlay: RotateOverlay, actions: [fillEdgesAction],
    reset: (recipe, session) => ({ geometry: resetRotation(recipe.geometry, session) }),
    leave: session => session.setToolData(ANGLE_LINE, undefined),
});
