# Filmstrip

A horizontally scrolling single-choice Glass UX toolbar, with arrow keys and named thumbnails.

`import { Filmstrip } from "glass-ux-image/panels/filmstrip"`

[Live examples](https://dastari.github.io/glass-ux-image/components/filmstrip)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultSelectedId | `string \| null \| undefined` | See type | no | — | Initially selected picture; otherwise the first. |
| labels | `Partial<{ workspace: string; library: string; file: string; edit: string; view: string; help: string; history: string; presets: string; layers: string; filmstrip: string; original: string; step: string; settings: string; develop: string; geometry: string; retouch: string; effects: string; files: string; docked: string; focus: string; compare: string; before: string; after: string; shortcuts: string; commands: string; nextRegion: string; previousRegion: string; unavailable: string; pan: string; open: string; save: string; export: string; copy: string; paste: string; recover: string; recovery: string; failed: string; autosave: string; noAutosave: string; templates: string; photo: string; custom: string; engine: string; singleSlider: string; avatar: string; product: string; social: string; annotator: string; developView: string; fullSuite: string; format: string; demo: string; resetLayout: string; showPane: (pane: string) => string; hidePane: (pane: string) => string; }> \| undefined` | See type | no | — | Localised words. |
| onSelectedIdChange | `((id: string, picture: OpenPicture) => void) \| undefined` | See type | no | — | Host switches to this picture's session. |
| pictures | `readonly OpenPicture[]` | See type | yes | — | Open pictures in host order. |
| selectedId | `string \| null \| undefined` | See type | no | — | Controlled selected picture. |
