// Workstream W2: the Select tool (Photoshop's Move tool with Auto-Select) and Photoshop's shortcuts.
import { expect, test, type Page } from '@playwright/test';
import type { OpenPicture, ImageWorkspace } from '../src/editor/index.js';
import type { LayerSpec } from '../src/core/index.js';
declare global { interface Window { __workspaceDemo?: { pictures: OpenPicture[]; selected: string | null; workspace: ImageWorkspace | undefined } } }

test.setTimeout(90_000);
test.use({ viewport: { width: 1440, height: 900 } });

async function workspace(page: Page, query = '') {
  await page.goto(`/?view=workspace${query}`);
  await expect(page.locator('.gi-image-editor .gi-stage canvas')).toHaveCount(1);
  await page.waitForFunction(() => window.__workspaceDemo?.pictures[0]?.editor.state.status === 'ready');
}
const state = (page: Page) => page.evaluate(() => {
  const s = window.__workspaceDemo!.pictures[0]!.editor;
  return { tool: s.state.tool, selected: (s.state.toolData['layers.selectedId'] as string | null | undefined) ?? null, layers: (s.state.recipe.layers ?? []) as LayerSpec[], draft: (s.state.draft.layers ?? []) as LayerSpec[], label: s.history.current.label, steps: s.history.nodes.length, toolData: s.state.toolData };
});
const press = async (page: Page, keys: string) => { await page.locator('.gi-stage').focus(); await page.keyboard.press(keys); };
const tool = async (page: Page, id: string) => { await expect.poll(async () => (await state(page)).tool).toBe(id); };

/** Place text with the Text tool, as a person does: T, Place text, type, Finish editing. */
async function placeText(page: Page, words: string) {
  const before = (await state(page)).layers.length;
  await press(page, 't'); await tool(page, 'text');
  // Found by structure, not by name, so the right-to-left runs in Arabic work too.
  await page.locator('.gi-text-place button').first().click();
  const box = page.locator('.gi-text-edit-wrap textarea');
  await box.fill(words);
  await page.locator('.gi-text-edit-wrap .gi-layers-actions button').last().click();
  await expect.poll(async () => (await state(page)).layers.length).toBe(before + 1);
  return (await state(page)).layers.at(-1)!.id;
}
/** A layer's corners on the page, from the Select overlay's own hit outline. */
async function corners(page: Page, id: string) {
  return page.evaluate(id => {
    const hit = document.querySelector(`.gi-select-hit[data-layer-id="${id}"]`) as SVGPolygonElement | null;
    if (!hit) return null;
    const box = hit.ownerSVGElement!.getBoundingClientRect();
    return hit.getAttribute('points')!.split(' ').map(p => { const [x, y] = p.split(',').map(Number); return [box.left + x!, box.top + y!] as [number, number]; });
  }, id);
}
const centre = (q: [number, number][]) => [q.reduce((n, p) => n + p[0], 0) / 4, q.reduce((n, p) => n + p[1], 0) / 4] as const;
async function drag(page: Page, from: readonly [number, number], to: readonly [number, number], modifiers: ('Shift' | 'Alt')[] = []) {
  await page.mouse.move(from[0], from[1]);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from[0] + (to[0] - from[0]) * i / 6, from[1] + (to[1] - from[1]) * i / 6);
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}
const angleOf = (q: readonly (readonly [number, number])[]) => Math.atan2(q[1]![1] - q[0]![1], q[1]![0] - q[0]![0]) * 180 / Math.PI;

test('Select leads the rail, is active on opening and lists Photoshop keys in help', async ({ page }) => {
  await workspace(page);
  // First in the rail's tool order, and checked. (Read from the DOM: a narrow rail may fold its tools into More.)
  const rail = page.locator('.gi-tool-rail [role=radio]').first();
  await expect(rail).toHaveAttribute('aria-label', 'Select');
  await expect(rail).toHaveAttribute('aria-checked', 'true');
  expect((await state(page)).tool).toBe('select');
  await expect(page.getByText('Add text or an image layer to select and move it.')).toBeVisible();
  await press(page, '?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  const row = (name: string) => help.getByRole('listitem').filter({ hasText: new RegExp(`^${name}`) }).first();
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [name, ...keys] of [['Select', 'V', 'Shift', 'V'], ['Crop', 'C', 'Shift', 'C'], ['Text', 'T'], ['Transform', 'Ctrl', 'T'], ['Spot healing', 'J', 'Shift', 'J'], ['Undo', 'Ctrl', 'Z'], ['Redo', 'Ctrl', 'Shift', 'Z'], ['Fit to window', 'Ctrl', '0'], ['Actual size', 'Ctrl', '1'], ['Duplicate layer', 'Ctrl', 'J'], ['Merge down', 'Ctrl', 'E'], ['Merge visible', 'Ctrl', 'Shift', 'E'], ['Delete layer', 'Del', 'Backspace'], ['Increase brush size', ']']])
    await expect(row(name!), name).toContainText(new RegExp(`${keys.map(escape).join('\\s*')}$`));
  await page.keyboard.press('Escape');
});

