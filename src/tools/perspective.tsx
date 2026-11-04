import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from 'glass-ux/button';
import { IconPerspective } from '../icons/geometry.js';
import { IconClose } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { SliderField } from 'glass-ux/slider';
import { useCanvasMapping } from '../canvas/image-canvas.js';
import { turnedSize, type Point } from '../core/index.js';
import { geometryMessages, type GeometryMessages } from '../messages/geometry.js';
import { PanelActions, PanelGroup, PanelHint } from '../react/panel-layout.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import type { EditorSession, EditRecipe } from '../session/index.js';
import { FillEdges, fillEdgesAction } from './fill-edges.js';
import { guidesInTurned, LIMITS, MAX_GUIDES, NEUTRAL_PERSPECTIVE, perspectiveChange, perspectiveOf, solveGuides, type PerspectiveGuide, type PerspectiveSettings } from './perspective-math.js';

export { perspectiveChange, perspectiveOf, perspectiveQuad, solveGuides, PERSPECTIVE, NEUTRAL_PERSPECTIVE, type PerspectiveGuide, type PerspectiveSettings } from './perspective-math.js';

/** A keystone frame with plumb sides inside it. */

const settingsOf = (session: EditorSession, recipe: EditRecipe = session.state.draft) => perspectiveOf(recipe, session.state.sourceSize!);

/** Show settings without recording them, or record them as one step when given a label. */
function applySettings(session: EditorSession, settings: PerspectiveSettings, label?: string) {
  const size = session.state.sourceSize;
  if (!size) return;
  const change = perspectiveChange(session.state.draft, size, settings);
  if (!change) return;
  if (label) session.commit(change, { label }); else session.preview(change);
}

/** New guides, solved into vertical, horizontal and rotate once there are two or more. */
function withGuides(session: EditorSession, guides: readonly PerspectiveGuide[]): PerspectiveSettings {
  const size = session.state.sourceSize!, geometry = session.state.draft.geometry, settings = { ...settingsOf(session), guides };
  if (guides.length < 2) return settings;
  return solveGuides(turnedSize(size, geometry.rotation), settings, guidesInTurned(size, geometry, guides), geometry.angle ?? 0);
}

const guideName = (m: GeometryMessages, guides: readonly PerspectiveGuide[], index: number) => {
  const axis = guides[index]!.axis, number = guides.slice(0, index + 1).filter(g => g.axis === axis).length;
  return `${axis === 'vertical' ? m.verticalGuide : m.horizontalGuide} ${number}`;
};

type SliderKey = 'vertical' | 'horizontal' | 'rotate' | 'aspect' | 'scale';
const RANGES: Record<SliderKey, { min: number; max: number; step: number; largeStep?: number; origin: number; unit?: string }> = {
  vertical: { min: -LIMITS.tilt, max: LIMITS.tilt, step: .1, largeStep: 10, origin: 0 },
  horizontal: { min: -LIMITS.tilt, max: LIMITS.tilt, step: .1, largeStep: 10, origin: 0 },
  rotate: { min: -LIMITS.rotate, max: LIMITS.rotate, step: .1, largeStep: 1, origin: 0, unit: '°' },
  aspect: { min: -LIMITS.aspect, max: LIMITS.aspect, step: 1, origin: 0 },
  scale: { min: LIMITS.scale[0], max: LIMITS.scale[1], step: 1, origin: 100, unit: '%' },
};

function PerspectivePanel() {
  const session = useEditorContext(), { draft, sourceSize } = useSessionState(session), m = useMessages(geometryMessages);
  if (!sourceSize) return null;
  const settings = perspectiveOf(draft, sourceSize), guides = settings.guides;
  const set = (key: SliderKey, value: number) => applySettings(session, { ...settingsOf(session), [key]: value });
  const commit = () => session.commit({}, { label: m.perspective });
  const label = (key: SliderKey) => ({ vertical: m.vertical, horizontal: m.horizontal, rotate: m.rotate, aspect: m.aspect, scale: m.scale })[key];
  return <div className="gi-panel">
    <PanelGroup label={m.upright}>
      <div className="gi-perspective-sliders">
        {(['vertical', 'horizontal', 'rotate', 'aspect', 'scale'] as const).map(key => <SliderField key={key} message="auto" size="sm" label={label(key)} {...RANGES[key]} value={settings[key]} onValueChange={v => typeof v === 'number' && set(key, v)} onValueCommitted={commit} />)}
      </div>
    </PanelGroup>
    <PanelGroup label={m.guided}>
      <PanelHint>{guides.length >= MAX_GUIDES ? m.guideLimit : guides.length === 1 ? m.guideMore : m.guideHint}</PanelHint>
      {guides.length > 0 && <ul className="gi-perspective-guides">
        {guides.map((guide, i) => {
          const name = guideName(m, guides, i);
          return <li key={i}>
            <span className="gi-perspective-guide-mark" data-axis={guide.axis} aria-hidden="true" />
            <span className="gi-perspective-guide-name">{name}</span>
            <Button size="xs" variant="ghost" icon={<IconClose />} aria-label={m.removeGuide(name)} onClick={() => applySettings(session, withGuides(session, guides.filter((_, n) => n !== i)), m.perspective)} />
          </li>;
        })}
      </ul>}
      {guides.length > 0 && <PanelActions start={<Button size="sm" variant="ghost" onClick={() => applySettings(session, { ...settingsOf(session), guides: [] }, m.perspective)}>{m.clearGuides}</Button>}>{null}</PanelActions>}
    </PanelGroup>
    <PanelGroup label={m.edges}><FillEdges /></PanelGroup>
  </div>;
}

