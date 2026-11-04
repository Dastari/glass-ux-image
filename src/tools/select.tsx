import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from 'glass-ux/button';
import { IconCursor } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { detectPlatform, matchesShortcut } from 'glass-ux/kbd';
import { useBindingLookup } from 'glass-ux/keymap';
import { numberFormat, useLocale } from 'glass-ux/locale';
import { Select as Choice } from 'glass-ux/select';
import { SettingRow } from 'glass-ux/setting-row';
import { Switch } from 'glass-ux/switch';
import { useCanvasMapping } from '../canvas/image-canvas.js';
import { createId } from '../core/id.js';
import { geometryMapping, type LayerSpec, type Point, type Quad } from '../core/index.js';
import { geometryMessages } from '../messages/geometry.js';
import { PanelActions, PanelGroup, PanelHint, PanelPair } from '../react/panel-layout.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
import type { EditorSession } from '../session/index.js';
import { layerActions, SELECTED_LAYER } from './select-actions.js';
import { constrainDelta, handlePoint, layerAt, layerCopy, quadAngle, quadBounds, quadCentre, quadSize, resizeCursor, resizeQuad, rotateQuad, rotateZone, scaleQuad, SELECT_CORNERS, SELECT_HANDLES, snapAngle, translateQuad, type SelectHandle } from './select-math.js';
import { GeometryNumber } from './transform-controls.js';
import { sharpenScaledText } from './select-text.js';
import { wrapAngle } from './transform-math.js';

export { layerActions, SELECTED_LAYER, selectedLayerId, type LayerActionArgs } from './select-actions.js';
export * from './select-math.js';

/** Tool data key: whether a click picks the layer under the pointer (default true). */
export const AUTO_SELECT = 'select.autoSelect';
/** Tool data key the text tool reads to open its editor on a layer. */
export const TEXT_EDIT_REQUEST = 'text.edit';

/** Command ids for keys the Select tool handles itself; a KeymapProvider keymap may rebind them. */
const DELETE_COMMAND = 'imageEditor.layers.delete', DESELECT_COMMAND = 'imageEditor.layers.deselect';
const DELETE_KEYS = ['delete', 'backspace'], DESELECT_KEYS = ['escape'];
const NUDGES: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/** Arrow presses this close together make one history step, as the rotate tool's do. */
const NUDGE_SETTLE = 600;
/** Screen pixels a press may travel and still count as a click. */
const CLICK_SLOP = 3;
/** How far outside a corner a drag turns the layer, in screen pixels. */
const ROTATE_REACH = 26;

/** Nudges waiting to become one history step, per session, so leaving the tool can record them first. */
const pending = new WeakMap<EditorSession, () => void>();
function settle(session: EditorSession) { pending.get(session)?.(); }

const selectedOf = (session: EditorSession) => {
    const id = session.state.toolData[SELECTED_LAYER] as string | null | undefined;
    return id ? session.state.draft.layers?.find(layer => layer.id === id) ?? null : null;
};
/** Work-space and document conversions for the session's current geometry. */
function spaces(session: EditorSession) {
    const mapping = geometryMapping(session.state.sourceSize!, session.state.draft.geometry);
    const toDocument = (q: Quad) => { const out = q.map(p => mapping.fromWork(p[0], p[1])); return out.every(Boolean) ? out as unknown as Quad : null; };
    const toWork = (q: Quad) => { const out = q.map(p => mapping.toWork(p[0], p[1])); return out.every(Boolean) ? out as unknown as Quad : null; };
    return { toDocument, toWork };
}
/** Show a layer at a document-space quad without recording it. */
function previewLayer(session: EditorSession, id: string, quad: Quad) {
    const work = spaces(session).toWork(quad);
    if (work) session.preview({ layers: (session.state.draft.layers ?? []).map(layer => layer.id === id ? { ...layer, quad: work } : layer) });
}
/** Record the draft as one labelled step; a host that refuses it leaves the picture as it was. */
function commitDraft(session: EditorSession, label: string) {
    session.commit({}, { label });
    if (session.state.draft !== session.state.recipe) session.revert();
}
/** Record a scale: enlarged text is re-set at its new size first, so it stays sharp, in the same step. */
function commitScale(session: EditorSession, id: string, label: string) {
    void sharpenScaledText(session, id).catch(() => undefined).then(() => commitDraft(session, label));
}