test('click selects the topmost layer; drag moves, handles scale and the corner zone turns, each one undo step', async ({ page }) => {
  await workspace(page);
  const first = await placeText(page, 'Sunrise');
  const second = await placeText(page, 'Lake');
  await press(page, 'v'); await tool(page, 'select');
  // The second text sits over the first: a click where both are picks the top one.
  let q = (await corners(page, second))!;
  await page.mouse.click(...centre(q));
  await expect.poll(async () => (await state(page)).selected).toBe(second);
  await expect(page.locator('.gi-select-outline')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Selected layer: Text' })).toBeAttached();

  // Move: one step labelled Move; undo puts it back.
  let before = await state(page);
  await drag(page, centre(q), [centre(q)[0] + 120, centre(q)[1] + 60]);
  let after = await state(page);
  expect(after.label).toBe('Move');
  expect(after.steps).toBe(before.steps + 1);
  const moved = after.layers.find(l => l.id === second)!.quad, start = before.layers.find(l => l.id === second)!.quad;
  expect(moved[0][0] - start[0][0]).toBeGreaterThan(50);
  expect(moved[0][1] - start[0][1]).toBeGreaterThan(20);
  await press(page, 'Control+z');
  await expect.poll(async () => (await state(page)).layers.find(l => l.id === second)!.quad[0][0]).toBeCloseTo(start[0][0], 3);
  await press(page, 'Control+Shift+z');
  q = (await corners(page, second))!;

  // Scale from the bottom-right corner with Shift: proportions hold.
  before = await state(page);
  const handle = page.locator('.gi-select-handle[data-handle=se]');
  const box = (await handle.boundingBox())!, from = [box.x + box.width / 2, box.y + box.height / 2] as const;
  await drag(page, from, [from[0] + 80, from[1] + 10], ['Shift']);
  await expect.poll(async () => (await state(page)).label).toBe('Scale');
  after = await state(page);
  // Enlarged text is re-set at the larger size, so it stays sharp, in the same step.
  expect((after.layers.find(l => l.id === second)!.data as { fontSize: number }).fontSize).toBeGreaterThan((before.layers.find(l => l.id === second)!.data as { fontSize: number }).fontSize * 1.2);
  expect(after.steps).toBe(before.steps + 1);
  const size = (l: LayerSpec): [number, number] => [Math.hypot(l.quad[1][0] - l.quad[0][0], l.quad[1][1] - l.quad[0][1]), Math.hypot(l.quad[3][0] - l.quad[0][0], l.quad[3][1] - l.quad[0][1])];
  const [w0, h0] = size(before.layers.find(l => l.id === second)!), [w1, h1] = size(after.layers.find(l => l.id === second)!);
  expect(w1).toBeGreaterThan(w0 * 1.2);
  // Re-set text measures a hair differently from a pure stretch, so proportions hold to within a percent.
  expect(w1 / h1 / (w0 / h0)).toBeCloseTo(1, 1);

  // Turn: drag from just outside the top-right corner, round the centre.
  q = (await corners(page, second))!;
  const c = centre(q), corner = q[1]!, out = [corner[0] + 17, corner[1] - 17] as const;
  before = await state(page);
  await drag(page, out, [c[0] + (out[1] - c[1]) * -1, c[1] + (out[0] - c[0])]);
  after = await state(page);
  expect(after.label).toBe('Rotate');
  expect(after.steps).toBe(before.steps + 1);
  expect(Math.abs(angleOf((await corners(page, second))!))).toBeGreaterThan(30);
  // The first text is still where it was: only the selection changed.
  expect(after.layers.find(l => l.id === first)!.quad).toEqual(before.layers.find(l => l.id === first)!.quad);
});

test('arrow keys nudge as one step, Escape and an empty click deselect, Delete removes, Alt drags a copy', async ({ page }) => {
  await workspace(page);
  const id = await placeText(page, 'Nudge me');
  await press(page, 'v'); await tool(page, 'select');
  const q = (await corners(page, id))!;
  await page.mouse.click(...centre(q));
  await expect.poll(async () => (await state(page)).selected).toBe(id);
  const before = await state(page), x0 = before.layers.find(l => l.id === id)!.quad[0][0];
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowRight');
  // A burst of presses settles into one Nudge step.
  await expect.poll(async () => (await state(page)).label, { timeout: 3000 }).toBe('Nudge');
  const after = await state(page);
  expect(after.steps).toBe(before.steps + 1);
  const dx = after.layers.find(l => l.id === id)!.quad[0][0] - x0;
  expect(dx).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).selected).toBeNull();
  await page.mouse.click(...centre((await corners(page, id))!));
  await expect.poll(async () => (await state(page)).selected).toBe(id);
  // A click on the picture away from every layer deselects.
  const stage = (await page.locator('.gi-stage').boundingBox())!;
  await page.mouse.click(stage.x + 40, stage.y + stage.height - 40);
  await expect.poll(async () => (await state(page)).selected).toBeNull();

  // Alt drags a copy above the original, as one Duplicate layer step.
  const c = centre((await corners(page, id))!);
  await drag(page, c, [c[0] + 60, c[1] + 80], ['Alt']);
  await expect.poll(async () => (await state(page)).layers.length).toBe(2);
  const copied = await state(page);
  expect(copied.label).toBe('Duplicate layer');
  expect(copied.selected).not.toBe(id);
  expect(copied.layers[0]!.quad).toEqual(after.layers[0]!.quad);

  await page.keyboard.press('Delete');
  await expect.poll(async () => (await state(page)).layers.length).toBe(1);
  expect((await state(page)).label).toBe('Delete layer');
});

