import AxeBuilder from '@axe-core/playwright';
import { expectTiming } from "./fixtures/speed.js";
import { expect, test, type Page } from '@playwright/test';
import type { EffectEntry } from '../src/filters/effects/catalogue.js';
const stack = (page: Page) => page.getByRole('group', { name: 'Applied effects', exact: true });
async function open(page: Page, backend = 'auto') {
    await page.goto(`/?format=image/png&backend=${backend}`);
    await page.evaluate(async () => { const c = new OffscreenCanvas(96, 64), ctx = c.getContext('2d')!; ctx.fillStyle = '#804020'; ctx.fillRect(0, 0, 96, 64); const blob = await c.convertToBlob({ type: 'image/png' }), input = document.querySelector<HTMLInputElement>('input[aria-label="Open an image"]')!, data = new DataTransfer(); data.items.add(new File([blob], 'solid.png', { type: 'image/png' })); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect(page.locator('.gi-photo-foot')).toContainText('96 × 64');
    await page.getByRole('radio', { name: 'Effects', exact: true }).click();
}
async function save(page: Page) { await page.evaluate(() => { window.__saved = undefined; }); await page.getByRole('button', { name: /Save copy/ }).click(); await page.waitForFunction(() => window.__saved); return page.evaluate(async () => { const saved = window.__saved!, bitmap = await createImageBitmap(await (await fetch(saved.url)).blob()), c = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = c.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); const recipe = (saved as unknown as {
    recipe: {
        filters: Record<string, {
            entries: EffectEntry[];
        }>;
    };
}).recipe; return { width: bitmap.width, height: bitmap.height, bytes: Array.from(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data), entries: recipe.filters['effects-stack']?.entries ?? [], warp: recipe.filters['effects-warps']?.entries ?? [] }; }); }
const decode = (n: number) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
const encode = (n: number) => Math.round(Math.min(1, n <= .0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - .055) * 255);
test.use({ viewport: { width: 1440, height: 1000 } });
for (const backend of ['auto', 'cpu'])
    test(`${backend}: saves perceptual sepia, stacks duplicate effects, orders, changes strength and removes with undo`, async ({ page }) => {
        await open(page, backend);
        await page.getByRole('radiogroup', { name: 'Vintage', exact: true }).getByRole('radio', { name: 'Sepia', exact: true }).click();
        const saved = await save(page);
        // Sepia is the CSS matrix on perceptual (sRGB-encoded) values, as photo apps apply it.
        const c = [128, 64, 32].map(n => n / 255), expected = [.393 * c[0]! + .769 * c[1]! + .189 * c[2]!, .349 * c[0]! + .686 * c[1]! + .168 * c[2]!, .272 * c[0]! + .534 * c[1]! + .131 * c[2]!].map(n => encode(decode(Math.min(1, n))));
        expect([saved.width, saved.height]).toEqual([96, 64]);
        expected.forEach((v, k) => expect(Math.abs(saved.bytes[k]! - v)).toBeLessThanOrEqual(2));
        expect(saved.warp).toEqual([]);
        await page.getByRole('radiogroup', { name: 'Vintage', exact: true }).getByRole('radio', { name: 'Sepia', exact: true }).click();
        await page.getByRole('radiogroup', { name: 'Vintage', exact: true }).getByRole('radio', { name: 'Faded colours', exact: true }).click();
        expect((await save(page)).entries.map(e => e.filter)).toEqual(['sepia', 'sepia', 'faded']);
        await stack(page).getByRole('group', { name: 'Faded colours', exact: true }).getByRole('button', { name: 'Move earlier' }).click();
        expect((await save(page)).entries.map(e => e.filter)).toEqual(['sepia', 'faded', 'sepia']);
        const fade = stack(page).getByRole('group', { name: 'Faded colours', exact: true });
        await fade.getByRole('slider', { name: 'Strength', exact: true }).focus();
        await page.keyboard.press('Home');
        expect((await save(page)).entries[1]!.strength).toBe(0);
        await fade.getByRole('button', { name: 'Remove effect' }).click();
        expect((await save(page)).entries).toHaveLength(2);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        expect((await save(page)).entries).toHaveLength(3);
    });
test('LUT import uses Glass UX file parts, reports invalid input and saves the imported transform', async ({ page }) => {
    await open(page);
    const file = page.getByLabel('Import .cube LUT', { exact: true });
    await file.setInputFiles({ name: 'bad.cube', mimeType: 'text/plain', buffer: Buffer.from('LUT_1D_SIZE 2') });
    await expect(page.getByRole('status').filter({ hasText: 'The LUT could not be read.' })).toBeVisible();
    const values = Array.from({ length: 8 }, (_, i) => `${(i >> 2) & 1} ${i & 1} ${(i >> 1) & 1}`).join('\n');
    await file.setInputFiles({ name: 'swap.cube', mimeType: 'text/plain', buffer: Buffer.from(`LUT_3D_SIZE 2\n${values}`) });
    await expect(stack(page).getByRole('group', { name: '3D LUT', exact: true })).toBeVisible();
    const saved = await save(page);
    expect(saved.bytes.slice(0, 3)).toEqual([32, 128, 64]);
});
test('warps are registered, presets append, and every category has live thumbnails', async ({ page }) => {
    await open(page);
    await page.getByRole('radiogroup', { name: 'Distortion', exact: true }).getByRole('radio', { name: 'Twirl', exact: true }).click();
    expect((await save(page)).warp[0]?.filter).toBe('twirl');
    await page.getByRole('radiogroup', { name: 'Looks and presets', exact: true }).getByRole('radio', { name: 'Warm film', exact: true }).click();
    // Warm film is a colour grade, grain and a vignette, appended after the twirl.
    expect((await save(page)).entries.map(e => e.filter)).toEqual(['twirl', 'colour-grade', 'film-grain', 'vignette']);
    await expect(page.locator('.gi-filter-thumb img')).toHaveCount(39);
    expect(await page.locator('.gi-filter-thumb img').evaluateAll(nodes => nodes.every(n => (n as HTMLImageElement).naturalWidth > 0))).toBe(true);
});
test('gallery workers generate previews without long main-thread tasks', async ({ page }) => {
    // Isolate thumbnail work from software WebGL context startup and shader compilation.
    await open(page, 'cpu');
    const result = await page.evaluate(async () => { let worst = 0, last = performance.now(), running = true; const tick = (now: number) => { worst = Math.max(worst, now - last); last = now; if (running)
        requestAnimationFrame(tick); }; requestAnimationFrame(tick); await new Promise<void>(resolve => { const start = performance.now(), poll = () => { if (document.querySelectorAll('.gi-filter-thumb img').length >= 30 || performance.now() - start > 10000) {
        running = false;
        resolve();
    }
    else
        setTimeout(poll, 20); }; poll(); }); return { worst, count: document.querySelectorAll('.gi-filter-thumb img').length }; });
    expect(result.count).toBeGreaterThanOrEqual(30);
    expectTiming("Effects gallery, longest frame", result.worst, 50);
});
test('effects controls have no axe violations', async ({ page }) => { await open(page); await page.getByRole('radiogroup', { name: 'Vintage', exact: true }).getByRole('radio', { name: 'Sepia', exact: true }).click(); const { violations } = await new AxeBuilder({ page }).include('.gi-photo-editor').exclude('.gi-stage').analyze(); expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]); });
test('standalone gallery takes a source and plain lists without an editor provider', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.effectsDemo.mountGallery());
    const gallery = page.getByRole('radiogroup', { name: 'Filter gallery', exact: true }), button = gallery.getByRole('radio', { name: 'Sepia', exact: true });
    await expect(gallery.locator('img')).toHaveCount(1);
    await button.click();
    await expect(button).toBeChecked();
    await page.evaluate(() => window.effectsDemo.unmountGallery());
    await expect(gallery).toHaveCount(0);
});
declare global {
    interface Window {
        effectsDemo: {
            mountGallery: () => void;
            unmountGallery: () => void;
        };
    }
}
