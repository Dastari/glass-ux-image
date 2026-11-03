# BasicPanel

Session binding over BasicAdjustments; committed changes use edit.apply.

`import { BasicPanel } from "glass-ux-image/tools/develop/basic"`

[Live examples](https://dastari.github.io/glass-ux-image/components/basic-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| controls | `readonly (keyof AdjustParams)[] \| undefined` | See type | no | — | Optional subset of controls. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit session or the nearest provider. |
