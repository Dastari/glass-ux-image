import { EmptyState } from 'glass-ux/empty-state';
import { IconImageOff } from 'glass-ux/icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { useElementSize, usePanZoom, type PanZoomCamera } from "glass-ux/hooks";
import { useMessages } from "glass-ux/i18n";
import { Spinner } from "glass-ux/spinner";
import { MAX_ZOOM, MIN_ZOOM, type Rect } from "../core/index.js";
import { imageEditorMessages } from "../react/messages.js";
import { useEditorContext, useSessionState } from "../react/session-context.js";
import type { CanvasMapping } from "../react/tool.js";
import { CpuBackend, createRenderBackend, Renderer, type BackendOptions, type RenderBackend } from "../render/index.js";

const MARGIN = 24;
const dpr = () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);

/** Smallest share of the stage, on each axis, that fitting will squeeze the picture into. */
const MIN_CLEAR = 0.35;

/**
 * Where a fitted picture goes: the clear box when floating panes leave a usable one, otherwise the
 * whole stage. Panning and zooming still use the whole stage either way.
 */
export function fitBox(stageWidth: number, stageHeight: number, clear: Pick<HTMLElement, "offsetLeft" | "offsetTop" | "offsetWidth" | "offsetHeight"> | null) {
  const whole = { x: 0, y: 0, width: stageWidth, height: stageHeight };
  if (!clear || !clear.offsetWidth || !clear.offsetHeight) return whole;
  const usable = clear.offsetWidth >= Math.max(MARGIN * 4, stageWidth * MIN_CLEAR) && clear.offsetHeight >= Math.max(MARGIN * 4, stageHeight * MIN_CLEAR);
  return usable ? { x: clear.offsetLeft, y: clear.offsetTop, width: clear.offsetWidth, height: clear.offsetHeight } : whole;
}

const MappingContext = /* @__PURE__ */ createContext<CanvasMapping | null>(null);

/** Maps the picture to the canvas, for anything drawn in `ImageCanvas`'s children. */
export function useCanvasMapping(): CanvasMapping {
  const mapping = useContext(MappingContext);
  if (!mapping) throw new Error("useCanvasMapping works inside ImageCanvas");
  return mapping;
}

/** A pointer sample in output document pixels. The native event supplies buttons and modifiers. */
export interface CanvasPointer { x: number; y: number; pressure: number; phase: "down" | "move" | "up" | "cancel"; event: ReactPointerEvent<HTMLDivElement> }
export interface ImageCanvasProps {
  /** Pointer down, move, up and cancel samples in document pixels. */
  onDocumentPointer?: (pointer: CanvasPointer) => void;
  /** Accessible picture or editing-area name. */
  "aria-label"?: string;
  /** Which backend to prefer. Defaults to the best available. */
  backend?: BackendOptions["prefer"];
  className?: string;
  /** Drawn over the picture. Elements marked `data-canvas-tool` take pointer drags from panning. */
  children?: ReactNode;
}

/**
 * The accelerated view of the nearest editor. It fills its parent. The picture sits on a neutral
 * stage in every theme and direction, so nothing around it changes how its colours read.
 *
 * Inside a Glass UX `PaneLayout` with overlay placement, Fit places the picture in the area the
 * floating panes leave clear, read from `--pane-covered-*`. A host can set those four properties on
 * any ancestor to keep its own floating content clear. Panning and zooming use the whole stage.
 */
