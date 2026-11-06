# ToolRail

One single-choice toolbar; large kits group by public tool family. A tool marked `standalone`
keeps its own button after its family's flyout, except a standalone first tool, which leads the
rail on its own as Photoshop's Move tool does.

`import { ToolRail } from "glass-ux-image/editor"`

[Live examples](https://dastari.github.io/glass-ux-image/components/tool-rail)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| editor | `EditorSession \| undefined` | See type | no | — | Explicit editor or nearest provider. |
| layout | `"fold" \| "wrap" \| undefined` | "fold", "wrap" | no | 'fold' | What happens when the tools do not fit one row. `fold` (default) folds them into the toolbar's More menu; `wrap` keeps every tool in sight on further rows, with Reset at the end of the first. Since Glass UX 0.18 a choice group folds one tool at a time, so `fold` suits a narrow column too. |
| onToolSelect | `((id: string) => void) \| undefined` | See type | no | — | Optional shared command runner; otherwise selection uses the session action. |
| reset | `boolean \| undefined` | false, true | no | true | Show a Reset button at the end that removes the chosen tool's edits as one undo step. Default true. |
| toolLabels | `Readonly<Record<string, string>> \| undefined` | See type | no | {} | Resolved labels, for sharing with a host's action set. |
| tools | `readonly ImageTool<any>[]` | See type | yes | — | Only these tools are offered. |
