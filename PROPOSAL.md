# glass-ux-image: design proposal

`glass-ux-image` is a component library that plugs into Glass UX. It is not an application. The
full editor is one composition of its parts, and the demo site is one consumer of that composition.

Status: Stages 1 to 3 are built, in `src/` and `apps/demo/`: the engine, `PhotoEditor`, `ImageEditor`, every
tool, the kits and templates, and the hooks and parts under them. The owner reordered the later stages on
2026-11-02: `docs/stage-3-brief.md` records that work and its engine contract. Mock-ups live in `mockups/` and
are built with the published `glass-ux` 0.13.0 release.

```sh
cd mockups && pnpm install --ignore-workspace && pnpm dev   # http://<host>:4320/?s=docked
```

Screens: `window`, `docked`, `focus`, `adjust`, `filters`, `export`, `open`, `pieces`, `phone-edit`,
`phone-layers`. Add `&mode=light`, `&dir=rtl&lang=ar` or `&palette=ocean` to any of them.
`node capture.mjs` writes full-resolution screenshots to `mockups/shots/` (needs the system
libraries Chromium depends on: `pnpm exec playwright install-deps chromium`).

Numbers shown in the mock-ups (timings, memory, file sizes) are illustrative, not measurements.

## Design principles

1. **The image is never judged through glass.** The stage is a neutral dark island in every mode,
   palette and direction. Default palette is Graphite, so chrome adds no colour cast.
2. **Image space never mirrors.** Canvas, rulers and coordinates stay left-to-right under RTL;
   only the chrome around them flips.
3. **Everything is non-destructive where it can be.** Adjustments and filters are layers by
   default, and any change can be compared in place.
4. **Blur stops while pixels move.** Backdrop blur over a live canvas repaints constantly. Docked
   panes never sit over the image. In Focus mode, floating panes drop blur during a stroke or pan,
   using the same "layer in motion" treatment Glass UX already gives dragged windows.
5. **The host owns the application.** The library never writes, uploads or persists anything by
   itself. Saving, actions, shortcuts and layout all pass through hooks the host controls.
6. **One action definition.** Each command is a `defineActions` entry, rendered in the menu bar,
   context menu, toolbar and command palette, so shortcuts and labels cannot drift.

## Composition model

Everything is built from four layers, and a project enters at whichever one it needs. Each layer
uses only the public API of the one below, so nothing the full editor does is out of reach for a
host.

| Layer | What it is | A project uses it to |
| --- | --- | --- |
| **Ready-made** | `ImageEditor`, `PhotoEditor` | Drop in an editor with one component |
| **Parts** | `ImageCanvas`, `LayersPanel`, `AdjustPanel`, `HistogramPanel`, `ToolRail`, `CurvesEditor`, … | Arrange its own layout |
| **Hooks** | `useImageEditor`, `useLayers`, `useImageHistory`, `useAction`, … | Build its own UI on the same state |
| **Headless** | `createImageDocument`, `defineTool`, `defineFilter` | Process images with no React, in a worker or a test |

The sizes people actually need:

```tsx
// A single photo window with basic tools. The host decides what Save means.
<PhotoEditor
  src={photo.url}
  tools={[crop, rotate, adjust, heal, text]}
  saveLabel="Save to listing"
  onSave={async (result, { signal, setProgress }) => {
    const blob = await result.toBlob({ type: "image/webp", quality: 0.82 });
    await uploadPhoto(blob, { signal, onProgress: setProgress });
  }}
/>

// The full suite, with the host's own actions added.
<ImageEditor document={doc} tools={allTools} filters={allFilters} actions={myActions} onSave={save} />

// The host's own layout around our parts.
const editor = useImageEditor({ src, tools: [crop, adjust] });

<ImageEditorProvider editor={editor}>
  <MyHeader />
  <ImageCanvas aria-label="Product photo" />
  <AdjustPanel />
  <Button onClick={() => editor.actions.run("edit.undo")}>Undo</Button>
</ImageEditorProvider>;

// No React at all.
const doc = await createImageDocument({ source: blob });
await doc.apply(gaussianBlur, { radius: 4 });
const output = await doc.export({ type: "image/png" });
```

