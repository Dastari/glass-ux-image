# Host control

The host decides what Save means. onSave receives a lazy EditResult and a cancellation signal. Encoding starts only when the host calls toBlob. Progress reports delivery, not a guessed completion time.

## Save through the host

```tsx
import { PhotoEditor } from 'glass-ux-image/photo-editor';
import { crop } from 'glass-ux-image/tools/crop';
export function ControlledPhoto({src,deliver}: {src: Blob; deliver: (blob:Blob,signal:AbortSignal)=>Promise<void>}) {
  return <PhotoEditor src={src} tools={[crop]} onSave={async(result,{signal,setProgress})=>{
    const blob = await result.toBlob({type:'image/webp',quality:0.82,signal});
    setProgress(null);
    await deliver(blob,signal);
    setProgress(1);
  }} onAction={(action,next)=> action.id === 'edit.reset' ? undefined : next()}/>;
}
```

onAction can refuse, replace arguments or wrap any committed action. A drag preview bypasses it; the eventual commit does not. Use session.run for commands, preview for transient state, commit for a history entry, and revert to abandon a draft. Do not mutate state or recipes in place. History branches remain available through useImageHistory and HistoryPanel.

```tsx
import { useImageEditor, useSessionState } from 'glass-ux-image/react';
import { PhotoEditorView } from 'glass-ux-image/photo-editor';
import { basic } from 'glass-ux-image/kits/basic';
export function Host({src}: {src:Blob}) {
  const editor=useImageEditor({source:src,tools:basic,actions:[{id:'host.rotate',run:s=>s.run('image.rotateRight')}]});
  const state=useSessionState(editor);
  return <><button disabled={!state.canUndo} onClick={()=>editor.run('edit.undo')}>Undo</button>
    <PhotoEditorView editor={editor} tools={basic}/></>;
}
```

Recipes are serialisable geometry, filters, layers and strokes. Supply recipe to resume an edit and onChange to observe committed changes. onDirtyChange reports save state. Actions can replace or hide built-ins by id. ImageEditor commands are Glass UX action definitions for menus and the command palette. Its shortcuts map action ids to keys; null or an empty list disables a binding. They are scoped to the editor. View props expose controlled workspace and filmstrip selection; plain controls expose value/defaultValue pairs. Consult each API before choosing which state the host owns.

## Keyboard shortcuts

ImageEditor uses Photoshop's keys, from `PHOTOSHOP_TOOL_KEYS` and `PHOTOSHOP_COMMAND_KEYS` in `glass-ux-image/editor`. The keyboard shortcuts dialog (`?`) lists the keys in effect. Keys work only while focus is in the editor. `mod` means Ctrl, or Command on a Mac.

| Keys | Tool or command |
| --- | --- |
| V | Select (Photoshop's Move tool with Auto-Select), Move |
| C | Crop, Straighten, Perspective |
| R | Rotate |
| J | Spot healing, Healing brush, Patch, Red-eye removal |
| B | Brush, Colour replacement |
| E | Eraser |
| S | Clone stamp |
| O | Dodge, Burn, Sponge |
| T | Text |
| Shift with a tool letter | The next tool sharing that letter |
| mod+T | Transform (Free Transform) |
| mod+Alt+I, mod+Alt+C | Resize (Image Size), Canvas size |
| mod+Shift+A, mod+Shift+X | Develop (Camera Raw Filter), Liquify |
| F7 | Layers |
| mod+O, mod+Alt+Shift+W, mod+Alt+Shift+I | Open images, Export, Image information or Metadata |
| mod+Z, mod+Shift+Z | Undo, Redo |
| mod+C, mod+V, mod+S | Copy image, Paste image, Save copy |
| mod+J, mod+E, mod+Shift+E | Duplicate layer, Merge down, Merge visible |
| Alt+], Alt+[ | Select the layer above or below |
| Delete or Backspace, Escape | Delete the selected layer, Deselect (Select tool) |
| Arrow keys, Shift+arrow keys | Nudge the selected layer 1 or 10 pixels (Select tool) |
| [ and ], { and } (Shift+[ and Shift+]) | Brush size and brush hardness |
| mod+0, mod+1, mod+= (or mod+numpad +), mod+- | Fit, Actual size, Zoom in, Zoom out |
| Space (hold) | Pan |
| F | Focus or Docked |
| \ | Before and after |
| mod+K, ? or mod+Alt+Shift+K | Command palette, Keyboard shortcuts |
| F6, Shift+F6 | Next or previous region |

A tool letter picks the current tool in its group: the one in use, or the last one used there. Shift with the letter steps to the next tool in the group, as Photoshop does. Browsers keep Ctrl+T for a new tab. Free Transform's key works in an installed app or a desktop shell; in a browser tab, use the Select tool's handles or rebind the key.

`shortcuts` overrides any binding by action id: `{"tool.crop": "k", "edit.undo": ["mod+z", "alt+z"], "layers.duplicate": null}`. A tool rebound to another letter leaves its group. The Select tool reads `layers.delete` and `layers.deselect` from the same keymap.

### The Select tool

`select` (`glass-ux-image/tools/select`) leads the advanced kit and the rail. Click picks the topmost visible layer under the pointer, and a drag moves it. Shift constrains a drag to an axis or a diagonal, and Alt drags a copy. Corner handles scale (Shift keeps proportions, Alt scales from the centre). Edge handles scale one way, and a drag just outside a corner turns the layer (Shift snaps to 15°). A double-click on text opens it in the Text tool. Text scaled up is set again at the larger size, so it stays sharp. Every drag, nudge burst, deletion and copy is one undo step through a session action. With Auto-select off, a drag moves the selected layer wherever it starts; Ctrl or Command with a click still picks. The panel sets the layer's position, size and angle by number.

`move` (numeric positioning of a chosen layer) and `transform` (scale, rotate, skew or distort the base or a layer, with Enter to apply) stay as they were. Select is the direct way to work on layers; Move and Transform are the precise ways.
