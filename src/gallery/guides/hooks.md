# Hooks

useImageEditor owns a session until unmount. A changed source starts another session. Pass stable sources; constructing a fresh TileSource each render also starts another session. A host that creates sessions directly must dispose them itself.

## Compose public parts

```tsx
import { ImageEditorProvider, useImageEditor, useSessionState, useImageHistory, useLayers } from 'glass-ux-image/react';
import { ImageCanvas } from 'glass-ux-image/canvas';
import { basic } from 'glass-ux-image/kits/basic';
export function Parts({src}: {src: Blob}) {
  const editor=useImageEditor({source:src,tools:basic});
  const state=useSessionState(editor),history=useImageHistory(editor),layers=useLayers(editor);
  return <ImageEditorProvider editor={editor}>
    <button disabled={!state.canUndo} onClick={()=>history.undo()}>Undo</button>
    <output>{layers.layers.length} layers</output>
    <div style={{height:'24rem'}}><ImageCanvas aria-label="Product photo"/></div>
  </ImageEditorProvider>;
}
```

useEditor resolves an explicit session or the nearest provider; useEditorContext requires the provider. useTool reads or chooses the active tool. useAction runs a named action and reports whether it is enabled. useRenderer reads the canvas renderer, while useCanvasMapping requires an ImageCanvas ancestor and maps picture coordinates to the viewport.

File hooks are opt-in: useImageFiles, useImageExport, useExportFormats, useExportPreview, useImageMetadata, useBatch, useImageBatch and useImageAutosave. Session bindings obtain data from the session; the plain batch and export hooks accept injected work. A save or storage adapter remains the host's policy. See [files](files.md) and the generated API for callback payloads.
