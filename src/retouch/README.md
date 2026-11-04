# Headless retouch

`index.ts` exports the stroke data, deterministic `strokeDabs`, the CPU kernels,
`StrokeStore`, `createRetouchStage`, and the liquify grid and warp. Imports require
neither React nor a DOM. Run expensive work in the host's worker. The store yields
to the task queue after an 8 ms budget, the renderer's own frame budget, between dabs and
inside one: `applyDabSteps` pauses every sixteen rows of each pass, so a large dab spreads
across frames with the same result (`stats.dabPauses` counts the pauses).

Coordinates use pixel edges, with the first pixel centred at (.5, .5). Size is a
source-pixel diameter. Pressure scales radius and deposition; spacing is arc length
at a fixed fraction of the nominal diameter. Opacity and flow multiply per dab,
so overlapping dabs accumulate. A path starts with one dab; its remainder does not
force a final dab, preserving event-segmentation independence. Parameters default
to hardness .75, opacity 1, flow 1, spacing .2 and strength .5. Colour is straight
linear RGBA at the API boundary; stored pixels are always premultiplied linear RGBA.
HDR colour values are allowed. Zero-alpha pixels have zero colour.

Use immutable stroke objects and lists. Reconciliation clones each new object
once and compares owned payloads by reference before structural comparison. IDs
alone are not cache keys. The store serialises edits and guards concurrent reads by revision, and reports clipped
source-coordinate dab rectangles through both the reconciliation result and
`invalidated`. Rectangles can overlap. Consumers may coalesce them. Undo restores
a retained copy-on-write snapshot without running dabs. Changed suffixes reuse
the longest available matching prefix. Unchanged mip tiles retain their identity;
dirty ancestor regions are rebuilt lazily using the core box-filter edge convention.
Cold mip reads seed from the base and rebuild edited descendants; warm reads patch
only changed regions. Revision guards discard stale coarse reads, so fine tiles and
new edits are never queued behind obsolete mip work.
Base tile sources must be immutable for the store's lifetime. Read buffers are
borrowed and must not be mutated.

The default retained pixel budget is 64 MiB and the history count limit is 128.
Disposable read-through base tiles are evicted first, then oldest history snapshots
and disposable mip tiles. The read-through cache counts towards the pixel budget. Undo past
an evicted snapshot replays from a retained prefix, or from the immutable base.
If edited level-zero tiles alone exceed the limit, reconciliation rejects with
`RangeError` and leaves the old image intact. Memory retained independently by the base, stroke metadata,
transient copy-on-write tiles and reusable scratch buffers are outside this pixel
budget. Scratch capacity follows the largest dab/search region until store disposal;
this is a retained-tile bound, not a whole-worker heap quota. The host must bound
brush/search sizes and document dimensions for its worker memory budget.

Clone, healing and patch use `sourceOffset` (source minus destination). Smudge
samples the preceding dab displacement. Each dab reads a frozen pre-dab region;
local filters include a halo, so tile boundaries never change kernel results.
Healing and patch use a twelve-iteration screened-Poisson correction field with
destination boundary conditions, preserving destination alpha. This is a bounded
approximation, not a fully converged global solve. Spot healing searches a fixed,
deterministic nearby lattice using sixteen boundary samples, then runs healing.
At edges without a valid search candidate, its zero offset leaves pixels alone.
Patch uses the source offset and an optional source-coordinate selection polygon;
the stroke path covers the selected area, and polygon clipping limits deposition.
Eraser removes pixel alpha and associated colour. On a mask, coverage is alpha: the brush
reveals and the eraser hides; colour does not matter.
Dodge/burn tonal weights use linear luminance. Colour replacement transfers colour
normalised by luminance to retain shading. Red-eye correction detects red-dominant
pixels inside the brush region and replaces red with the green/blue mean.

`createRetouchStage()` has the landed `SourceStage` shape without importing the
session. It keeps one store for the base picture, one for each painted layer's pixels
(`stroke.layer`, points in the layer's own pixels) and one for each painted mask
(`stroke.mask`), each keyed by its own source; `strokesFor` picks a store's strokes. A
`StrokeStore` is built for one `StrokeTarget` and refuses strokes aimed elsewhere. A layer
nobody has painted keeps its own source. `preview` reconciles every live store, and layers
or masks that leave the recipe leave the preview set. Stage reads await queued
reconciliation and reject if it fails. Direct store callers can catch a failed
reconcile and still read the previous image.
There is no automatic subscription to changes in a mutable base source.

Liquify parameters are JSON-compatible numeric arrays, never pixels. Push, twirl,
pucker, bloat and reconstruct compose an inverse displacement field. Register
`liquifyWarp` with the host's warp registry; it conforms to `defineWarp` and is
sampled by `warpSource`. Reconstruct attenuates displacement towards identity.
The grid resolution controls deformation accuracy; it does not blur the picture.

Phase 1b entries:

- `tools/retouch/brush`, `eraser`, `clone`, `heal`, `spot-heal`, `patch`, `blur`,
  `sharpen`, `smudge`, `dodge`, `burn`, `sponge`, `colour-replace`, `red-eye`, `liquify`.
  The `tools/retouch` barrel also exports the public panel, overlay, settings helpers
  and factory. Each tool brings only its own registration; crop imports no retouch.
- `controls/brush-picker` exports plain values and callbacks (controlled or uncontrolled),
  with Glass UX sliders, number fields, colour picker and preset swatches.
- `controls/brush-cursor` exports a standalone screen-space size/hardness overlay.

Pixel tools register the source stage automatically through `SessionTool.stages`.
The pointer path uses `session.toSource`, or `session.toLayer` when an image layer is
selected; cursor projections use `fromSource` or `fromLayer`. The paint target is the
Layers panel's selection (`layers.selectedId` in tool data) and `layers.paintMask`, so the
retouch tools import no layers code. Every pixel panel shows a Paint on choice once there are
image layers. Liquify always warps the base.
Appending a live stroke applies only newly spaced dabs. Pixel previews happen at most once
per animation frame through `session.previewStrokes(strokes)`, maintaining the draft while bypassing
actions and per-frame React notifications; pointer release commits one labelled
`edit.commit` action. A host veto restores the committed picture. Escape, pointer
cancellation and leaving an active drag also restore it. No per-frame cursor state
is stored in React. B/E/S/J select brush/eraser/clone/spot healing. Arrow keys move
the keyboard cursor, Shift moves ten output pixels, Enter stamps; Alt+Enter and
Alt-click choose a clone/heal/patch source. Size follows source pixels through zoom,
rotation and resize. Patch uses a drag rectangle, with numeric alternatives in its
panel, followed by a source point and Apply patch. On a mask target the eraser hides. Liquify registers its warp and commits a grid in filters,
never a pixel stroke. Saving, transport and persistence still belong to the host.

The stage assumes immutable decoded bases, layer assets and mask fills. The landed warp source tracks sampled source footprints and forwards local dirty
rectangles through rotation, resize and liquify. No adapter in core or session is
needed. Mip downsampling also yields on a 4 ms budget, in eight-row chunks.
Translations have complete coverage but have not had native review.

`StrokeStore.idle()` waits for submitted reconciliation jobs to publish their dirty
rectangles. Tile sources may forward this optional barrier through geometry and
warp caches; `Renderer.settle()` uses it before checking rendered tiles. Its frame
budget remains active while settling, with task yields between incomplete frames.
Renderer pending-tile statistics count the current revision immediately, including
invalidations that arrive between animation frames; they cannot predict source
edits that have not yet published, so use the idle/settle barrier for that case.
