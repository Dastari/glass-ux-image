import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useAnnounce, useDebouncedCallback } from "glass-ux/hooks";
import { Button } from "glass-ux/button";
import { IconArrowLeftRight, IconCrop, IconLink } from "glass-ux/icons";
import { Field } from "glass-ux/field";
import { PanelActions, PanelGroup, PanelPair } from "../react/panel-layout.js";
import { useMessages } from "glass-ux/i18n";
import { NumberField } from "glass-ux/number-field";
import { Segmented } from "glass-ux/segmented";
import { useCanvasMapping } from "../canvas/image-canvas.js";
import { fitAspect, workSize, geometryMapping, type Rect, type Size } from "../core/index.js";
import { imageEditorMessages } from "../react/messages.js";
import { useEditorContext, useSessionState } from "../react/session-context.js";
import { defineTool } from "../react/tool.js";
import type { EditorSession } from "../session/index.js";
import { geometryMessages } from "../messages/geometry.js";
import { dragCrop, type CropHandle } from "./crop-math.js";
import { FillEdges, fillEdgesAction, sessionHasEmptyEdges } from "./fill-edges.js";
type AspectChoice = "free" | "original" | "square" | "fourThree" | "wide" | "custom";
const HANDLES: Exclude<CropHandle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const whole = ({ width, height }: Size): Rect => ({ x: 0, y: 0, width, height });
const currentCrop = (session: EditorSession, bounds: Size) => session.state.draft.geometry.crop ?? whole(bounds);
const chosenAspect = (session: EditorSession) => (session.state.toolData.crop as AspectChoice | undefined) ?? "free";
function aspectValue(choice: AspectChoice, bounds: Size) {
    if (choice === "original")
        return bounds.width / bounds.height;
    if (choice === "square")
        return 1;
    if (choice === "fourThree")
        return 4 / 3;
    if (choice === "wide")
        return 16 / 9;
    return null;
}
const cropBounds = (session: EditorSession) => session.state.sourceSize && workSize(session.state.sourceSize, session.state.draft.geometry);
function ratioFor(session: EditorSession, bounds: Size) {
    const choice = chosenAspect(session);
    const ratio = choice === 'custom' ? Number(session.state.toolData.cropRatio ?? 1) : aspectValue(choice, bounds);
    return ratio && session.state.toolData.cropSwap ? 1 / ratio : ratio;
}
const previewCrop = (session: EditorSession, crop: Rect) => session.preview({ geometry: { ...session.state.draft.geometry, crop } });
/** Commit the draft crop. A crop covering the whole picture is no crop. */
function finish(session: EditorSession) {
    const bounds = cropBounds(session);
    const crop = session.state.draft.geometry.crop;
    if (!bounds || !crop)
        return;
    const covers = crop.x === 0 && crop.y === 0 && crop.width === bounds.width && crop.height === bounds.height;
    session.commit({ geometry: { ...session.state.draft.geometry, crop: covers ? null : crop } }, { label: imageEditorMessages.defaults.crop });
}
function CropOverlay() {
    const session = useEditorContext();
    const { draft } = useSessionState(session);
    const messages = useMessages(imageEditorMessages);
    const words = useMessages(geometryMessages);
    const { scale, toScreen } = useCanvasMapping();
    const announce = useAnnounce();
    const drag = useRef<{
        handle: CropHandle;
        x: number;
        y: number;
        start: Rect;
    } | null>(null);
    const box = useRef<HTMLDivElement>(null);
    const bounds = cropBounds(session);
    const readout = (crop: Rect) => messages.cropReadout({ x: String(crop.x), y: String(crop.y), width: String(crop.width), height: String(crop.height) });
    const announceCrop = useDebouncedCallback((crop: Rect) => announce(readout(crop)), 400);
    useEffect(() => {
        box.current?.focus({ preventScroll: true });
    }, []);
    if (!bounds)
        return null;
    const crop = draft.geometry.crop ?? whole(bounds);
    const project = geometryMapping(session.state.sourceSize!, { ...draft.geometry, crop: null });
    const a = project.fromWork(crop.x, crop.y)!, b = project.fromWork(crop.x + crop.width, crop.y + crop.height)!;
    const shown = toScreen({ x: a[0], y: a[1], width: b[0] - a[0], height: b[1] - a[1] });
    const o = project.fromWork(0, 0)!, e = project.fromWork(bounds.width, bounds.height)!;
    const picture = toScreen({ x: o[0], y: o[1], width: e[0] - o[0], height: e[1] - o[1] });
    const origin = project.toWork(0, 0)!, unit = project.toWork(1, 1)!;
    const scaleX = scale / (unit[0] - origin[0]), scaleY = scale / (unit[1] - origin[1]);
    const begin = (handle: CropHandle) => (event: PointerEvent<HTMLElement>) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { handle, x: event.clientX, y: event.clientY, start: crop };
    };
    const move = (event: PointerEvent<HTMLElement>) => {
        const active = drag.current;
        if (!active)
            return;
        const dx = (event.clientX - active.x) / scaleX;
        const dy = (event.clientY - active.y) / scaleY;
        previewCrop(session, dragCrop(active.start, active.handle, dx, dy, bounds, ratioFor(session, bounds)));
    };
    const end = () => {
        drag.current = null;
    };
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        const steps: Record<string, [
            number,
            number
        ]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const step = steps[event.key];
        if (step) {
            event.preventDefault();
            const size = event.altKey ? 10 : 1;
            const aspect = ratioFor(session, bounds);
            const next = event.shiftKey ? dragCrop(crop, "se", step[0] * size, step[1] * size, bounds, aspect) : dragCrop(crop, "move", step[0] * size, step[1] * size, bounds, aspect);
            previewCrop(session, next);
            announceCrop(next);
        }
        else if (event.key === "Enter") {
            event.preventDefault();
            session.run("tool.select", null);
            session.run("tool.select", session.defaultTool);
        }
        else if (event.key === "Escape") {
            event.preventDefault();
            session.revert();
        }
    };
    return (<div className="gi-crop" data-canvas-tool="">
      {/* Only the picture outside the crop dims; the stage around it keeps its neutral grey. */}
      <div className="gi-crop-picture" aria-hidden="true" style={{ left: picture.x, top: picture.y, width: picture.width, height: picture.height }}>{/* logical:allow picture space does not mirror */}
        <div className="gi-crop-shade" style={{ left: shown.x - picture.x, top: shown.y - picture.y, width: shown.width, height: shown.height }}/>{/* logical:allow picture space does not mirror */}
      </div>
      <div ref={box} className="gi-crop-box" role="group" tabIndex={0} aria-label={messages.cropArea} aria-description={`${readout(crop)}. ${messages.cropHelp}`} 
    /* logical:allow picture space does not mirror */
    style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height }} onPointerDown={begin("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={onKeyDown}>
        {HANDLES.map((handle) => (<span key={handle} className="gi-crop-handle" data-handle={handle} role="button" tabIndex={0} aria-label={`${messages.cropArea} ${({ nw: words.topLeft, n: words.top, ne: words.topRight, e: words.right, se: words.bottomRight, s: words.bottom, sw: words.bottomLeft, w: words.left })[handle]}`} onKeyDown={event => { const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key]; if (step) {
            event.preventDefault();
            event.stopPropagation();
            const n = event.altKey ? 10 : 1;
            previewCrop(session, dragCrop(crop, handle, step[0]! * n, step[1]! * n, bounds, ratioFor(session, bounds)));
        } }} onPointerDown={begin(handle)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>))}
      </div>
    </div>);
}
function CropPanel() {
    const session = useEditorContext();
    const { draft, recipe, toolData } = useSessionState(session);
    const messages = useMessages(imageEditorMessages);
    const words = useMessages(geometryMessages);
    const bounds = cropBounds(session);
    if (!bounds)
        return null;
    const crop = currentCrop(session, bounds);
    const aspect = (toolData.crop as AspectChoice | undefined) ?? "free";
    const chooseAspect = (choice: AspectChoice) => {
        session.setToolData("crop", choice);
        const ratio = ratioFor(session, bounds);
        if (ratio)
            previewCrop(session, roundRect(fitAspect(crop, ratio)));
    };
    const setSize = (axis: "width" | "height", value: number | null) => {
        if (!value)
            return;
        const ratio = ratioFor(session, bounds);
        const size = axis === "width" ? { width: value, height: ratio ? value / ratio : crop.height } : { height: value, width: ratio ? value * ratio : crop.width };
        const width = Math.min(bounds.width - crop.x, size.width);
        const height = Math.min(bounds.height - crop.y, size.height);
        previewCrop(session, roundRect({ ...crop, width, height }));
    };
    const apply = () => {
        finish(session);
        session.run("tool.select", null);
        session.run("tool.select", session.defaultTool);
    };
    const cancel = () => {
        session.revert();
        session.run("tool.select", null);
        session.run("tool.select", session.defaultTool);
    };
    const remove = () => session.commit({ geometry: { ...session.state.draft.geometry, crop: null } }, { label: messages.crop });
    const ratio = ratioFor(session, bounds);
    return (<div className="gi-panel">
      <PanelGroup label={messages.aspectRatio}>
        <div className="gi-panel-inline">
          <Segmented aria-label={messages.aspectRatio} size="sm" collapse="menu" value={aspect} onValueChange={chooseAspect} options={[
            { value: "free", label: messages.aspectFree },
            { value: "original", label: messages.aspectOriginal },
            { value: "square", label: messages.aspectSquare },
            { value: "fourThree", label: messages.aspectFourThree },
            { value: "wide", label: messages.aspectWide },
            { value: "custom", label: words.custom },
        ]}/>
          {aspect === 'custom' && <NumberField aria-label={words.custom} size="sm" width="short" min={.01} max={100} value={Number(toolData.cropRatio ?? 1)} onValueChange={v => { if (v) {
            session.setToolData('cropRatio', v);
            chooseAspect('custom');
        } }}/>}
          <Button size="sm" variant="ghost" icon={<IconArrowLeftRight />} aria-label={words.swap} aria-pressed={Boolean(toolData.cropSwap)} onClick={() => { session.setToolData('cropSwap', !toolData.cropSwap); const next = ratioFor(session, bounds); if (next)
            previewCrop(session, roundRect(fitAspect(whole(bounds), next))); }}/>
        </div>
      </PanelGroup>
      <PanelGroup label={words.size}>
        <PanelPair link={ratio ? <span className="gi-panel-link" aria-hidden="true"><IconLink /></span> : undefined}>
          <Field label={messages.width} message="auto"><NumberField aria-label={messages.width} size="sm" min={1} max={bounds.width} value={Math.round(draft.geometry.crop?.width ?? bounds.width)} onValueChange={(value) => setSize("width", value)} unit="px" steppers={false}/></Field>
          <Field label={messages.height} message="auto"><NumberField aria-label={messages.height} size="sm" min={1} max={bounds.height} value={Math.round(draft.geometry.crop?.height ?? bounds.height)} onValueChange={(value) => setSize("height", value)} unit="px" steppers={false}/></Field>
        </PanelPair>
      </PanelGroup>
      {sessionHasEmptyEdges(session) && <PanelGroup label={words.edges}><FillEdges before={() => finish(session)}/></PanelGroup>}
      <PanelActions start={recipe.geometry.crop ? <Button variant="ghost" size="sm" onClick={remove}>{messages.removeCrop}</Button> : undefined}>
        <Button variant="secondary" size="sm" onClick={cancel}>{messages.cancel}</Button>
        <Button variant="primary" size="sm" onClick={apply}>{messages.applyCrop}</Button>
      </PanelActions>
    </div>);
}
const roundRect = ({ x, y, width, height }: Rect): Rect => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
/** Crop to any shape or a fixed aspect ratio. Leaving the tool keeps the crop. */
export const crop = defineTool({
    id: "crop",
    group: "geometry",
    label: (messages) => messages.crop,
    icon: <IconCrop />,
    shortcut: "c",
    Panel: CropPanel,
    Overlay: CropOverlay,
    actions: [fillEdgesAction],
    reset: (recipe) => ({ geometry: { ...recipe.geometry, crop: null } }),
    enter: (session) => session.setCropping(true),
    leave(session) {
        finish(session);
        session.setCropping(false);
    },
});
