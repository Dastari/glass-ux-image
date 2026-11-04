// Workstream F: Focus fit, the file provider reader under Glass UX's conformance suite, the RGB
// histogram, legible filter thumbnails, the Resize constrain switch and the narrow-box layout.
import type { OpenPicture, ImageWorkspace } from '../src/editor/index.js';
import type { FileProviderReport } from 'glass-ux/testing/file-provider';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { crc32, deflateSync } from 'node:zlib';
declare global {
  interface Window {
    __workspaceDemo?: { pictures: OpenPicture[]; selected: string | null; workspace: ImageWorkspace | undefined };
    providerProof?: {
      conformance(): Promise<FileProviderReport>;
      open(options?: { unsized?: boolean }): Promise<{ width: number; height: number; bytes: number }>;
      stale(): Promise<string>;
    };
  }
}

test.setTimeout(60_000);

/** A plain RGB PNG of one colour. */
function png(width: number, height: number) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows.set([200, 120, 40], y * (width * 3 + 1) + 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), check = Buffer.alloc(4);
    length.writeUInt32BE(data.length); check.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
test.use({ viewport: { width: 1440, height: 900 } });

async function workspace(page: Page, query = '') {
  await page.goto(`/?view=workspace${query}`);
  await expect(page.locator('.gi-image-editor .gi-stage canvas')).toHaveCount(1);
  await page.waitForFunction(() => window.__workspaceDemo?.pictures[0]?.editor.state.status === 'ready');
}

/** The picture's box on screen, from the renderer's view, beside the stage and its clear area. */
const geometry = (page: Page) => page.evaluate(() => {
  const editor = window.__workspaceDemo!.pictures[0]!.editor, view = editor.renderer!.view, dpr = devicePixelRatio;
  const k = view.zoom / dpr, size = editor.state.size!;
  const stage = document.querySelector('.gi-stage')!.getBoundingClientRect(), clear = document.querySelector('.gi-stage-clear')!.getBoundingClientRect();
  const left = stage.left + view.width / dpr / 2 - view.centerX * k, top = stage.top + view.height / dpr / 2 - view.centerY * k;
  const box = (r: { left: number; top: number; right: number; bottom: number }) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  return { picture: { left, top, right: left + size.width * k, bottom: top + size.height * k }, stage: box(stage), clear: box(clear), zoom: k };
});
const inside = (inner: { left: number; top: number; right: number; bottom: number }, outer: typeof inner) =>
  inner.left >= outer.left - 1 && inner.top >= outer.top - 1 && inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1;

for (const dir of ['ltr', 'rtl'] as const) test(`Focus fits the picture to the area floating panes leave clear (${dir})`, async ({ page }) => {
  await workspace(page, dir === 'rtl' ? '&dir=rtl&lang=ar' : '');
  const docked = await geometry(page);
  // Docked: nothing floats, so the clear area is the stage.
  expect(docked.clear).toEqual(docked.stage);
  await page.evaluate(() => window.__workspaceDemo!.pictures[0]!.editor.run('workspace.mode', 'focus'));
  await expect(page.locator('.gi-image-editor')).toHaveAttribute('data-workspace', 'focus');
  await expect.poll(async () => { const g = await geometry(page); return inside(g.picture, g.clear) && g.clear.right - g.clear.left < g.stage.right - g.stage.left; }).toBe(true);
  // Let the floating panes finish settling before measuring.
  let focus = await geometry(page);
  await expect.poll(async () => { const previous = focus; focus = await geometry(page); return JSON.stringify(previous) === JSON.stringify(focus); }, { intervals: [250] }).toBe(true);
  // Both side panes float: the clear area is narrower than the stage at both ends, and the picture
  // is centred in it, not in the stage behind the panes.
  expect(focus.clear.left).toBeGreaterThan(focus.stage.left + 100);
  expect(focus.clear.right).toBeLessThan(focus.stage.right - 100);
  expect(Math.abs((focus.picture.left + focus.picture.right) / 2 - (focus.clear.left + focus.clear.right) / 2)).toBeLessThan(2);
  // Zoom and pan still use the whole stage: zooming in lets the picture run under the panes.
  await page.evaluate(() => { const view = window.__workspaceDemo!.pictures[0]!.editor.view!; view.zoomIn(); view.zoomIn(); });
  await expect.poll(async () => { const g = await geometry(page); return g.picture.right - g.picture.left > focus.clear.right - focus.clear.left; }, { message: JSON.stringify(focus) }).toBe(true);
  // Fit returns it to the clear area.
  await page.evaluate(() => window.__workspaceDemo!.pictures[0]!.editor.view!.fit());
  await expect.poll(async () => { const g = await geometry(page); return inside(g.picture, g.clear); }).toBe(true);
});

test('the file reader passes Glass UX FileProvider conformance in the browser and pins versions', async ({ page }) => {
  await page.goto('/?view=engine&provider-test');
  await page.waitForFunction(() => Boolean(window.providerProof));
  const report = await page.evaluate(() => window.providerProof!.conformance());
  console.log(`FileProvider conformance: ${report.checks.filter(c => c.status === 'passed').length} passed, ${report.checks.filter(c => c.status === 'skipped').length} skipped, ${report.failed.length} failed`);
  expect(report.failed).toEqual([]);
  expect(report.checks.filter(c => c.status === 'passed').length).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.providerProof!.open())).toMatchObject({ width: 40, height: 30 });
  expect(await page.evaluate(() => window.providerProof!.open({ unsized: true }))).toMatchObject({ width: 40, height: 30 });
  expect(await page.evaluate(() => window.providerProof!.stale())).toBe('changed');
});