### What the host controls

| Concern | Hook | Default |
| --- | --- | --- |
| Save and export | `onSave(result, { signal, setProgress })`, `onExport` | No Save button without a handler |
| Open | `src`, `document`, `onOpen`, or a `backend` | Nothing but what the host passes |
| Actions | `actions` adds, replaces or hides. `onAction(action, next)` can veto, wrap or redirect any of them | Built-in set for the tools in use |
| Tools and filters | Imported and passed in, plus `defineTool` and `defineFilter` for the host's own | None: unused tools stay out of the bundle |
| State | Tool, zoom, selection and panels are controlled or uncontrolled, like every Glass UX input | Uncontrolled |
| Changes | `onChange`, `onDirtyChange`, `editor.subscribe`, `doc.on` | None |
| Shortcuts | `shortcuts` overrides or turns off any binding | Scoped to the editor, not the page |
| Layout | Slots for every region, and `onWorkspaceChange` to store panel layout | Not persisted |
| Words | `labels`, plus Glass UX message packs | Glass UX packs |
| Look | Glass UX tokens, palettes and density | Host's appearance settings |
| Unsaved work | `onBeforeClose`, which plugs into the Glass UX window close guard | Asks only inside a window |

`onSave` deliberately matches `EditableAvatar` in `glass-ux/avatar`: same `signal` and
`setProgress`, same rule that the library never uploads. In a Glass UX managed window, a host turns
off `header` and `footer` and puts `PhotoEditorActions` and `PhotoEditorStatus` in the window's own
slots, so `PhotoEditor` never has to import `glass-ux/windows`.

### Package layout

One package with subpath entries, built and released as a versioned archive, like Glass UX and
`glass-ux-ide`. `glass-ux` and React are peers. A project pays only for what it imports: an entry
never pulls in the tools, filters or codecs it was not given, and `size:check` budgets hold that
for `PhotoEditor` and the full suite separately.

| Entry | Holds | React |
| --- | --- | --- |
| `/core` | Document, layer tree, tiles, selection, masks, history | No |
| `/render` | `RenderBackend`: WebGL2, WebGPU (later), CPU | No |
| `/filters/*` | One entry per filter family | No |
| `/io` | `openImage`, `encodeImage`, and later the `.guxi` format | No |
| `/session` | `EditorSession`: recipe, history, actions, saving | No |
| `/codecs/*` | Lazily loaded WASM and TypeScript codecs | No |
| `/react` | Hooks, `ImageEditorProvider`, `defineTool` | Yes |
| `/tools/*` | One entry per tool family: panel, overlay and filters | Yes |
| `/canvas` | `ImageCanvas`, the bare accelerated viewport | Yes |
| `/panels/*` | `LayersPanel`, `HistoryPanel`, `HistogramPanel`, `AdjustPanel`, … | Yes |
| `/controls/*` | `CurvesEditor`, `LevelsEditor`, `BrushPicker`, `BlendModeSelect`, … | Yes |
| `/annotator` | `ImageAnnotator` | Yes |
| `/photo-editor` | `PhotoEditor`, `PhotoEditorView`, `PhotoEditorActions`, `PhotoEditorStatus` | Yes |
| `/i18n/*` | One language pack per locale, for `registerMessagePack` | No |
| `/editor` | `ImageEditor`, the full workspace | Yes |

Hooks so far: `useImageEditor`, `useEditor`, `useSessionState`, `useTool`, `useImageHistory`, `useAction`,
`useRenderer` and `useCanvasMapping`. Planned: `useImageSelection`, `useLayers`, `useBackend` and
`useFileSystem`. Names follow `glass-ux-ide`
(`useTextDocument`, `useEditor`, `useDocumentHistory`, `useBackend`, `useFileSystem`) so the two
read as siblings. The IDE's `useCommand` and our `useAction` should settle on one name when the
shared Shortcuts work lands on `defineActions`.

### The demo

