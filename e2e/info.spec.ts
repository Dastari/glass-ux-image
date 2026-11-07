import type { OpenPicture, ImageWorkspace } from '../src/editor/index.js';
import type { EncodeOptions } from '../src/io/index.js';
declare global {interface Window {__workspaceDemo?:{pictures:OpenPicture[];selected:string|null;workspace:ImageWorkspace|undefined}}}
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cameraExif, lightroomXmp, withJpegMetadata, withPngMetadata, withWebpMetadata } from './fixtures/metadata.js';
import { listMetadata, readMetadata } from '../src/io/metadata/index.js';

test.setTimeout(60_000);
const sample = readFileSync(new URL('../apps/demo/src/assets/sample.png', import.meta.url));

/** Re-encode the demo's sample in the browser, so the fixture is a real camera-sized JPEG, PNG or WebP. */
async function encoded(page: Page, type: string, width = 1500) {
  const bytes = await page.evaluate(async ({ png, type, width }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(width, Math.round(width * bitmap.height / bitmap.width));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return Array.from(new Uint8Array(await (await canvas.convertToBlob({ type, quality: 0.9 })).arrayBuffer()));
  }, { png: Array.from(sample), type, width });
  return new Uint8Array(bytes);
}
async function ready(page: Page, query = '') {
  page.on('pageerror', error => console.log('PAGE ERROR', error.message));
  await page.goto(`/?view=workspace&backend=cpu${query}`);
  await page.waitForFunction(() => window.__workspaceDemo?.pictures[0]?.editor.state.status === 'ready');
}
/** Open a fixture through the host's own Open images picker, as a person would. */
async function open(page: Page, name: string, bytes: Uint8Array, mimeType: string) {
  const count = await page.evaluate(() => window.__workspaceDemo!.pictures.length);
  await page.locator('.workspace-host-bar input[type=file]').setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
  await page.waitForFunction(n => { const d = window.__workspaceDemo!; return d.pictures.length > n && d.pictures.find(p => p.id === d.selected)?.editor.state.status === 'ready'; }, count);
}
/** Choose the Info tool from its rail button, or from the rail's More menu when a narrow rail folds its tools. */
async function chooseInfo(page: Page) {
  const button = page.locator('.gi-tool-rail').getByRole('radio', { name: 'Image information', exact: true });
  if (await button.isVisible()) { await button.click(); return; }
  await page.locator('.gi-tool-rail').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Image information', exact: true }).click();
}
const session = (page: Page) => page.evaluateHandle(() => { const d = window.__workspaceDemo!; return d.pictures.find(p => p.id === d.selected)!.editor; });
async function camera(page: Page) {
  const jpeg = withJpegMetadata(await encoded(page, 'image/jpeg'), { exif: cameraExif(), xmp: lightroomXmp(), iptc: true });
  await open(page, 'harbour-dawn.jpg', jpeg, 'image/jpeg');
  await chooseInfo(page);
  const panel = page.locator('.gi-info');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('JPEG · RGB', { exact: true })).toBeVisible();
  return panel;
}
const row = (panel: ReturnType<Page['locator']>, label: string) => panel.locator('.gi-info-facts > div').filter({ has: panel.page().locator('dt', { hasText: new RegExp(`^${label}$`) }) }).first();

