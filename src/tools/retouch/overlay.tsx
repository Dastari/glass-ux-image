import { Notice } from 'glass-ux/notice';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useMessages } from 'glass-ux/i18n';
import { useCanvasMapping } from '../../canvas/image-canvas.js';
import { BrushCursor } from '../../controls/brush-cursor.js';
import { geometryMapping, workSize } from '../../core/index.js';
import { retouchMessages } from '../../messages/retouch.js';
import { useEditorContext, useSessionState } from '../../react/session-context.js';
import type { LiquifyGrid, LiquifyMode, LiquifyDab } from '../../retouch/liquify.js';
import { retouchStage } from '../../retouch/stage.js';
import type { Stroke, StrokePoint } from '../../retouch/stroke.js';
import type { EditRecipe } from '../../session/index.js';
import { applyPatch } from './patch-action.js';
import { brushParams, readRetouchSettings, setRetouchSettings, type RetouchKind } from './settings.js';
import { createId } from '../../core/id.js';

interface Gesture { stroke: Stroke | null; base: EditRecipe; points: StrokePoint[]; selection: boolean; grid?: LiquifyGrid; last?: StrokePoint }
/** Optional displacement interaction; supplied only by the liquify entry. */
export interface LiquifyInteraction {
  /** Create an identity work-space lattice. */ create(width: number, height: number): LiquifyGrid;
  /** Compose a gesture into a new lattice. */ apply(grid: LiquifyGrid, mode: LiquifyMode, dab: LiquifyDab): LiquifyGrid;
}
/** Session-aware painting overlay. Place it inside ImageCanvas in any host composition. */
export interface RetouchOverlayProps {
  /** Tool receiving pointer and keyboard input. */ kind: RetouchKind;
  /** Displacement engine supplied by the liquify tool; pixel tools omit it. */ liquify?: LiquifyInteraction }
