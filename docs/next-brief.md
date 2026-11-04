# 0.2.0 brief: owner feedback on the workspace

Working brief, 2026-11-04. 0.1.0 is released; the owner reviewed the workspace and asked for the items below.
Four agents share this checkout. Each workstream owns its files; read the whole brief before starting.

The rules in `docs/gaps-brief.md` ("Rules for every agent") still apply in full: no commits, no `pnpm build`,
`check`, `dev`, `test:e2e` or `docs:build` (they replace `dist`), targeted edits to shared files, all 11 languages
for new words, Glass UX components first, accessible names and keyboard paths, Australian spelling, session
actions for committed changes, no raised tolerances or timing limits. Use `pnpm e2e:own <port> e2e/<spec>.ts`
after `export LD_LIBRARY_PATH=$HOME/.cache/glass-ux-browser-libs/root/usr/lib/x86_64-linux-gnu`. Frame-time
limits go through `expectTiming` (`e2e/fixtures/speed.ts`).

The owner judges the result by eye against Glass UX's own docs site and Lightroom and Photoshop. Screenshot your
work in light, dark and RTL (`?dir=rtl`) at 1440 and 1100 wide, look critically, and fix what falls short before
reporting. Put screenshots under `/tmp/gi-<workstream>/`.

## Owner's items

1. The histogram and the tool rail always stay visible at the top of the right column; the tool settings below
   them scroll.
2. A Select tool, first in the rail, for things the user creates and adds (text, image layers): click to select
   what is under the pointer, drag to move, handles to resize and rotate, arrow keys to nudge, Delete to remove,
   Escape to deselect. Every shortcut maps to Photoshop's.
3. Undo history is not always visible: it moves out of the Library column to somewhere it can be opened.
4. An Image information panel, on an i button in the tool rail: everything about the image, including file type,
   file size, dimensions, bit depth, colour profile, resolution, orientation and full EXIF, with EXIF fields
   editable and removable.
5. The effects galleries leave a large empty gap below their last row.
6. Most presets and looks are poor: check what each one does against what its name promises, and fix them.
7. Icons for every tool, from Glass UX (requested; not yet available). Use the current icons on menu items now.
8. A closed pane (Library, Develop, Open pictures) can only come back by reloading. The View menu shows and hides
   each pane, and resets the layout.
9. The stage stays a solid neutral grey. Transparent pixels inside the picture's bounds show a transparency grid,
   as Photoshop draws under the document.

## Workstreams

### W1. Workspace chrome (Claude) — port 4371

Items 1, 3, 5, 7 (menu icons with the current stand-ins), 8 and 9.

- Right column: histogram and rail fixed, settings scroll beneath, at every width; the narrow (sheet) layout too.
- History: a History button beside Undo and Redo in the title bar opening a popover or side sheet with the
  branching tree, and View > History. It leaves the Library column. Keep `HistoryPanel` public and standalone.
- View menu: show or hide Library, Develop and Open pictures (checkbox items), Reset layout, through PaneLayout's
  public functions (`openPanel`, `revealPanel`, `closePanel`). Hosts' own layouts still work.
- Menu items carry the tool's icon.
- Gallery gap: find the cause (a reserved, hidden status row is a likely one) and fix it in the gallery.
- Transparency grid in `ImageCanvas`, under the picture's bounds only, aligned to the picture at every zoom,
  pan, rotation and in Focus; a neutral grid that reads in both modes.
- Owns: `src/editor/**` (W2 edits only the shortcut table there), `src/canvas/**`, `src/panels/history.tsx`,
  `src/panels/filter-gallery.tsx` (layout only; W4 owns what thumbnails show), `src/styles/workspace.css`,
  `src/messages/workspace.ts` and its packs.

### W2. Select tool and Photoshop shortcuts (Claude) — port 4372

Item 2.

- A `select` tool (Photoshop's Move tool with auto-select, `V`), first in the kits that have layers and in the
  demo: hit-testing layers in z-order under the pointer, a selection outline and handles drawn in picture space
  (consistent with the rotate tool's overlay), drag to move, corner handles to scale (Shift keeps aspect),
  rotate outside a corner, arrow keys to nudge (Shift ten pixels), Delete to remove, Escape to deselect,
  double-click on text to edit it. Each committed change is one undo step through a session action. Decide how it
  relates to the existing `move` and `transform` tools and say so.
- Shortcuts: map every tool and command to Photoshop's where Photoshop has one (V move, C crop, B brush, E eraser,
  S clone stamp, J healing, O dodge/burn/sponge, T text, I eyedropper if built, H hand, Z zoom, Ctrl+T free
  transform, Ctrl+J duplicate layer, Ctrl+E merge down, Ctrl+Shift+E merge visible, [ and ] brush size, Ctrl+0
  fit, Ctrl+1 actual size, Ctrl+plus/minus zoom, Space pan, Ctrl+Z, Ctrl+Shift+Z, Delete, and so on). Shift with a
  tool key cycles the tools sharing it, as Photoshop does. Hosts can still override every binding. Update the
  keyboard shortcuts dialog and the docs.
- Owns: new `src/tools/select*`, `src/tools/move.tsx`, `src/tools/transform*.ts*`, the shortcut table in
  `src/editor/image-editor.tsx` and tool `shortcut` fields, `src/kits/*`, `apps/demo/src/domains/*`,
  `src/messages/geometry.ts` and its packs.

### W3. Image information (Claude) — port 4373

Item 4.

- An Info tool on its own rail button with an i icon (`standalone`), showing: file name, type and format detail
  (for example "PNG, 8-bit, RGBA"), file size, dimensions and megapixels, bit depth, colour profile and whether it
  was converted, resolution, orientation, frames, import notes (RAW preview, PSD layers), and every EXIF, XMP and
  IPTC field in readable groups (camera, exposure, lens, date, GPS with a map-free coordinate, software, copyright).
- Edit and remove fields: a change is a session action (one undo step) kept in the recipe, and export writes the
  edited metadata when the metadata policy keeps it. Removing GPS or all metadata is one action. Read-only fields
  (computed ones such as dimensions) say so.
- Reuse `src/panels/metadata.tsx` and the io metadata readers and writers; keep `MetadataPanel` usable without a
  session.
- Owns: `src/panels/metadata.tsx` (and new info panel files), `src/tools/info*`, `src/io/metadata/**`, the
  metadata part of the recipe and session, `src/messages/files.ts` and its packs.

### W4. Presets and looks that do what they say (Claude) — port 4374

Item 6.

- Go through every preset and look (the Library presets Warm film, Silver screen and Soft cinema, the effects
  Looks and presets gallery, and every effect in every category), applied to several kinds of photo (the sample,
  a portrait-like, a high-contrast scene, a low-light scene; generate them or use permissively licensed ones and
  record them). Compare each with what its name promises and with how Lightroom, Photoshop and common photo apps
  render that effect. Cartoon and Watercolour, for example, currently look garish.
- Fix parameters, curves and algorithms so each is faithful and tasteful at its default strength. A kernel
  change keeps GLSL and TypeScript in step with a conformance scene. Thumbnails must show the effect truly.
- Report a before/after contact sheet for every preset and effect.
- Owns: `src/filters/effects/**`, `src/filters/develop/**` presets, `src/tools/effects/**`, the demo's preset
  definitions, `src/messages/effects.ts` and its packs, `src/panels/filter-gallery-jobs.ts` and the gallery worker
  (what thumbnails render).
