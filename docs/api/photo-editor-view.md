# PhotoEditorView

`PhotoEditor` over a session the host already holds, for when something outside needs it too. In a
managed window, turn off `header` and `footer` and put `PhotoEditorActions` and `PhotoEditorStatus`
in `Window.Actions` and `Window.Status`.

`import { PhotoEditorView } from "glass-ux-image/photo-editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/photo-editor-view)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| backend | `"auto" \| import("../render/types.js").BackendKind \| undefined` | "auto", "webgl2", "cpu" | no | — | Force a rendering backend. By default the best available is used. |
| canvasLabel | `string \| undefined` | See type | no | — | An `aria-label` for the canvas. |
| className | `string \| undefined` | See type | no | — | Classes applied to the outer element for layout. Use the component props and theme tokens for its appearance. |
| editor | `EditorSession` | See type | yes | — | A session from `useImageEditor`. |
| footer | `boolean \| undefined` | false, true | no | — | Draw the bottom bar. Turn it off to place `PhotoEditorStatus` elsewhere. |
| header | `boolean \| undefined` | false, true | no | — | Draw the title bar. Turn it off when a window or dialog supplies one. |
| labels | `Partial<{ canvasLabel: string; canvasHelp: string; opening: string; openFailed: string; tools: string; crop: string; rotate: string; adjust: string; undo: string; noUndo: string; noRedo: string; redo: string; reset: string; zoomIn: string; zoomOut: string; fit: string; actualSize: string; zoomPercent: (percent: string) => string; size: ({ width, height }: { width: string; height: string; }) => string; cancel: string; close: string; save: string; saving: string; saved: string; saveFailed: string; discardTitle: string; discardBody: string; discardConfirm: string; keepEditing: string; rotateLeft: string; rotateRight: string; flipHorizontal: string; flipVertical: string; brightness: string; contrast: string; saturation: string; warmth: string; sharpen: string; aspectRatio: string; aspectFree: string; aspectOriginal: string; aspectSquare: string; aspectFourThree: string; aspectWide: string; width: string; height: string; applyCrop: string; removeCrop: string; cropArea: string; cropHelp: string; cropReadout: ({ x, y, width, height }: { x: string; y: string; width: string; height: string; }) => string; toolSelected: (tool: string) => string; resetTool: (tool: string) => string; nothingToReset: string; }> \| undefined` | See type | no | — | Replace any built-in words. |
| saveLabel | `string \| undefined` | See type | no | — | Words on the save button, such as "Save to listing". |
| title | `ReactNode` | See type | no | — | Shown in the title bar. |
| tools | `readonly ImageTool<any>[]` | See type | yes | — | The tools to offer, in order. Pass only what you need: unused tools stay out of the bundle. |