`apps/demo` lives in the repository and is left out of the package, as in Glass UX. It imports only
public entries, so anything the demo can do, a host can do. It runs entirely in the browser on
GitHub Pages and feels like a full application: files via the browser's own file APIs, autosave to
OPFS, no server. The docs site also shows `PhotoEditor` and each part on its own, so people see
the small sizes first.

### Rendering

- **WebGL2 is the primary backend.** It is the browser's OpenGL ES 3.0 and is the one accelerated
  API that can be assumed across the browsers Glass UX supports, including Firefox ESR 140.
- **WebGPU is an optional later backend**, behind the same interface.
- **The fallback is a TypeScript CPU backend** in workers with `OffscreenCanvas`, used when WebGL2
  is missing or the context is lost. The status bar shows which backend is active.
- **Each filter has one definition with a GLSL and a TypeScript kernel.** A conformance suite
  renders every filter on both backends and fails on pixel differences beyond a tolerance. This
  is the main guard against the fallback quietly rotting.
- **Large images use tiles** (256 px, with a mip pyramid), so memory and upload follow the
  viewport. Working format is linear, premultiplied RGBA16F. A device without float render targets
  (`EXT_color_buffer_float`) uses the CPU backend, because 8-bit linear bands visibly.
  Tile data lives in workers and spills to OPFS.

### Files: local and remote

This package ships no server software. Security, authentication and transport belong to the host,
and a provider arrives already able to do its job.

Most hosts need only `src` and `onSave`. A host that wants the Open screen, remote browsing or
version history supplies a backend, in the same shape as `IdeBackend` in `glass-ux-ide`: every
member is optional, and the UI offers only what is present.

```ts
interface ImageBackend {
  files?: readonly FileSystemProvider[]; // the shared Glass UX contract
  assets?: ImageAssetProvider; // brushes, LUTs, fonts, presets
  history?: ImageHistoryStore; // saved versions
}
```

```tsx
<ImageEditor backend={{ files: [localFiles(), browserFiles(), assets] }} onSave={save} />
```

`FileSystemProvider` is the shared contract in the Glass UX brief, not a type of our own. Its
ranged reads suit this package well: `.guxi` stores tiles uncompressed by the zip layer, so a large
remote document opens by reading only the tiles on screen. A version on `stat` and a conflict
result on write are what make the conflict state in the Open mock-up possible. Thumbnails are the
one addition this package asked for.

Built-in providers use the same names as the IDE (`memoryFiles`, `browserFiles`, `localFiles`,
`httpFiles`) and are all opt-in. Clipboard and drag and drop are separate, and need no provider.

`.guxi` is the native format: a zip of a JSON manifest and tile blobs.

### Accessibility and languages

- All built-in words are `defineMessages` entries with all 11 Glass UX language packs, enforced by
  the same pack coverage tests.
- Every tool is reachable by keyboard: arrow keys nudge, numeric fields replace dragging, and a
  keyboard cursor can stamp a brush. Curves, gradients and crop handles use the same pattern.
- `useAnnounce` reports tool changes and results. Focus regions (F6) move out of the canvas, so
  keyboard users are never trapped in it. Layers are a real tree with reordering by keyboard.
- Freehand painting cannot be made equivalent without a pointer. The aim is that every operation
  other than freehand drawing can be completed by keyboard, and that drawing has a usable
  keyboard path.

### Documentation and testing

Same pipeline as Glass UX: TSDoc, generated API pages, a catalogue page and working demo for each
public component, a GitHub Pages site with the full editor as its demo, `llms.txt`, agent skills
and a `check` script. Browser tests run on Chromium, Firefox and WebKit, with screenshot tests for
the stage rendering in both backends.

## What Glass UX supplies, and what it needs

In the mock-ups today: `Surface`, `Panel`, `Slider`, `NumberField`, `Select`, `Segmented`,
`ColorPicker`, `Switch`, `Badge`, `Notice`, `Field`, `FileDrop`, `Button`, icons and appearance.

