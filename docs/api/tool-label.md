# ToolLabel

Public presentation bridge, useful to hosts building action labels from tool descriptors.

`import { ToolLabel } from "glass-ux-image/editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/tool-label)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| onLabel | `(id: string, label: string) => void` | See type | yes | — | Reports localised name changes. |
| tool | `ImageTool<any>` | See type | yes | — | Tool whose public panels should be shown. |
