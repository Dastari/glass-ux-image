# TextPanel

Font controls use document pixels. A zero wrap width means no automatic wrapping.

`import { TextPanel } from "glass-ux-image/tools/text"`

[Live examples](https://dastari.github.io/glass-ux-image/components/text-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| onValueChange | `(value: TextSpec, label: string) => void` | See type | yes | — | Reports a complete spec and a translated history label. |
| value | `TextSpec` | See type | yes | — | Complete controlled text specification. |
