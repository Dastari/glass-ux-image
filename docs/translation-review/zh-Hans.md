# zh-Hans review (glass-ux-image 0.1.0)

This is a model review, not a sign-off by a native speaker. I read all 503 entries in the dump. 32 fixes are in `patches/zh-Hans.json`.
Terminology follows mainland Adobe usage (Photoshop / Lightroom CN), and Glass UX zh-Hans for shared words.

**Apply-script warning:** `apply.mjs --dry` reports 7 failures. The patch entries are correct. The cause is the file layout:
- `src/i18n/domains/develop.ts` opens its blocks with `"zh-Hans": {` at column 0, not indented by two spaces. That gives "no block" for exposure, removePoint, before and after.
- `src/i18n/domains/workspace.ts` closes the block before zh-Hans with `},` at column 0, so the end-of-block search fails. That gives "matched 0" for before, after and fullSuite.
The script's block start and end regexes need to accept 0 or 2 spaces of indentation. Otherwise these 7 entries have to be applied by hand.

## Fixes by theme

### Mistranslated or non-standard tool and filter names
- effects `unsharpMask`: 反差保留锐化 → USM 锐化. 反差保留 is High Pass. Photoshop CN calls Unsharp Mask "USM 锐化".
- effects `vignette`: 暗角 → 晕影 (Lightroom / Photoshop CN).
- effects `ripple`: 涟漪 → 波纹. effects and retouch `twirl`: 旋涡 / 旋转 → 旋转扭曲 (Photoshop CN Distort filters and Liquify). In retouch, 旋转 also collided with Rotate.
- retouch `shrink` (Pucker): 收缩 → 褶皱 (Photoshop Liquify). effects `size`: 单元大小 → 单元格大小 (Photoshop Mosaic).
- develop `exposure`: 曝光 → 曝光度 (Lightroom). effects `grading`: 调色 → 颜色分级 (Lightroom Color Grading). layers `flatten`: 合并图层 → 拼合图层. This also keeps it apart from 向下合并.
- effects `lut`: 三维查找表 → 3D LUT. It is a standard name, and the nearby strings already say LUT.

### Consistency
- base `fit` and `canvasHelp`: 适合窗口 → 适应窗口, to match Glass UX `lightbox.fit`.
- geometry `aspect` (Perspective slider): 长宽比 → 宽高比, the same term as `aspectRatio` and `constrain`.
- develop `removePoint`: 删除 → 移除. Remove is 移除 everywhere else, and 删除 is kept for Delete.
- develop and workspace `before` / `after` (compare-slider labels): 之前 / 之后 → 修改前 / 修改后 (Lightroom CN).
- retouch `keyboardHelp`: Escape → Esc, as in `cropHelp` and Glass UX `kbd.esc`.

### Accuracy and wording
- retouch `sourceHint`: "Alt+Enter 选择键盘光标" → "按 Alt+Enter 将键盘光标位置设为源点". The old text said the shortcut selects the cursor, not the source.
- retouch `keyboardHelp`: now says Shift is held to move 10 px per step.
- retouch `previewFailed`: 笔画 (a character stroke) → 此笔触 (a brush stroke).
- geometry `guideHint`: 二到四条 → 两到四条. geometry `swap`: 交换方向 → 横竖互换 (it toggles the crop ratio between landscape and portrait).
- layers `font`: 字体 → 字体系列. The field sat under the 字体 group heading with the same label.
- workspace `fullSuite`: 完整工具 ("a complete tool") → 全套工具.

### Punctuation and spacing
- layers `layerActions`: `操作： ${name}` (stray space after a full-width colon) → `${name}的操作`.
- base `cropReadout`: `位于 ${x}, ${y}` → `位于 ${x}，${y}` (full-width comma).
- files `stripGps`, `iccNote`, `profileFallback`, `rawPreview`: added spaces between Latin and CJK text (移除 GPS, 以 sRGB 导出, ICC, LUT, JPEG, RAW). The rest of the pack already does this ("中心 X", "导入 .cube LUT", "缩放 ${percent}").

## Left alone or unsure
- Undo is 撤销 here. Glass UX zh-Hans is inconsistent: 撤消 in 5 places (entitySettings/richText/signaturePad undo) and 撤销 in others. 撤销 is the modern standard form and the one Apple uses. I suggest Glass UX standardise on 撤销 upstream.
- Glass UX `commandPalette.commandPalette` = 命令调色板 is a literal mistranslation ("colour palette"). Here we use 命令面板, which is correct. Worth fixing upstream.
- Noise is 噪点 throughout (添加噪点 / 减少噪点). Photoshop CN uses 杂色. I kept 噪点 because it is consistent within this pack and common in Apple and consumer apps.
- `solarise` 曝光反转: Photoshop CN uses 曝光过度, which also means "overexposed". I kept the clearer term.
- develop `aqua` 青色: Lightroom CN HSL uses 浅绿色. I kept 青色 as more descriptive. A native reviewer could align it with Lightroom.
- retouch sponge `saturate` / `desaturate`: 增加饱和度 / 降低饱和度. Photoshop uses 加色 / 去色. I kept them because they are clearer, and they fit at 5 characters.
- retouch `layerMask` `${name} 的蒙版`: the space suits Latin layer names and looks a little loose after CJK names. I left it, given the pack's Latin-spacing style.
- geometry `upright` 竖直校正, `horizon` 绘制水平线 (地平线 would be more literal) and `develop` 显影 are acceptable. I left them.
- files `noExport` 宿主未提供导出目标: "宿主" is developer jargon, but the English "The host" is too (see the source notes below).
- Register: one 你 (`saveFailed`), which is fine. Glass UX mixes 你 and 您.

## Overflow risk
- Nothing should overflow a 240px panel. The longest control labels are 阴影水平偏移 / 阴影垂直偏移 (6 characters), 导入 .cube LUT and 开始批量处理.
- Liquify mode segments (向前变形 / 旋转扭曲 / 褶皱 / 膨胀 / 重建) are at most 4 characters.

## English source / code observations (report only)
- `src/tools/retouch/overlay.tsx:181` builds `aria-label={`${words[kind]}: ${words.cursor}`}` with a hard-coded ASCII ": ". In zh this reads "仿制图章: 画笔光标". It should be a message function.
- `src/tools/transform.tsx` joins the corner name and axis with a space (`${m.topLeft} ${m.x}`). That is fine in zh, but it is a hard-coded join.
- files `noExport` "The host has no export destination" exposes the integration term "host" to end users.