test('the Info tool has its own rail button and reads everything about a camera JPEG', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const panel = await camera(page);
  expect(await page.evaluate(() => { const d = window.__workspaceDemo!; return d.pictures.find(p => p.id === d.selected)!.editor.state.tool; })).toBe('info');
  // Its own button in the rail, not a member of the files flyout.
  await expect(page.locator('.gi-tool-rail .fa-toolbar-group [aria-label="Image information"]')).toHaveCount(1);
  const expectRow = async (label: string, value: string | RegExp) => expect(row(panel, label).locator('dd')).toContainText(value);
  await expectRow('Name', 'harbour-dawn.jpg');
  await expectRow('Compression', /Lossy · Progressive|Lossy/);
  await expectRow('Bit depth', '8 bits per channel');
  await expectRow('Dimensions', '1,500 × 1,000 px · 1.5 MP');
  await expectRow('File size', /^\d+(\.\d+)?\s(kB|MB)$/u);
  await expectRow('Resolution', '300 ppi');
  await expectRow('Colour profile', /sRGB/); // Chromium's encoder embeds an sRGB profile.
  await expectRow('Model', 'Canon EOS R5');
  await expectRow('Serial number', '012345678901');
  await expectRow('Exposure', '1/250 s');
  await expectRow('Aperture', 'ƒ/5.6');
  await expectRow('ISO', '400');
  await expectRow('Exposure bias', '-0.33 EV');
  await expectRow('Program', 'Aperture priority');
  await expectRow('Metering', 'Evaluative');
  await expectRow('Flash', 'Did not fire');
  await expectRow('Lens', 'RF24-105mm F4 L IS USM');
  await expectRow('Lens range', '24–105 mm · ƒ/4');
  await expectRow('Taken', /29 Oct 2026.*6:42:13.*UTC\+11:00/);
  await expectRow('Coordinates', '33° 51′ 31.08″ S, 151° 12′ 33.48″ E');
  await expectRow('Altitude', '12.5 m above sea level');
  await expectRow('Title', 'Harbour at dawn');
  await expectRow('Creator', 'Alex Rivera');
  await expectRow('Copyright', '© 2026 Alex Rivera');
  await expectRow('City', 'Sydney');
  await expectRow('Software', 'Adobe Lightroom Classic 13.0 (Macintosh)');
  await expect(panel.locator('.gi-info-capture')).toHaveText('ISO 40050 mmƒ/5.61/250 s');
  // Keywords edit in place as chips.
  await expect(row(panel, 'Keywords').getByText('ferry', { exact: true })).toBeVisible();
  // Every stored field is listed under All fields, by family.
  await panel.getByRole('button', { name: /^All fields/ }).click();
  for (const family of ['EXIF', 'XMP', 'IPTC']) await expect(panel.getByRole('region', { name: family, exact: true })).toBeVisible();
  await expect(row(panel, 'MakerNote').locator('dd')).toContainText('Binary data, 32 B');
  await expect(row(panel, 'Iptc4xmpCore:CreatorContactInfo').locator('dd')).toContainText('alex@example.com');
  await expect(row(panel, 'By-line').locator('dd')).toContainText('Alex Rivera');
  // File facts are computed and say so.
  await expect(panel.getByRole('button', { name: /^File/ })).toContainText('Read only');
  await expect(row(panel, 'Dimensions').getByRole('button')).toHaveCount(0);
});

