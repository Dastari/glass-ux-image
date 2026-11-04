import AxeBuilder from '@axe-core/playwright';
import { expectTiming } from "./fixtures/speed.js";
import { expect, test, type Page } from '@playwright/test';
import { build } from '../apps/demo/node_modules/vite/dist/node/index.js';
import { resolve } from 'node:path';
import type { EditorSession } from '../src/session/index.js';

declare global { interface Window { __retouchDemo?: EditorSession; __retouchFrames?: number[]; __retouchFrameStop?: boolean; __retouchLongTasks?: number[]; __retouchTaskObserver?: PerformanceObserver } }
test.use({ viewport: { width: 1440, height: 1000 } });
async function open(page: Page, backend = 'cpu') {
  await page.goto(`/?format=image/png&backend=${backend}`);
  await page.getByRole('radio', { name: 'Brush', exact: true }).click();
  await page.waitForFunction(() => window.__retouchDemo?.state.status === 'ready' && window.__retouchDemo.renderer);
  await page.evaluate(async () => { await window.__retouchDemo!.renderer!.settle(); });
}
async function screen(page: Page, x: number, y: number) {
  const box = (await page.locator('.gi-stage').boundingBox())!;
  const p = await page.evaluate(({ x, y }) => {
    const s = window.__retouchDemo!, v = s.renderer!.view, ratio = devicePixelRatio;
    return { x: (v.width / 2 + (x - v.centerX) * v.zoom) / ratio, y: (v.height / 2 + (y - v.centerY) * v.zoom) / ratio };
  }, { x, y });
  return { x: box.x + p.x, y: box.y + p.y };
}
async function settle(page: Page) {
  // settle fences queued stage edits as well as the renderer’s own tile reads.
  await page.evaluate(() => window.__retouchDemo!.renderer!.settle());
}
async function stamp(page: Page, x: number, y: number) { const p = await screen(page, x, y); await page.mouse.click(p.x, p.y); await settle(page); }
async function savedPixel(page: Page, x: number, y: number) {
  return page.evaluate(async ({ x, y }) => {
    const blob = await window.__retouchDemo!.result().toBlob({ type: 'image/png' });
    const bitmap = await createImageBitmap(blob), c = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0); return Array.from(ctx.getImageData(x, y, 1, 1).data);
  }, { x, y });
}
for (const backend of ['cpu', 'auto']) {
  test(`${backend}: a rotated, cropped and resized stroke lands in source space and in the saved PNG`, async ({ page }) => {
    await open(page, backend);
    await page.evaluate(() => {
      const s = window.__retouchDemo!;
      s.setGeometry({ rotation: 90, crop: { x: 400, y: 800, width: 1000, height: 1000 }, resize: { width: 600, height: 600 } });
    });
    await expect(page.locator('.gi-photo-foot')).toContainText('600 × 600');
    await settle(page);
    const expected = await page.evaluate(() => window.__retouchDemo!.toSource(300, 300));
    await stamp(page, 300, 300);
    const data = await page.evaluate(() => {
      const s = window.__retouchDemo!, stroke = s.state.recipe.strokes!.at(-1)!;
      return { points: stroke.points, label: s.history.current.label, count: s.state.recipe.strokes!.length, backend: s.renderer!.backend.info.kind };
    });
    expect(data.points[0]!.x).toBeCloseTo(expected![0], 0); expect(data.points[0]!.y).toBeCloseTo(expected![1], 0);
    expect(data.label).toBe('Brush'); expect(data.count).toBe(1);
    expect(data.backend).toBe(backend === 'cpu' ? 'cpu' : 'webgl2');
    expect(await savedPixel(page, 300, 300)).toEqual([0, 0, 0, 255]);
    await page.evaluate(() => window.__retouchDemo!.undo()); await settle(page);
    expect((await savedPixel(page, 300, 300)).slice(0, 3).some(n => n > 20)).toBe(true);
  });
  test(`${backend}: preview changes only touched tiles, commits once, and keeps responsive frames`, async ({ page }) => {
    await open(page, backend);
    await page.evaluate(() => window.__retouchDemo!.view!.actualSize());
    // The canvas delivers camera changes on the next animation frame.
    await page.waitForFunction(() => window.__retouchDemo!.renderer!.view.zoom === 1);
    await settle(page);
    const before = await page.evaluate(() => ({ ...window.__retouchDemo!.renderer!.stats, history: window.__retouchDemo!.history.nodes.length }));
    const p = await screen(page, 1450, 1000), end = await screen(page, 1490, 1010);
    await page.evaluate(() => {
      window.__retouchLongTasks = [];
      window.__retouchTaskObserver = new PerformanceObserver(list => { for (const task of list.getEntries()) window.__retouchLongTasks!.push(task.duration); });
      window.__retouchTaskObserver.observe({ type: 'longtask' });
      window.__retouchFrames = []; window.__retouchFrameStop = false; let last = performance.now();
      const tick = (now: number) => { window.__retouchFrames!.push(now - last); last = now; if (!window.__retouchFrameStop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    });
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await expect.poll(() => page.evaluate(() => window.__retouchDemo!.state.draft.strokes?.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__retouchDemo!.renderer!.stats.tileReads), { timeout: 20000 }).toBeGreaterThan(before.tileReads);
    await expect.poll(() => page.evaluate(() => window.__retouchDemo!.renderer!.stats.pendingTiles)).toBe(0);
    const during = await page.evaluate(() => ({ ...window.__retouchDemo!.renderer!.stats, history: window.__retouchDemo!.history.nodes.length, recipeCount: window.__retouchDemo!.state.recipe.strokes?.length ?? 0 }));
    expect(during.history).toBe(before.history); expect(during.recipeCount).toBe(0);
    expect(during.tileReads - before.tileReads).toBeGreaterThan(0);
    expect(during.tileReads - before.tileReads).toBeLessThan(before.composedTiles);
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
    await settle(page);
    await expect.poll(() => page.evaluate(() => window.__retouchDemo!.renderer!.stats.pendingTiles)).toBe(0);
    const after = await page.evaluate(() => {
      window.__retouchFrameStop = true;
      const observer = window.__retouchTaskObserver!;
      const tasks = [...window.__retouchLongTasks!, ...observer.takeRecords().map(task => task.duration)];
      observer.disconnect();
      return { stats: window.__retouchDemo!.renderer!.stats, history: window.__retouchDemo!.history.nodes.length, revision: window.__retouchDemo!.document!.revision, frames: window.__retouchFrames!, longestTask: Math.max(0, ...tasks) };
    });
    expect(after.history).toBe(before.history + 1);
    expect(after.stats.pendingTiles).toBe(0);
    const stable = await page.evaluate(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return { revision: window.__retouchDemo!.document!.revision, pending: window.__retouchDemo!.renderer!.stats.pendingTiles };
    });
    expect(stable).toEqual({ revision: after.revision, pending: 0 });
    const times = after.frames.slice(1).sort((a, b) => a - b), p95 = times[Math.floor(times.length * .95)] ?? 0;
    console.log(`${backend} SwiftShader/CPU stroke: p95 ${p95.toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms; preview tile reads ${during.tileReads - before.tileReads}/${before.composedTiles}, compose ${after.stats.composeMs.toFixed(1)} ms; longest main-thread task ${after.longestTask.toFixed(1)} ms (0 means none >=50 ms)`);
    expectTiming(`${backend} stroke, frame p95`, p95, 200); expectTiming(`${backend} stroke, longest frame`, Math.max(...times), 500);
  });
}

test('keyboard stamps, shortcuts, source points, patch selection and undo after many strokes', async ({ page }) => {
  await open(page);
  const overlay = page.locator('[data-retouch-tool="brush"]'); await overlay.focus();
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Enter'); }
  await settle(page);
  expect(await page.evaluate(() => window.__retouchDemo!.state.recipe.strokes?.length)).toBe(12);
  await page.keyboard.press('Control+z'); await settle(page);
  expect(await page.evaluate(() => window.__retouchDemo!.state.recipe.strokes?.length)).toBe(11);
  for (const [key, kind] of [['e', 'eraser'], ['s', 'clone'], ['j', 'spot-heal'], ['b', 'brush']]) {
    await page.getByRole('application').focus(); await page.keyboard.press(key!); await expect(page.locator(`[data-retouch-tool="${kind}"]`)).toBeVisible();
  }
  await page.getByRole('radio', { name: 'Clone stamp', exact: true }).click();
  await page.locator('[data-retouch-tool="clone"]').focus(); await page.keyboard.press('Alt+Enter');
  await expect.poll(() => page.evaluate(() => (window.__retouchDemo!.state.toolData['retouch.clone'] as { source?: unknown }).source !== null)).toBe(true);
  await page.getByRole('radio', { name: 'Patch', exact: true }).click();
  const a = await screen(page, 1400, 950), b = await screen(page, 1460, 1010);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window.__retouchDemo!.state.toolData['retouch.patch'] as { selection?: unknown[] }).selection?.length)).toBe(4);
  await page.locator('[data-retouch-tool="patch"]').focus(); await page.keyboard.press('Alt+Enter');
  await page.getByRole('button', { name: 'Apply patch', exact: true }).click(); await settle(page);
  expect(await page.evaluate(() => window.__retouchDemo!.history.current.label)).toBe('Patch');
});

