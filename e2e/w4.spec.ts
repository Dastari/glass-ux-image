// Workstream W4: presets, looks and effects that do what they say, with faithful thumbnails.
import type { OpenPicture, ImageWorkspace } from '../src/editor/index.js';
import type { EffectEntry } from '../src/filters/effects/catalogue.js';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
declare global {
  interface Window {
    __workspaceDemo?: { pictures: OpenPicture[]; selected: string | null; workspace: ImageWorkspace | undefined };
  }
}
test.setTimeout(90_000);
test.use({ viewport: { width: 1440, height: 1000 } });
const shots = '/tmp/gi-w4/browser';
async function workspace(page: Page, query = '') {
  await page.goto(`/?view=workspace${query}`);
  await expect(page.locator('.gi-image-editor .gi-stage canvas')).toHaveCount(1);
  await page.waitForFunction(() => window.__workspaceDemo?.pictures[0]?.editor.state.status === 'ready');
}
const entries = (page: Page) => page.evaluate(() => ((window.__workspaceDemo!.pictures[0]!.editor.state.recipe.filters['effects-stack'] as { entries: EffectEntry[] } | undefined)?.entries ?? []).map(e => ({ filter: e.filter, params: e.params })));
async function category(page: Page, name: string) {
  await page.locator('.gi-workspace-right [role=toolbar] button[aria-label="Effects"]').click();
  const trigger = page.locator('.gi-workspace-right .fa-accordion-trigger', { hasText: name });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  return page.getByRole('radiogroup', { name, exact: true });
}

test('gallery defaults are fitted to the picture, so a chosen effect matches its thumbnail', async ({ page }) => {
  await workspace(page);
  const gallery = await category(page, 'Artistic');
  await expect(gallery.locator('img')).toHaveCount(4, { timeout: 30_000 });
  await gallery.getByRole('radio', { name: 'Cartoon', exact: true }).click();
  // The sample is 1500 pixels wide: the reference radius of 3 at a 1000-pixel long edge becomes 4.5.
  await expect.poll(() => entries(page)).toEqual([{ filter: 'cartoon', params: { amount: 1, radius: 4.5 } }]);
});

/** Mean byte brightness of each thumbnail in a gallery, keyed by its label. */
async function means(gallery: ReturnType<Page['getByRole']>) {
  await expect(gallery.locator('img').first()).toBeVisible({ timeout: 30_000 });
  return Object.fromEntries(await gallery.getByRole('radio').evaluateAll(async radios => Promise.all(radios.map(async radio => {
    const img = radio.querySelector('img')!; await img.decode();
    const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data; let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i]! + data[i + 1]! + data[i + 2]!;
    return [radio.textContent?.trim() ?? '', sum / (data.length / 4 * 3)] as const;
  })))) as Record<string, number>;
}

test('Cartoon, Oil painting and Watercolour thumbnails keep the picture\'s tones instead of posterising them', async ({ page }) => {
  await workspace(page);
  // A Gaussian blur keeps the mean, so its thumbnail stands for the original's brightness.
  const blur = await category(page, 'Blur');
  await expect(blur.locator('img')).toHaveCount(5, { timeout: 30_000 });
  const reference = (await means(blur))['Gaussian blur']!;
  const gallery = await category(page, 'Artistic');
  await expect(gallery.locator('img')).toHaveCount(4, { timeout: 30_000 });
  const artistic = await means(gallery);
  // The old linear-light quantising crushed the dusk sample's water and shadows to black, a third darker.
  for (const name of ['Cartoon', 'Oil painting']) expect(Math.abs(artistic[name]! - reference) / reference).toBeLessThan(.15);
  // Washes lighten towards the paper, but not to white.
  expect(artistic['Watercolour']!).toBeGreaterThan(reference);
  expect(artistic['Watercolour']!).toBeLessThan(reference * 1.6);
  mkdirSync(shots, { recursive: true });
  await gallery.screenshot({ path: `${shots}/artistic-gallery.png` });
});

test('a Library look applies as an ordered, fitted effects stack that the Effects panel shows', async ({ page }) => {
  await workspace(page);
  await page.getByRole('treeitem', { name: 'Silver screen', exact: true }).click();
  await page.waitForFunction(() => window.__workspaceDemo!.pictures[0]!.editor.history.nodes.map(n => n.label).join('|') === '|Silver screen');
  const applied = await entries(page);
  expect(applied.map(e => e.filter)).toEqual(['colour-grade', 'film-grain', 'vignette']);
  expect(applied[0]!.params).toMatchObject({ mono: 1 });
  // Grain size .6 at the reference edge, fitted to 1500 pixels.
  expect(applied[1]!.params).toMatchObject({ size: .9 });
  await category(page, 'Applied effects');
  const stack = page.getByRole('group', { name: 'Applied effects', exact: true });
  await expect(stack.getByRole('group', { name: 'Colour grade', exact: true })).toBeVisible();
  await expect(stack.getByRole('group', { name: 'Film grain', exact: true })).toBeVisible();
  // The picture really is black and white.
  const chroma = await page.evaluate(async () => {
    const editor = window.__workspaceDemo!.pictures[0]!.editor, p = await editor.readPreview(120);
    let worst = 0;
    for (let i = 0; i < p.data.length; i += 4) worst = Math.max(worst, Math.abs(p.data[i]! - p.data[i + 1]!), Math.abs(p.data[i + 1]! - p.data[i + 2]!));
    return worst;
  });
  expect(chroma).toBeLessThan(.01);
});

for (const scheme of ['light', 'dark'] as const)
  test(`looks and artistic galleries screenshot in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await workspace(page);
    mkdirSync(shots, { recursive: true });
    const looks = await category(page, 'Looks and presets');
    await expect(looks.locator('img')).toHaveCount(6, { timeout: 30_000 });
    await looks.screenshot({ path: `${shots}/looks-${scheme}.png` });
    const artistic = await category(page, 'Artistic');
    await expect(artistic.locator('img')).toHaveCount(4, { timeout: 30_000 });
    await artistic.screenshot({ path: `${shots}/artistic-${scheme}.png` });
    await page.screenshot({ path: `${shots}/workspace-${scheme}.png` });
  });
