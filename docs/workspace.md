# Workspace layout and slots

ImageEditorView arranges public parts with Glass UX PaneLayout. Docked is the default. Focus floats panes over the stage. Workspace state is serialisable view data; it does not belong in a recipe. Keep the stage neutral and image coordinates left-to-right.

## Control the layout

```tsx
import { useState } from 'react';
import { ImageEditor, createImageWorkspace } from 'glass-ux-image/editor';
import { standard } from 'glass-ux-image/kits/standard';
export function Workspace({src}: {src:Blob}) {
  const [workspace,setWorkspace]=useState(createImageWorkspace);
  return <ImageEditor src={src} tools={standard} workspace={workspace} onWorkspaceChange={setWorkspace}
    slots={{bottom:null,status:<span>Local session</span>}}/>;
}
```

Slots replace top, left, right, stage, overlay, settings, histogram, tools, bottom and status. undefined keeps the built-in region; null empties it. Use ImageCanvas and session-bound panels under ImageEditorProvider when making a layout from scratch. PhotoEditorView can hide header/footer so a Glass UX window supplies its own app bar and actions. The product-photo template demonstrates this composition.

The host owns pictures and selectedPictureId in the filmstrip. Switching a picture must keep the other sessions alive; dispose them only when closed. Pane layout changes go through onWorkspaceChange. Store them only when the host chooses to.
