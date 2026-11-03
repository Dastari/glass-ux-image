# AnchorPicker

Nine-position image-space anchor picker, with roving arrow-key focus.

`import { AnchorPicker } from "glass-ux-image/tools/canvas-size"`

[Live examples](https://dastari.github.io/glass-ux-image/components/anchor-picker)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| defaultValue | `CanvasAnchor \| undefined` | 0, 3, 2, 1, 4, 5, 6, 7, 8 | no | 4 | Starting cell when uncontrolled. Defaults to the centre. |
| onValueChange | `((value: CanvasAnchor) => void) \| undefined` | See type | no | — | Receives a selected cell, from top left (0) through bottom right (8). |
| value | `CanvasAnchor \| undefined` | 0, 3, 2, 1, 4, 5, 6, 7, 8 | no | — | Selected cell in image space; pair with onValueChange to control it. |