test('double-clicking text opens its editor in the Text tool', async ({ page }) => {
  await workspace(page);
  const id = await placeText(page, 'Edit me');
  await press(page, 'v'); await tool(page, 'select');
  await page.mouse.dblclick(...centre((await corners(page, id))!));
  await tool(page, 'text');
  const box = page.getByRole('textbox', { name: 'Edit text' });
  await expect(box).toBeVisible();
  await expect(box).toHaveValue('Edit me');
  await box.fill('Edited');
  await page.getByRole('button', { name: 'Finish editing' }).click();
  await expect.poll(async () => ((await state(page)).layers[0]!.data as { content: string }).content).toBe('Edited');
});

test("Photoshop's keys pick tools, cycle a group with Shift, duplicate, size brushes and zoom", async ({ page }) => {
  await workspace(page);
  for (const [key, id] of [['c', 'crop'], ['t', 'text'], ['e', 'retouch.eraser'], ['s', 'retouch.clone'], ['b', 'retouch.brush'], ['o', 'retouch.dodge'], ['r', 'rotate'], ['v', 'select']] as const) {
    await press(page, key); await tool(page, id);
  }
  // J picks Spot healing; Shift+J steps through Healing brush, Patch and Red eye; J then keeps the group's tool.
  await press(page, 'j'); await tool(page, 'retouch.spot-heal');
  await press(page, 'Shift+j'); await tool(page, 'retouch.heal');
  await press(page, 'Shift+j'); await tool(page, 'retouch.patch');
  await press(page, 'b'); await tool(page, 'retouch.brush');
  await press(page, 'j'); await tool(page, 'retouch.patch');
  // Shift with a letter steps the group on from its current tool, wherever focus is, as Photoshop does.
  await press(page, 'Shift+o'); await tool(page, 'retouch.burn');
  await press(page, 'Shift+o'); await tool(page, 'retouch.sponge');
  await press(page, 'o'); await tool(page, 'retouch.sponge');
  // [ and ] size the brush on Photoshop's steps; Shift with them sets hardness.
  await press(page, 'b'); await tool(page, 'retouch.brush');
  const brush = async () => (await state(page)).toolData['retouch.brush'] as { size: number; hardness: number } | undefined;
  await press(page, ']');
  const grown = (await brush())!.size;
  await press(page, '[');
  expect((await brush())!.size).toBeLessThan(grown);
  await press(page, '}');
  expect((await brush())!.hardness).toBe(1);
  await press(page, '{');
  expect((await brush())!.hardness).toBe(.75);
  // Ctrl+J duplicates the selected layer.
  const id = await placeText(page, 'Copy me');
  await press(page, 'v'); await tool(page, 'select');
  await page.mouse.click(...centre((await corners(page, id))!));
  await press(page, 'Control+j');
  await expect.poll(async () => (await state(page)).layers.length).toBe(2);
  expect((await state(page)).label).toBe('Duplicate layer');
  // Alt+[ selects the layer below.
  await press(page, 'Alt+[');
  await expect.poll(async () => (await state(page)).selected).toBe(id);
  // Ctrl+1 shows actual pixels and Ctrl+0 fits again.
  const zoom = () => page.evaluate(() => window.__workspaceDemo!.pictures[0]!.editor.state.zoom!);
  const fitted = await zoom();
  await press(page, 'Control+1');
  await expect.poll(zoom).toBeCloseTo(1 / await page.evaluate(() => devicePixelRatio), 2);
  await press(page, 'Control+0');
  await expect.poll(zoom).toBeCloseTo(fitted, 3);
});