test('Escape restores source tiles after an uncommitted preview', async ({ page }) => {
  await open(page);
  const read = () => page.evaluate(async () => {
    const tile = await window.__retouchDemo!.document!.layers[0]!.source.readTile({ level: 0, x: 5, y: 3 });
    return tile.data[((1000 - 768) * tile.width + 1500 - 1280) * 4]!;
  });
  const before = await read(), at = await screen(page, 1500, 1000);
  expect(before).toBeGreaterThan(0);
  await page.mouse.move(at.x, at.y); await page.mouse.down();
  await expect.poll(read).toBe(0);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect.poll(read).toBe(before);
  expect(await page.evaluate(() => window.__retouchDemo!.state.draft.strokes?.length ?? 0)).toBe(0);
  expect(await page.evaluate(() => window.__retouchDemo!.history.nodes.length)).toBe(1);
});

test('resampled geometry and active liquify preserve local dirty tiles', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const s = window.__retouchDemo!;
    s.commit({ geometry: { ...s.state.recipe.geometry, resize: { width: 3000, height: 2000 } }, filters: { liquify: { width: 3000, height: 2000, columns: 3, rows: 3, displacement: [0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0] } } });
    s.view!.actualSize();
  });
  await settle(page);
  const before = await page.evaluate(() => window.__retouchDemo!.renderer!.stats), at = await screen(page, 1450, 1000);
  await page.mouse.move(at.x, at.y); await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__retouchDemo!.renderer!.stats.tileReads), { timeout: 20000 }).toBeGreaterThan(before.tileReads);
  await expect.poll(() => page.evaluate(() => window.__retouchDemo!.renderer!.stats.pendingTiles)).toBe(0);
  const after = await page.evaluate(() => window.__retouchDemo!.renderer!.stats);
  console.log(`Resize + liquify preview tile reads: ${after.tileReads - before.tileReads}/${before.composedTiles}`);
  expect(after.tileReads - before.tileReads).toBeLessThan(before.composedTiles);
  await page.mouse.up();
});

