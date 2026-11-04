# Closing the gaps before 0.1.0

Working brief, 2026-11-03. The owner asked to adopt what glass-ux 0.15.0 offers, close every remaining gap
in `PROPOSAL.md` ("Still open" under Stage 3 results, plus the visual items below), then release 0.1.0 on
GitHub. Several agents share this one checkout at once. Each workstream below owns its files; read the
whole brief before starting so you know where the others are working.

The baseline is commit `f80de01`. `git diff f80de01` shows everything changed since, including other
agents' work in progress. Do not commit, stash, reset or check out: the lead integrates and commits.

## Rules for every agent

- Read `AGENTS.md`, `PROPOSAL.md`, `docs/stage-3-brief.md` (the engine contract) and this brief first, then
  `../glass-ux/AGENTS.md` and `../glass-ux/docs/ui-rules.md` if you touch UI. glass-ux 0.15.0 is installed;
  its docs are in `node_modules/glass-ux/docs` and its types in `node_modules/glass-ux/dist`.
- Do not run `pnpm build`, `pnpm check`, `pnpm dev`, `pnpm test:e2e` or `pnpm docs:build`: they replace
  `dist`, which the others use. Use `pnpm exec vitest run <paths>`, `pnpm exec tsc --noEmit -p
  tsconfig.check.json`, `pnpm exec oxlint --deny-warnings <paths>` and `pnpm e2e:own <your port>
  e2e/<spec>.ts`, which builds the demo from `src` into `/tmp/gi-demo-<port>` and never touches `dist`.
- Another agent's half-finished file may break a whole-project typecheck. Fix only your own errors; if
  something of theirs blocks you, say so in your report.
- Edit shared files (`package.json`, `src/*/index.ts`, `src/react/messages.ts`, `src/i18n/*`,
  `src/messages/*`, `THIRD-PARTY-ASSETS.txt`) with small targeted edits, re-reading first. Never rewrite a
  shared file whole. Do not edit `PROPOSAL.md`; put what it should say in your report.
- Only workstream D installs packages, and only those named there.
- New words go through messages in all 11 languages (`src/i18n` enforces it). Every control has an
  accessible name and a keyboard path. Use Glass UX components first, logical CSS and Glass UX tokens.
  Australian spelling in code and copy. No promotional copy.
- Every committed change goes through a session action, so `onAction` can see and refuse it. Previews do
  not. `core` and `filters` import no React, Glass UX or DOM. Tools stay tree-shakeable: nothing in
  `session`, `render` or `core` imports a tool. Kit size budgets (`pnpm size:check` reads `dist`, so the
  lead runs it) must still pass: keep heavy code behind dynamic imports.
- A filter or kernel change keeps its GLSL and TypeScript passes in step, with a conformance scene. Never
  raise a tolerance or a timing limit to make a test pass: find out why it moved.
- Add tests for what you build: unit tests beside the code, and browser tests in your own spec file
  (`e2e/<workstream>.spec.ts`) so specs do not collide.
- Report honestly: what passes, what fails, what you did not build, and any limit you hit. SwiftShader
  timings find stalls; they say nothing about GPU speed. Only Chromium runs here.

## Workstreams

### A. Off the main thread (Codex) — port 4341

PROPOSAL: "The CPU backend still composes on the main thread", and "one stroke timing test can fail
occasionally on SwiftShader's graphics process (1 run in 25)".

- Move the CPU backend's tile composition (filters, blends, layers) into a worker, with the renderer's
  budget and cancellation intact, so the main thread only presents. Keep `backend: "cpu"` results
  byte-identical to today (`e2e/conformance*.spec.ts`, saved-file tests).
- Find the cause of the intermittent stroke timing failure (`e2e/retouch.spec.ts`) and fix it. Run it at
  least 25 times after the fix and report the count.
- Owns: `src/render/**`, `src/canvas/**` (only as far as the backend needs), new worker files.

### B. Layer strokes and masks (Claude) — port 4342

PROPOSAL: "Layer strokes and mask erasing are not built: strokes apply to the base picture", and "a large
brush dab cannot be split across frames".

- Retouch strokes on the selected raster layer (`Stroke.layer`), so painting, erasing, cloning and healing
  work on layers as well as the base, through undo, save, project files and flatten.
- Layer masks: add, apply, delete, show and hide a mask; paint it with the brush (reveal) and eraser
  (hide); a mask thumbnail beside the layer's. Glass UX components, Lightroom feel.
- Split a large brush dab's work across frames within the renderer's budget.
- While in `src/panels/layers.tsx`: the empty-state icon is cut off at the bottom of the left column, and
  the panel has a gap before its list. Fix both.
- Owns: `src/retouch/**`, `src/tools/retouch/**`, `src/tools/layers/**`, `src/panels/layers.tsx`,
  `src/layers-text/**`, layer parts of `src/core` and `src/session`, `src/messages/layers.ts`,
  `src/messages/retouch.ts`, their packs and styles.

### C. Colour and metadata (Codex) — port 4343

PROPOSAL: "ICC profiles are read and written back, but pixels are not converted. Working space is linear
sRGB", and "AVIF export strips metadata, and the export panel says so".