test('host overrides still win: tool and command keys', async ({ page }) => {
  await workspace(page, '&shortcuts-test');
  // The demo's test overrides move undo to Alt+Z.
  await placeText(page, 'Override');
  expect((await state(page)).label).toBe('Edit text');
  await press(page, 'Control+z');
  expect((await state(page)).label).toBe('Edit text');
  await press(page, 'Alt+z');
  await expect.poll(async () => (await state(page)).label).toBe('Place text');
});

for (const [mode, dir, width] of [['light', 'ltr', 1440], ['dark', 'ltr', 1440], ['dark', 'rtl', 1440], ['light', 'ltr', 1100], ['dark', 'rtl', 1100]] as const) {
  test(`screenshot: selection outline and handles, ${mode} ${dir} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: mode });
    await workspace(page, `&mode=${mode}${dir === 'rtl' ? '&dir=rtl&lang=ar' : ''}`);
    await placeText(page, dir === 'rtl' ? 'שקיעה' : 'Sunrise');
    const id = await placeText(page, dir === 'rtl' ? 'אגם' : 'Lake');
    await press(page, 'v'); await tool(page, 'select');
    const q = (await corners(page, id))!;
    await drag(page, centre(q), [centre(q)[0] + 90, centre(q)[1] + 70]);
    const box = (await page.locator('.gi-select-handle[data-handle=ne]').boundingBox())!;
    await drag(page, [box.x + box.width / 2 + 17, box.y + box.height / 2 - 17], [box.x + box.width / 2 + 40, box.y + box.height / 2 + 30]);
    // Hover another layer so its hairline shows beside the selection.
    const other = (await state(page)).layers[0]!.id;
    await page.mouse.move(...centre((await corners(page, other))!));
    // Let the renderer draw the last commit before the picture is taken.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/tmp/gi-w2/select-${mode}-${dir}-${width}.png` });
    await page.locator('.gi-stage').screenshot({ path: `/tmp/gi-w2/select-stage-${mode}-${dir}-${width}.png` });
  });
}

test.describe('close-ups at device scale 2', () => {
  test.use({ deviceScaleFactor: 2 });
  for (const mode of ['light', 'dark'] as const) test(`screenshot: close-up while turning, ${mode}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await workspace(page, `&mode=${mode}`);
    const id = await placeText(page, 'Lake');
    await press(page, 'v'); await tool(page, 'select');
    await page.mouse.click(...centre((await corners(page, id))!));
    // Make it larger with Shift on a corner, then turn it partway and hold the drag for the picture.
    let box = (await page.locator('.gi-select-handle[data-handle=se]').boundingBox())!;
    await drag(page, [box.x + box.width / 2, box.y + box.height / 2], [box.x + 140, box.y + 60], ['Shift']);
    const q = (await corners(page, id))!, c = centre(q), corner = q[1]!, out = [corner[0] + 17, corner[1] - 17] as const;
    await page.mouse.move(...out); await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(out[0] + i * 6, out[1] + i * 9);
    const clip = { x: c[0] - 200, y: c[1] - 130, width: 400, height: 260 };
    await page.screenshot({ path: `/tmp/gi-w2/select-turning-${mode}.png`, clip });
    await page.mouse.up();
    await page.mouse.move(c[0] - 150, c[1] + 100);
    await page.screenshot({ path: `/tmp/gi-w2/select-selected-${mode}.png`, clip });
    box = (await page.locator('.gi-stage').boundingBox())!;
    await page.screenshot({ path: `/tmp/gi-w2/select-panel-${mode}.png`, clip: { x: box.x + box.width + 10, y: 150, width: 1440 - box.x - box.width - 10, height: 560 } });
  });
});
