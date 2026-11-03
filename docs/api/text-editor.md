# TextEditor

Native text composition remains intact for IMEs; newline inserts a line, Escape cancels.

`import { TextEditor } from "glass-ux-image/tools/text"`

[Live examples](https://dastari.github.io/glass-ux-image/components/text-editor)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| onCancel | `() => void` | See type | yes | — | Cancels on Escape or the cancel button. |
| onCommit | `(value: TextSpec) => void` | See type | yes | — | Commits on blur, Ctrl/Command+Enter, or the finish button. |
| onPreview | `((value: TextSpec) => void) \| undefined` | See type | no | — | Reports draft input; the session wrapper uses this only for transient previews. |
| style | `CSSProperties \| undefined` | See type | no | — | CSS placement in the containing stage. Image coordinates do not mirror. |
| value | `TextSpec` | See type | yes | — | Text spec at the beginning of this edit. Remount with a new key to edit a different layer. |
