# ImageEditorView

A full workspace made from public parts; no persistence or file transport is implicit.

`import { ImageEditorView } from "glass-ux-image/editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/image-editor-view)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| backend | `"auto" \| import("../render/types.js").BackendKind \| undefined` | "auto", "webgl2", "cpu" | no | — | Force a renderer; auto chooses the available backend. |
| canvasLabel | `string \| undefined` | See type | no | — | Accessible picture name. |
| className | `string \| undefined` | See type | no | — | Extra layout class. |
| collapseBelow | ``${number}rem` \| undefined` | See type | no | — | Width below which panes use the shared sheet-and-strip layout. Defaults to 64rem. |
| commands | `readonly ActionDefinition<EditorSession>[] \| undefined` | See type | no | — | Host-supplied command definitions; matching ids replace built-ins. |
| defaultWorkspace | `ImageWorkspace \| undefined` | See type | no | — | Uncontrolled initial workspace. |
| editor | `EditorSession` | See type | yes | — | Host owns this session and its lifetime. |
| labels | `Partial<{ workspace: string; library: string; file: string; edit: string; view: string; help: string; history: string; presets: string; layers: string; filmstrip: string; original: string; step: string; settings: string; develop: string; geometry: string; retouch: string; effects: string; files: string; docked: string; focus: string; compare: string; before: string; after: string; shortcuts: string; commands: string; nextRegion: string; previousRegion: string; unavailable: string; pan: string; open: string; save: string; export: string; copy: string; paste: string; recover: string; recovery: string; failed: string; autosave: string; noAutosave: string; templates: string; photo: string; custom: string; engine: string; singleSlider: string; avatar: string; product: string; social: string; annotator: string; developView: string; fullSuite: string; format: string; demo: string; }> \| undefined` | See type | no | — | Localised words. |
| onSelectedPictureIdChange | `((id: string, picture: OpenPicture) => void) \| undefined` | See type | no | — | Reports a filmstrip choice. Host switches editor without disposing other sessions. |
| onWorkspaceChange | `((workspace: ImageWorkspace) => void) \| undefined` | See type | no | — | Completed layout and mode changes; the host may store this value. |
| pictures | `readonly OpenPicture[] \| undefined` | See type | no | — | Host-managed open sessions. |
| presets | `readonly ImagePreset[] \| undefined` | See type | no | — | Optional host presets. Rendering parts must belong to the supplied tools. |
| selectedPictureId | `string \| null \| undefined` | See type | no | — | Current filmstrip picture. |
| shortcuts | `Readonly<Record<string, string \| readonly string[] \| null>> \| undefined` | See type | no | — | Key overrides by action id (for example edit.undo or tool.crop); [] disables a binding. |
| slots | `ImageEditorSlots \| undefined` | See type | no | — | Replacement regions. null intentionally empties a region. |
| title | `ReactNode` | See type | no | — | Current picture name. |
| tools | `readonly ImageTool<any>[]` | See type | yes | — | Only these tools, sections and layer panels appear. |
| workspace | `ImageWorkspace \| undefined` | See type | no | — | Controlled workspace; nothing is persisted internally. |
