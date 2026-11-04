import type { OpenPicture, ImageWorkspace } from '../src/editor/index.js';
declare global { interface Window { __workspaceDemo?: { pictures: OpenPicture[]; selected: string | null; workspace: ImageWorkspace | undefined } } }
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90000);
test.use({ viewport: { width: 1440, height: 900 } });

const ready = async (page: Page, query = '') => {
  await page.goto(`/?view=workspace${query}`);
  await expect(page.locator('.gi-image-editor .gi-stage canvas')).toHaveCount(1);
  await page.waitForFunction(() => window.__workspaceDemo?.pictures[0]?.editor.state.status === 'ready');
};
const state = (page: Page) => page.evaluate(() => {
  const e = window.__workspaceDemo!.pictures[0]!.editor, p = e.state.recipe.filters.perspective as { vertical: number; horizontal: number; rotate: number; guides: unknown[] } | undefined;
  return { distort: e.state.recipe.geometry.distort ?? null, perspective: p ?? null, labels: e.history.nodes.map(n => n.label), size: e.state.size, crop: e.state.recipe.geometry.crop ?? null, source: e.state.sourceSize };
});
const choose = async (page: Page) => {
  await page.evaluate(() => window.__workspaceDemo!.pictures[0]!.editor.run('tool.select', 'perspective'));
  await expect(page.locator('.gi-perspective')).toBeVisible();
};
/** The picture's box on screen, from the overlay's grid. */
const pictureBox = async (page: Page) => (await page.locator('.gi-perspective .gi-rotate-fine').boundingBox())!;
/** Lean from plumb of each guide on screen, in degrees, from its end handles. */
const leans = (page: Page) => page.locator('.gi-perspective-guide').evaluateAll(groups => groups.map(g => {
  const [a, b] = [...g.querySelectorAll('.gi-rotate-end-face')].map(c => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
  return Math.abs(Math.atan2(b![0]! - a![0]!, b![1]! - a![1]!) * 180 / Math.PI);
}));
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to, { steps: 8 }); await page.mouse.up();
}

