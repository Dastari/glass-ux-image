# SessionPresetsPanel

Choosing a preset starts again: it runs `edit.restart`, so the preset applies to the picture as
it was opened, earlier steps leave the history, and Undo returns to the original. A host can
refuse or replace that action through `onAction`.

`import { SessionPresetsPanel } from "glass-ux-image/panels/presets"`

[Live examples](https://dastari.github.io/glass-ux-image/components/session-presets-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| defaultSelectedId | `string \| null \| undefined` | See type | no | — | Initial selected preset. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor, or the nearest provider. |
| labels | `Partial<{ workspace: string; library: string; file: string; edit: string; view: string; help: string; history: string; presets: string; layers: string; filmstrip: string; original: string; step: string; settings: string; develop: string; geometry: string; retouch: string; effects: string; files: string; docked: string; focus: string; compare: string; before: string; after: string; shortcuts: string; commands: string; nextRegion: string; previousRegion: string; unavailable: string; pan: string; open: string; save: string; export: string; copy: string; paste: string; recover: string; recovery: string; failed: string; autosave: string; noAutosave: string; templates: string; photo: string; custom: string; engine: string; singleSlider: string; avatar: string; product: string; social: string; annotator: string; developView: string; fullSuite: string; format: string; demo: string; }> \| undefined` | See type | no | — | Localised words. |
| onSelectedIdChange | `((id: string, preset: ImagePreset) => void) \| undefined` | See type | no | — | Receives a choice; this plain panel does not edit a picture. |
| presets | `readonly ImagePreset[]` | See type | yes | — | Presets whose rendering parts the host has registered. |
| selectedId | `string \| null \| undefined` | See type | no | — | Controlled selected preset. |
