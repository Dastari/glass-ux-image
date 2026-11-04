# Hebrew (he) review notes

This is a model review, not a sign-off from a native speaker. I read all 520 dump lines and checked them against the Glass UX he pack and the places the keys are used. There are 15 fixes in `patches/he.json`.

## Apply-script problem
`scripts/apply.mjs` cannot find the `develop.ts` he block (the line `"he": {` has no indent) or the `workspace.ts` blocks (they close with `},` at column 0). This affects 4 he entries: develop highlights/clarity and workspace presets/failed. A dry run with a whitespace-tolerant copy (`/tmp/arhe-check/apply-check.mjs`) applied all 15 with 0 failures.

## Register
The pack is gender-neutral, and I kept it that way:
- Buttons and labels are action nouns (שמירה, ביטול, החלה).
- Errors use the impersonal "יש לנסות שוב".
- Hints use plural imperatives (גררו, ציירו). This is how Glass UX writes it too (fileDialog errors use יש ל…, tabs hints use הקישו).
- There was one exception: workspace failed "נסו שוב" → "יש לנסות שוב".
- Glass UX's own he pack sometimes uses masculine singular imperatives (בטל, שמור, התקרב). I did not copy those.

## Themes
**Short control label.**
- geometry aspect "יחס גובה-רוחב" → "יחס". This is the Lightroom Transform "Aspect" slider. The new word matches constrain "שמירת יחס".
- geometry scale "שינוי גודל" (that is Resize in the same domain) → "קנה מידה", which matches scaleX/scaleY.

**One term per concept**
- Highlights: develop "אזורים בהירים" → "הבהקים" (as in retouch, and shorter).
- Twirl: retouch "פיתול" → "סחרור" (as in effects).
- Presets: workspace "קביעות מוגדרות" → "ערכות", as in effects looks and presetHistory.
- Luminosity: blend mode "בהירות" (that is Brightness elsewhere) → "בהיקות", as in develop luminance.

**Terminology and accuracy**
- liquify: "נזילה" (a leak) → "הנזלה".
- Bloat: "הרחבה" → "ניפוח".
- flatten: "איחוד שכבות" (reads as merge) → "השטחת שכבות".
- clarity: "בהירות פרטים" → "צלילות". The old term was long and opened with the Brightness word.

**Typography and RTL**
- canvasHelp "ו-0" and cropHelp "ו-Escape" now use a maqaf (ו־), as the pack already does in ב־sRGB and כ־sRGB.
- importLut "ייבוא LUT מסוג .cube": the "." between Hebrew and Latin text renders as "cube.". It is now "ייבוא LUT מסוג cube".
- sourceHint: "Alt ולחיצה בוחרים מקור" sounded unnatural and opened with Latin. It is now "לחיצה עם Alt בוחרת מקור. Alt+Enter בוחר את מיקום סמן המקלדת."
- I checked `size` and `cropReadout` and left them alone: the numbers read correctly in RTL. Left and right words stay physical.

## Unsure / left alone
- upright "יישור" is the same word as the Straighten tool, "יישור". I don't know a good Hebrew term for Upright ("תיקון ידני" or "תיקון פרספקטיבה" are possibilities), so I flagged it rather than guess.
- undo and cancel are both "ביטול". Glass UX does the same (richText.undo, fileDialog.cancel), so I kept it. "ביטול פעולה" would make undo clearer.
- zoomIn/zoomOut "הגדלה/הקטנה" are nouns, like the rest of the pack. Glass UX uses "התקרב/התרחק" (masculine imperative).
- tint "גוון" vs hue "גוון צבע" in develop, and hue "גוון" in layers and Glass UX. This avoids a clash inside develop. A native reviewer might prefer something else for tint.
- "בהיקות" (luminance) is the Academy-style term and may be unfamiliar. The alternative is "לומיננס".
- preserve "שמירה" (metadata) is the same word as Save; "שמירת הכול" would mirror "הסרת הכול". Original "מקור" is the same word as retouch Source "מקור". Cartoon "קומיקס" and grading "דירוג צבע" are acceptable. I kept all of these.

## Overflow risks (≈240px panels)
- "תצוגה מקדימה דחוסה"
- "היסט צל אופקי/אנכי"
- "טבלת צבע תלת־ממדית"
- "הזזה מוקדם/מאוחר יותר"
- "התצוגה המקדימה אינה זמינה"

## English source
- retouch sourceHint "Alt+Enter chooses the keyboard cursor" is unclear. I translated it as "the keyboard cursor's position".
