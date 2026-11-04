# Import fixtures

All files here are original generated geometric samples, licensed MIT like this repository.
Regenerate with `node e2e/fixtures/imports/generate.mjs`. No third-party images or Adobe fixtures
are included. `ag-psd` is used only to write the small PSD test file.

- `rgba8.tif`, `rgba16.tif`, `rgba16-be.tif`: a 3 × 2 RGBA chart, unsigned 8/16-bit, little/big endian.
- `deflate.tif`, `lzw.tif`, `packbits.tif`: the same chart with Deflate / LZW / PackBits strips.
- `multipage.tif`: two directory pages referring to the same chart; import reads only the first.
- `oriented.tif`: the same chart tagged orientation 6 (90° clockwise).
- `associated.tif`: explicitly associated alpha to test conversion to straight decoder samples.
- `layers.psd`: a 6 × 4 saved composite and three raster layers, including offset, opacity,
  multiply, colour dodge, a negative offset and a hidden layer.

RAW unit tests build bounded synthetic JPEG marker streams; browser tests use native-encoded
8 × 4 and 2 × 1 geometric JPEGs with synthetic TIFF/ORF/RAF/CR3 headers and orientation tags.
HEIF tests use an empty branded container to test unavailable-native and host-peer behaviour;
there is no real HEVC-encoded fixture and no native Safari test on this Chromium-only machine.
