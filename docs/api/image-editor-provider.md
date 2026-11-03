# ImageEditorProvider

Provide an existing host-owned session to descendant editor parts; does not create or dispose it.

`import { ImageEditorProvider } from "glass-ux-image/react"`

[Live examples](https://dastari.github.io/glass-ux-image/components/image-editor-provider)

## Props

| Prop | Type | Valid options | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| children | `ReactNode` | See type | no | — | Parts reading the provided session. |
| editor | `EditorSession` | See type | yes | — | Existing session whose lifetime belongs to the host. |
