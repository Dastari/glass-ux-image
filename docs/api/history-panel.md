# HistoryPanel

Glass UX Tree supplies roving focus and arrow-key branch navigation; selection jumps via edit.goTo.

`import { HistoryPanel } from "glass-ux-image/panels/history"`

[Live examples](https://dastari.github.io/glass-ux-image/components/history-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| className | `string \| undefined` | See type | no | — | Layout class. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor, or the nearest provider. |
| labels | `Partial<{ workspace: string; library: string; file: string; edit: string; view: string; help: string; history: string; presets: string; layers: string; filmstrip: string; original: string; step: string; settings: string; develop: string; geometry: string; retouch: string; effects: string; files: string; docked: string; focus: string; compare: string; before: string; after: string; shortcuts: string; commands: string; nextRegion: string; previousRegion: string; unavailable: string; pan: string; open: string; save: string; export: string; copy: string; paste: string; recover: string; recovery: string; failed: string; autosave: string; noAutosave: string; templates: string; photo: string; custom: string; engine: string; singleSlider: string; avatar: string; product: string; social: string; annotator: string; developView: string; fullSuite: string; format: string; demo: string; resetLayout: string; showPane: (pane: string) => string; hidePane: (pane: string) => string; }> \| undefined` | See type | no | — | Host wording overrides. |
