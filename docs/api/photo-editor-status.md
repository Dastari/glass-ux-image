# PhotoEditorStatus

Size and zoom, for the bottom bar or a window's own status slot.

`import { PhotoEditorStatus } from "glass-ux-image/photo-editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/photo-editor-status)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit session or the nearest provider. |
| labels | `Partial<{ canvasLabel: string; canvasHelp: string; opening: string; openFailed: string; tools: string; crop: string; rotate: string; adjust: string; undo: string; noUndo: string; noRedo: string; redo: string; reset: string; zoomIn: string; zoomOut: string; fit: string; actualSize: string; zoomPercent: (percent: string) => string; size: ({ width, height }: { width: string; height: string; }) => string; cancel: string; close: string; save: string; saving: string; saved: string; saveFailed: string; discardTitle: string; discardBody: string; discardConfirm: string; keepEditing: string; rotateLeft: string; rotateRight: string; flipHorizontal: string; flipVertical: string; brightness: string; contrast: string; saturation: string; warmth: string; sharpen: string; aspectRatio: string; aspectFree: string; aspectOriginal: string; aspectSquare: string; aspectFourThree: string; aspectWide: string; width: string; height: string; applyCrop: string; removeCrop: string; cropArea: string; cropHelp: string; cropReadout: ({ x, y, width, height }: { x: string; y: string; width: string; height: string; }) => string; toolSelected: (tool: string) => string; resetTool: (tool: string) => string; nothingToReset: string; }> \| undefined` | See type | no | — | Localised wording overrides. |
