import { createElement, useEffect } from 'react';
import { useEditorContext, type ImageTool } from 'glass-ux-image/react';
import type { EditorSession } from 'glass-ux-image/session';
import { brush, eraser, cloneStamp, healingBrush, spotHealing, patch, blurBrush, sharpenBrush, smudge, dodge, burn, sponge, colourReplacement, redEyeRemoval, liquify } from 'glass-ux-image/tools/retouch';

// The demo owns this inspection hook; no product control exposes engine internals.
declare global { interface Window { __retouchDemo?: EditorSession } }
function inspect(tool: ImageTool): ImageTool {
  const Overlay = tool.Overlay!;
  return { ...tool, Overlay() {
    const session = useEditorContext();
    useEffect(() => { window.__retouchDemo = session; return () => { if (window.__retouchDemo === session) delete window.__retouchDemo; }; }, [session]);
    return createElement(Overlay);
  } };
}
/** Tools supplied by the retouch domain, each also available as an individual public entry. */
export const retouchTools: readonly ImageTool[] = [brush, eraser, cloneStamp, healingBrush, spotHealing, patch, blurBrush, sharpenBrush, smudge, dodge, burn, sponge, colourReplacement, redEyeRemoval, liquify].map(inspect);