test('the perspective rail tool corrects keystone with sliders, each drag one undo step', async ({ page }) => {
  await ready(page);
  await choose(page);
  const panel = page.locator('.gi-workspace-right');
  const vertical = panel.getByRole('slider', { name: 'Vertical', exact: true });
  await vertical.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('PageDown');
  await expect.poll(async () => (await state(page)).perspective?.vertical ?? 0).toBeLessThan(-5);
  const after = await state(page);
  expect(after.distort).not.toBeNull();
  // The top widens for negative vertical.
  const [tl, tr, br, bl] = after.distort!;
  expect(Math.hypot(tr[0] - tl[0], tr[1] - tl[1])).toBeGreaterThan(Math.hypot(br[0] - bl[0], br[1] - bl[1]));
  // Scale above 100% zooms in and keeps the output size.
  const sized = after.size!;
  const scale = panel.getByRole('slider', { name: 'Scale', exact: true });
  await scale.focus(); await page.keyboard.press('PageUp');
  await expect.poll(async () => (await state(page)).crop).not.toBeNull();
  const zoomed = await state(page);
  expect(Math.abs(zoomed.size!.width - sized.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(zoomed.size!.height - sized.height)).toBeLessThanOrEqual(1);
  // The rail's Reset removes the correction in one step.
  await page.locator('.gi-tool-rail').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(async () => (await state(page)).distort).toBeNull();
  const labels = (await state(page)).labels;
  expect(labels[labels.length - 1]).toMatch(/Reset/);
  const { violations } = await new AxeBuilder({ page }).include('.gi-workspace-right').analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test('two guides drawn along converging edges make them plumb; ends move and delete by keyboard', async ({ page }) => {
  await ready(page);
  await choose(page);
  const box = await pictureBox(page), x = (f: number) => box.x + box.width * f, y = (f: number) => box.y + box.height * f;
  // Edges that lean towards each other at the top, as a camera tilted up at a building shows them.
  await drag(page, [x(.27), y(.15)], [x(.2), y(.85)]);
  await expect(page.locator('.gi-workspace-right')).toContainText('Draw one more line');
  expect((await state(page)).distort).toBeNull();
  await drag(page, [x(.73), y(.15)], [x(.8), y(.85)]);
  await expect.poll(async () => (await state(page)).perspective?.guides.length).toBe(2);
  const solved = await state(page);
  expect(solved.perspective!.vertical).toBeLessThan(-3);
  expect(solved.labels.filter(l => l === 'Perspective')).toHaveLength(2);
  // On screen, both guides now stand plumb.
  await expect.poll(async () => Math.max(...await leans(page))).toBeLessThan(.5);
  await page.screenshot({ path: '/tmp/gi-e-perspective-guided-dark.png' });
  // A guide's end is a keyboard control: arrows nudge it, Delete removes the guide.
  const start = page.getByRole('button', { name: 'Vertical guide 1, start', exact: true });
  await start.focus(); await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await state(page)).labels.length, { timeout: 3000 }).toBe(solved.labels.length + 1);
  await start.focus(); await page.keyboard.press('Delete');
  await expect.poll(async () => (await state(page)).perspective?.guides.length).toBe(1);
  await page.getByRole('button', { name: 'Clear guides', exact: true }).click();
  await expect.poll(async () => (await state(page)).perspective?.guides.length ?? 0).toBe(0);
});

test('Fill edges synthesises the uncovered corners as one undo step without stalling frames', async ({ page }) => {
  await ready(page);
  await choose(page);
  const panel = page.locator('.gi-workspace-right');
  const fill = panel.getByRole('button', { name: 'Fill edges', exact: true });
  await expect(fill).toHaveAttribute('aria-disabled', 'true');
  const vertical = panel.getByRole('slider', { name: 'Vertical', exact: true });
  await vertical.focus(); await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown');
  await expect(fill).not.toHaveAttribute('aria-disabled', 'true');
  const before = await state(page);
  // Watch the main thread while the worker fills.
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __tasks: number[] }; w.__gaps = []; w.__tasks = [];
    let last = performance.now(); const tick = (t: number) => { w.__gaps.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    new PerformanceObserver(list => { for (const entry of list.getEntries()) w.__tasks.push(entry.duration); }).observe({ type: 'longtask' });
  });
  const started = Date.now();
  await fill.click();
  await expect.poll(async () => (await state(page)).labels.at(-1), { timeout: 60000 }).toBe('Fill edges');
  const took = Date.now() - started;
  const { gaps, tasks } = await page.evaluate(() => { const w = window as unknown as { __gaps: number[]; __tasks: number[] }; return { gaps: w.__gaps.slice(1), tasks: w.__tasks }; });
  const after = await state(page);
  expect(after.distort).toBeNull();
  expect(after.source).toEqual(before.size);
  expect(after.size).toEqual(before.size);
  console.log(`Fill edges on ${before.size!.width} × ${before.size!.height}: ${took} ms; longest main-thread task ${Math.round(Math.max(0, ...tasks))} ms; longest frame gap ${Math.round(Math.max(...gaps))} ms over ${gaps.length} frames`);
  // Inpainting and encoding run in a worker; the page's own thread only reads tiles in slices.
  expect(Math.max(0, ...tasks)).toBeLessThan(250);
  // The corners are now opaque picture, not transparency.
  const corners = await page.evaluate(async () => {
    const e = window.__workspaceDemo!.pictures[0]!.editor, pixels = await e.readPreview(256);
    const at = (x: number, y: number) => pixels.data[(y * pixels.width + x) * 4 + 3]!;
    return [at(0, 0), at(pixels.width - 1, 0), at(0, pixels.height - 1), at(pixels.width - 1, pixels.height - 1)];
  });
  for (const alpha of corners) expect(alpha).toBeGreaterThan(.99);
  await page.screenshot({ path: '/tmp/gi-e-fill-dark.png' });
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect.poll(async () => (await state(page)).distort).not.toBeNull();
  expect((await state(page)).source).toEqual(before.source);
});

