# glass-ux-image 0.3.1

Updates Glass UX and the matching docs kit from 0.19.0 to 0.19.11. The demo and mock-ups use the same release. The peer range is unchanged at glass-ux 0.19, and nothing in the public API changes.

## Fixed

- The text tool's on-canvas editor matches the layer's own type size on touch screens. Glass UX 0.19.2 raised text fields to 16 px there, so the editor now opts out with `data-own-font-size`.
- Effect gallery names wrap through Glass UX's own card titles (0.19.2), not a local override.

## Changed

- `ImageInfoPanel`: the number of fields beside "All fields" uses the Accordion's `count` (glass-ux 0.19.11), so it reads as a count, not as part of the title.
- Documentation site: blur ("Live" or "None") is the visitor's own appearance preference (glass-ux 0.19.4). Glass UX stores it, restores it and includes it in Reset, in place of the site's own setting.
- Documentation site: built with the docs kit's site template versions from glass-ux 0.19.10 (React 19.3.1, TanStack Router 1.170.46, Vite 8.3.8, Tailwind CSS 4.3.5).

```sh
pnpm add https://github.com/Dastari/glass-ux/releases/download/v0.19.11/glass-ux-0.19.11.tgz
pnpm add https://github.com/Dastari/glass-ux-image/releases/download/v0.3.1/glass-ux-image-0.3.1.tgz
```

[Documentation and full editor](https://dastari.github.io/glass-ux-image/).

## Assets

- `glass-ux-image-0.3.1.tgz`: the package.
- `glass-ux-image-docs.tar.gz`: the documentation site.
- `SHA256SUMS`: checksums for both archives.

Known limits remain as recorded in `PROPOSAL.md` under "0.2.0".