type Drag = { index: number | null; end: 'a' | 'b'; fixed: Point };
const length = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Guides over the picture: drag along an edge that should be plumb or level to add one, drag an end
 * to move it, and the picture corrects on release. Ends are focusable: arrow keys move them and
 * Delete removes the guide. A fine grid helps judge verticals while the sliders move.
 */
function PerspectiveOverlay() {
  const session = useEditorContext(), { draft, size, sourceSize } = useSessionState(session), map = useCanvasMapping(), m = useMessages(geometryMessages);
  const drag = useRef<Drag | null>(null), keyed = useRef<ReturnType<typeof setTimeout> | null>(null), clip = useId();
  const [drawing, setDrawing] = useState<{ a: Point; b: Point; index: number | null } | null>(null);
  const flush = () => { if (keyed.current) { clearTimeout(keyed.current); keyed.current = null; session.commit({}, { label: m.perspective }); } };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);
  if (!size || !sourceSize) return null;
  const guides = perspectiveOf(draft, sourceSize).guides;
  const toScreen = (p: Point): Point | null => { const d = session.fromSource(p[0], p[1]); if (!d) return null; const r = map.toScreen({ x: d[0], y: d[1], width: 0, height: 0 }); return [r.x, r.y]; };
  const toSource = (p: Point): Point | null => { const d = map.toDocument(p[0], p[1]); return session.toSource(d.x, d.y); };
  const picture = map.toScreen({ x: 0, y: 0, ...size });
  const shown = guides.map(g => { const a = toScreen(g.a), b = toScreen(g.b); return a && b ? { a, b, axis: g.axis } : null; });
  const local = (event: PointerEvent<Element>): Point => { const box = (event.currentTarget.closest('.gi-perspective') ?? event.currentTarget).getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };

  const finish = (index: number | null, a: Point, b: Point) => {
    if (length(a, b) < 6) return;
    const sa = toSource(a), sb = toSource(b);
    if (!sa || !sb) return;
    const axis = index === null ? (Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 'horizontal' : 'vertical') : guides[index]!.axis;
    const next = index === null ? [...guides, { a: sa, b: sb, axis }] : guides.map((g, n) => n === index ? { ...g, a: sa, b: sb } : g);
    applySettings(session, withGuides(session, next), m.perspective);
  };
  const startNew = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || guides.length >= MAX_GUIDES) return;
    const p = local(event);
    if (p[0] < picture.x || p[1] < picture.y || p[0] > picture.x + picture.width || p[1] > picture.y + picture.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index: null, end: 'b', fixed: p };
    setDrawing({ a: p, b: p, index: null });
  };
  const startEnd = (index: number, end: 'a' | 'b') => (event: PointerEvent<SVGElement>) => {
    const line = shown[index];
    if (!line || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, end, fixed: end === 'a' ? line.b : line.a };
    setDrawing({ ...line, index });
  };
  const move = (event: PointerEvent<SVGElement>) => {
    const active = drag.current;
    if (!active) return;
    const p = local(event);
    setDrawing(active.end === 'b' ? { a: active.fixed, b: p, index: active.index } : { a: p, b: active.fixed, index: active.index });
  };
  const end = (event: PointerEvent<SVGElement>) => {
    const active = drag.current;
    drag.current = null;
    setDrawing(null);
    if (!active) return;
    const p = local(event), [a, b] = active.end === 'b' ? [active.fixed, p] : [p, active.fixed];
    finish(active.index, a, b);
  };
  const cancel = () => { drag.current = null; setDrawing(null); };
  const onKeyDown = (index: number, which: 'a' | 'b') => (event: KeyboardEvent<SVGElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      applySettings(session, withGuides(session, guides.filter((_, n) => n !== index)), m.perspective);
      return;
    }
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[event.key];
    const line = shown[index];
    if (!step || !line) return;
    event.preventDefault();
    const n = event.shiftKey ? 10 : 1, moved: Point = [line[which][0] + step[0] * n, line[which][1] + step[1] * n], p = toSource(moved);
    if (!p) return;
    // Quick presses become one history step, as the rotate dial's do.
    applySettings(session, withGuides(session, guides.map((g, i) => i === index ? { ...g, [which]: p } : g)));
    if (keyed.current) clearTimeout(keyed.current);
    keyed.current = setTimeout(flush, 600);
  };

  const grid = (() => {
    const columns = Math.max(3, Math.round(picture.width / 48)), rows = Math.max(3, Math.round(picture.height / 48));
    let fine = '';
    for (let i = 1; i < columns; i++) fine += `M${picture.x + picture.width * i / columns} ${picture.y}V${picture.y + picture.height}`;
    for (let i = 1; i < rows; i++) fine += `M${picture.x} ${picture.y + picture.height * i / rows}H${picture.x + picture.width}`;
    return fine;
  })();
  const extend = (a: Point, b: Point) => { const d = length(a, b) || 1, k = (picture.width + picture.height) * 2 / d, dx = (b[0] - a[0]) * k, dy = (b[1] - a[1]) * k; return `M${a[0] - dx} ${a[1] - dy}L${b[0] + dx} ${b[1] + dy}`; };
  const lines = shown.map((line, i) => drawing?.index === i ? { a: drawing.a, b: drawing.b, axis: guides[i]!.axis } : line);
  const fresh = drawing && drawing.index === null && length(drawing.a, drawing.b) >= 6 ? { a: drawing.a, b: drawing.b, axis: (Math.abs(drawing.b[0] - drawing.a[0]) > Math.abs(drawing.b[1] - drawing.a[1]) ? 'horizontal' : 'vertical') as PerspectiveGuide['axis'] } : null;
  const chip = fresh ?? (drawing?.index != null ? lines[drawing.index] : null);

  return <div className="gi-rotate gi-perspective" data-canvas-tool="" data-full={guides.length >= MAX_GUIDES ? '' : undefined}>
    <svg className="gi-geometry-overlay gi-rotate-surface" onPointerDown={startNew} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}>
      <defs><clipPath id={clip}><rect x={picture.x} y={picture.y} width={picture.width} height={picture.height} /></clipPath></defs>
      <g aria-hidden="true"><path className="gi-rotate-shade gi-perspective-grid-shade" d={grid} /><path className="gi-rotate-fine" d={grid} /></g>
      {[...lines.map((line, i) => line && { ...line, i }), fresh && { ...fresh, i: -1 }].map(line => line && <g key={line.i} className="gi-rotate-line gi-perspective-guide" data-axis={line.axis} data-drawing={drawing && (drawing.index === line.i || line.i === -1) ? '' : undefined}>
        <path className="gi-perspective-extend" clipPath={`url(#${clip})`} d={extend(line.a, line.b)} aria-hidden="true" />
        <path className="gi-rotate-shade" d={`M${line.a[0]} ${line.a[1]}L${line.b[0]} ${line.b[1]}`} aria-hidden="true" />
        <path className="gi-rotate-measure" d={`M${line.a[0]} ${line.a[1]}L${line.b[0]} ${line.b[1]}`} aria-hidden="true" />
        {line.i >= 0 && (['a', 'b'] as const).map(e => <g key={e} className="gi-rotate-end gi-perspective-end" role="button" tabIndex={0} aria-label={(e === 'a' ? m.guideStart : m.guideEnd)(guideName(m, guides, line.i))} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Delete" onPointerDown={startEnd(line.i, e)} onKeyDown={onKeyDown(line.i, e)} onBlur={flush}>
          <circle className="gi-rotate-knob-target" cx={line[e][0]} cy={line[e][1]} r={16} />
          <circle className="gi-rotate-end-face" cx={line[e][0]} cy={line[e][1]} r={5} />
        </g>)}
      </g>)}
    </svg>
    {/* logical:allow picture space does not mirror */}
    {chip && <span className="gi-rotate-chip gi-perspective-chip" aria-hidden="true" style={{ left: (chip.a[0] + chip.b[0]) / 2, top: (chip.a[1] + chip.b[1]) / 2 }}>{chip.axis === 'vertical' ? m.verticalGuide : m.horizontalGuide}</span>}
  </div>;
}

/**
 * Correct converging verticals and horizontals, as a camera turned about its axes would, with aspect
 * and scale to finish. Guided: two to four lines drawn along edges that should be plumb or level solve
 * the correction. It writes the geometry's distortion, so it renders and saves like any other geometry.
 */
export const perspective = defineTool({
  id: 'perspective', group: 'geometry', messages: geometryMessages, label: m => m.perspective, icon: <IconPerspective />,
  Panel: PerspectivePanel, Overlay: PerspectiveOverlay, actions: [fillEdgesAction],
  reset: (recipe, session) => {
    const size = session.state.sourceSize;
    if (!size) return {};
    return perspectiveChange(recipe, size, { ...NEUTRAL_PERSPECTIVE, base: perspectiveOf(recipe, size).base }) ?? {};
  },
});
