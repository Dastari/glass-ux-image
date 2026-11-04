# ja review (glass-ux-image 0.1.0)

This is a model review of all 520 lines, not a sign-off by a native speaker. 29 fixes are in `patches/ja.json`.

**Apply-script issue:** `scripts/apply.mjs` can't find the ja block in `src/i18n/domains/develop.ts`, where `"ja": {` has no indent. It also can't find the end of the ja block in `src/i18n/domains/workspace.ts`, which closes with `},` at column 0. Four entries fail as a result (develop `range`, workspace `compare`/`before`/`after`). The keys are correct. With a looser match (start `^\s*"ja": \{$`, end `^\s*\},?$`), all 29 resolve to exactly one line each.

## Adobe / Photoshop / Lightroom terminology
- distort: 自由変形 → 自由な形に. 自由変形 is Photoshop's Free Transform. Distort is 自由な形に.
- effects.gallery: フィルター一覧 → フィルターギャラリー
- effects.threshold: しきい値 → 2 階調化. This is the Photoshop filter name. Before, the filter and its slider (`pivot`) had the same label.
- Liquify modes: push 押す → 前方ワープ, reconstruct 復元 → 再構築. 復元 is also used for session recovery.
- red-eye: 赤目除去 → 赤目修正. geometry.scale: 拡大縮小 → 拡大・縮小.
- layers.style: 書体 → フォントスタイル (書体 means typeface). oblique: 斜体 → オブリーク (斜体 is also the usual word for italic).

## Consistency with Glass UX and within the pack
- redo: やり直す → やり直し, and zoomIn/zoomOut: 拡大/縮小 → ズームイン/ズームアウト. These follow the Glass UX lightbox, richText and map packs.
- workspace compare/before/after: 編集前/編集後 → 補正前/補正後. This is the same CompareSlider as in develop, which already uses the Lightroom term.
- fillEdgesHint: カンバス → キャンバス, to match canvasSize and Glass UX.
- layers.outlineGroup: 輪郭 → 縁取り, to match its fields (縁取り幅 / 縁取りの色). retouch.selectArea: 領域 → 範囲, to match `area`.
- layers.failed: 再試行してください → もう一度お試しください. This is the pattern used everywhere else in the pack.

## Accuracy
- develop.range: 色域 → 色の範囲. 色域 reads as "colour gamut".
- retouch.sourceHint: the old text said Alt+Enter "selects the cursor". It actually sets the source at the cursor position. It is now ます-style and uses ソース, matching the group label.
- retouch.keyboardHelp: rewritten in the same style as cropHelp. It now uses Esc, and says Shift works together with the arrow keys.
- files.alpha: 透明度を保持 → 透明部分を保持. files.iccNote: "Otherwise" now reads オフにすると. files.browse: 保存場所を参照 → 場所を参照 (the button opens a file to read, not a save destination).

## Typography
- Removed spaces before particles and suffixes: `${tool}ツール`, `${name}のマスク`.
- layerActions: `操作: ${name}` → `${name}の操作`, matching マスクの操作.

## Left alone (judgement calls)
- 書き出し for Export: Glass UX uses エクスポート, but Lightroom and Photoshop use 書き出し, and the pack is consistent. 履歴 for History is clear, though Adobe uses ヒストリー.
- skew 傾斜: Photoshop's term is ゆがみ, but that would clash with Liquify ゆがみ. pucker 収縮: Photoshop's term is 縮小, which clashes with zoom out and scale.
- motionBlur モーションブラー sits beside ガウスぼかし and other ぼかし names. It is natural Japanese, so left as is.
- The spacing between Latin text and kana is mixed across files (for example `GPSを削除` and `.cube LUTを読み込む` vs base `Shift と`). Glass UX ja is mixed too. I only normalised the strings I rewrote.

## Overflow risks
- The transform-mode segmented control now has 拡大・縮小 / 回転 / 傾斜 / 自由な形に. It may be tight at about 240px. 変形 would be a shorter fallback for Distort.
- Long labels in the text panel: 影の横方向の距離 / 影の縦方向の距離. フィルターギャラリー is a heading, so it should fit.

## English source (report only)
- develop.range ("Colour range") is also used as the label for the colour-balance shadows/midtones/highlights selector, which is a tonal range, not a colour range.
- In retouch/panel.tsx the source X/Y aria-label is built from `words.clone` for heal and patch too, so a screen reader announces "Clone stamp X" for every source tool.
