import { useMemo, useState } from "react";
import { Button } from "glass-ux/button";
import { Surface } from "glass-ux/surface";
import { ImageCanvas } from "glass-ux-image/canvas";
import { ImageEditorProvider, useImageEditor, useImageHistory, useSessionState } from "glass-ux-image/react";
import { adjust } from "glass-ux-image/tools/adjust";
import { sceneSource } from "./scene-source";

const TOOLS = [adjust];
const AdjustPanel = adjust.Panel!;

/** A host's own header and buttons around the parts, with one rule of its own. */
function Editor() {
  const { canUndo, undo } = useImageHistory();
  const { size } = useSessionState();
  return (
    <div className="custom">
      <Surface material="chrome" radius="tile" className="custom-bar">
        <b>Catalogue image</b>
        <span data-testid="custom-size">{size ? `${size.width} × ${size.height}` : ""}</span>
        <span className="grow" />
        <Button variant="secondary" size="sm" disabled={!canUndo} onClick={undo}>Step back</Button>
      </Surface>
      <Surface material="panel" radius="tile" className="custom-stage">
        <ImageCanvas aria-label="Catalogue image" />
      </Surface>
      <Surface material="panel" radius="tile" padding="compact">
        <AdjustPanel />
      </Surface>
    </div>
  );
}

export function CustomPage() {
  const [blocked, setBlocked] = useState(0);
  const source = useMemo(() => sceneSource({ width: 1500, height: 1000 }), []);
  const editor = useImageEditor({
    source,
    tools: TOOLS,
    // Catalogue images stay the right way up, so this host refuses rotation at the source.
    onAction: ({ id }, next) => {
      if (id.startsWith("image.rotate")) return setBlocked((count) => count + 1);
      return next();
    },
  });
  return (
    <ImageEditorProvider editor={editor}>
      <Editor />
      <Button variant="ghost" size="sm" onClick={() => editor.run("image.rotateRight")}>Try to rotate ({blocked} refused)</Button>
    </ImageEditorProvider>
  );
}
