import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "glass-ux/button";
import { Select } from "glass-ux/select";
import { Surface } from "glass-ux/surface";
import { formatBytes } from "./format";
import { crop } from "glass-ux-image/tools/crop";
import { flip } from "glass-ux-image/tools/flip";
import { rotate } from "glass-ux-image/tools/rotate";
import { adjust } from "glass-ux-image/tools/adjust";
import { basic } from "glass-ux-image/kits/basic";
import { standard } from "glass-ux-image/kits/standard";
import { advanced } from "glass-ux-image/kits/advanced";
import { PhotoEditor } from "glass-ux-image/photo-editor";
import type { EditRecipe, EditResult, SaveContext } from "glass-ux-image/session";
import { geometryTools } from "./domains/geometry";
import { developTools } from "./domains/develop";
import { retouchTools } from "./domains/retouch";
import { effectsTools } from "./domains/effects";
import { filesTools } from "./domains/files";
import { layersTools } from "./domains/layers";
import { workspaceTools } from "./domains/workspace";
import { sceneSource } from "./scene-source";

const RotatePanel = rotate.Panel!;
const FlipPanel = flip.Panel!;
// Stage 2's Rotate exposed the flip operations too; compose the same public panels for its regression fixture.
const stage2Rotate = {...rotate, Panel: () => <><RotatePanel/><FlipPanel/></>};

const TOOLS = [...developTools, ...geometryTools, ...retouchTools, ...effectsTools, ...filesTools, ...layersTools, ...workspaceTools];
const backend = new URLSearchParams(location.search).get("backend") === "cpu" ? "cpu" : "auto";
const SAMPLE = { width: 3000, height: 2000 };
const FORMATS = [
  { value: "image/webp", label: "WebP" },
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/png", label: "PNG" },
];

interface Saved {
  url: string;
  bytes: number;
  type: string;
  width: number;
  height: number;
  recipe: EditRecipe;
}

declare global {
  interface Window {
    /** What the host last received, for browser tests. */
    __saved?: Saved;
    /** Makes the next saves fail, for browser tests. */
    __failSave?: boolean;
  }
}

/** A host application: it chooses the picture and the format, and decides what Save means. */
export function EditorPage() {
  const [source, setSource] = useState<Blob | ReturnType<typeof sceneSource>>(() => sceneSource(SAMPLE));
  const [title, setTitle] = useState("Lake at dusk");
  const [format, setFormat] = useState(() => new URLSearchParams(location.search).get("format") ?? "image/webp");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const tools = useMemo(() => { const kit=new URLSearchParams(location.search).get("kit");return kit==="stage2"?[adjust,crop,stage2Rotate]:kit==="basic"?basic:kit==="standard"?standard:kit==="advanced"?advanced:TOOLS; }, []);

  useEffect(() => () => void (saved && URL.revokeObjectURL(saved.url)), [saved]);

  const save = async (result: EditResult, { signal, setProgress }: SaveContext) => {
    if (window.__failSave) throw new Error("Refused by the demo");
    const blob = await result.toBlob({ type: format, quality: 0.86, signal, onProgress: (done) => setProgress(done) });
    const next = { url: URL.createObjectURL(blob), bytes: blob.size, type: blob.type, width: result.width, height: result.height, recipe: result.recipe };
    window.__saved = next;
    setSaved(next);
  };

  return (
    <div className="host">
      <Surface material="panel" radius="surface" className="host-editor">
        {open ? (
          <PhotoEditor src={source} tools={tools} title={title} saveLabel="Save copy" backend={backend} onSave={save} onCancel={() => setOpen(false)} />
        ) : (
          <div className="host-closed">
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Edit photo</Button>
          </div>
        )}
      </Surface>
      <Surface material="panel" radius="surface" className="host-side">
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          aria-label="Open an image"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setSource(file);
            setTitle(file.name);
            setOpen(true);
          }}
        />
        <Button variant="secondary" size="sm" block onClick={() => input.current?.click()}>Open an image</Button>
        <label className="host-label">
          Format
          <Select aria-label="Format" size="sm" options={FORMATS} value={format} onValueChange={(value) => value && setFormat(value)} />
        </label>
        {saved && (
          <figure className="host-result" data-testid="saved">
            <img src={saved.url} alt="The saved copy" />
            <figcaption>{saved.width} × {saved.height} · {saved.type.replace("image/", "").toUpperCase()} · {formatBytes(saved.bytes)}</figcaption>
          </figure>
        )}
      </Surface>
    </div>
  );
}
