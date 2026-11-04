# glass-ux-image 0.2.0

The owner's review of the 0.1.0 workspace, built on [Glass UX](https://github.com/Dastari/glass-ux) 0.16.

```sh
pnpm add https://github.com/Dastari/glass-ux/releases/download/v0.16.0/glass-ux-0.16.0.tgz
pnpm add https://github.com/Dastari/glass-ux-image/releases/download/v0.2.0/glass-ux-image-0.2.0.tgz
```

Documentation and the full editor: https://dastari.github.io/glass-ux-image/

## New

- **Select tool** (V): Photoshop's Move with Auto-Select, first in the rail. Click to pick a text or image layer,
  drag to move (Shift locks an axis, Alt drags a copy), handles to scale (Shift keeps proportions), outside a corner
  to rotate, arrows to nudge, Delete to remove, Escape to deselect, double-click to edit text.
- **Photoshop shortcuts** throughout, with Shift+letter cycling the tools that share a key. Every binding can be
  overridden by the host. Plain letters type normally in text fields.
- **Image information** (the i button): file, camera, exposure, lens, dates, location, rights and every EXIF,
  XMP and IPTC field, editable and removable as undoable steps, written on export when metadata is kept.
- **Transparency grid** under the picture's transparent pixels; the stage around it stays neutral grey.
- **Workspace:** the histogram and tool rail stay put while settings scroll; History opens from a button beside
  Undo and Redo; the View menu shows and hides each pane, resets the layout and zooms; a Layer menu; icons on
  menu rows.
- **Effects and looks rebuilt** so each does what its name says: sizes scale with the picture, tonal maths is
  perceptual, the artistic filters are new, and Warm film, Silver screen and Soft cinema are built on a new colour
  grade filter.

## Fixed

- The effects galleries no longer leave a gap below their last row.
- Undo straight after nudging or turning with the keys removes that step, not the one before it.
- Reset also clears metadata edits.

## Assets

- `glass-ux-image-0.2.0.tgz`: the package.
- `glass-ux-image-docs.tar.gz`: the documentation site, as published on GitHub Pages.
- `SHA256SUMS`: checksums for both.

Known limits are listed in `PROPOSAL.md` under "0.2.0".