- Convert decoded pixels from their embedded profile into the linear sRGB working space: matrix/TRC
  profiles (v2 and v4, parametric and sampled curves) at least, covering Display P3, Adobe RGB, ProPhoto
  and camera sRGB variants. Keep out-of-gamut values where the float pipeline can hold them. Say clearly
  what is not converted (for example LUT-based A2B profiles) and fall back to treating it as sRGB with a
  note in the metadata panel.
- On export: write sRGB with an sRGB profile by default, with an option to convert back to and embed the
  source profile. EXIF orientation stays correct.
- AVIF: write EXIF, XMP and the ICC or nclx colour box, and remove the panel's warning.
- Owns: `src/io/metadata/**`, `src/io/encode.ts`, `src/codecs/avif*`, colour conversion code (new files
  under `src/io/colour/`), the export and metadata panels' colour parts, `src/messages/files.ts`.
  Coordinate with D in `src/io/open-image.ts`: D owns format detection and the decoder registry; you add
  one call that converts a decoded image's colour.

### D. More import formats (Codex) — port 4344

PROPOSAL: "Advanced items are later: ... TIFF, HEIC, RAW and PSD import."

- TIFF with `utif2` (MIT): baseline and common compressions, 8 and 16 bit, multi-page takes the first.
- PSD with `ag-psd` (MIT): the composite image, and the layers as image layers with names, opacity,
  visibility, offsets and the blend modes we support, through the layers model and project files.
- RAW (CR2, NEF, ARW, ORF, RAF, DNG, CR3): the largest embedded JPEG preview, parsed in TypeScript.
  This is not demosaicing; say so in the UI and docs. Keep orientation.
- HEIC/HEIF: the browser's own decoder where it has one (Safari), else an optional peer package the host
  installs, loaded by dynamic import. Do not bundle LGPL or patent-encumbered code. Record licences and
  patent notes in `THIRD-PARTY-ASSETS.txt` and `src/codecs/THIRD-PARTY-ASSETS.txt`.
- Every format sits behind its own dynamic import and keeps the kits within budget. Add fixtures that
  are generated or MIT/public-domain, small, and recorded.
- Owns: `src/io/formats/**`, `src/io/open-image.ts` detection and decoder registry, new `src/codecs/*`
  modules, `package.json` dependencies for `utif2` and `ag-psd` only.

### E. Perspective and content-aware crop (Claude) — port 4345

PROPOSAL: "Advanced items are later: perspective correction, content-aware crop".

- Perspective correction tool: vertical and horizontal keystone, aspect and scale sliders, plus guided
  mode: draw two to four lines along edges that should be vertical or horizontal, as the rotate tool's
  angle finder draws lines (see `src/tools/rotate.tsx` and its overlay styles). Build it on the geometry's
  distort quad and homography; geometry stays serialisable.
- Content-aware fill for the empty edges left by rotate, perspective and canvas expansion: a "Fill edges"
  option that synthesises plausible pixels (PatchMatch or similar inpainting, on the CPU in a worker,
  within the renderer's budget), as one undo step through a source checkpoint, the way flatten works.
- Owns: new `src/tools/perspective*.tsx`, new fill engine files, `src/tools/crop.tsx` and
  `src/tools/rotate.tsx` only to add the fill option, `src/messages/geometry.ts` and its packs,
  `src/styles/geometry.css`.

### F. Glass UX 0.15 and the visual gaps (Claude) — port 4346

- Focus mode: the canvas fits the picture to the area not covered by floating panes, using PaneLayout's
  `--pane-covered-*` on the primary stack; zoom and pan still use the whole stage.
- Run Glass UX's `testFileProvider` (`glass-ux/testing/file-provider`) against our file provider adapter in
  the browser, and fix what it finds.
- Histogram: offer RGB channels as well as luminance, with Glass UX's Histogram (series per channel).
- Filter gallery: thumbnails are small and some (Pencil sketch) read near white; size and sample them so
  each effect is recognisable.
- Develop templates show the picture letterboxed small; fill the frame properly.
- Resize: the Constrain switch was replaced by a link toggle, which departs from R15.4. Restore a labelled
  switch or justify the link in your report.
- Docs: component pages show long demo code because `./gallery/*` is not exported; show the short public
  usage instead.
- Look for anything else that misses Glass UX's own quality, comparing with the Glass UX docs site (serve
  `../glass-ux/apps/docs/dist` with `DOCS_DIR=../glass-ux/apps/docs/dist DOCS_BASE=/ DOCS_PORT=4356 node
  scripts/serve-docs.mjs`) in light, dark, narrow and RTL. Screenshot before and after.
- Owns: `src/canvas/**` (fit only; A owns the backend), `src/panels/histogram.tsx`,
  `src/panels/filter-gallery*`, `src/tools/resize.tsx`, `src/editor/**`, `apps/docs/**`,
  `apps/demo/src/templates/**`, `src/gallery/**`, `src/messages/workspace.ts`.

### Later, after A to F

- G. Translation review (Claude): every pack, for terminology, consistency with Glass UX's own packs,
  and tone, once all new words exist.
- H. The lead: integration, the full suites, an independent review, CI for Firefox and WebKit, the release
  workflow, the 0.1.0 tag and GitHub release.
