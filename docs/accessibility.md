# Internationalisation and accessibility

Built-in words use message descriptors and language packs. The docs language menu loads Glass UX and image-editor packs together. The prose stays English. Translations are unreviewed; do not present them as native-speaker reviewed.

## Register language packs

```ts
import { registerMessagePack } from 'glass-ux/i18n';
import imageArabic from 'glass-ux-image/i18n/ar';
import arabic from 'glass-ux/i18n/ar';
registerMessagePack(arabic);
registerMessagePack(imageArabic);
```

The host configures locale and DirectionProvider and sets document lang/dir. Labels props override domain wording. Format numbers in the active locale; never concatenate fragments of translated sentences.

Every canvas needs an accessible name. Numeric fields complement crop, transform, curves and brush gestures. Arrow keys navigate controls; F6 moves between workspace regions. Shortcuts stay inside the editor. Freehand drawing still requires spatial input; keyboard stamping is a usable path rather than an equivalent drawing experience.

Chrome follows RTL. Pixels, rulers, x/y coordinates and before/after comparisons stay in image space. Check focus order, names, target sizes, high contrast and keyboard paths as well as axe. Browser coverage in this repository is Chromium; no Firefox, Safari or real-GPU results are implied.
