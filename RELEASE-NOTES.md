# glass-ux-image 0.1.0

The first release: image editing components and a tiled image engine for
[Glass UX](https://github.com/Dastari/glass-ux) 0.16, from a single slider to a full photo editor. Pictures are
edited in the browser, on the GPU where there is one, and nothing is saved or uploaded unless the host decides to.

```sh
pnpm add https://github.com/Dastari/glass-ux/releases/download/v0.16.0/glass-ux-0.16.0.tgz
pnpm add https://github.com/Dastari/glass-ux-image/releases/download/v0.1.0/glass-ux-image-0.1.0.tgz
```

Documentation, the component catalogue, templates and the full editor: https://dastari.github.io/glass-ux-image/

## What is in it

- **Levels:** standalone controls (curves, levels, balance wheel, brush picker, blend modes), `PhotoEditor` for
  a dialog or page section, `ImageEditor` for a Lightroom-style workspace, and `kits/basic`, `kits/standard` and
  `kits/advanced`. Every part also stands alone with its own hooks, and seven copyable templates go from one
  slider to the full suite.
- **Geometry:** crop with aspect ratios, resize, rotate by any angle on a protractor with an angle finder,
  straighten, flip, move, transform, perspective with guided correction, canvas size, and content-aware Fill edges.
- **Tone and colour:** exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation,
  vibrance, HSL, levels, curves, colour balance, clarity, texture, dehaze and auto enhance.
- **Painting and retouching:** brush, eraser, clone, healing, spot healing, patch, blur, sharpen, smudge, dodge,
  burn, sponge, colour replacement, red-eye and liquify, on the picture or on an image layer and its mask.
- **Layers and text:** image and text layers, 16 blend modes, masks, merge and flatten.
- **Effects:** blur, sharpness, artistic, vintage, light, distortion, pixel, noise, stylisation and colour
  grading looks, with live thumbnails.
- **Files:** JPEG, PNG, WebP, GIF, SVG, TIFF, PSD with layers, camera RAW previews and HEIF in; JPEG, PNG, WebP
  and AVIF out, with EXIF, XMP and ICC handling and colour conversion from embedded profiles. Project files with
  layers, autosave and recovery, clipboard, drag and drop, and batch export.
- **Workspace:** branching history, before and after, a command palette, keyboard shortcuts the host can rebind,
  docked and focus layouts, and 11 languages including right-to-left.
- **Host control:** every committed change is a session action the host can see and refuse through `onAction`.
  The library never saves, uploads or persists by itself.

## Assets

- `glass-ux-image-0.1.0.tgz`: the package.
- `glass-ux-image-docs.tar.gz`: the documentation site, as published on GitHub Pages.
- `SHA256SUMS`: checksums for both.

## Known limits

`PROPOSAL.md` lists them under "Before 0.1.0". In short: LUT-based ICC profiles are not converted and browser
decoding is 8-bit; 16-bit TIFF and PSD import at 8 bits; RAW import uses the embedded preview, not demosaicing;
text layers cannot be painted or masked; translations had a machine review, not a native speaker's.
