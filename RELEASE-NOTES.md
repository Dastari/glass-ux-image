# glass-ux-image 0.3.0

Updates Glass UX and the matching docs kit to 0.19.0. The demo and mock-ups use the same release.

## Breaking

- Needs glass-ux 0.19.
- `ToolRail`: the `layout` prop is gone, along with its `wrap` layout. Glass UX now folds a choice group one tool at a time, which is what it worked around. Remove `layout` where you pass it.

## Changed

- `HistogramPanel` draws RGB as one Histogram, using Glass UX's `series` and `blend="screen"`, in place of three overlaid charts.

```sh
pnpm add https://github.com/Dastari/glass-ux/releases/download/v0.19.0/glass-ux-0.19.0.tgz
pnpm add https://github.com/Dastari/glass-ux-image/releases/download/v0.3.0/glass-ux-image-0.3.0.tgz
```

[Documentation and full editor](https://dastari.github.io/glass-ux-image/).

## Assets

- `glass-ux-image-0.3.0.tgz`: the package.
- `glass-ux-image-docs.tar.gz`: the documentation site.
- `SHA256SUMS`: checksums for both archives.

Known limits remain as recorded in `PROPOSAL.md` under "0.2.0".