test('every painting panel passes axe and liquify stores a grid rather than strokes', async ({ page }) => {
  await open(page);
  for (const name of ['Brush', 'Eraser', 'Clone stamp', 'Healing brush', 'Spot healing', 'Patch', 'Blur brush', 'Sharpen brush', 'Smudge', 'Dodge', 'Burn', 'Sponge', 'Colour replacement', 'Red-eye removal', 'Liquify']) {
    await page.getByRole('radio', { name, exact: true }).click();
    const result = await new AxeBuilder({ page }).include('.gi-photo-editor').analyze();
    expect(result.violations, name).toEqual([]);
  }
  const at = await screen(page, 1500, 1000); await page.mouse.click(at.x, at.y); await settle(page);
  const result = await page.evaluate(() => ({ grid: window.__retouchDemo!.state.recipe.filters.liquify, strokes: window.__retouchDemo!.state.recipe.strokes }));
  expect(result.grid).toBeTruthy(); expect(result.strokes ?? []).toHaveLength(0);
});

test('crop-only excludes retouch, and one brush excludes the liquify engine', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: resolve('src/tools/crop.tsx'), formats: ['es'], fileName: 'crop' }, rollupOptions: { external: [/^react/, /^glass-ux\//] } } });
  const outputs = Array.isArray(result) ? result : [result];
  const code = outputs.flatMap(output => 'output' in output ? output.output : []).filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n');
  expect(code.length).toBeGreaterThan(100);
  for (const marker of ['StrokeStore', 'applyDab', 'DabWorkspace', 'liquifyDab', 'RetouchOverlay', 'imageEditor.retouch']) expect(code).not.toContain(marker);
  const brush = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: resolve('src/tools/retouch/brush.ts'), formats: ['es'], fileName: 'brush' }, rollupOptions: { external: [/^react/, /^glass-ux\//] } } });
  const brushOutputs = Array.isArray(brush) ? brush : [brush];
  const brushCode = brushOutputs.flatMap(output => 'output' in output ? output.output : []).filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n');
  expect(brushCode).toContain('StrokeStore'); expect(brushCode).not.toContain('liquifyDab'); expect(brushCode).not.toContain('createLiquifyGrid');

});
