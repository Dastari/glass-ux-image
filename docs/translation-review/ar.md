# Arabic (ar) review notes

This is a model review, not a sign-off from a native speaker. I read all 520 dump lines and checked them against the Glass UX ar pack and the places the keys are used. There are 34 fixes in `patches/ar.json`.

## Apply-script problem (affects the patch, not the wording)
`scripts/apply.mjs` cannot find two of the blocks:
- In `develop.ts` the line `"ar": {` has no indent, so the script reports "no block".
- In `workspace.ts` the blocks close with `},` at column 0 rather than `  }`, so the block end is -1 and no key matches.
This affects 7 ar entries: develop develop/reset/luminance and workspace avatar/presets/pan/failed. I ran a dry run with a copy whose block match is whitespace-tolerant (`/tmp/arhe-check/apply-check.mjs`). It applied all 34 entries with 0 failures.

## Themes
**Short control label (the known wrap).** `geometry.aspect` "نسبة العرض إلى الارتفاع" → "التناسب". This is the Lightroom Transform "Aspect" slider. The new word matches `constrain` "تثبيت التناسب". `aspectRatio` (crop segment aria-label) keeps the long form, which is correct there.

**One term per concept**
- Crop: "قص" → "اقتصاص" in crop, applyCrop, removeCrop, cropArea and workspace avatar. Glass UX imageCropper and geometry cropToFill already use اقتصاص.
- Develop: develop.develop "تطوير" (software development) → "تحميض", the same word as workspace develop and developView.
- Reset: develop "إعادة الضبط" → "إعادة تعيين", as in the base pack and Glass UX.
- Opacity: "العتامة" → "التعتيم" in retouch and layers, as in Glass UX colorPicker.alpha.
- Strength: retouch "القوة" → "الشدة" (as in effects). Twirl: retouch "التواء" → "دوامة" (as in effects).
- X/Y: retouch "س/ص" and effects "المركز س/ص" → Latin X/Y, as in geometry.
- Vertical: scaleY "الرأسي" → "العمودي". Try again: workspace "حاول مجددًا" → "حاول مرة أخرى".
- Colour profile: "ملف الألوان" → "ملف تعريف الألوان", to match icc/iccNote. Done (batch status): "تم" → "مكتمل" (Glass UX).

**Terminology and accuracy**
- tonalRange: "النطاق اللوني" (colour range) → "نطاق الدرجات".
- tolerance: "التسامح" (social tolerance) → "التفاوت" (Photoshop), in retouch and effects.
- flatten: "دمج الطبقات" (= merge) → "تسطيح الطبقات".
- blend: "نمط المزج" → "وضع المزج". نمط is already Font style.
- Bloat: "تمدد" → "انتفاخ".
- luminance: "الإضاءة" → "النصوع". The old word clashed with Highlights "الإضاءات" and the Light category.
- vintage: "قديم" → "عتيق".
- looks: "المظاهر والإعدادات" → "المظاهر والإعدادات المسبقة". The old text meant "settings", not presets.
- pan: "اضغط المسافة" (a single press) → "اضغط مع الاستمرار على المسافة" (hold).

**Grammar and phrasing**
- canvasHelp: "ويكبّر الزائد والناقص أو يصغّران" had broken agreement. It now says plainly which key zooms in and which zooms out.
- keyboardHelp: "عشر بكسلات" → "عشرة بكسلات" (بكسل is masculine). It now uses verb-first phrasing like cropHelp.

**RTL**
- importLut: "استيراد جدول .cube". A "." between Arabic and Latin text resolves RTL and renders as "cube.". It is now "استيراد جدول ألوان بصيغة cube".
- I checked `size` "${width} × ${height} بكسل" and `cropReadout`. Both read correctly in RTL: width shows first, on the right, and the coordinates use «،». I left them alone.
- Left and right words (rotateLeft, topLeft, …) stay physical. Arabic punctuation (، ؛ ؟) is already right throughout. There is no ASCII , ; ? in Arabic text.

## Unsure / left alone
- upright "التقويم": this can also read as "calendar". It works in context, but a native reviewer should look at it.
- aqua "المائي" ("the watery") may be better as "الأزرق المائي" or "الفيروزي". Kept because it is short.
- grading "التدرج اللوني" can read as "colour gradient". I don't know Adobe's Arabic term for Color Grading.
- Blend mode names: multiply "ضرب" is GIMP-style; Photoshop ME may use "مضاعفة". Dodge/Burn tools share "تفتيح/تغميق" with the Lighten/Darken blend modes. They are in different menus, so I kept them.
- highlights "الإضاءات", whites/blacks "الأبيض/الأسود", sepia "بني داكن" (Microsoft's term). I kept all of these.
- Diacritics vary (تعذّر/تعذر, أفقياً/أفقيًا). This is cosmetic, so I didn't change it.

## Overflow risks (≈240px panels)
- "المظاهر والإعدادات المسبقة": section label or aria-label.
- "جدول ألوان ثلاثي الأبعاد": effect tile.
- "الشركة المصنّعة للكاميرا": metadata row label.
- "إزاحة الظل أفقياً/عمودياً": text slider labels.
- "استيراد جدول ألوان بصيغة cube": compact FileDrop.

## English source
- retouch sourceHint "Alt+Enter chooses the keyboard cursor" is unclear. It presumably means "uses the keyboard cursor's position as the source".
