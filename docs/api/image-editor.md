# ImageEditor

Own a session for one source, or use ImageEditorView for a host-owned collection.

`import { ImageEditor } from "glass-ux-image/editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/image-editor)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| actions | `readonly ActionOverride[] \| undefined` | See type | no | — | Host action overrides; matching ids replace or hide built-ins. |
| assets | `AssetStore \| undefined` | See type | no | — | Host-owned decoded assets, shared with project adapters. |
| backend | `"auto" \| import("../render/types.js").BackendKind \| undefined` | "auto", "webgl2", "cpu" | no | — | Force a renderer; auto chooses the available backend. |
| canvasLabel | `string \| undefined` | See type | no | — | Accessible picture name. |
| className | `string \| undefined` | See type | no | — | Extra layout class. |
| collapseBelow | ``${number}rem` \| undefined` | See type | no | — | Width below which panes use the shared sheet-and-strip layout. Defaults to 64rem. |
| commands | `readonly ActionDefinition<EditorSession>[] \| undefined` | See type | no | — | Host-supplied command definitions; matching ids replace built-ins. |
| defaultWorkspace | `ImageWorkspace \| undefined` | See type | no | — | Uncontrolled initial workspace. |
| filters | `readonly (Filter<any> \| Warp<any>)[] \| undefined` | See type | no | — | Filters beyond those the tools bring, in the order they apply. |
| labels | `Partial<{ workspace: string; library: string; file: string; edit: string; view: string; help: string; history: string; presets: string; layers: string; filmstrip: string; original: string; step: string; settings: string; develop: string; geometry: string; retouch: string; effects: string; files: string; docked: string; focus: string; compare: string; before: string; after: string; shortcuts: string; commands: string; nextRegion: string; previousRegion: string; unavailable: string; pan: string; open: string; save: string; export: string; copy: string; paste: string; recover: string; recovery: string; failed: string; autosave: string; noAutosave: string; templates: string; photo: string; custom: string; engine: string; singleSlider: string; avatar: string; product: string; social: string; annotator: string; developView: string; fullSuite: string; format: string; demo: string; resetLayout: string; showPane: (pane: string) => string; hidePane: (pane: string) => string; }> \| undefined` | See type | no | — | Localised words. |
| layerKinds | `readonly LayerKind[] \| undefined` | See type | no | — | Opt-in source providers for recipe layer kinds. |
| onAction | `((action: ActionRequest, next: (args?: unknown) => unknown) => unknown) \| undefined` | See type | no | — | Runs for every action. Call `next` to let it go ahead, or don't to stop it. |
| onCancel | `(() => void) \| undefined` | See type | no | — | Called when the host cancellation action runs. |
| onChange | `((recipe: EditRecipe) => void) \| undefined` | See type | no | — | Called with each committed change. |
| onDirtyChange | `((dirty: boolean) => void) \| undefined` | See type | no | — | Reports whether committed edits differ from the last saved state. |
| onError | `((error: unknown) => void) \| undefined` | See type | no | — | Reports operational loading, rendering or delivery failures to the host. |
| onExport | `((blob: Blob, context: SaveContext) => unknown) \| undefined` | See type | no | — | Explicit export delivery. The host decides whether to download, upload or persist it. |
| onSave | `((result: EditResult, context: SaveContext) => unknown) \| undefined` | See type | no | — | Receive the lazy edited result and cancellable delivery context. No storage occurs without this callback. |
| onSelectedPictureIdChange | `((id: string, picture: OpenPicture) => void) \| undefined` | See type | no | — | Reports a filmstrip choice. Host switches editor without disposing other sessions. |
| onWorkspaceChange | `((workspace: ImageWorkspace) => void) \| undefined` | See type | no | — | Completed layout and mode changes; the host may store this value. |
| open | `Pick<OpenImageOptions, "worker"> \| undefined` | See type | no | — | Controls whether the overlay is open. |
| pictures | `readonly OpenPicture[] \| undefined` | See type | no | — | Host-managed open sessions. |
| presets | `readonly ImagePreset[] \| undefined` | See type | no | — | Optional host presets. Rendering parts must belong to the supplied tools. |
| recipe | `EditRecipe \| undefined` | See type | no | — | An earlier edit to continue from. |
| selectedPictureId | `string \| null \| undefined` | See type | no | — | Current filmstrip picture. |
| shortcuts | `Readonly<Record<string, string \| readonly string[] \| null>> \| undefined` | See type | no | — | Key overrides by action id (for example edit.undo or tool.crop); [] disables a binding. |
| slots | `ImageEditorSlots \| undefined` | See type | no | — | Replacement regions. null intentionally empties a region. |
| src | `import("../io/open-image.js").ImageInput` | See type | yes | — | Picture URL, blob or tile source. A new source starts a new session. |
| stages | `readonly SourceStage[] \| undefined` | See type | no | — | Opt-in source stages that replay before geometry and filters. |
| title | `ReactNode` | See type | no | — | Current picture name. |
| tools | `readonly ImageTool<any>[]` | See type | yes | — | Only these tools, sections and layer panels appear. |
| workspace | `ImageWorkspace \| undefined` | See type | no | — | Controlled workspace; nothing is persisted internally. |
