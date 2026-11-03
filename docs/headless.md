# Going headless

core and filters use no React, Glass UX or DOM. A TileSource supplies linear premultiplied RGBA. render, io and session also import no React or Glass UX; decoding and encoding still require browser facilities. CpuBackend can compose pixels in a test or worker without creating a display canvas.

## Compose pixels

```ts
import { createPixels, createImageDocument, solidSource } from 'glass-ux-image/core';
import { CpuBackend, composeDocument } from 'glass-ux-image/render';
import { adjust } from 'glass-ux-image/filters/adjust';
export async function renderTile() {
  const source=solidSource({width:32,height:32},[0.2,0.1,0.05,1]);
  const document=createImageDocument(source);
  document.addLayer({source,filters:[{filter:adjust,params:{brightness:20,contrast:0,saturation:0,warmth:0}}]});
  const backend=new CpuBackend();
  try {
    return await composeDocument(backend,document);
  } finally { backend.dispose(); document.dispose(); }
}
```

Put the function in a worker module and transfer the returned sRGB byte buffer. In a test call it directly and inspect pixels. Convert sRGB bytes with pixelsFromRgba8 at the decoding edge and pixelsToRgba8 at display. Do not multiply alpha twice.

For recipes and history use createEditorSession. Wait for state.status to become ready through subscribe, handle failed, then use run and result().toBlob(). Dispose the session and any host-owned sources when finished. Decoding arbitrary files needs browser APIs; pure procedural tile tests do not.