type Drag =
    | { kind: 'move'; id: string; from: Point; quad: Quad; screen: Point; copy: boolean; moved: boolean }
    | { kind: 'scale'; id: string; handle: SelectHandle; quad: Quad }
    | { kind: 'rotate'; id: string; quad: Quad; centre: Point; from: number };

const degrees = (locale: string, value: number) => `${numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}°`;
const pixels = (locale: string, value: number) => numberFormat(locale, { maximumFractionDigits: 0 }).format(value);
/** Shift a screen quad's corners outward from its centre, for a focus ring that clears the outline. */
const grow = (q: readonly Point[], by: number) => { const [cx, cy] = quadCentre(q as unknown as Quad); return q.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / d * by, y + (y - cy) / d * by] as Point; }); };
const points = (q: readonly Point[]) => q.map(p => `${p[0]},${p[1]}`).join(' ');

/**
 * Photoshop's Move tool with Auto-Select: click picks the topmost layer under the pointer, a drag
 * moves it, handles scale it and a drag just outside a corner turns it. Every drag, nudge and
 * removal is one undo step through a session action; the drag itself is only a preview.
 */
function SelectOverlay() {
    const session = useEditorContext(), state = useSessionState(session), map = useCanvasMapping();
    const m = useMessages(geometryMessages), locale = useLocale(), lookup = useBindingLookup();
    const root = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null), nudge = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [chip, setChip] = useState<{ x: number; y: number; text: string } | null>(null);
    const [dragging, setDragging] = useState(false);
    const words = useRef(m);
    words.current = m;
    const keys = useRef({ remove: DELETE_KEYS as readonly string[], deselect: DESELECT_KEYS as readonly string[] });
    keys.current = { remove: lookup(DELETE_COMMAND, DELETE_KEYS).keys, deselect: lookup(DESELECT_COMMAND, DESELECT_KEYS).keys };

    // Arrow nudges: a burst of presses becomes one step, recorded when they stop, the tool changes or the overlay goes.
    useEffect(() => {
        const flush = () => { if (nudge.current) { clearTimeout(nudge.current); nudge.current = null; commitDraft(session, words.current.nudge); } };
        pending.set(session, flush);
        // Undo while a burst is pending first records the nudge, then undoes it, not the step before.
        const release = session.holdDraft(flush);
        return () => { release(); flush(); if (pending.get(session) === flush) pending.delete(session); };
    }, [session]);

    // Keys while focus is anywhere on the stage, as Photoshop's are on the canvas. They are taken before
    // the stage's own arrow-key panning, and only while a layer is selected.
    useEffect(() => {
        const stage = root.current?.closest('.gi-stage');
        if (!stage) return;
        const platform = detectPlatform();
        const down = (event: KeyboardEvent) => {
            const target = event.target as Element | null;
            if (!target || !stage.contains(target) || target.closest('input,textarea,select,[contenteditable=true]') || event.isComposing) return;
            const layer = selectedOf(session), take = () => { event.preventDefault(); event.stopPropagation(); };
            if (keys.current.deselect.some(k => matchesShortcut(event, k, platform))) {
                if (drag.current) { take(); drag.current = null; setDragging(false); setChip(null); session.revert(); }
                else if (layer) { take(); settle(session); session.setToolData(SELECTED_LAYER, null); }
                return;
            }
            if (!layer || drag.current) return;
            const step = NUDGES[event.key];
            if (step && !event.altKey && !event.ctrlKey && !event.metaKey) {
                take();
                const quad = spaces(session).toDocument(layer.quad), n = event.shiftKey ? 10 : 1;
                if (!quad) return;
                previewLayer(session, layer.id, translateQuad(quad, step[0] * n, step[1] * n));
                if (nudge.current) clearTimeout(nudge.current);
                nudge.current = setTimeout(() => pending.get(session)?.(), NUDGE_SETTLE);
                return;
            }
            if (keys.current.remove.some(k => matchesShortcut(event, k, platform))) {
                take(); settle(session);
                session.run('layers.delete', { id: layer.id, label: words.current.deleteLayer });
            }
        };
        document.addEventListener('keydown', down, true);
        return () => document.removeEventListener('keydown', down, true);
    }, [session]);

    // A click on the picture away from every layer deselects, as clicking the background does in Photoshop.
    // A drag there still pans the stage.
    useEffect(() => {
        const stage = root.current?.closest('.gi-stage') as HTMLElement | null;
        if (!stage) return;
        let start: { x: number; y: number; id: number } | null = null;
        const down = (event: PointerEvent) => {
            const target = event.target as Element;
            start = event.button === 0 && !target.closest('[data-select-part]') && !target.closest('[data-canvas-tool]:not(.gi-select)') && !stage.hasAttribute('data-panning') ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
        };
        const up = (event: PointerEvent) => {
            if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= CLICK_SLOP && selectedOf(session)) { settle(session); session.setToolData(SELECTED_LAYER, null); }
            start = null;
        };
        stage.addEventListener('pointerdown', down, true);
        window.addEventListener('pointerup', up, true);
        return () => { stage.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); };
    }, [session]);

    if (!state.size || !state.sourceSize) return null;
    const { toDocument } = spaces(session);
    const screenOf = (p: Point): Point => { const r = map.toScreen({ x: p[0], y: p[1], width: 0, height: 0 }); return [r.x, r.y]; };
    const local = (event: { clientX: number; clientY: number }): Point => { const box = root.current!.getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };
    const documentAt = (event: { clientX: number; clientY: number }): Point => { const [x, y] = local(event), d = map.toDocument(x, y); return [d.x, d.y]; };
    const layers = (state.draft.layers ?? []).filter(layer => layer.visible);
    const quads = new Map<string, Quad>();
    for (const layer of layers) { const q = toDocument(layer.quad); if (q) quads.set(layer.id, q); }
    const selected = selectedOf(session), auto = state.toolData[AUTO_SELECT] !== false;
    const shown = selected && quads.get(selected.id);
    const screen = shown ? shown.map(screenOf) as unknown as Quad : null;
    const editText = (layer: LayerSpec | undefined) => {
        if (layer?.kind !== 'text' || !session.renderingParts.layerKinds.some(kind => kind.kind === 'text')) return;
        settle(session);
        session.setToolData(SELECTED_LAYER, layer.id);
        session.setToolData(TEXT_EDIT_REQUEST, layer.id);
        session.run('tool.select', 'text');
    };
    const readout = (quad: Quad, kind: Drag['kind'], at: Point) => {
        const b = quadBounds(quad), size = quadSize(quad);
        const text = kind === 'rotate' ? degrees(locale, wrapAngle(quadAngle(quad))) : kind === 'scale' ? `${pixels(locale, size.width)} × ${pixels(locale, size.height)} px` : `${m.x} ${pixels(locale, b.x)}   ${m.y} ${pixels(locale, b.y)}`;
        setChip({ x: at[0] + 18, y: at[1] + 22, text });
    };

    const begin = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (event.button !== 0) return;
        const part = (event.target as Element).closest<SVGElement>('[data-select-part]');
        if (!part) return;
        event.stopPropagation();
        settle(session);
        const kind = part.dataset.selectPart, p = documentAt(event);
        let id = selected?.id ?? null;
        // Auto-select picks the topmost layer under the pointer; Ctrl or Command does so for one click when it is off.
        if (kind === 'hit' && (auto || event.ctrlKey || event.metaKey || !id)) id = layerAt(layers, p, layer => quads.get(layer.id) ?? null);
        if (!id || !quads.has(id)) { if (kind === 'hit') session.setToolData(SELECTED_LAYER, null); return; }
        if (id !== selected?.id) session.setToolData(SELECTED_LAYER, id);
        const quad = quads.get(id)!;
        part.setPointerCapture(event.pointerId);
        if (kind === 'handle') drag.current = { kind: 'scale', id, handle: part.dataset.handle as SelectHandle, quad };
        else if (kind === 'rotate') { const centre = quadCentre(quad); drag.current = { kind: 'rotate', id, quad, centre, from: Math.atan2(p[1] - centre[1], p[0] - centre[0]) * 180 / Math.PI }; }
        else drag.current = { kind: 'move', id, from: p, quad, screen: local(event), copy: event.altKey, moved: false };
        setDragging(true);
    };
    const update = (event: ReactPointerEvent<SVGSVGElement>) => {
        const d = drag.current;
        if (!d) return;
        const p = documentAt(event), at = local(event);
        let next: Quad;
        if (d.kind === 'move') {
            if (!d.moved) {
                if (Math.hypot(at[0] - d.screen[0], at[1] - d.screen[1]) <= CLICK_SLOP) return;
                d.moved = true;
                // Alt drags a copy, as in Photoshop: the copy goes above the original and moves; the original stays.
                if (d.copy) {
                    const copy = layerCopy(session.state.draft, d.id, createId());
                    if (copy) { session.preview(copy.change); d.id = copy.id; session.setToolData(SELECTED_LAYER, copy.id); }
                    else d.copy = false;
                }
            }
            const [dx, dy] = event.shiftKey ? constrainDelta(p[0] - d.from[0], p[1] - d.from[1]) : [p[0] - d.from[0], p[1] - d.from[1]];
            next = translateQuad(d.quad, dx, dy);
        }
        else if (d.kind === 'scale') next = scaleQuad(d.quad, d.handle, p, { keepAspect: event.shiftKey, fromCentre: event.altKey, minSize: 1 });
        else {
            let turn = wrapAngle(Math.atan2(p[1] - d.centre[1], p[0] - d.centre[0]) * 180 / Math.PI - d.from);
            if (event.shiftKey) turn = snapAngle(quadAngle(d.quad) + turn) - quadAngle(d.quad);
            next = rotateQuad(d.quad, turn, d.centre);
        }
        previewLayer(session, d.id, next);
        readout(next, d.kind, at);
    };
    const end = () => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        setChip(null);
        if (!d || (d.kind === 'move' && !d.moved)) return;
        if (d.kind === 'scale') commitScale(session, d.id, m.scale);
        else commitDraft(session, d.kind === 'move' ? (d.copy ? m.duplicateLayer : m.move) : m.rotate);
    };
    const cancel = () => { if (drag.current) { drag.current = null; setDragging(false); setChip(null); session.revert(); } };

    // Handles turn with the layer as drawn on screen; their cursors point the way each one pulls.
    const angle = screen ? Math.atan2(screen[1][1] - screen[0][1], screen[1][0] - screen[0][0]) * 180 / Math.PI : 0;
    const pull: Record<SelectHandle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
    const handles = shown ? (Object.keys(SELECT_HANDLES) as SelectHandle[]).map(handle => ({ handle, at: screenOf(handlePoint(shown, handle)), corner: (SELECT_CORNERS as readonly string[]).includes(handle), cursor: resizeCursor(angle + pull[handle]) })) : [];
    // Edge handles hide when the layer is too small on screen to tell them from the corners. They stay
    // in the page, so a drag that shrinks the layer keeps the handle it started on.
    const roomy = screen ? Math.min(Math.hypot(screen[1][0] - screen[0][0], screen[1][1] - screen[0][1]), Math.hypot(screen[3][0] - screen[0][0], screen[3][1] - screen[0][1])) >= 40 : false;
    const active = dragging ? drag.current : null;
    const hub = screen && active?.kind === 'rotate' ? quadCentre(screen as unknown as Quad) : null;
    // Where the layer was, while scaling or turning it.
    const ghost = active && active.kind !== 'move' ? active.quad.map(screenOf) : null;

    return <div ref={root} className="gi-select" data-canvas-tool="" data-dragging={dragging ? '' : undefined}>
      <svg className="gi-geometry-overlay gi-select-surface" onPointerDown={begin} onPointerMove={update} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) end(); }} onDoubleClick={event => { const id = layerAt(layers, documentAt(event), layer => quads.get(layer.id) ?? null); editText(layers.find(layer => layer.id === id)); }}>
        <g className="gi-select-hits" aria-hidden="true">
          {layers.map(layer => { const q = quads.get(layer.id); return q ? <polygon key={layer.id} className="gi-select-hit" data-select-part="hit" data-layer-id={layer.id} data-selected={layer.id === selected?.id ? '' : undefined} points={points(q.map(screenOf))}/> : null; })}
        </g>
        {!auto && selected && <rect className="gi-select-catch" data-select-part="hit" x={-1e5} y={-1e5} width={2e5} height={2e5} aria-hidden="true"/>}
        {ghost && <polygon className="gi-select-ghost" points={points(ghost)} aria-hidden="true"/>}
        {screen && shown && <g className="gi-select-box" role="group" tabIndex={0} aria-label={m.selectedLayer(selected!.name)} aria-description={`${m.selectKeys}${selected!.kind === 'text' ? ` ${m.editTextHint}` : ''}`}>
          <polygon className="gi-select-focus" points={points(grow(screen, 4))}/>
          {SELECT_CORNERS.map((_, i) => <polygon key={i} className="gi-select-rotate" data-select-part="rotate" points={points(rotateZone(screen as unknown as Quad, i as 0 | 1 | 2 | 3, ROTATE_REACH))} aria-hidden="true"/>)}
          <polygon className="gi-select-shade" points={points(screen)}/>
          <polygon className="gi-select-outline" points={points(screen)}/>
          {hub && <g className="gi-select-hub" aria-hidden="true"><path className="gi-select-shade" d={`M${hub[0] - 5} ${hub[1]}H${hub[0] + 5}M${hub[0]} ${hub[1] - 5}V${hub[1] + 5}`}/><path className="gi-select-cross" d={`M${hub[0] - 5} ${hub[1]}H${hub[0] + 5}M${hub[0]} ${hub[1] - 5}V${hub[1] + 5}`}/></g>}
          {handles.map(({ handle, at, corner, cursor }) => {
              const size = corner ? 9 : 7;
              return <g key={handle} className="gi-select-handle" data-select-part="handle" data-handle={handle} data-corner={corner ? '' : undefined} data-hidden={corner || roomy ? undefined : ''} style={{ cursor }} transform={`translate(${at[0]} ${at[1]}) rotate(${angle})`} aria-hidden="true">
                <rect className="gi-select-handle-target" x={-12} y={-12} width={24} height={24}/>
                <rect className="gi-select-handle-shade" x={-size / 2 - 1} y={-size / 2 - 1} width={size + 2} height={size + 2} rx={2.5}/>
                <rect className="gi-select-handle-face" x={-size / 2} y={-size / 2} width={size} height={size} rx={2}/>
              </g>;
          })}
        </g>}
      </svg>
      {/* logical:allow picture space does not mirror */}
      {chip && <span className="gi-select-chip" aria-hidden="true" style={{ left: chip.x, top: chip.y }}>{chip.text}</span>}
    </div>;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** The selected layer's position, size and angle, with the auto-select switch and layer commands. */