test('the histogram overlays red, green and blue by default and offers each channel and luminance', async ({ page }) => {
  await workspace(page);
  const histogram = page.locator('.gi-workspace-right-content > .gi-develop-histogram');
  await expect(histogram).toHaveAttribute('data-channel', 'rgb');
  const charts = histogram.locator('.fa-chart');
  await expect(charts).toHaveCount(3);
  for (const channel of ['red', 'green', 'blue']) {
    const chart = histogram.locator(`[data-histogram-channel="${channel}"]`);
    await expect.poll(() => chart.locator('.fa-chart-bar').evaluateAll(bars => bars.filter(bar => bar.getBoundingClientRect().height > 0).length)).toBeGreaterThan(0);
  }
  // Each channel draws in its own colour, whatever the palette.
  const fills = await histogram.locator('.fa-chart-sheen-bottom').evaluateAll(stops => stops.map(stop => getComputedStyle(stop).stopColor));
  expect(new Set(fills).size).toBe(3);
  // The well is the stage's neutral in light mode too.
  await page.goto('/?view=workspace&mode=light');
  await page.waitForFunction(() => window.__workspaceDemo?.pictures[0]?.editor.state.status === 'ready');
  const well = await page.locator('.gi-workspace-right-content > .gi-develop-histogram > .gi-develop-histogram-chart').evaluate(e => getComputedStyle(e).backgroundColor);
  expect(well).toMatch(/oklch\(0\.235 0 0\)|rgb\(3[0-9], 3[0-9], 3[0-9]\)/);
  await page.locator('.gi-workspace-right-content > .gi-develop-histogram .fa-segmented-trigger').click();
  await page.getByRole('menuitemradio', { name: 'Luminance', exact: true }).click();
  await expect(page.locator('.gi-workspace-right-content > .gi-develop-histogram')).toHaveAttribute('data-channel', 'luminance');
  await expect(page.locator('.gi-workspace-right-content > .gi-develop-histogram .fa-chart')).toHaveCount(1);
});

test('filter thumbnails are sharp crops of the picture, and Pencil sketch shows its lines', async ({ page }) => {
  await workspace(page);
  await page.locator('.gi-workspace-right [role=toolbar] button[aria-label="Effects"]').click();
  await page.locator('.gi-workspace-right .fa-accordion-trigger', { hasText: 'Artistic' }).click();
  const gallery = page.getByRole('radiogroup', { name: 'Artistic', exact: true });
  await expect(gallery.locator('img')).toHaveCount(4, { timeout: 20_000 });
  // Each thumbnail has at least as many pixels as it is drawn with at twice the density.
  const sizes = await gallery.locator('img').evaluateAll(images => images.map(i => { const img = i as HTMLImageElement; return [img.naturalWidth, img.getBoundingClientRect().width * 2]; }));
  for (const [natural, drawn] of sizes) expect(natural).toBeGreaterThanOrEqual(Math.min(240, drawn!));
  // A sketch is mostly paper, with dark lines: count clearly dark pixels.
  const sketch = gallery.getByRole('radio', { name: 'Pencil sketch', exact: true }).locator('img');
  const dark = await sketch.evaluate(async (node) => {
    const img = node as HTMLImageElement; await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight), context = canvas.getContext('2d')!;
    context.drawImage(img, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data; let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 160) count++;
    return count / (data.length / 4);
  });
  expect(dark).toBeGreaterThan(0.005);
});

test('Resize constrains proportions with a labelled switch (R15.4)', async ({ page }) => {
  await page.goto('/?format=image/png');
  await page.getByLabel('Open an image').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png(400, 200) });
  await expect(page.locator('.gi-photo-foot')).toContainText('400 × 200');
  await page.getByRole('radio', { name: 'Resize' }).click();
  const constrain = page.getByRole('switch', { name: 'Constrain aspect', exact: true });
  await expect(constrain).toBeChecked();
  const width = page.getByRole('textbox', { name: 'Width', exact: true }), height = page.getByRole('textbox', { name: 'Height', exact: true });
  await width.fill('300'); await width.press('Tab');
  await expect(height).toHaveValue('150');
  await constrain.click();
  await expect(constrain).not.toBeChecked();
  await width.fill('100'); await width.press('Tab');
  await expect(height).toHaveValue('150');
  const { violations } = await new AxeBuilder({ page }).include('.gi-photo-editor').exclude('.gi-stage').analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test('in a narrower box the workspace puts the library in a tab, so the picture keeps the width', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 860 });
  await workspace(page);
  await expect(page.getByRole('tab', { name: /Library/ })).toBeVisible();
  const narrow = await geometry(page);
  expect(narrow.stage.right - narrow.stage.left).toBeGreaterThan(600);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('tab', { name: /Library/ })).toHaveCount(0);
});
