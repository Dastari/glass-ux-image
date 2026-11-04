import AxeBuilder from '@axe-core/playwright';
import { expectTiming } from "./fixtures/speed.js";
import { expect, test, type Page } from '@playwright/test';
import type { EditorSession } from '../src/session/index.js';

declare global { interface Window { __retouchDemo?: EditorSession; __layerSession?: EditorSession; layerProjectRoundTrip?: (session: EditorSession) => Promise<number>; __frames?: number[]; __frameStop?: boolean; __tasks?: number[]; __taskObserver?: PerformanceObserver } }
test.use({ viewport: { width: 1440, height: 1000 } });

/** An 800 × 600 mid-grey picture, small enough that each saved file is quick on SwiftShader. */
async function open(page: Page, backend: string, size = { width: 800, height: 600 }) {
  await page.goto(`/?layers-test&format=image/png&backend=${backend}`);
  await page.locator('input[type="file"]').and(page.getByLabel('Open an image', { exact: true })).evaluate(async (input, size) => {
    const canvas = new OffscreenCanvas(size.width, size.height), context = canvas.getContext('2d')!;
    context.fillStyle = '#808080'; context.fillRect(0, 0, size.width, size.height);
    const file = new File([await canvas.convertToBlob({ type: 'image/png' })], 'base.png', { type: 'image/png' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    (input as HTMLInputElement).files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, size);
  await expect(page.locator('.gi-photo-foot')).toContainText(`${size.width.toLocaleString('en')} × ${size.height.toLocaleString('en')}`);
  await tool(page, 'Brush');
  await page.waitForFunction(() => window.__retouchDemo?.state.status === 'ready' && window.__retouchDemo.renderer);
  // The demo clears its own handle when the painting tool unmounts; keep the session.
  await page.evaluate(() => { window.__layerSession = window.__retouchDemo; });
  await settle(page);
}
async function tool(page: Page, name: string) { await page.getByRole('radio', { name, exact: true }).click(); }
async function settle(page: Page) { await page.evaluate(() => window.__layerSession!.renderer!.settle()); }
async function screen(page: Page, x: number, y: number) {
  const box = (await page.locator('.gi-stage').boundingBox())!;
  const p = await page.evaluate(({ x, y }) => {
    const v = window.__layerSession!.renderer!.view, ratio = devicePixelRatio;
    return { x: (v.width / 2 + (x - v.centerX) * v.zoom) / ratio, y: (v.height / 2 + (y - v.centerY) * v.zoom) / ratio };
  }, { x, y });
  return { x: box.x + p.x, y: box.y + p.y };
}
async function stamp(page: Page, x: number, y: number) {
  const count = await page.evaluate(() => window.__layerSession!.history.nodes.length);
  const p = await screen(page, x, y); await page.mouse.click(p.x, p.y);
  await page.waitForFunction(n => window.__layerSession!.history.nodes.length > n, count);
  await settle(page);
}
async function saved(page: Page, ...points: [number, number][]) {
  return page.evaluate(async points => {
    const blob = await window.__layerSession!.result().toBlob({ type: 'image/png' });
    const bitmap = await createImageBitmap(blob), c = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
  }, points);
}
/** A 400 × 300 red layer at the picture's top-left corner, selected. */
async function addRedLayer(page: Page) {
  await tool(page, 'Layers');
  await page.locator('input[type="file"]').and(page.getByLabel('Add image layer', { exact: true })).evaluate(async input => {
    const canvas = new OffscreenCanvas(400, 300), context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 400, 300);
    const file = new File([await canvas.convertToBlob({ type: 'image/png' })], 'red.png', { type: 'image/png' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    (input as HTMLInputElement).files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('treeitem', { name: /red\.png/ })).toBeVisible();
  await settle(page);
  return page.evaluate(() => window.__layerSession!.state.recipe.layers!.at(-1)!.id);
}
const RED = [255, 0, 0, 255], BLACK = [0, 0, 0, 255];

for (const backend of ['cpu', 'auto']) {
  test(`${backend}: the brush paints the selected layer through undo, save, a project file and flatten`, async ({ page }) => {
    await open(page, backend);
    const [base] = await saved(page, [100, 100]);
    const id = await addRedLayer(page);
    await tool(page, 'Brush');
    await expect(page.getByRole('combobox', { name: 'Paint on', exact: true })).toHaveText(/red\.png/);
    await stamp(page, 100, 100);
    const stroke = await page.evaluate(() => window.__layerSession!.state.recipe.strokes!.at(-1)!);
    expect(stroke.layer).toBe(id); expect(stroke.mask).toBeUndefined();
    expect(stroke.points[0]!.x).toBeCloseTo(100, 1); expect(stroke.points[0]!.y).toBeCloseTo(100, 1);
    expect(await saved(page, [100, 100], [300, 250])).toEqual([BLACK, RED]);
    // The stroke is on the layer: hiding the layer shows the base, untouched.
    await page.evaluate(id => window.__layerSession!.run('layers.update', { id, patch: { visible: false } }), id);
    expect(await saved(page, [100, 100])).toEqual([base]);
    await page.evaluate(() => window.__layerSession!.undo()); await settle(page);
    expect(await saved(page, [100, 100])).toEqual([BLACK]);
    // Undo the stroke, redo it.
    await page.evaluate(() => window.__layerSession!.undo()); await settle(page);
    expect(await saved(page, [100, 100])).toEqual([RED]);
    await page.evaluate(() => window.__layerSession!.redo()); await settle(page);
    expect(await saved(page, [100, 100])).toEqual([BLACK]);
    // Through a project file and back.
    const size = await page.evaluate(() => window.layerProjectRoundTrip!(window.__layerSession!));
    expect(size).toBeGreaterThan(0);
    await page.waitForFunction(() => window.__layerSession!.state.status === 'ready');
    const restored = await page.evaluate(() => window.__layerSession!.state.recipe);
    expect(restored.strokes!.map(s => s.layer)).toEqual([id]);
    expect(await saved(page, [100, 100], [300, 250])).toEqual([BLACK, RED]);
    // Flatten bakes the layer stroke into the base, as one step.
    await page.evaluate(() => window.__layerSession!.flatten({ label: 'Flatten layers' }));
    const flat = await page.evaluate(() => window.__layerSession!.state.recipe);
    expect(flat.layers).toEqual([]); expect(flat.strokes).toEqual([]);
    expect(await saved(page, [100, 100], [300, 250])).toEqual([BLACK, RED]);
    await page.evaluate(() => window.__layerSession!.undo()); await settle(page);
    expect(await page.evaluate(() => window.__layerSession!.state.recipe.strokes!.length)).toBe(1);
  });
}

test('masks: hide all, brush reveals, eraser hides, switch off and on, apply, undo and delete', async ({ page }) => {
  await open(page, 'auto');
  const [base, baseFar] = await saved(page, [100, 100], [300, 250]);
  const id = await addRedLayer(page);
  await page.getByRole('button', { name: 'Add mask', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Hide all', exact: true }).click();
  await settle(page);
  expect(await saved(page, [100, 100])).toEqual([base]);
  // Adding a mask makes it the paint target, in both panels.
  await expect(page.getByRole('button', { name: 'Mask', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await new AxeBuilder({ page }).include('.gi-layers-panel').analyze().then(r => r.violations.map(v => v.id))).toEqual([]);
  await tool(page, 'Brush');
  await expect(page.getByRole('combobox', { name: 'Paint on', exact: true })).toHaveText('red.png mask');
  await stamp(page, 100, 100);
  expect(await saved(page, [100, 100])).toEqual([RED]);
  await stamp(page, 200, 150);
  await tool(page, 'Eraser');
  await stamp(page, 100, 100);
  expect(await saved(page, [100, 100], [200, 150], [300, 250])).toEqual([base, RED, baseFar]);
  const strokes = await page.evaluate(() => window.__layerSession!.state.recipe.strokes!);
  expect(strokes.map(s => [s.tool, s.layer, s.mask])).toEqual([['brush', id, true], ['brush', id, true], ['eraser', id, true]]);

  await tool(page, 'Layers');
  const enabled = page.getByRole('switch', { name: 'Enable mask', exact: true });
  await enabled.click(); await settle(page);
  expect(await saved(page, [100, 100], [300, 250])).toEqual([RED, RED]);
  expect(await page.evaluate(() => window.__layerSession!.history.current.label)).toBe('Disable mask');
  await enabled.click(); await settle(page);
  expect(await saved(page, [300, 250])).toEqual([baseFar]);

  // Apply bakes the mask into new pixels: same picture, no mask, no layer strokes.
  const before = await saved(page, [100, 100], [200, 150], [300, 250]);
  const asset = await page.evaluate(() => window.__layerSession!.state.recipe.layers![0]!.asset);
  await page.getByRole('button', { name: 'Mask actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Apply mask', exact: true }).click();
  await page.waitForFunction(() => !window.__layerSession!.state.recipe.layers![0]!.mask);
  await settle(page);
  const applied = await page.evaluate(() => window.__layerSession!.state.recipe);
  expect(applied.strokes).toEqual([]); expect(applied.layers![0]!.asset).not.toBe(asset);
  expect(await page.evaluate(() => window.__layerSession!.history.current.label)).toBe('Apply mask');
  expect(await saved(page, [100, 100], [200, 150], [300, 250])).toEqual(before);
  await page.evaluate(() => window.__layerSession!.undo()); await settle(page);
  expect(await page.evaluate(() => window.__layerSession!.state.recipe.strokes!.length)).toBe(3);

  // Delete drops the mask and its strokes as one step.
  await page.getByRole('button', { name: 'Mask actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete mask', exact: true }).click();
  await settle(page);
  expect(await page.evaluate(() => window.__layerSession!.state.recipe.strokes)).toEqual([]);
  expect(await saved(page, [100, 100], [300, 250])).toEqual([RED, RED]);
  await expect(page.getByRole('button', { name: 'Add mask', exact: true })).toBeVisible();
});

test('a large dab is split across frames and does not hold the page', async ({ page }) => {
  await open(page, 'cpu', { width: 1600, height: 1200 });
  await page.evaluate(() => window.__layerSession!.view!.actualSize());
  await page.waitForFunction(() => window.__layerSession!.renderer!.view.zoom === 1);
  await settle(page);
  await page.evaluate(() => {
    window.__tasks = [];
    window.__taskObserver = new PerformanceObserver(list => { for (const task of list.getEntries()) window.__tasks!.push(task.duration); });
    window.__taskObserver.observe({ type: 'longtask' });
    window.__frames = []; window.__frameStop = false; let last = performance.now();
    const tick = (now: number) => { window.__frames!.push(now - last); last = now; if (!window.__frameStop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const result = await page.evaluate(async () => {
    const s = window.__layerSession!, centre = s.toSource(s.state.size!.width / 2, s.state.size!.height / 2)!;
    const started = performance.now();
    // One 700-pixel healing dab: about 385,000 pixels through twelve Poisson passes.
    s.commit({ strokes: [{ id: 'large', tool: 'heal', params: { size: 700, hardness: .6, strength: .8, sourceOffset: { x: 120, y: 0 } }, points: [{ x: centre[0], y: centre[1] }] }] }, { label: 'Healing brush' });
    await s.renderer!.settle();
    const elapsed = performance.now() - started;
    window.__frameStop = true;
    const tasks = [...window.__tasks!, ...window.__taskObserver!.takeRecords().map(task => task.duration)];
    window.__taskObserver!.disconnect();
    return { elapsed, frames: window.__frames!.slice(1), longestTask: Math.max(0, ...tasks) };
  });
  const sorted = [...result.frames].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * .95)] ?? 0, longest = Math.max(...result.frames);
  console.log(`SwiftShader/CPU 700 px healing dab: ${result.elapsed.toFixed(0)} ms to settle over ${result.frames.length} frames; frame p95 ${p95.toFixed(1)} ms, max ${longest.toFixed(1)} ms; longest task ${result.longestTask.toFixed(1)} ms`);
  // Work that held the page would show as one frame as long as the whole dab.
  expect(result.frames.length).toBeGreaterThan(3);
  expectTiming("Large dab, longest frame", longest, 250);
  expectTiming("Large dab, frame p95", p95, 120);
});
