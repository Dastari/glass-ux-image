# pt-BR review notes (model review, not a native-speaker sign-off)

Read all ~520 lines of `dumps/pt-BR.txt` and checked shared words against Glass UX `glass/pt-BR.txt`. 19 fixes in `patches/pt-BR.json`.
Register is consistent você-imperative (Verifique, Tente, Arraste, Desenhe), matching Glass. Much of the Adobe BR
terminology is right: Realces, Desembaçar, Carimbo, Pincel de recuperação, Correção (Patch), Subexposição/Superexposição
(Dodge/Burn, the Adobe BR convention), Tela/Sobrepor, Modo de mesclagem, Achatar, Dissolver (Adobe BR's name for Liquify).

## Themes
**European Portuguese forms (2).** The scan also covered ecrã, ficheiro, utilizador, guardar, registo, câmara, c-ção and "a + infinitive".
- retouch `keyboardHelp` "dez píxeis" → "dez pixels".
- effects `pixel` "Efeitos de píxel" → "Efeitos de pixel".

**Crop wording vs Glass UX (5).** Glass imageCropper uses Recortar / Área de recorte, and workspace `avatar` already said "Recorte".
- `crop` Cortar → Recortar; `applyCrop` → Aplicar recorte; `removeCrop` → Remover recorte; `cropArea` → Área de recorte; geometry `cropToFill` → Recortar para preencher.

**Develop terminology (Lightroom BR).**
- `hue` Tom → Matiz; `tint` Matiz → Tonalidade. These were effectively swapped against Adobe BR, and layers blend `hue` already said Matiz.
- develop `midtones` Meios-tons → Tons médios, to match retouch.
- geometry `aspect` Proporção → Aspecto (the Lightroom Transform slider). It also no longer collides with crop "Proporção".
- geometry `scale` Escalar → Escala (a noun for the slider and mode label).
- retouch `shrink`/`expand` Contrair/Expandir → Franzir/Inflar (Photoshop BR Liquify tools; moderate confidence).

**Collisions and calques.**
- effects `tiltShift` "Miniatura" was the same name as the `miniature` preset in the same gallery. It is now "Tilt-shift", the usual BR photo term.
- effects `looks` "Visuais e predefinições" → "Estilos e predefinições".
- workspace `workspace` "Área de imagem" → "Espaço de trabalho de imagem" (Glass term); `social` → "Post para redes sociais".
- files `error` Falhou → Falha (ActionButton error label = Glass `button.failed`).

## Left alone / unsure
- `vibrance` "Vibração". Adobe BR says "Vibratilidade", but Vibração is common and clear. Change it if you want Adobe parity.
- `hardLight` "Luz forte" matches GIMP BR. Photoshop BR says "Luz direta". `multiply` "Multiplicar" vs Photoshop BR "Multiplicação" is the same split.
- `upright` "Endireitar" is the same word as `straighten`. They are in different panels and the meaning is right, so I kept it ("Retificar" is an option).
- `zoomIn` "Aumentar zoom". Glass is inconsistent here (Ampliar / Diminuir zoom), so I kept our matched pair.
- `liquify` "Dissolver" is the Adobe BR name, so I kept it. It does read like the Dissolve blend mode.
- `rawPreview` "demosaicizados" is an awkward neologism, but there is no settled BR term.
- `glow` "Brilho" is the same word as develop `brightness`. They are in different panels.
- `annotator` "Anotações" is a noun where the other template names are agents ("Anotador" would be parallel). Minor.

## Overflow risks
- files `batch` "Processamento em lote" (21 chars) is a tool label. Consider "Lote".
- layers `shadowX`/`shadowY` "Deslocamento horizontal/vertical da sombra" (~40 chars) are slider labels.
- workspace `settings` "Configurações da ferramenta" is only an aria-label, so it is fine.

## English source
- files `pending` "Pending" is used as the ActionButton busy label. "Working" would fit better.

## Tooling
`scripts/apply.mjs --dry` cannot place 5 valid entries: develop.ts `tint`/`hue`/`midtones`, and workspace.ts
`workspace`/`social`. The cause is block formatting (develop.ts blocks start at column 0; workspace.ts blocks close with
`},` at column 0). The keys exist in the pt-BR block.
