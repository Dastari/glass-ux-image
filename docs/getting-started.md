# Getting started

Use React and Glass UX as peers. Import each part from its public entry. Mount the shared appearance, tooltip, action and command palette providers once in the host. Import both stylesheets at the application entry.

## Mount the editor

```tsx
import 'glass-ux/styles.css';
import 'glass-ux-image/styles.css';
import { AppearanceProvider } from 'glass-ux/appearance';
import { TooltipProvider } from 'glass-ux/tooltip';
import { ActionProvider } from 'glass-ux/actions';
import { PaletteProvider } from 'glass-ux/command-palette';
import { PhotoEditor } from 'glass-ux-image/photo-editor';
import { basic } from 'glass-ux-image/kits/basic';
export function Photo({src}: {src: Blob}) {
  return <AppearanceProvider><TooltipProvider><ActionProvider><PaletteProvider>
    <PhotoEditor src={src} tools={basic}/>
  </PaletteProvider></ActionProvider></TooltipProvider></AppearanceProvider>;
}
```

Give the editor a bounded height. A source can be a Blob, URL or TileSource. URL fetching uses the host's CORS policy. There is no Save button until the host supplies onSave. Try the catalogue before choosing a larger composition. See [choosing a level](choosing-a-level.md) and [host control](host-control.md).
