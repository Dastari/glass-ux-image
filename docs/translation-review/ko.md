# ko review (glass-ux-image 0.1.0)

This is a model review of all 520 lines, not a sign-off by a native speaker. 25 fixes are in `patches/ko.json`. The register is already consistent (-합니다 for statements, -세요 for requests, as in Glass UX ko), so no changes were needed there.

**Apply-script issue:** `scripts/apply.mjs` can't find the ko block in `src/i18n/domains/develop.ts`, where `"ko": {` has no indent. It also can't find the end of the ko block in `src/i18n/domains/workspace.ts`, which closes with `},` at column 0. Nine entries fail as a result (develop reset/detail/midtones, and workspace history/retouch/compare/before/after/custom). The keys are correct. With a looser match (start `^\s*"ko": \{$`, end `^\s*\},?$`), all 25 resolve to exactly one line each.

## Adobe / Photoshop / Lightroom terminology
- spot-heal: 부분 복구 → 스팟 복구. colour-replace: 색상 교체 → 색상 대체.
- Blend modes darken/lighten: 어둡게/밝게 → 어둡게 하기/밝게 하기 (the Photoshop ko names).
- develop.detail: 세부 사항 → 세부. workspace.history: 기록 → 작업 내역. effects.vignette: 비네트 → 비네팅.
- geometry.percent: 백분율 → 퍼센트, next to 픽셀 as in Photoshop's image size dialog.

## Consistency with Glass UX and within the pack
- develop.reset: 초기화 → 재설정, matching the base pack and Glass UX.
- develop.midtones: 중간톤 → 중간 영역, matching 어두운 영역 / 밝은 영역 and retouch.
- geometry.constrain: 종횡비 → 가로세로 비율, matching base aspectRatio and Glass UX imageCropper.
- geometry.scale: 크기 조절 → 배율. 크기 조절 is already the Resize tool's name, and 배율 matches 가로/세로 배율.
- effects.tolerance: 색 허용 오차 → 색상 허용치, matching retouch 허용치. layers.outlineGroup: 윤곽선 → 외곽선, matching its fields.
- workspace before/after/compare: 이전/이후/이전 및 이후 → 보정 전/보정 후/보정 전후 비교. This is the same CompareSlider as in develop, and 이전 also means "previous" (as in 이전 영역).
- workspace.retouch: 보정 → 리터치, because 보정 is generic (자동 보정, 보정 전/후). workspace.custom: → 사용자 지정 레이아웃.

## Accuracy
- retouch tonalRange/all: 색조 범위/모든 색조 → 톤 범위/모든 톤. Elsewhere in this pack 색조 means tint or hue.
- retouch.sourceHint: the old text said Alt+Enter "selects the cursor". It actually sets the source at the cursor position. 원본 (which means "original") is now 소스, matching the group label.
- retouch.keyboardHelp: 방향키/Escape → 화살표 키/Esc, matching canvasHelp and cropHelp. It now says Shift works together with the arrow keys.
- files.iccNote: "Otherwise" now reads 끄면 (the note sits under a switch).
- layers.layerActions: `작업: ${name}` → `${name} 작업`, matching 마스크 작업.

## Left alone (judgement calls)
- develop.hue is 색상, while Glass UX and Photoshop Hue/Saturation use 색조. It stays because tint is 색조 in the same Colour slider group.
- develop.luminance is 휘도. Lightroom ko HSL may use 광도, but I'm not sure, so I left it.
- flipHorizontal/flipVertical (가로로/세로로 뒤집기) and fit (창에 맞추기) differ slightly from the Glass UX lightbox (좌우 반전, 창에 맞춤). They match Photoshop and geometry.flip 뒤집기.
- workspace.geometry 기하 is terse. 형태 or 지오메트리 are possible alternatives; this needs a native speaker's call.
- dodge/burn 닷지/번 are the Adobe names, though 번 alone is very short. threshold and pivot are both 임계값.

## Overflow risks
- 가로세로 비율 고정 is a SettingRow label with a switch. It should wrap acceptably, but it is the longest label in the resize panel.
- 그림자 가로 오프셋 / 그림자 세로 오프셋 slider labels in the text panel.

## English source (report only)
- develop.range ("Colour range") is also used as the label for the colour-balance shadows/midtones/highlights selector, which is a tonal range, not a colour range.
- In retouch/panel.tsx the source X/Y aria-label is built from `words.clone` for heal and patch too.
