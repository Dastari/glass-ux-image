# ToolRail

One single-choice toolbar; large kits group by public tool family. A tool marked `standalone`
keeps its own button after its family's flyout.

`import { ToolRail } from "glass-ux-image/editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/tool-rail)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| onToolSelect | `((id: string) => void) \| undefined` | See type | no | — | Optional shared command runner; otherwise selection uses the session action. |
| reset | `boolean \| undefined` | false, true | no | true | Show a Reset button at the end that removes the chosen tool's edits as one undo step. Default true. |
| toolLabels | `Readonly<Record<string, string>> \| undefined` | See type | no | {} | Resolved labels, for sharing with a host's action set. |
| tools | `readonly ImageTool<any>[]` | See type | yes | — | Only these tools are offered. |