Planned for the real build: `SplitPane`, `Tree`, `DragDrop`, `Dialog`, `Sheet`,
`CommandPalette`, `ContextMenu`, `windows` (floating and pop-out panels), `defineActions`,
`useHotkeys` and i18n. The dialogs, sheet, layer rows and tool rail in the mock-ups are
hand-composed stand-ins.

### Requests to Glass UX

The shared brief, `/home/toby/dev/glass-ux-ide/docs/glass-ux-request.md`, shipped in glass-ux 0.14.0 and 0.15.0.
Stage 2 needed no stopgaps. Every later stage now has what it needs: `glass-ux/menubar`,
`pane-layout`, `file-provider`, `file-dialog`, `keymap`, `status-bar`, `compare-slider`,
`gradient-picker`, the `Histogram` bins and the `ActivityFeed` timeline.

Five gaps went to the Glass UX agent on 2026-11-03 and shipped in glass-ux 0.15.0, with two docs-kit items.
The stand-ins are gone:

- **Formatters:** `numberFormat` and `formatPercent` from `glass-ux/locale` replace `src/react/format.ts`.
- **Two-way sliders** take `origin={0}`, so a -100 to 100 slider at 0 reads as unset, in both directions.
- **Colour balance** uses Glass UX's `ColorWheel`. `BalanceWheel` (`controls/balance-wheel`, formerly
  `ColorWheel` here) is now an adapter: the recipe still stores red, green and blue offsets, and
  `wheelToBalance` and `balanceToWheel` convert through OKLab, so the hue under the bead is the hue pushed.
- **F6** uses `useFocusRegionNavigation`, called from the workspace's own actions, so hosts can still veto or
  rebind it.
- **Focus** is PaneLayout's `placement: "overlay"`, derived from the workspace mode, and pointer, wheel and
  pan gestures set PaneLayout's `moving` once at the start and end.
- **Docs:** tool, filter and kit pages set `badge` in their section meta, `ReferenceSection` and its
  MutationObserver are gone, and the API pages were regenerated for left-to-right code under RTL.

Still in place:

- **RTL language:** in production builds through Tailwind v4, Glass UX's `:dir(rtl)` selectors match by
  language. A right-to-left page still needs a right-to-left `lang`: the demo switches to Arabic for
  `?dir=rtl`, and the docs preview sets `lang="ar"`. Glass UX keeps this as the documented approach.
- **Template pages:** exporting `TemplateDocumentation` and `TemplatePreview` from the kit is a recorded
  follow-up upstream. Keep the copies in `apps/docs/src/templates.tsx`.
- **Toolbar:** `Toolbar.Button` with only `disabledReason` reads as enabled, so the rail's Reset passes
  `disabled` too. Reported in the shared brief on 2026-11-03.

**Stays in `glass-ux-image`:** the engine, `ImageCanvas`, layers and masks, `CurvesEditor`,
`LevelsEditor`, `BrushPicker`, `BlendModeSelect`, the filter gallery, `ImageAnnotator`, rulers,
image-specific tool icons, `PhotoEditor` and `ImageEditor`.

## Build order

Each stage ends in something usable and published to the demo site. Parts come before the full
editor, so the full editor can only be built from public pieces. Stage 3 absorbed Stage 4's `ImageEditor`,
curves, levels, filter catalogue and export, in the order `docs/stage-3-brief.md` sets out.

1. **Engine proof.** Repository, docs site, CI. Tiled compositor on WebGL2 and CPU, conformance
   harness, one filter on both backends. Exit test: pan and zoom a 6000 × 4000 document smoothly,
   with the fallback passing conformance.
2. **`PhotoEditor`.** `ImageCanvas`, hooks, actions and `onSave`, with crop, rotate, adjust and
   export. First release projects can adopt, with the host-control API proved on a real component.
3. **Editing parts.** Layers, blend modes, history, selection, brush, transform, heal, text,
   `.guxi`, `ImageAnnotator`.
4. **`ImageEditor` and the demo.** Docked and Focus workspaces, curves, levels, masks, the filter
   catalogue, backend and file providers, Open and Export.
5. **Format and reach.** PSD, TIFF, XCF, WASM codecs, colour management, phones and tablets,
   accessibility audit, language packs.

