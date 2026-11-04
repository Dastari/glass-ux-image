# nl review (glass-ux-image 0.1.0)

Model review of all 520 lines in `dumps/nl.txt` against the Glass UX nl pack and the usual
Photoshop / Lightroom Dutch terms. Not a native-speaker sign-off. Most tool names were already right:
Kloonstempel, Retoucheerpenseel, Natte vinger, Tegenhouden/Doordrukken, Uitvloeien, Overvloeimodus,
Bleken, Bedekken, Hooglichten, Witte/Zwarte tinten, Levendigheid, Nevel verwijderen. 31 fixes in
`patches/nl.json`.

## Fixes by theme

**Terminology (8)**
- develop.clarity `Helderheid van details` → `Duidelijkheid` (Lightroom nl). It is shorter and no
  longer collides with Brightness = Helderheid.
- Blend modes: hardLight `Hard licht` → `Fel licht`, hue `Tint` → `Kleurtoon`, luminosity `Helderheid`
  → `Lichtsterkte` (Photoshop nl).
- retouch: desaturate `Ontzadigen` (not a word) → `Desatureren`; reconstruct `Herstellen` →
  `Reconstrueren`; spot-heal `Plaatselijk herstellen` → `Snel retoucheren`.
- effects.fisheye `Vissenoog` → `Visoog`.

**Consistency and collisions (10)**
- files.format `Formaat` → `Bestandsindeling`. Format and Size both read `Formaat` in the same export panel.
- retouch.twirl `Draaien` (which is Rotate) → `Werveling`, as effects.twirl already has.
- Presets: effects.looks `Stijlen en presets` → `Stijlen en voorinstellingen`, presetHistory →
  `Voorinstelling toepassen`, matching workspace.presets.
- layers.outlineGroup `Omlijning` → `Omtrek`, matching Omtrekbreedte/Omtrekkleur. layers.size
  `Tekstgrootte` → `Lettergrootte`, matching Lettertype/Lettergewicht/Letterstijl.
- Glass UX words: redo `Opnieuw` → `Opnieuw uitvoeren`, view `Beeld` → `Weergave`, commands
  `Opdrachtenpalet` → `Commandopalet`.
- retouch.keyboardHelp `Pijlen` → `Pijltoetsen`.

**Register (3)**
- saveFailed `Je bewerkingen` → `Uw bewerkingen`. Glass UX nl uses u/uw. This was the only je-form string.
- layers.failed and workspace.failed: `Probeer opnieuw.` → `Probeer het opnieuw.` (Glass UX).

**Accuracy (10)**
- opening `Afbeelding openen` → `Afbeelding wordt geopend` and files.loading → `Voorbeeld wordt
  voorbereid`. Both are status texts, but they read as commands.
- discardTitle/discardConfirm `Verwijderen` → `negeren`/`Negeren`. "Verwijderen" suggests deleting the
  image. This matches Glass UX dialog.discardTitle.
- files.pending `In behandeling` → `Bezig`. It is the in-progress button label, and Glass UX uses
  `Bezig` for Working.
- next/previousRegion `regio` (geographic) → `Volgend/Vorig gebied` (the F6 UI regions).
- social `Sociaal bericht` → `Post voor sociale media`.
- effects.seed `Ruiszaad` (calque) → `Startwaarde ruis`.
- geometry.cropToFill `Bijsnijden om te vullen` → `Vullend bijsnijden`. It is shorter and sits in a
  small Segmented control.

## Left alone / unsure
- geometry.upright `Rechtzetten` is the same word as straighten (`Rechtzetten`). They are in different
  tools, so I left it. Lightroom nl keeps "Upright".
- workspace.docked `Vastgezet` really means "pinned". `Gedockt` would be more literal. Kept, because it
  is understandable.
- layers.flatten `Lagen samenvoegen` is close to mergeDown `Omlaag samenvoegen`. Photoshop nl uses
  "Eén laag maken". Unsure, so left it.
- liquify shrink/expand `Samentrekken`/`Opblazen` and push `Duwen`: fine, though Photoshop nl may use
  other names. files.rawPreview `gedemosaïceerd` is rare jargon.
- Glass UX nl is itself mixed: Annuleer/Annuleren, Hernoemen/Naam wijzigen, Gereed/Voltooid. The pack
  is consistent within itself (Annuleren, Hernoemen), so I kept it.

## Overflow risks
- `Horizontale/Verticale schaduwverschuiving`, `Gereedschapsinstellingen`, `Afbeeldingswerkruimte`,
  `Beeldverhouding` (small perspective slider label).
- files.autosave `Automatische momentopname` is a small ActionButton.
- `Kleur doordrukken` / `Kleur tegenhouden` in the blend select: fine.

## English source
- retouch.sourceHint "Alt+Enter chooses the keyboard cursor" is unclear. It means the cursor's
  position becomes the source.

## Apply-script caveat
`apply.mjs --dry` fails 7 entries. One is in develop.ts, whose blocks start at column 0. Six are in
workspace.ts, whose blocks close with `},` at column 0. Each key exists exactly once in its nl block,
so the script's block detection needs fixing, not the patch.