export function ImageCanvas({ "aria-label": label, backend: prefer = "auto", className, children, onDocumentPointer }: ImageCanvasProps) {
  const session = useEditorContext();
  const { status, cropping, draft } = useSessionState(session);
  const messages = useMessages(imageEditorMessages);
  const stageRef = useRef<HTMLDivElement>(null);
  const { width: stageWidth, height: stageHeight } = useElementSize(stageRef);
  // The part of the stage nothing floats over. PaneLayout's overlay placement publishes how far its
  // floating stacks reach into the primary panel as --pane-covered-*; elsewhere they are unset, and
  // this box is the whole stage. Its size changes whenever theirs do, so it is observed, not polled.
  const clearRef = useRef<HTMLDivElement>(null);
  const { width: clearWidth, height: clearHeight } = useElementSize(clearRef);
  const [reading, setReading] = useState<"ltr" | "rtl">("ltr");
  const surface = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [camera, setCamera] = useState<PanZoomCamera>({ x: 0, y: 0, k: 1 });
  /** Whether the picture should keep fitting the stage as the stage changes. */
  const fitted = useRef(true);
  const space = useRef(false);
  useEffect(() => {
    const element=stageRef.current;
    if(!element) return;
    const down=(event: KeyboardEvent)=>{
      if(event.code!=="Space"||(event.target as Element).closest("input,textarea,select,[contenteditable=true]"))return;
      space.current=true;element.dataset.panning="";event.preventDefault();
    };
    const up=(event?: KeyboardEvent)=>{if(event&&event.code!=="Space")return;space.current=false;delete element.dataset.panning;};
    element.addEventListener("keydown",down,true);
    window.addEventListener("keyup",up);window.addEventListener("blur",up as EventListener);
    return ()=>{element.removeEventListener("keydown",down,true);window.removeEventListener("keyup",up);window.removeEventListener("blur",up as EventListener);};
  }, []);


  const present = useCallback(
    ({ x, y, k }: PanZoomCamera) => {
      if (!stageWidth || !stageHeight) return;
      const scale = dpr();
      renderer.current?.setView({
        width: Math.round(stageWidth * scale),
        height: Math.round(stageHeight * scale),
        zoom: k * scale,
        centerX: (stageWidth / 2 - x) / k,
        centerY: (stageHeight / 2 - y) / k,
      });
      session.setZoom(k);
      setCamera({ x, y, k });
    },
    [session, stageWidth, stageHeight],
  );

  const fitCamera = useCallback((): PanZoomCamera | null => {
    const document = session.document;
    if (!document || !stageWidth || !stageHeight) return null;
    const box = fitBox(stageWidth, stageHeight, clearRef.current);
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((box.width - MARGIN * 2) / document.width, (box.height - MARGIN * 2) / document.height)));
    return { k, x: box.x + (box.width - document.width * k) / 2, y: box.y + (box.height - document.height * k) / 2 };
  }, [session, stageWidth, stageHeight, clearWidth, clearHeight, reading]);

  const panZoom = usePanZoom({
    onFrame: present,
    onGestureStart: () => {
      fitted.current = false;
    },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    arrows: !cropping,
    canPan: (event) => space.current || !(event.target as Element | null)?.closest?.("[data-canvas-tool]"),
    disabled: status !== "ready",
  });

  const fit = useCallback(() => {
    const next = fitCamera();
    if (!next) return;
    fitted.current = true;
    panZoom.moveTo(next);
    present(next);
  }, [fitCamera, panZoom, present]);

  useEffect(() => {
    const zoomTo = (k: number) => {
      const current = panZoom.camera();
      panZoom.zoomBy(k / current.k);
      fitted.current = false;
    };
    session.view = {
      fit,
      actualSize: () => zoomTo(1 / dpr()),
      zoomIn: () => {
        fitted.current = false;
        panZoom.zoomIn();
      },
      zoomOut: () => {
        fitted.current = false;
        panZoom.zoomOut();
      },
    };
    return () => {
      session.view = undefined;
    };
  }, [session, panZoom, fit]);

  useEffect(() => {
    if (status !== "ready" || !surface.current) return;
    const box = surface.current;
    const show = (backend: RenderBackend) => {
      backend.canvas.setAttribute("aria-hidden", "true");
      box.replaceChildren(backend.canvas);
    };
    const backend = createRenderBackend({ prefer });
    const next = new Renderer({
      document: session.document!,
      backend,
      fallback: (reason) => new CpuBackend({ fallbackReason: reason }),
      onBackendChange: show,
    });
    renderer.current = next;
    session.attach(next);
    show(backend);
    return () => {
      session.attach(undefined);
      renderer.current = null;
      next.dispose();
    };
  }, [session, status, prefer]);

  // The stage is always left to right; the covered amounts follow the page's reading direction.
  useEffect(() => {
    const parent = stageRef.current?.parentElement;
    if (parent) setReading(getComputedStyle(parent).direction === "rtl" ? "rtl" : "ltr");
  }, [stageWidth, stageHeight]);

  // A new shape, stage size or clear area refits, unless someone has zoomed in to work on a detail.
  const shape = `${session.document?.width}x${session.document?.height}`;
  const lastShape = useRef(shape);
  useEffect(() => {
    if (status !== "ready") return;
    if (shape !== lastShape.current) fitted.current = true;
    lastShape.current = shape;
    if (fitted.current) fit();
    else present(panZoom.camera());
  }, [status, shape, stageWidth, stageHeight, clearWidth, clearHeight, reading, fit, present, panZoom, draft.geometry, cropping]);

  const mapping = useMemo<CanvasMapping>(
    () => ({
      scale: camera.k,
      toDocument: (x,y) => {const current=panZoom.camera();return {x:(x-current.x)/current.k,y:(y-current.y)/current.k};},
      toScreen: ({ x, y, width, height }: Rect) => ({ x: x * camera.k + camera.x, y: y * camera.k + camera.y, width: width * camera.k, height: height * camera.k }),
    }),
    [camera,panZoom],
  );

  const stage = useCallback(
    (element: HTMLDivElement | null) => {
      stageRef.current = element;
      panZoom.ref(element);
    },
    [panZoom],
  );

  const pointer=(phase: CanvasPointer["phase"],event: ReactPointerEvent<HTMLDivElement>)=>{
    if(space.current)return;
    const rect=event.currentTarget.getBoundingClientRect(),point=mapping.toDocument(event.clientX-rect.left,event.clientY-rect.top);
    onDocumentPointer?.({...point,pressure:event.pressure,phase,event});
  };

  return (
    <div
      ref={stage}
      onPointerDown={event=>pointer("down",event)}
      onPointerMove={event=>pointer("move",event)}
      onPointerUp={event=>pointer("up",event)}
      onPointerCancel={event=>pointer("cancel",event)}
      className={["gi-stage", className].filter(Boolean).join(" ")}
      role="application"
      aria-label={label ?? messages.canvasLabel}
      aria-description={messages.canvasHelp}
      aria-busy={status === "loading"}
      tabIndex={0}
      dir="ltr"
      data-mode="dark"
      data-reading={reading}
    >
      <div ref={clearRef} className="gi-stage-clear" aria-hidden="true" />
      <div ref={surface} className="gi-stage-surface" />
      {status === "loading" && (
        <div className="gi-stage-state" role="status">
          <Spinner label={messages.opening} />
        </div>
      )}
      <div className="gi-stage-state" hidden={status !== "failed"}>
        {status === "failed" && <EmptyState tone="danger" icon={<IconImageOff/>}>{messages.openFailed}</EmptyState>}
      </div>
      {status === "ready" && <MappingContext.Provider value={mapping}>{children}</MappingContext.Provider>}
    </div>
  );
}