### Stage 1 results

Measured on 2026-11-01 in headless Chromium with SwiftShader, which is WebGL2 emulated on the CPU
of a 16-core server.

| Check | Result |
| --- | --- |
| Backend conformance: 9 scenes at 3 pyramid levels | Largest difference 0.0008, against a limit of 0.002 |
| On-screen bytes at 100% | Within 2 of 255, with 0.0001% of bytes above 1 |
| Tile seams at awkward zooms | None on either backend |
| Harness sensitivity | A 4% kernel error is caught, at 2.5 times the limit |
| Pan and zoom, 6000 × 4000 | 16.7 ms frames at the 95th percentile on both backends |
| Memory at 100% | 79 tiles and 77 MB decoded |
| Loss of the GPU context | Moves to the CPU backend and keeps drawing |
| Dragging a 4–20 px blur | Not smooth: 95th percentile 150–270 ms on WebGL2, 50–150 ms on CPU |

On a real GPU, the owner reported blur dragging as very quick, and as noticeably slower but still
usable on the CPU backend (hands-on over Tailscale, 2026-11-01, no frame timings). So no cheaper
drag preview is planned.

Known gaps, for Stage 2:

- The CPU backend composes on the main thread. Tile sources already run in workers. The kernels are
  plain functions, so moving composition is contained work, and the frame budget limits the damage
  until then, though one large-radius tile can still take hundreds of milliseconds.
- Any change recomposes every tile, which is part of why blur dragging is slow. Per-tile dirty
  tracking waits for painting in Stage 3.

### Stage 2 results

Measured on 2026-11-02 against glass-ux 0.14.0, in the same headless environment as Stage 1.

| Check | Result |
| --- | --- |
| Backend conformance, now 20 scenes at 3 levels | Largest difference 0.0014, limit 0.002 |
| A full edit saved by each renderer | Byte-identical files |
| Saved files checked by pixel | Rotate, flip, crop and brightness on both renderers |
| Save after the GPU is lost | Correct, not blank: the export redoes the work on the CPU |
| Opening a 6000 × 4000 PNG | 650–980 ms, longest frame 17–33 ms, decoded in a worker |
| Accessibility (axe, outside the stage) | No violations on any tool, including contrast |
| Crop-only bundle, including React and Glass UX parts | 180 KB gzipped, with no adjust or sharpen code |
| All three tools | 193 KB gzipped |

Worked out along the way:

- **Half floats:** conformance measures a difference relative to any value above 1, because half
  floats keep relative precision. Contrast can push a pixel to about 2.4.
- **Layer order:** `styles.css` declares the layer order itself, because importing it first would
  otherwise put every Glass UX control under the reset.

Still open:

- **The CPU backend composes on the main thread.** Tile decoding is in a worker; filters are not, so a
  strong filter on a large picture can hold a frame. Hands-on it was "noticeably slower but still
  functional".
- **No editing beyond crop, rotate and adjust yet.** The `heal` and `text` tools in the mock-up belong
  to Stage 3. Straightening by a free angle is not built.
- **`PhotoEditor` has no docs site page, API reference or published release.** The docs kit is
  available but not adopted.
- **Translations are unreviewed.** All 11 packs need a native speaker's pass.
- **Only Chromium has run this.** Firefox and WebKit have not.
- **Formats:** export is limited to what the browser can encode. `/codecs` is still to come.

### Stage 3 results

Measured on 2026-11-03 against glass-ux 0.14.0, in the same headless environment as Stages 1 and 2. Parts
were built separately by agents and then run together, which is where most defects came to light.

