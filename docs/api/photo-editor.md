# PhotoEditor

A window-sized photo editor. It fills its parent, so a dialog, a window or a page section sets its
size. It saves nothing by itself: `onSave` receives the result and the host stores it.

`import { PhotoEditor } from "glass-ux-image/photo-editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/photo-editor)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| actions | `readonly ActionOverride[] \| undefined` | See type | no | — | Host action overrides; matching ids replace or hide built-ins. |
| assets | `AssetStore \| undefined` | See type | no | — | Host-owned decoded assets, shared with project adapters. |
| backend | `"auto" \| import("../render/types.js").BackendKind \| undefined` | "auto", "webgl2", "cpu" | no | — | Force a rendering backend. By default the best available is used. |
| canvasLabel | `string \| undefined` | See type | no | — | An `aria-label` for the canvas. |
| className | `string \| undefined` | See type | no | — | Classes applied to the outer element for layout. Use the component props and theme tokens for its appearance. |
| filters | `readonly (Filter<any> \| Warp<any>)[] \| undefined` | See type | no | — | Filters beyond those the tools bring, in the order they apply. |
| footer | `boolean \| undefined` | false, true | no | — | Draw the bottom bar. Turn it off to place `PhotoEditorStatus` elsewhere. |
| header | `boolean \| undefined` | false, true | no | — | Draw the title bar. Turn it off when a window or dialog supplies one. |
| labels | `Partial<{ canvasLabel: string; canvasHelp: string; opening: string; openFailed: string; tools: string; crop: string; rotate: string; adjust: string; undo: string; noUndo: string; noRedo: string; redo: string; reset: string; zoomIn: string; zoomOut: string; fit: string; actualSize: string; zoomPercent: (percent: string) => string; size: ({ width, height }: { width: string; height: string; }) => string; cancel: string; close: string; save: string; saving: string; saved: string; saveFailed: string; discardTitle: string; discardBody: string; discardConfirm: string; keepEditing: string; rotateLeft: string; rotateRight: string; flipHorizontal: string; flipVertical: string; brightness: string; contrast: string; saturation: string; warmth: string; sharpen: string; aspectRatio: string; aspectFree: string; aspectOriginal: string; aspectSquare: string; aspectFourThree: string; aspectWide: string; width: string; height: string; applyCrop: string; removeCrop: string; cropArea: string; cropHelp: string; cropReadout: ({ x, y, width, height }: { x: string; y: string; width: string; height: string; }) => string; toolSelected: (tool: string) => string; resetTool: (tool: string) => string; nothingToReset: string; }> \| undefined` | See type | no | — | Replace any built-in words. |
| layerKinds | `readonly LayerKind[] \| undefined` | See type | no | — | Opt-in source providers for recipe layer kinds. |
| onAction | `((action: ActionRequest, next: (args?: unknown) => unknown) => unknown) \| undefined` | See type | no | — | Runs for every action. Call `next` to let it go ahead, or don't to stop it. |
| onCancel | `(() => void) \| undefined` | See type | no | — | Called when the host cancellation action runs. |
| onChange | `((recipe: EditRecipe) => void) \| undefined` | See type | no | — | Called with each committed change. |
| onDirtyChange | `((dirty: boolean) => void) \| undefined` | See type | no | — | Reports whether committed edits differ from the last saved state. |
| onError | `((error: unknown) => void) \| undefined` | See type | no | — | Reports operational loading, rendering or delivery failures to the host. |
| onExport | `((blob: Blob, context: SaveContext) => unknown) \| undefined` | See type | no | — | Explicit export delivery. The host decides whether to download, upload or persist it. |
| onSave | `((result: EditResult, context: SaveContext) => unknown) \| undefined` | See type | no | — | Receive the lazy edited result and cancellable delivery context. No storage occurs without this callback. |
| open | `Pick<OpenImageOptions, "worker"> \| undefined` | See type | no | — | Controls whether the overlay is open. |
| recipe | `EditRecipe \| undefined` | See type | no | — | An earlier edit to continue from. |
| saveLabel | `string \| undefined` | See type | no | — | Words on the save button, such as "Save to listing". |
| src | `import("../io/open-image.js").ImageInput` | See type | yes | — | The picture: a file, blob, URL or tile source. |
| stages | `readonly SourceStage[] \| undefined` | See type | no | — | Opt-in source stages that replay before geometry and filters. |
| title | `ReactNode` | See type | no | — | Shown in the title bar. |
| tools | `readonly ImageTool<any>[]` | See type | yes | — | The tools to offer, in order. Pass only what you need: unused tools stay out of the bundle. |
