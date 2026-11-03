import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Button } from "glass-ux/button";
import { Segmented } from "glass-ux/segmented";
import { Slider } from "glass-ux/slider";
import { Surface } from "glass-ux/surface";
import { createImageDocument, fitViewport, zoomAt, type ImageDocument } from "glass-ux-image/core";
import { gaussianBlur } from "glass-ux-image/filters/gaussian-blur";
import { CpuBackend, Renderer, createRenderBackend, type BackendKind, type RendererStats } from "glass-ux-image/render";
import { sceneSource } from "./scene-source";

const SIZE = { width: 6000, height: 4000 };
const MARGIN = 24;
type Choice = "auto" | BackendKind;

const megabytes = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
const dpr = () => window.devicePixelRatio || 1;

declare global {
  interface Window {
    /** The running renderer, for browser tests. */
    __renderer?: Renderer;
    /** Sets the blur without the slider, for browser tests. */
    __blur?: (sigma: number) => void;
  }
}

function Workspace({ document: doc, choice }: { document: ImageDocument; choice: Choice }) {
  const stage = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [stats, setStats] = useState<RendererStats | null>(null);
  const [info, setInfo] = useState("");
  const [zoom, setZoom] = useState(0);

  const fit = useCallback(() => {
    const box = stage.current;
    if (!box || !renderer.current) return;
    const canvas = { width: Math.round(box.clientWidth * dpr()), height: Math.round(box.clientHeight * dpr()) };
    renderer.current.setView(fitViewport(doc, canvas, MARGIN));
    setZoom(renderer.current.view.zoom);
  }, [doc]);

  useEffect(() => {
    const box = stage.current!;
    const show = (backend: Renderer["backend"]) => {
      box.replaceChildren(backend.canvas);
      backend.canvas.setAttribute("aria-hidden", "true");
      setInfo(backend.info.renderer ?? (backend.info.kind === "cpu" ? "TypeScript" : ""));
    };
    const backend = createRenderBackend({ prefer: choice });
    const next = new Renderer({
      document: doc,
      backend,
      fallback: (reason) => new CpuBackend({ fallbackReason: reason }),
      onBackendChange: show,
      onFrame: (frame) => {
        if (frame.frames % 15 === 0 || frame.pendingTiles === 0) setStats(frame);
      },
    });
    renderer.current = next;
    window.__renderer = next;
    show(backend);
    fit();
    const resize = new ResizeObserver(() => {
      const view = next.view;
      next.setView({ ...view, width: Math.round(box.clientWidth * dpr()), height: Math.round(box.clientHeight * dpr()) });
    });
    resize.observe(box);
    return () => {
      resize.disconnect();
      next.dispose();
      renderer.current = null;
    };
  }, [doc, choice, fit]);

  const zoomBy = (factor: number, x: number, y: number) => {
    const active = renderer.current;
    if (!active) return;
    active.setView(zoomAt(active.view, factor, x, y));
    setZoom(active.view.zoom);
  };

  const onWheel = (event: WheelEvent) => {
    const box = stage.current!.getBoundingClientRect();
    zoomBy(Math.exp(-event.deltaY * 0.002), (event.clientX - box.left) * dpr(), (event.clientY - box.top) * dpr());
  };
  const onPointerDown = (event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current) return;
    renderer.current?.panBy((event.clientX - drag.current.x) * dpr(), (event.clientY - drag.current.y) * dpr());
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const active = renderer.current;
    if (!active) return;
    const step = 64 * dpr();
    const { width, height } = active.view;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => active.panBy(step, 0),
      ArrowRight: () => active.panBy(-step, 0),
      ArrowUp: () => active.panBy(0, step),
      ArrowDown: () => active.panBy(0, -step),
      "+": () => zoomBy(1.25, width / 2, height / 2),
      "=": () => zoomBy(1.25, width / 2, height / 2),
      "-": () => zoomBy(0.8, width / 2, height / 2),
      "0": fit,
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  return (
    <>
      <div
        ref={stage}
        className="stage"
        role="application"
        aria-label="Image, 6000 by 4000 pixels. Arrow keys pan, plus and minus zoom, 0 fits."
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      />
      <Surface material="chrome" radius="tile" className="status" data-testid="status">
        <span><b>{(zoom * 100).toFixed(1)}%</b></span>
        <span>{SIZE.width} × {SIZE.height} px</span>
        <span>{info}</span>
        <span className="grow" />
        {stats && (
          <>
            <span>{stats.pendingTiles > 0 ? `${stats.pendingTiles} tiles to compose` : "Up to date"}</span>
            <span>{stats.composedTiles} composed · {megabytes(stats.composedBytes)}</span>
            <span>{stats.tileReads} read · {megabytes(stats.decodedBytes)} decoded</span>
          </>
        )}
      </Surface>
    </>
  );
}

export function EnginePage() {
  const [choice, setChoice] = useState<Choice>("auto");
  const [sigma, setSigma] = useState(0);
  const doc = useMemo(() => {
    const next = createImageDocument(SIZE);
    next.addLayer({ id: "scene", name: "Scene", source: sceneSource(SIZE) });
    return next;
  }, []);

  const applyBlur = useCallback(
    (next: number) => doc.updateLayer("scene", { filters: next > 0 ? [{ filter: gaussianBlur, params: { sigma: next } }] : [] }),
    [doc],
  );
  const changeBlur = (value: number | number[]) => {
    const next = Array.isArray(value) ? value[0]! : value;
    setSigma(next);
    applyBlur(next);
  };
  useEffect(() => {
    window.__blur = applyBlur;
  }, [applyBlur]);

  return (
    <main className="app" data-density="compact">
      <Surface material="chrome" radius="tile" className="bar">
        <Segmented
          size="sm"
          aria-label="Renderer"
          value={choice}
          onValueChange={setChoice}
          collapse="none"
          options={[
            { value: "auto", label: "Auto" },
            { value: "webgl2", label: "WebGL2" },
            { value: "cpu", label: "CPU" },
          ]}
        />
        <span className="field">
          Gaussian blur
          <span className="field-slider"><Slider aria-label="Gaussian blur" value={sigma} onValueChange={changeBlur} min={0} max={40} step={0.5} size="sm" bubble="never" /></span>
          <span className="value">{sigma} px</span>
        </span>
        <span className="grow" />
        <Button variant="secondary" size="sm" onClick={() => changeBlur(0)}>Reset</Button>
      </Surface>
      <Workspace key={choice} document={doc} choice={choice} />
    </main>
  );
}

