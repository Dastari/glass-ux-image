# HistogramPanel

Glass UX Histogram fed by readPreview, including uncommitted slider drafts.

`import { HistogramPanel } from "glass-ux-image/panels/histogram"`

[Live examples](https://dastari.github.io/glass-ux-image/components/histogram-panel)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| bins | `number \| undefined` | See type | no | 64 | Bin count, defaults to 64. |
| channel | `"red" \| "green" \| "blue" \| "luminance" \| undefined` | "red", "green", "blue", "luminance" | no | — | Controlled histogram channel. |
| className | `string \| undefined` | See type | no | — | Layout class. |
| defaultChannel | `"red" \| "green" \| "blue" \| "luminance" \| undefined` | "red", "green", "blue", "luminance" | no | 'luminance' | Starting channel when uncontrolled. |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| maxEdge | `number \| undefined` | See type | no | 192 | Preview maximum edge in pixels; defaults to 192. |
| onChannelChange | `((channel: "red" \| "green" \| "blue" \| "luminance") => void) \| undefined` | See type | no | — | Channel selection callback. |