function SelectPanel() {
    const session = useEditorContext(), state = useSessionState(session), m = useMessages(geometryMessages);
    const [locked, setLocked] = useState(true);
    if (!state.sourceSize) return null;
    const layers = state.draft.layers ?? [], layer = selectedOf(session), auto = state.toolData[AUTO_SELECT] !== false;
    const quad = layer ? spaces(session).toDocument(layer.quad) : null;
    const change = (next: Quad, label: string) => { if (!layer) return; settle(session); previewLayer(session, layer.id, next); if (label === m.scale) commitScale(session, layer.id, label); else commitDraft(session, label); };
    const bounds = quad && quadBounds(quad), size = quad && quadSize(quad), angle = quad ? wrapAngle(quadAngle(quad)) : 0;
    const resize = (axis: 'width' | 'height', value: number) => {
        if (!quad || !size || value <= 0 || !size[axis]) return;
        const k = value / size[axis], sx = axis === 'width' || locked ? k : 1, sy = axis === 'height' || locked ? k : 1;
        change(resizeQuad(quad, sx, sy), m.scale);
    };
    return <div className="gi-panel">
      <PanelGroup>
        <Choice size="sm" aria-label={m.layer} placeholder={m.noSelection} value={layer?.id ?? ''} onValueChange={id => { settle(session); session.setToolData(SELECTED_LAYER, id || null); }}
          options={[...layers].reverse().map(item => ({ value: item.id, label: item.name }))} disabled={!layers.length}/>
        <SettingRow className="gi-panel-setting" label={m.autoSelect} control={<Switch size="sm" aria-label={m.autoSelect} checked={auto} onCheckedChange={on => session.setToolData(AUTO_SELECT, on)}/>}/>
      </PanelGroup>
      {quad && bounds && size && <PanelGroup label={m.transform}>
        <PanelPair>
          <GeometryNumber layout="field" label={m.x} unit="px" value={round(bounds.x)} onChange={v => change(translateQuad(quad, v - bounds.x, 0), m.move)}/>
          <GeometryNumber layout="field" label={m.y} unit="px" value={round(bounds.y)} onChange={v => change(translateQuad(quad, 0, v - bounds.y), m.move)}/>
        </PanelPair>
        <PanelPair>
          <GeometryNumber layout="field" label={m.width} unit="px" min={1} value={round(size.width)} onChange={v => resize('width', v)}/>
          <GeometryNumber layout="field" label={m.height} unit="px" min={1} value={round(size.height)} onChange={v => resize('height', v)}/>
        </PanelPair>
        <SettingRow className="gi-panel-setting" label={m.constrain} control={<Switch size="sm" aria-label={m.constrain} checked={locked} onCheckedChange={setLocked}/>}/>
        <GeometryNumber label={m.angle} unit="°" min={-180} max={180} value={round(angle)} onChange={v => change(rotateQuad(quad, v - angle), m.rotate)}/>
      </PanelGroup>}
      {layer && <PanelActions start={<Button size="sm" variant="ghost" onClick={() => { settle(session); session.setToolData(SELECTED_LAYER, null); }}>{m.deselect}</Button>}>
        <Button size="sm" variant="secondary" onClick={() => { settle(session); session.run('layers.duplicate', { id: layer.id, label: m.duplicateLayer }); }}>{m.duplicateLayer}</Button>
        <Button size="sm" variant="secondary" onClick={() => { settle(session); session.run('layers.delete', { id: layer.id, label: m.deleteLayer }); }}>{m.deleteLayer}</Button>
      </PanelActions>}
      <PanelHint>{layers.length ? `${m.selectHint}${layer?.kind === 'text' ? ` ${m.editTextHint}` : ''}` : m.noLayers}</PanelHint>
    </div>;
}

/**
 * Select, move, scale and turn text and image layers on the canvas: Photoshop's Move tool with
 * Auto-Select (V). Arrow keys nudge (Shift for ten pixels), Delete removes, Escape deselects, Alt
 * drags a copy and a double-click edits text. It brings Photoshop's layer commands with it.
 */
export const select = defineTool({
    id: 'select', group: 'layers', standalone: true, messages: geometryMessages, label: m => m.select, icon: <IconCursor />, shortcut: 'v',
    Panel: SelectPanel, Overlay: SelectOverlay, actions: layerActions,
    leave: settle,
});
