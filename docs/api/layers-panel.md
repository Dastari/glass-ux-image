# LayersPanel

Glass UX tree with thumbnails, drag reorder, Alt+Arrow reorder, F2 rename, row menus and masks.

`import { LayersPanel } from "glass-ux-image/panels/layers"`

[Live examples](https://dastari.github.io/glass-ux-image/components/layers-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| busy | `boolean \| undefined` | false, true | no | — | Disable asynchronous conflicting edits while baking or importing. |
| canMask | `((layer: LayerSpec) => boolean) \| undefined` | See type | no | — | Which layers can take a mask. Default: image layers. |
| defaultSelectedId | `string \| null \| undefined` | See type | no | — | Initial selection for uncontrolled use. |
| error | `string \| null \| undefined` | See type | no | — | Reports an operational error to the host. |
| kindIcons | `Readonly<Record<string, ReactNode>> \| undefined` | See type | no | — | Icons for host-registered layer kinds. |
| layers | `readonly LayerSpec[]` | See type | yes | — | Plain layer values in compositing order. |
| onAddImage | `(() => void) \| undefined` | See type | no | — | Host opens a file chooser; absent hides the action. |
| onAddMask | `((id: string, fill: LayerMask["fill"]) => void) \| undefined` | See type | no | — | Add a mask. Absent adds it through `onLayersChange`. |
| onApplyMask | `((id: string) => void) \| undefined` | See type | no | — | Bake a mask into its layer's pixels. Absent hides the action. |
| onDeleteMask | `((id: string) => void) \| undefined` | See type | no | — | Delete a mask with its strokes. Absent removes it through `onLayersChange`. |
| onDuplicate | `((id: string) => void) \| undefined` | See type | no | — | Copy a layer with what belongs to it, such as its strokes. Absent copies the layer alone. |
| onFlatten | `(() => void) \| undefined` | See type | no | — | Bake the visible picture to a single base with no editable layers. Absent hides the action. |
| onLayersChange | `(layers: readonly LayerSpec[], label: string) => void` | See type | yes | — | Reports a complete list and a translated history label. |
| onMaskEnabledChange | `((id: string, enabled: boolean) => void) \| undefined` | See type | no | — | Turn a mask on or off. Absent changes it through `onLayersChange`. |
| onMergeDown | `((id: string) => void) \| undefined` | See type | no | — | Bake the selected layer with the one below. Absent hides the action. |
| onPaintTargetChange | `((target: LayerPaintTarget) => void) \| undefined` | See type | no | — | Reports a new paint target, from the choice or a click on a thumbnail. |
| onPasteImage | `(() => void) \| undefined` | See type | no | — | Host reads its clipboard; absent hides the action. |
| onRemove | `((id: string) => void) \| undefined` | See type | no | — | Delete a layer with what belongs to it. Absent removes the layer alone. |
| onSelectedIdChange | `((id: string \| null) => void) \| undefined` | See type | no | — | Reports selection without changing the layer data. |
| paintTarget | `LayerPaintTarget \| undefined` | "pixels", "mask" | no | — | Whether the selected layer's pixels or mask take strokes. Absent hides the choice. |
| renderThumbnail | `((layer: LayerSpec, part: LayerPaintTarget) => ReactNode) \| undefined` | See type | no | — | Draw a layer's or its mask's thumbnail. Absent shows the kind's icon and a mask glyph. |
| selectedId | `string \| null \| undefined` | See type | no | — | Controlled selection, or undefined for local selection. |
