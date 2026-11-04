# SessionLayersPanel

Image import, masks and baking use public session actions; the view itself remains reusable.

`import { SessionLayersPanel } from "glass-ux-image/panels/layers"`

[Live examples](https://dastari.github.io/glass-ux-image/components/session-layers-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| kindIcons | `Readonly<Record<string, ReactNode>> \| undefined` | See type | no | — | Icons for host-registered layer kinds. |
| session | `EditorSession \| undefined` | See type | no | — | Explicit session, or the nearest provider. |
