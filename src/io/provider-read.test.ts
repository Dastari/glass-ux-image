import { describe, expect, it } from 'vitest';
import { memoryFiles } from 'glass-ux/file-provider/memory';
import { testFileProvider } from 'glass-ux/testing/file-provider';
import type { FileProvider } from 'glass-ux/file-provider';
import { readProviderImage } from './session-files.js';

const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 7) & 255);
const signal = () => new AbortController().signal;

describe('readProviderImage over the shared FileProvider contract', () => {
  it('runs on a provider that passes Glass UX conformance', async () => {
    const files = memoryFiles({ 'Pictures/dusk.png': { content: bytes(64), mime: 'image/png' } });
    const { failed } = await testFileProvider(files);
    expect(failed).toEqual([]);
    const listed = (await files.readDirectory!('memory:///Pictures', { signal: signal() })).entries[0]!;
    const blob = await readProviderImage(files, listed, signal());
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes(64));
  });

  it('pins every range to one version, so a file changed mid-read fails instead of mixing', async () => {
    const files = memoryFiles({ 'big.png': { content: bytes(9 * 1024 * 1024), mime: 'image/png' } });
    const stat = await files.stat('memory:///big.png', { signal: signal() });
    let reads = 0;
    const changing: FileProvider = { ...files, read: async (uri, range, options) => {
      if (++reads === 2) await files.write!(uri, new Blob([bytes(10)]).stream(), { base: { version: stat.version }, signal: signal() });
      return files.read(uri, range, options);
    } };
    await expect(readProviderImage(changing, stat, signal())).rejects.toMatchObject({ code: 'changed' });
    expect(reads).toBe(2);
  });

  it('asks stat for a listing without a size or version, and reads an unknown size to its end', async () => {
    const files = memoryFiles({ 'a.png': { content: bytes(5 * 1024 * 1024 + 3), mime: 'image/png' } });
    const unsized: FileProvider = { ...files, stat: async (uri, options) => ({ ...(await files.stat(uri, options)), size: null }) };
    const blob = await readProviderImage(unsized, { uri: 'memory:///a.png', size: null }, signal());
    expect(blob.size).toBe(5 * 1024 * 1024 + 3);
    expect(blob.type).toBe('image/png');
  });

  it('refuses a provider that ends early or overruns its range, and honours abort', async () => {
    const files = memoryFiles({ 'a.png': { content: bytes(32), mime: 'image/png' } });
    const stat = await files.stat('memory:///a.png', { signal: signal() });
    const short: FileProvider = { ...files, read: async (uri, range, options) => (await files.read(uri, range, options)).slice(0, 8) };
    await expect(readProviderImage(short, stat, signal())).rejects.toThrow('Incomplete provider read');
    const long: FileProvider = { ...files, read: async () => bytes(64) };
    await expect(readProviderImage(long, stat, signal())).rejects.toThrow('more than the range');
    const controller = new AbortController();
    controller.abort();
    await expect(readProviderImage(files, stat, controller.signal)).rejects.toBeTruthy();
  });
});