test('editing by keyboard is one intercepted, undoable step written on export', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const panel = await camera(page), editor = await session(page);
  // Tab reaches the row's Edit button; Enter edits, Enter commits, focus returns.
  await row(panel, 'Creator').getByRole('button', { name: 'Edit Creator' }).focus();
  await page.keyboard.press('Enter');
  const input = panel.getByRole('textbox', { name: 'Creator', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Sam Lee');
  await page.keyboard.press('Enter');
  await expect(row(panel, 'Creator').locator('dd')).toContainText('Sam Lee');
  await expect(row(panel, 'Creator').getByRole('button', { name: 'Edit Creator' })).toBeFocused();
  // Written to every family that carries the field, as one history step.
  expect(await editor.evaluate(s => ({ set: s.state.recipe.metadata?.set, label: s.history.current.label, steps: s.history.nodes.length }))).toEqual({ set: { 'xmp:dc:creator': 'Sam Lee', 'exif:Artist': 'Sam Lee', 'iptc:By-line': 'Sam Lee' }, label: 'Change Creator', steps: 2 });
  // Escape leaves a value as it was.
  await row(panel, 'Title').getByRole('button', { name: 'Edit Title' }).click();
  await panel.getByRole('textbox', { name: 'Title', exact: true }).fill('Discarded');
  await page.keyboard.press('Escape');
  await expect(row(panel, 'Title').locator('dd')).toContainText('Harbour at dawn');
  // Remove the location as one step; the coordinates row goes.
  await panel.getByRole('button', { name: 'Remove location', exact: true }).click();
  await expect(row(panel, 'Coordinates')).toHaveCount(0);
  expect(await editor.evaluate(s => [s.state.recipe.metadata?.removeGps, s.history.current.label])).toEqual([true, 'Remove location']);
  // Remove one camera reading.
  await row(panel, 'Serial number').hover();
  await row(panel, 'Serial number').getByRole('button', { name: 'Remove Serial number' }).click();
  await expect(row(panel, 'Serial number')).toHaveCount(0);
  // Export keeps the edits only where the metadata setting keeps metadata.
  const exported = async (metadata: EncodeOptions['metadata']) => new Uint8Array(await editor.evaluate(async (s, metadata) => Array.from(new Uint8Array(await (await s.result().toBlob({ type: 'image/jpeg', metadata })).arrayBuffer())), metadata));
  const kept = Object.fromEntries(listMetadata(readMetadata(await exported('preserve'))).map(e => [e.key, e.value]));
  expect(kept['exif:Artist']).toBe('Sam Lee');
  expect(kept['xmp:dc:creator']).toEqual(['Sam Lee']);
  expect(kept['iptc:By-line']).toEqual(['Sam Lee']);
  expect(kept['exif:SerialNumber']).toBeUndefined();
  expect(Object.keys(kept).some(key => /GPS/.test(key))).toBe(false);
  expect(kept['exif:Model']).toBe('Canon EOS R5');
  expect(readMetadata(await exported('strip')).packets).toEqual([]);
  // Undo walks back one step at a time, through the action.
  await page.locator('.gi-stage').focus();
  await page.keyboard.press('Control+z');
  await expect(row(panel, 'Serial number')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(row(panel, 'Coordinates')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(row(panel, 'Creator').locator('dd')).toContainText('Alex Rivera');
  expect(await editor.evaluate(s => s.state.recipe.metadata)).toBeUndefined();
});

test('a host can refuse metadata changes through onAction, and Remove all metadata leaves fresh fields', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const panel = await camera(page), editor = await session(page);
  // Remove all is one action; the description fields stay so new ones can be added.
  await panel.getByRole('button', { name: 'Remove all metadata', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^All fields/ })).toHaveCount(0);
  await expect(row(panel, 'Title').locator('dd')).toContainText('Not set');
  await row(panel, 'Copyright').getByRole('button', { name: 'Edit Copyright' }).click();
  await panel.getByRole('textbox', { name: 'Copyright', exact: true }).fill('© Sam Lee');
  await page.keyboard.press('Enter');
  expect(await editor.evaluate(s => s.state.recipe.metadata)).toEqual({ removeAll: true, set: { 'exif:Copyright': '© Sam Lee' } });
  const out = new Uint8Array(await editor.evaluate(async s => Array.from(new Uint8Array(await (await s.result().toBlob({ type: 'image/png', metadata: 'preserve' })).arrayBuffer()))));
  expect(listMetadata(readMetadata(out)).map(e => [e.key, e.value])).toEqual([['exif:Copyright', '© Sam Lee']]);
  // The same actions are visible to a session's host: a refusal leaves the recipe as it was.
  const refused = await editor.evaluate(s => { const before = s.state.recipe; s.run('metadata.set', { values: { 'exif:FNumber': '2' }, label: 'x' }); return s.state.recipe === before; }).catch(() => true);
  expect(refused).toBe(true);
});

test('PNG and WebP fixtures read their XMP, IPTC text and storage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await open(page, 'harbour.png', withPngMetadata(await encoded(page, 'image/png', 600), { exif: cameraExif({ gps: false }), xmp: lightroomXmp(), iptc: true }), 'image/png');
  await chooseInfo(page);
  let panel = page.locator('.gi-info');
  await expect(row(panel, 'Type').locator('dd')).toHaveText('PNG · RGBA');
  await expect(row(panel, 'Compression').locator('dd')).toHaveText('Lossless');
  await expect(row(panel, 'City').locator('dd')).toContainText('Sydney');
  await expect(row(panel, 'Coordinates')).toHaveCount(1); // From XMP alone, since the EXIF has no GPS.
  await panel.getByRole('button', { name: /^All fields/ }).click();
  await expect(panel.getByRole('region', { name: 'IPTC', exact: true })).toContainText('Country-PrimaryLocationName');
  await open(page, 'harbour.webp', withWebpMetadata(await encoded(page, 'image/webp', 600), { exif: cameraExif(), xmp: lightroomXmp() }), 'image/webp');
  // A newly opened picture starts on its default tool.
  await chooseInfo(page);
  panel = page.locator('.gi-info');
  await expect(row(panel, 'Type').locator('dd')).toHaveText(/^WebP · RGB/);
  await expect(row(panel, 'Model').locator('dd')).toContainText('Canon EOS R5');
});

