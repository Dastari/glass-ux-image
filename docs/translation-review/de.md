# de review (glass-ux-image 0.1.0)

Model review of all 520 lines in `dumps/de.txt` against the Glass UX de pack and the usual
Photoshop / Lightroom German terms. Not a native-speaker sign-off. The pack was already in good shape:
it uses the Sie form throughout, Photoshop tool names (Kopierstempel, Reparaturpinsel, Abwedler,
Nachbelichter, Wischfinger, Verflüssigen) and Lightroom develop names (Dynamik, Klarheit, Struktur,
Dunst entfernen, Gradationskurve, Weiß/Schwarz). 23 fixes in `patches/de.json`.

## Fixes by theme

**Photoshop / Lightroom terminology (11)**
- Shadows `Schatten` → `Tiefen` (develop, retouch). Lightroom and Photoshop pair Lichter with Tiefen,
  and the dodge/burn range in Photoshop is Tiefen/Mitteltöne/Lichter. Text drop shadow stays `Schatten`.
- layers.blend `Mischmodus` → `Füllmethode`; overlay `Überlagern` → `Ineinanderkopieren` (Photoshop names).
- Curves/levels `Eingang/Ausgang` → `Eingabe/Ausgabe`, plus the four levels fields (`Eingabe Schwarz`, …).
- develop.aqua `Aqua` → `Aquamarin` (Lightroom HSL).

**Consistency (3)**
- retouch.size `Grösse` (Swiss ss) → `Größe`.
- retouch.twirl `Wirbel` → `Strudel`, which effects.twirl already uses.
- base.undo `Rückgängig` → `Rückgängig machen` (Glass UX). It is a menu item, command and tooltip, so
  the longer form fits.

**Accuracy (6)**
- files.pending `Ausstehend` → `In Bearbeitung`. It is the ActionButton label shown *while* the action
  runs. `Ausstehend` means it has not started yet. Glass UX uses `In Bearbeitung` for Working.
- effects.earlier/later `Nach vorne/Nach hinten` → `Früher/Später anwenden`. The old words read as
  layer stacking order. The buttons change the order the effects are applied in.
- geometry.upright `Aufrecht` → `Aufrichten`. The adjective read oddly as a section heading. Unsure:
  Lightroom de keeps "Upright" in English.
- geometry.cropToFill `Zuschneiden zum Füllen` → `Formatfüllend`. That is a calque. The new word is
  shorter and sits in a small Segmented control next to `Alles zeigen`.
- cropReadout `…, bei ${x}, ${y}` → `…, an Position ${x}, ${y}`.

**Register and grammar (3)**
- layers.failed and workspace.failed: `Erneut versuchen.` → `Versuchen Sie es erneut.`, matching
  saveFailed and Glass UX.
- retouch.keyboardHelp `Umschalt bewegt zehn Pixel` → `bewegt um zehn Pixel`.

## Left alone / unsure
- develop.purple `Violett`: Lightroom uses `Lila`, but `Violett` is correct German. Left it.
- effects.grading `Farbkorrektur` for "Colour grading". Lightroom de says `Color-Grading`. Acceptable.
- files.rawPreview `demosaiziert`: a rare technical word. An alternative is "werden nicht entwickelt
  (kein Demosaicing)".
- effects.seed `Rauschstartwert`: clumsy but correct.
- geometry.canvasSize `Leinwandgröße` is GIMP's word. Photoshop says `Arbeitsfläche`. Kept, since it
  matches `Leinwand` in fillEdgesHint.
- zoomOut `Verkleinern`: Glass UX itself mixes this with `Herauszoomen`. Kept.

## Overflow risks (narrow panels)
- geometry.aspect `Seitenverhältnis` (small perspective slider label). It probably fits, but watch it.
- `Seitenverhältnis beibehalten`, `Horizontaler/Vertikaler Schattenversatz`, `Negativ multiplizieren`,
  `Ineinanderkopieren`, `Farbig nachbelichten` (blend select), `Werkzeugeinstellungen`.
- files.autosave `Automatische Momentaufnahme` is a small ActionButton label, so wrapping is likely.

## English source
- retouch.sourceHint "Alt+Enter chooses the keyboard cursor" is unclear. It means it uses the keyboard
  cursor's *position* as the source. The de text copies this ambiguity.

## Apply-script caveat
`scripts/apply.mjs --dry` reports "no block" for `src/i18n/domains/develop.ts`, whose locale blocks
start at column 0 (`"de": {`). It reports "matched 0" for `workspace.ts`, whose blocks close with `},`
at column 0. The patch entries are correct. The script's block detection needs to allow 0 or 2 spaces.
