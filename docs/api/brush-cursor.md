# BrushCursor

Two outlined rings show size and hardness; image coordinates remain left-to-right.

`import { BrushCursor } from "glass-ux-image/controls/brush-cursor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/brush-cursor)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| angle | `number \| undefined` | See type | no | 0 | Rotation in degrees. |
| className | `string \| undefined` | See type | no | — | Layout class. |
| hardness | `number \| undefined` | See type | no | .75 | Inner fully covered fraction, 0–1. |
| hidden | `boolean \| undefined` | false, true | no | false | Hide the rings until the cursor enters the picture. |
| radiusX | `number \| undefined` | See type | no | 16 | Horizontal radius in screen pixels. |
| radiusY | `number \| undefined` | See type | no | radiusX | Vertical radius in screen pixels. |
| ref | `Ref<SVGSVGElement> \| undefined` | See type | no | — | SVG reference for hosts updating cursor positions without rendering per pointer frame. |
| x | `number \| undefined` | See type | no | 0 | Screen x coordinate. |
| y | `number \| undefined` | See type | no | 0 | Screen y coordinate. |