test('the Info panel passes axe in light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const mode of ['dark', 'light']) {
    await ready(page, `&mode=${mode}`);
    const panel = await camera(page);
    await panel.getByRole('button', { name: /^All fields/ }).click();
    const results = await new AxeBuilder({ page }).include('.gi-info').analyze();
    expect(results.violations).toEqual([]);
  }
});

// Screenshots for review: GI_SHOTS=1 writes them under /tmp/gi-w3.
for (const [name, query] of [['dark', ''], ['light', '&mode=light'], ['rtl', '&dir=rtl']] as const) for (const width of [1440, 1100]) {
  test(`screenshot ${name} ${width}`, async ({ page }) => {
    test.skip(!process.env.GI_SHOTS, 'Set GI_SHOTS=1 to capture review screenshots');
    await page.setViewportSize({ width, height: 1000 });
    await ready(page, query);
    const jpeg = withJpegMetadata(await encoded(page, 'image/jpeg'), { exif: cameraExif(), xmp: lightroomXmp(), iptc: true });
    await open(page, 'harbour-dawn.jpg', jpeg, 'image/jpeg');
    // The rail's label is translated under RTL, so select the tool through its action.
    await page.evaluate(() => { const d = window.__workspaceDemo!; d.pictures.find(p => p.id === d.selected)!.editor.run('tool.select', 'info'); });
    await expect(page.locator('.gi-info')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/gi-w3/info-${name}-${width}.png` });
    const scroller = page.locator('.gi-info').locator('xpath=ancestor-or-self::*[contains(@class,"scroll") or contains(@class,"gi-tool-settings")][1]');
    if (await scroller.count()) { await scroller.evaluate(el => { el.scrollTop = el.scrollHeight / 2; }); await page.waitForTimeout(200); await page.screenshot({ path: `/tmp/gi-w3/info-${name}-${width}-scrolled.png` }); }
    // Row controls on hover, and a field being edited.
    if (name !== 'rtl') {
      const creator = row(page.locator('.gi-info'), 'Creator');
      await creator.scrollIntoViewIfNeeded(); await creator.hover(); await page.waitForTimeout(300);
      const clip = async () => { const box = (await creator.boundingBox())!, panel = (await page.locator('.gi-info').boundingBox())!; return { x: panel.x - 8, y: box.y - 72, width: panel.width + 16, height: box.height + 144 }; };
      await page.screenshot({ path: `/tmp/gi-w3/info-${name}-${width}-hover.png`, clip: await clip() });
      await creator.getByRole('button', { name: 'Edit Creator' }).click(); await page.waitForTimeout(200);
      await page.screenshot({ path: `/tmp/gi-w3/info-${name}-${width}-editing.png`, clip: await clip() });
      await page.keyboard.press('Escape');
    }
    // A tall window shows the whole panel at once, with every field listed, for review.
    await page.setViewportSize({ width, height: 3400 });
    await page.locator('.gi-info .fa-accordion-trigger, .gi-info h3 button').last().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/gi-w3/info-${name}-${width}-full.png`, clip: { x: name === 'rtl' ? 0 : width - 420, y: 140, width: 420, height: 3260 } });
  });
}
