# LayersPanel

Glass UX tree with drag reorder, Alt+Arrow reorder, F2 rename and row action menus.

`import { LayersPanel } from "glass-ux-image/panels/layers"`

[Live examples](https://dastari.github.io/glass-ux-image/components/layers-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| busy | `boolean \| undefined` | false, true | no | — | Disable asynchronous conflicting edits while baking or importing. |
| defaultSelectedId | `string \| null \| undefined` | See type | no | — | Initial selection for uncontrolled use. |
| error | `string \| null \| undefined` | See type | no | — | Reports an operational error to the host. |
| kindIcons | `Readonly<Record<string, ReactNode>> \| undefined` | See type | no | — | Icons for host-registered layer kinds. |
| layers | `readonly LayerSpec[]` | See type | yes | — | Plain layer values in compositing order. |
| onAddImage | `(() => void) \| undefined` | See type | no | — | Host opens a file chooser; absent hides the action. |
| onFlatten | `(() => void) \| undefined` | See type | no | — | Bake the visible picture to a single base with no editable layers. Absent hides the action. |
| onLayersChange | `(layers: readonly LayerSpec[], label: string) => void` | See type | yes | — | Reports a complete list and a translated history label. |
| onMergeDown | `((id: string) => void) \| undefined` | See type | no | — | Bake the selected layer with the one below. Absent hides the action. |
| onPasteImage | `(() => void) \| undefined` | See type | no | — | Host reads its clipboard; absent hides the action. |
| onSelectedIdChange | `((id: string \| null) => void) \| undefined` | See type | no | — | Reports selection without changing the layer data. |
| selectedId | `string \| null \| undefined` | See type | no | — | Controlled selection, or undefined for local selection. |