test('Fill edges is a session action a host can see by id', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { const e = window.__workspaceDemo!.pictures[0]!.editor; e.commit({ geometry: { ...e.state.recipe.geometry, angle: 7 } }, { label: 'Turn' }); });
  // Refusal itself is covered by the unit tests, through a host's onAction.
  expect(await page.evaluate(() => window.__workspaceDemo!.pictures[0]!.editor.action('image.fillEdges'))).toEqual({ available: true, enabled: true });
});

for (const [mode, dir] of [['light', 'ltr'], ['dark', 'ltr'], ['light', 'rtl'], ['dark', 'rtl']] as const) test(`perspective panel and guides, ${mode} ${dir}`, async ({ page }) => {
  await ready(page, `&mode=${mode}&dir=${dir}${dir === 'rtl' ? '&lang=ar' : ''}`);
  await choose(page);
  const box = await pictureBox(page), x = (f: number) => box.x + box.width * f, y = (f: number) => box.y + box.height * f;
  await drag(page, [x(.3), y(.18)], [x(.24), y(.82)]);
  await drag(page, [x(.7), y(.18)], [x(.76), y(.82)]);
  await expect.poll(async () => (await state(page)).perspective?.guides.length).toBe(2);
  await page.mouse.move(x(.5), y(.2)); await page.mouse.down(); await page.mouse.move(x(.62), y(.22), { steps: 4 });
  await page.screenshot({ path: `/tmp/gi-e-perspective-${mode}-${dir}.png` });
  await page.mouse.up();
  await page.locator('.gi-workspace-right').screenshot({ path: `/tmp/gi-e-perspective-panel-${mode}-${dir}.png` });
  // And the end of the panel: the guide list and Fill edges.
  await page.locator('.gi-workspace-right .gi-fill-edges').evaluate(e => e.scrollIntoView({ block: 'end' }));
  await page.locator('.gi-workspace-right').screenshot({ path: `/tmp/gi-e-perspective-panel-end-${mode}-${dir}.png` });
  const { violations } = await new AxeBuilder({ page }).include('.gi-workspace-right').analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test('Rotate, Crop and Canvas size offer Fill edges only where it applies', async ({ page }) => {
  await ready(page);
  const panel = page.locator('.gi-workspace-right');
  await page.locator('.gi-tool-rail').getByRole('radio', { name: 'Rotate', exact: true }).click();
  const fill = panel.getByRole('button', { name: 'Fill edges', exact: true });
  await expect(fill).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() => { const e = window.__workspaceDemo!.pictures[0]!.editor; e.commit({ geometry: { ...e.state.recipe.geometry, angle: 5 } }, { label: 'Rotate' }); });
  await expect(fill).not.toHaveAttribute('aria-disabled', 'true');
  await panel.screenshot({ path: '/tmp/gi-e-rotate-panel-dark.png' });
  // Crop to fill leaves nothing empty, so the control goes.
  await panel.getByRole('button', { name: 'Crop to fill', exact: true }).click();
  await expect(fill).toHaveCount(0);
  await panel.getByRole('button', { name: 'Show all', exact: true }).click();
  await page.evaluate(() => window.__workspaceDemo!.pictures[0]!.editor.run('tool.select', 'crop'));
  await expect(panel.getByRole('button', { name: 'Fill edges', exact: true })).toBeVisible();
  await page.evaluate(() => { const e = window.__workspaceDemo!.pictures[0]!.editor; e.commit({ geometry: { ...e.state.recipe.geometry, angle: 0 } }, { label: 'Rotate' }); });
  await expect(panel.getByRole('button', { name: 'Fill edges', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__workspaceDemo!.pictures[0]!.editor.run('tool.select', 'canvas-size'));
  await expect(panel.getByRole('button', { name: 'Fill edges', exact: true })).toHaveCount(0);
  await panel.getByRole('textbox', { name: 'Width', exact: true }).fill('2000');
  await panel.getByRole('textbox', { name: 'Width', exact: true }).press('Tab');
  await expect(panel.getByRole('button', { name: 'Fill edges', exact: true })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('.gi-workspace-right').analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});
