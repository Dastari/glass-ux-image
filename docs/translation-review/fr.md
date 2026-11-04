# fr — translation review (model review, not a native-speaker sign-off)

520 messages read line by line. 15 fixes in `patches/fr.json`. The pack was already good: formal
`vous` imperatives (Vérifiez, Réessayez, Faites glisser), curly apostrophes, and a plain space before
`?` and `:`, which matches what Glass UX fr mostly does. I left the typography alone.

## Fixes by theme

**Glass UX consistency**
- redo `Rétablir` → `Refaire`, noRedo `… à rétablir` → `… à refaire`: Glass UX fr uses Refaire (richText.redo).

**Photoshop FR terminology**
- posterise `Isolhélie` → `Isohélie`: a typo.
- emboss `Relief` → `Estampage`: Photoshop FR's name for the filter.
- layers.screen `Écran` → `Superposition`: the other blend modes already use Photoshop FR names
  (Produit, Incrustation, Lumière tamisée, Densité couleur −/+). `Écran` is the GIMP name.
- retouch.reconstruct `Reconstituer` → `Reconstruction`: Photoshop's Liquify tool name, and a noun like the other modes in that Select.

**Real collisions and wrong labels**
- develop.tint `Teinte` → `Nuance`: the Basic panel's Colour group shows Temperature, Tint,
  Saturation, Vibrance and Hue together, so two sliders were both labelled "Teinte". Hue keeps
  `Teinte` (as in TSL). **Needs a native check.** Adobe and Apple use Teinte for both terms. The other
  option is to keep Tint and make Hue `Décalage de teinte`.
- geometry.scale `Mettre à l’échelle` → `Échelle`: this is the Scale slider in the Upright panel
  (Lightroom FR: Échelle) and a Transform mode. A verb phrase was wrong and too long there.
- workspace.edit `Modifier` → `Édition`: it is the menubar menu title.
- effects earlier/later `Avancer`/`Reculer` → `Appliquer plus tôt`/`Appliquer plus tard`. These are
  icon-button aria-labels in the effect stack. Avancer reads as Photoshop's "En avant", which moves a
  layer up the stack, so it gets applied later: the opposite meaning.

**Naturalness and consistency**
- files.stripGps `Supprimer le GPS` → `Supprimer les données GPS`.
- files.profileFallback `à LUT` → `basé sur des LUT`.
- workspace.paste `Coller l’image` → `Coller une image`, to match files and layers.
- workspace.social `Publication sociale` → `Publication pour les réseaux sociaux`. This is a template title.

## Unsure / left alone
- workspace.focus `Concentration` (layout mode, the counterpart of `Ancré`). It is the macOS FR word for
  Focus, but here it names a floating-pane layout, and a user may not understand it. A native speaker
  should choose, for example "Mode focus".
- spot-heal `Correcteur localisé`: Photoshop says "Correcteur de tons directs", which is longer and
  obscure. I kept the clearer term.
- unsharpMask `Masque de netteté`: Photoshop says "Accentuation". The current term is widely understood.
- blur brush `Flou local`: Photoshop's tool is "Goutte d’eau". I kept it.
- develop.aqua `Turquoise`: Lightroom FR may use "Bleu-vert". Not verified.
- tiltShift `Bascule et décentrement`: accurate but long. Photoshop uses "Inclinaison-décalage", and many
  photographers say "tilt-shift".
- transform modes: Échelle | Pivoter | Inclinaison | Déformer mix nouns and verbs, as the English does.
  Pivoter is shared with the Rotate tool label, so I left it.
- I left the NBSP before ?/: as a plain space, because Glass UX fr uses a plain space in almost every case.

## Overflow risks (~240px panels)
- layers.shadowX/shadowY `Décalage horizontal/vertical de l’ombre` (slider labels, 30 chars).
- mergeDown `Fusionner avec le calque inférieur` (menu item, probably fine).
- effects.tiltShift `Bascule et décentrement` (gallery tile).
- develop.autoEnhance `Amélioration automatique` (button with an icon, beside Compare).
- geometry.constrain `Conserver les proportions`.

## Source (English) observations
- resetTool / toolSelected compose with tool labels that are verbs in FR (Recadrer, Pivoter), which gives
  "Réinitialiser Recadrer". A noun form of each tool name would read better in every language.
- removeGuide/guideStart put a capitalised guide name mid-phrase ("Supprimer Repère vertical 1").
- Tooling: `scripts/apply.mjs` cannot find the fr/it blocks in `domains/develop.ts` (block opens at
  column 0: `"fr": {`) or the end of the blocks in `domains/workspace.ts` (they close with `},` at
  column 0). Its dry run reports 7 failures for these patches, but every key exists exactly once in its
  block (I checked with a separate script). Fix the block detection before applying.