| Check | Result |
| --- | --- |
| Unit tests | 635 |
| Browser tests on the merged code | 512, of which 511 passed; the one failure led to the alert fix below, and its three specs then passed |
| Backend conformance, all filters at 3 levels | Largest difference 0.00144, limit 0.002 |
| Saved files, both renderers | Byte-identical PNGs for geometry, layers and flatten |
| Accessibility (axe, outside the stage) | No violations on any panel or tool |
| `kits/basic` | 96 KB gzipped, with no retouch, layers, text, curves or effects modules |
| `kits/standard`, `kits/advanced` | 185 KB and 181 KB gzipped |
| `ImageEditor` with all kits | 368 KB gzipped, excluding CSS, fonts and optional WASM |
| Retouch dab, 100 px, on this server's CPU | Brush 0.5 ms, healing 2.5 ms, spot healing 3 ms |
| A stroke | Recomposes only touched tiles: 2 of 41 in the test |

Worked out along the way:

- **Full-float surfaces:** colour-dodge, colour-burn, non-separable blends, full develop and discontinuous
  effects compose in 32-bit float, because half-float rounding amplified past the conformance limit. Those
  tiles take twice the memory. The cost on large pictures has not been measured.
- **Distortion and liquify are warps,** run on the CPU before filters, so they cannot differ between renderers.
- **Hangs:** a preview spinning on disposed caches froze the page, and a failed tile read could retry forever.
  Every wait now rejects on failure and honours an abort signal.
- **Previews of other recipes** use their own branches of the stroke store, so comparing history cannot change
  the live picture.
- **Danger states already announce themselves.** `EmptyState` and `Notice` set `role="alert"`, so a wrapper must
  not add another.

Still open:

- **The CPU backend still composes on the main thread,** and a large brush dab cannot be split across frames.
- **Layer strokes and mask erasing** are not built: strokes apply to the base picture.
- **Colour:** ICC profiles are read and written back, but pixels are not converted. Working space is linear sRGB.
- **AVIF export strips metadata,** and the export panel says so.
- **Focus panels float in their tracks** through PaneLayout's overlay placement; they are not free windows.
- **One stroke timing test can fail occasionally** on SwiftShader's graphics process (1 run in 25), with the
  main thread clear. The limit stays.
- **Advanced items are later:** perspective correction, content-aware crop, and TIFF, HEIC, RAW and PSD import.
- **Translations are unreviewed, and only Chromium has run this.**
- **Nothing is committed or published.** There is no remote yet.

## Decisions

Settled by the owner on 2026-11-01 and 2026-11-02.

- **Shape:** a component library for Glass UX. The full application is a composition and a demo.
- **Layout:** Docked is the default workspace of `ImageEditor`. Focus is a switchable mode.
- **Name:** the package is `glass-ux-image`, with entries such as `glass-ux-image/core`.
- **WASM is allowed** for optional codecs. The engine, tools and filters stay TypeScript.
- **Levels:** developers choose how much editing to offer, through `kits/basic`, `kits/standard` and
  `kits/advanced`, and copyable templates. Every part also stands alone, with its own API and hooks.
- **Feel:** Lightroom's layout and workflow, in Glass UX's own components.
- **Presets start again** (2026-11-03): choosing one runs `edit.restart`, which applies it to the picture as
  opened and drops earlier steps. Undo returns to the original. Hosts can refuse it through `onAction`.
- **Rotate is its own rail button** (2026-11-03), with a protractor dial over the picture and an angle finder:
  a line drawn along any straight edge reads its lean, and Level to line turns the picture to it. The line is
  kept in source pixels, so it stays on its feature as the picture turns.
- **Every rail has a Reset button** (2026-11-03) for the chosen tool, as one undo step. A tool declares
  `reset`; one without it resets its own `filters`. Move has nothing to reset.

### WASM codecs

Codecs sit in their own `/codecs` entry and load on first use, so the core bundle and any
application that never opens those formats pay nothing. This covers AVIF, HEIC, JPEG XL and
camera RAW, plus PNG, JPEG and WebP encoders that behave the same in every browser.

- Each codec has a TypeScript or browser fallback where one exists, and the UI shows a format as
  unavailable when neither can load, rather than failing on export.
- Strict Content Security Policies need `wasm-unsafe-eval`. The docs must say so, and a blocked
  module must take the same fallback path.
- The package is MIT. Each codec's licence and any patent exposure gets checked before it ships,
  HEIC and camera RAW first, and recorded in the third-party assets list.
