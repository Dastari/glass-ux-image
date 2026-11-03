# DevelopCompare

Glass UX's keyboard-operable comparison; both sides share the current geometry.

`import { DevelopCompare } from "glass-ux-image/tools/develop"`

[Live examples](https://dastari.github.io/glass-ux-image/components/develop-compare)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultValue | `number \| undefined` | See type | no | — | Initial uncontrolled divider percentage. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| maxEdge | `number \| undefined` | See type | no | 512 | Preview edge in pixels; defaults to 512. |
| onValueChange | `((value: number) => void) \| undefined` | See type | no | — | Divider change callback. |
| value | `number \| undefined` | See type | no | — | Divider percentage when controlled. |
