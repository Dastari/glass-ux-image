// Opt-in browser fixture (?provider-test): Glass UX's FileProvider conformance suite, run in the
// page, and the package's reader over the providers a host passes to FilesPanel and FileDialog.
import { memoryFiles } from 'glass-ux/file-provider/memory';
import type { FileProvider } from 'glass-ux/file-provider';
import { testFileProvider, type FileProviderReport } from 'glass-ux/testing/file-provider';
import { openImage, readProviderImage } from 'glass-ux-image/io';

async function png(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d')!;
  context.fillStyle = '#3a6ea5';
  context.fillRect(0, 0, width, height);
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

export interface ProviderProof {
  /** The conformance report for the provider the demo's file panel uses. */
  conformance(): Promise<FileProviderReport>;
  /** Lists a folder as the dialog does, reads the first picture and decodes it. */
  open(options?: { unsized?: boolean }): Promise<{ width: number; height: number; bytes: number }>;
  /** Changes the file between the listing and the read: the read must fail with `changed`. */
  stale(): Promise<string>;
}

async function provider(): Promise<FileProvider> {
  return memoryFiles({ 'Pictures/': {}, 'Pictures/harbour.png': { content: await png(40, 30), mime: 'image/png', modified: 1 } }, { label: 'Memory' });
}

const proof: ProviderProof = {
  async conformance() { return testFileProvider(await provider(), { folder: 'memory:///Pictures' }); },
  async open({ unsized = false } = {}) {
    const files = await provider(), signal = new AbortController().signal;
    const source: FileProvider = unsized ? { ...files, stat: async (uri, options) => ({ ...(await files.stat(uri, options)), size: null }) } : files;
    const entry = (await files.readDirectory!('memory:///Pictures', { signal })).entries[0]!;
    const blob = await readProviderImage(source, unsized ? { uri: entry.uri, size: null } : entry, signal);
    const image = await openImage(blob), { width, height } = image;
    image.dispose?.();
    return { width, height, bytes: blob.size };
  },
  async stale() {
    const files = await provider(), signal = new AbortController().signal;
    const stat = await files.stat('memory:///Pictures/harbour.png', { signal });
    await files.write!(stat.uri, new Blob([await png(20, 20)]).stream(), { base: { version: stat.version }, signal });
    try { await readProviderImage(files, stat, signal); return 'read'; }
    catch (error) { return (error as { code?: string }).code ?? String(error); }
  },
};
(window as unknown as { providerProof: ProviderProof }).providerProof = proof;
