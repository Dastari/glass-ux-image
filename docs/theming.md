# Theming with Glass UX tokens

Mount AppearanceProvider at the host root and import Glass UX and image styles once. Palette, mode, material, density, UI scale and motion are shared with the surrounding application. The image stage stays neutral so chrome does not add a colour cast.

## Choose appearance defaults

```tsx
import { AppearanceProvider, configureAppearance } from 'glass-ux/appearance';
import { BrushPicker } from 'glass-ux-image/controls/brush-picker';
configureAppearance({defaults:{palette:'graphite',mode:'dark'}});
export function BrushSettings() { return <AppearanceProvider><BrushPicker/></AppearanceProvider>; }
```

Use semantic roles such as --fg, --fg-muted, --accent-text, --canvas, --inset-panel and --gap-section. Surface and Panel own their geometry; do not add a second card around every panel. Use logical CSS for chrome and explicit image-space coordinates for overlays. Radius roles follow the control or surface, not a raw radius step.

Check both modes, compact density, Solid material, reduced motion and a narrow viewport. Check actual insets, focus outlines and scroll clipping. A selected palette swatch alone does not prove the computed colours changed. Keep image sample colours separate from theme tokens: those are pixel data, not interface colours.
