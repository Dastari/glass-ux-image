# es review notes (model review, not a native-speaker sign-off)

Read all ~520 lines of `dumps/es.txt` and checked shared words against Glass UX `glass/es.txt`. 27 fixes in `patches/es.json`.
The pack is good overall. Blend modes, Dodge/Burn (Sobreexponer/Subexponer), Tampón de clonar, Pincel corrector,
Licuar, Iluminaciones, Intensidad (vibrance), Matiz/Tono, Aguamarina, Trama and Acoplar all match Photoshop/Lightroom ES.

## Themes
**Consistency of width/height (8 keys).** Base and Glass UX use Ancho/Alto. geometry/retouch/files used Anchura/Altura.
- geometry `width` Anchura → Ancho; `ratioWidth` Anchura de proporción → Ancho de proporción; files/retouch `height` Altura → Alto.
- `layers.lineHeight` "Altura de línea" is left alone because it is the standard term.

**Glass UX shared words.**
- layers `rename` Renombrar → Cambiar nombre (Glass fileDialog/sessionNav/tree).
- develop `removePoint` Eliminar punto → Quitar punto; effects `remove` Eliminar efecto → Quitar efecto (Glass: Remove = Quitar, Delete = Eliminar).
- files `done` Hecho → Completado; `error` Error → Falló. Both are ActionButton success and error labels, the same as Glass `button.done/failed`.

**Terminology and accuracy.**
- geometry `upright` Vertical automática → Rectificar. This is the heading over the *manual* sliders. The old text said "automatic" and repeated the "Vertical" slider label under it.
- geometry `aspect` Proporción → Aspecto (Lightroom Transform term). It also no longer collides with the crop "Proporción".
- geometry `scale` Escalar → Escala; `rotate` Rotar → Girar. These are slider and mode labels, and Girar matches base `rotate`.
- develop `dehaze` Borrar neblina → Eliminar neblina (Lightroom ES).
- base `sharpen` Enfocar → Nitidez (a noun among the noun slider labels).
- retouch `shrink`/`expand` Contraer/Expandir → Desinflar/Inflar (Photoshop ES Licuar tools).
- effects `looks` / `presetHistory`: on its own, "ajuste(s)" means adjustment, so these now say "ajustes preestablecidos" to match workspace `presets`.

**Calques.** files `noExport` "El anfitrión" → "La aplicación"; workspace `workspace` "Espacio de imagen" →
"Espacio de trabajo de imagen" (Glass term); `social` "Publicación social" → "Publicación para redes".

**Register.** The pack uses tú (Comprueba, Inténtalo, Dibuja, Tus cambios). geometry `measureHint` was the one usted
string (Arrastre … nivele), and it is now tú. Glass UX es mixes both forms itself: avatarEditor/imageCropper and the loadFailed
strings use usted, while dataTable/tree/copyButton use tú. So the Glass pack gives no single register to match. Worth raising upstream.

## Left alone / unsure
- `aspectRatio` "Proporción". Glass imageCropper says "Relación de aspecto", but this label sits in a narrow crop panel, so I kept it short.
- effects `glow` "Brillo" is the same word as develop `brightness` "Brillo". They are in different panels, so I left it. "Resplandor" is already used by `bloom`.
- workspace `focus` "Enfoque" (a layout mode) can read as photographic focus. "Modo enfoque" might be clearer.
- Corner labels "Arriba izquierda" are kept compact for the transform corners grid. Glass mediaPlayer uses "Arriba a la izquierda".
- `rawPreview` renders "demosaiced" as "no se interpolan" (colour interpolation). It is acceptable, if loose.
- Key names: base `cropHelp` says "Esc" and retouch `keyboardHelp` says "Escape". Both are valid, so I left them.

## Overflow risks
- files `batch` "Procesamiento por lotes" (23 chars) is a tool label. Consider "Lotes".
- layers `shadowX`/`shadowY` "Desplazamiento horizontal/vertical de sombra" (35 chars) are slider labels in a 240px panel.
- effects `looks` is longer now (33 chars), but it is only an aria-label.

## English source
- files `pending` "Pending" is the ActionButton *busy* label. "Working" would describe the state better (Glass: "En curso").

## Tooling
`scripts/apply.mjs --dry` cannot place 4 valid entries: develop.ts `dehaze`/`removePoint`, and workspace.ts
`workspace`/`social`. In develop.ts the locale blocks start at column 0 (`"es": {`, not `  "es": {`). In workspace.ts
the blocks close with `},` at column 0, so the script finds no block end. The keys do exist in the es block.