/** Direct DOM cursor updates; at most one recipe preview per animation frame. */
export function RetouchOverlay({ kind, liquify }: RetouchOverlayProps) {
  const session = useEditorContext(); useSessionState(session);
  const [failed, setFailed] = useState(false);
  const mapping = useCanvasMapping(), words = useMessages(retouchMessages);
  const root = useRef<HTMLDivElement>(null), cursor = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null), frame = useRef(0), keyboard = useRef({ x: 0, y: 0 });
  const lastCursor = useRef<StrokePoint | null>(null);
  const settings = readRetouchSettings(session, kind);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const sourcePoint = (x: number, y: number): StrokePoint | null => { const p = session.toSource(x, y); return p ? { x: p[0], y: p[1] } : null; };
  const screenPoint = (p: StrokePoint) => {
    const q = session.fromSource(p.x, p.y); if (!q) return null;
    const r = mapping.toScreen({ x: q[0], y: q[1], width: 0, height: 0 }); return { x: r.x, y: r.y };
  };
  const drawSelection = (points: readonly StrokePoint[]) => {
    const shown = points.map(screenPoint).filter(p => p !== null);
    cursor.current?.querySelector('[data-patch-outline]')?.setAttribute('points', shown.map(p => `${p.x},${p.y}`).join(' '));
  };
  const showCursor = (p: StrokePoint) => {
    lastCursor.current = p;
    const svg = cursor.current, at = screenPoint(p); if (!svg || !at) return;
    const s = settingsRef.current, radius = s.size / 2;
    const px = screenPoint({ x: p.x + radius, y: p.y }), py = screenPoint({ x: p.x, y: p.y + radius });
    if (!px || !py) return;
    const rx = Math.hypot(px.x - at.x, px.y - at.y), ry = Math.hypot(py.x - at.x, py.y - at.y);
    const ring = svg.querySelector('[data-brush-ring]')!;
    ring.setAttribute('visibility', kind === 'patch' ? 'hidden' : 'visible'); ring.setAttribute('transform', `translate(${at.x} ${at.y}) rotate(${Math.atan2(px.y - at.y, px.x - at.x) * 180 / Math.PI})`);
    for (const [selector, ratio] of [['[data-outer]', 1], ['[data-outer-shadow]', 1], ['[data-inner]', s.hardness], ['[data-inner-shadow]', s.hardness]] as const) {
      const ellipse = svg.querySelector(selector)!; ellipse.setAttribute('rx', String(rx * ratio)); ellipse.setAttribute('ry', String(ry * ratio));
    }
    const source = s.source && screenPoint(s.source), marker = svg.querySelector('[data-source-marker]')!;
    marker.setAttribute('visibility', source ? 'visible' : 'hidden');
    if (source) marker.setAttribute('transform', `translate(${source.x} ${source.y})`);
    if (!gesture.current?.selection) drawSelection(s.selection);
  };
  const restorePixels = () => {
    if (kind !== 'liquify') void retouchStage.preview(session, (session.state.recipe.strokes ?? []) as readonly Stroke[]).catch(() => setFailed(true));
  };
  const flush = () => {
    if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0;
    const g = gesture.current; if (!g || g.selection) return;
    if (kind === 'liquify') {
      if (g.grid) session.preview({ filters: { ...g.base.filters, liquify: g.grid } });
    } else if (g.stroke) {
      const stroke = { ...g.stroke, points: g.points.slice() };
      const strokes = [...(g.base.strokes ?? []) as readonly Stroke[], stroke];
      session.previewStrokes(strokes);
      void retouchStage.preview(session, strokes).catch(() => { setFailed(true); session.revert(); restorePixels(); });
    }
  };
  const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(flush); };
  const cancel = () => {
    if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0;
    if (gesture.current) { gesture.current = null; session.revert(); restorePixels(); }
    drawSelection(settingsRef.current.selection);
  };
  const workPoint = (document: StrokePoint): StrokePoint | null => {
    const size = session.state.sourceSize; if (!size) return null;
    const p = geometryMapping(size, session.state.draft.geometry).toWork(document.x, document.y);
    return p ? { x: p[0], y: p[1] } : null;
  };
  const begin = (p: StrokePoint, document: StrokePoint) => {
    setFailed(false);
    const s = settingsRef.current;
    const selecting = kind === 'patch' && (s.selecting || !s.selection.length);
    if (kind === 'patch' && !selecting) { applyPatch(session, words.patch); return; }
    if ((kind === 'clone' || kind === 'heal') && !s.source) return;
    const g: Gesture = { stroke: null, base: session.state.recipe, points: [p], selection: selecting };
    if (kind === 'liquify') {
      if (!liquify) return;
      const size = session.state.sourceSize!, work = workSize(size, g.base.geometry), at = workPoint(document);
      if (!at) return;
      g.grid = (g.base.filters.liquify as LiquifyGrid | undefined) ?? liquify.create(work.width, work.height);
      g.last = at;
      g.grid = liquify.apply(g.grid, s.mode, { ...at, radius: s.size / 2, strength: s.strength, dx: s.size * .1, dy: 0 });
    } else if (!selecting) g.stroke = { id: createId(), tool: kind, params: brushParams(s, p), points: [] };
    gesture.current = g;
    if (!selecting) flush();
  };
  const add = (p: StrokePoint, document: StrokePoint) => {
    const g = gesture.current; if (!g) return;
    if (g.selection) {
      const a = g.points[0]!;
      drawSelection([{ x: a.x, y: a.y }, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }]);
      g.points[1] = p; return;
    }
    const previous = g.points.at(-1)!;
    if (p.x === previous.x && p.y === previous.y) return;
    g.points.push(p);
    if (kind === 'liquify') {
      if (!liquify) return;
      const at = workPoint(document); if (!at || !g.last || !g.grid) return;
      const s = settingsRef.current;
      g.grid = liquify.apply(g.grid, s.mode, { ...at, radius: s.size / 2, strength: s.strength, dx: at.x - g.last.x, dy: at.y - g.last.y }); g.last = at;
    }
    schedule();
  };
  const finish = () => {
    const g = gesture.current; if (!g) return;
    if (g.selection) {
      const a = g.points[0]!, b = g.points.at(-1)!, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
      gesture.current = null;
      setRetouchSettings(session, kind, { selecting: false, selection: [{ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }] }); return;
    }
    flush(); gesture.current = null;
    const change = kind === 'liquify' ? { filters: { ...g.base.filters, liquify: g.grid } } : { strokes: [...(g.base.strokes ?? []), { ...g.stroke!, points: g.points.slice() }] };
    session.commit(change, { label: words[kind] });
    // A host veto restores the committed image; an accepted commit has already adopted it.
    session.revert(); restorePixels();
  };
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const document = mapping.toDocument(event.clientX - rect.left, event.clientY - rect.top), p = sourcePoint(document.x, document.y);
    if (p) p.pressure = event.pointerType === 'pen' ? event.pressure : 1;
    return { p, document };
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.currentTarget.closest('[data-panning]')) return;
    event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    const { p, document } = position(event); if (!p) return;
    keyboard.current = document;
    if (event.altKey && (kind === 'clone' || kind === 'heal' || kind === 'patch')) { setRetouchSettings(session, kind, { source: p }); return; }
    event.currentTarget.setPointerCapture(event.pointerId); begin(p, document); showCursor(p);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.closest('[data-panning]')) return;
    const { p, document } = position(event); if (!p) return;
    keyboard.current = document; showCursor(p);
    if (gesture.current) { event.stopPropagation(); add(p, document); }
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, step = steps[event.key];
    if (step) {
      event.preventDefault(); event.stopPropagation(); const amount = event.shiftKey ? 10 : 1;
      const size = session.state.size;
      keyboard.current = { x: Math.max(0, Math.min((size?.width ?? 1) - .5, keyboard.current.x + step[0] * amount)), y: Math.max(0, Math.min((size?.height ?? 1) - .5, keyboard.current.y + step[1] * amount)) };
      const p = sourcePoint(keyboard.current.x, keyboard.current.y); if (p) showCursor(p);
    } else if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); const p = sourcePoint(keyboard.current.x, keyboard.current.y); if (!p) return;
      if (event.altKey && (kind === 'clone' || kind === 'heal' || kind === 'patch')) setRetouchSettings(session, kind, { source: p });
      else { begin(p, keyboard.current); finish(); }
    } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
  };
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    const size = session.state.size; keyboard.current = { x: (size?.width ?? 1) / 2, y: (size?.height ?? 1) / 2 };
    return () => { if (frame.current) cancelAnimationFrame(frame.current); if (gesture.current) { gesture.current = null; session.revert(); restorePixels(); } };
  }, [session, kind]);
  useEffect(() => { const p = lastCursor.current; if (p) showCursor(p); });
  return <div ref={root} className="gi-retouch-overlay" data-canvas-tool="" data-retouch-tool={kind} role="group" aria-label={`${words[kind]}: ${words.cursor}`} aria-description={`${words.keyboardHelp} ${kind === 'clone' || kind === 'heal' || kind === 'patch' ? words.sourceHint : ''}`} tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={event => { if (gesture.current) { event.stopPropagation(); finish(); } }} onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerLeave={() => { if (!gesture.current) cursor.current?.querySelector('[data-brush-ring]')?.setAttribute('visibility', 'hidden'); }} onKeyDownCapture={key}>
    <BrushCursor ref={cursor} hidden />
    <div className="gi-feedback gi-retouch-error" role="status"><Notice role="none" tone="danger" style={{visibility: failed ? undefined : "hidden"}}>{words.previewFailed}</Notice></div>
  </div>;
}
