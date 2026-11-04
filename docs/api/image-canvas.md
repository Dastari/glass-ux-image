# ImageCanvas

The accelerated view of the nearest editor. It fills its parent. The picture sits on a neutral
stage in every theme and direction, so nothing around it changes how its colours read.

Inside a Glass UX `PaneLayout` with overlay placement, Fit places the picture in the area the
floating panes leave clear, read from `--pane-covered-*`. A host can set those four properties on
any ancestor to keep its own floating content clear. Panning and zooming use the whole stage.

`import { ImageCanvas } from "glass-ux-image/canvas"`

[Live examples](https://dastari.github.io/glass-ux-image/components/image-canvas)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| aria-label | `string \| undefined` | See type | no | — | Accessible picture or editing-area name. |
| backend | `"auto" \| import("../render/types.js").BackendKind \| undefined` | "auto", "webgl2", "cpu" | no | "auto" | Which backend to prefer. Defaults to the best available. |
| children | `ReactNode` | See type | no | — | Drawn over the picture. Elements marked `data-canvas-tool` take pointer drags from panning. |
| className | `string \| undefined` | See type | no | — | Classes applied to the outer element for layout. Use the component props and theme tokens for its appearance. |
| onDocumentPointer | `((pointer: CanvasPointer) => void) \| undefined` | See type | no | — | Pointer down, move, up and cancel samples in document pixels. |
