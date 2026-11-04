# it — translation review (model review, not a native-speaker sign-off)

520 messages read line by line. 20 fixes in `patches/it.json`. Register is consistent: informal `tu`
imperatives (Controlla, Riprova, Trascina), as in Glass UX it. Apostrophes are curly throughout.
Terminology mostly follows Lightroom and Photoshop IT (Luci, Ombre, Vividezza, Chiarezza, Timbro
clone, Pennello correttivo, Toppa, Scherma/Brucia, Fluidifica, Maschera di contrasto).

## Fixes by theme

**Glass UX consistency / Reset vs Restore vs Redo**
- develop.reset `Ripristina` → `Reimposta`: the base pack and most Glass UX it reset labels use Reimposta.
- noRedo `… da ripristinare` → `… da ripetere`, because Redo is `Ripeti`.
- discardTitle/discardConfirm `Eliminare le modifiche?`/`Elimina` → `Scartare le modifiche?`/`Scarta`,
  as in Glass UX it dialogs. Elimina is Delete here (layers, masks).
- files.done `Fatto` → `Completato` (Glass UX it uses Completato for Done statuses).
- files.recover/recovery `Ripristina`/`Istantanee di ripristino` → `Recupera`/`Istantanee di recupero`, to match
  workspace Recupera / Recupero.
- workspace.commands `Tavolozza comandi` → `Tavolozza dei comandi` (Glass UX commandPalette).

**Photoshop IT terminology**
- colourDodge/colourBurn `Colore scherma`/`Colore brucia` → `Scherma colore`/`Brucia colore`: the word
  order was wrong.
- flipHorizontal/flipVertical `Capovolgi …` → `Rifletti …`: the Flip tool is already `Rifletti`, as in Photoshop.
- motionBlur `Mosso` → `Effetto movimento` (Photoshop IT name).
- develop.midtones `Mezzi toni` → `Mezzitoni`, to match retouch.

**Meaning / grammar**
- effects.glow `Luminosità` → `Alone luminoso`: Luminosità already means Brightness and Luminosity elsewhere.
- effects.looks `Aspetti e predefiniti` → `Stili e predefiniti`.
- geometry.horizon `Disegna linea orizzonte` → `Disegna una linea dell’orizzonte` (aria-label; it lacked an article and preposition).
- geometry.fillEdgesHint `…; annulla li ripristina` → `…; il comando Annulla li ripristina`: the old text was ungrammatical.
- retouch.sourceHint `la sorgente` → `l’origine`, to match the Source control label `Origine`.
- retouch.red-eye `Rimuovi occhi rossi` → `Rimozione occhi rossi` (a noun, like the other tool names in the list).

## Unsure / left alone
- effects.grading `Color grading` is English. Lightroom IT keeps "Color grading", I believe, and
  Italian photographers use the term, so I left it. Confirm.
- workspace.focus `Concentrazione` (layout mode, the counterpart of `Ancorato`). It is unclear. macOS IT calls
  its Focus feature "Full immersion". A native speaker should choose.
- spot-heal `Correzione locale`: Photoshop says "Pennello correttivo al volo". I kept the shorter term.
- geometry.aspect `Proporzioni`: Lightroom IT may use "Aspetto" for this Transform slider. Not verified.
- silverScreen `Schermo d’argento`: a literal calque of a preset name. It is harmless, so I left it.
- Anchor labels `Alto a sinistra` etc. (not "In alto a sinistra"): compact and acceptable for corner labels.
- liquify modes are mostly verbs (Sposta, Contrai, Espandi, Ricostruisci) plus `Vortice`. Photoshop
  uses nouns (Risucchio, Gonfiamento). They are consistent enough, so I left them.
- stripGps `Rimuovi GPS` is terse but clear.

## Overflow risks (~240px panels)
- layers.shadowX/shadowY `Scostamento orizzontale/verticale ombra` (slider labels, ~29 chars).
- develop.autoEnhance `Miglioramento automatico` (button with an icon).
- files.batch `Elaborazione in serie` (tool and panel title).
- geometry.horizon is an aria-label only, so there is no overflow.

## Source (English) observations
- resetTool / toolSelected compose with tool labels that are verbs in IT (Ritaglia, Ruota), which gives
  "Reimposta Ritaglia". A noun form of each tool name would read better.
- Tooling: `scripts/apply.mjs` cannot find the it block in `domains/develop.ts` (it opens at column 0)
  or the end of the blocks in `domains/workspace.ts` (`},` at column 0). The dry run reports failures
  for develop.reset, develop.midtones and workspace.commands, but those keys exist once in the it blocks.
