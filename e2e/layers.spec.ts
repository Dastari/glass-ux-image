import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 } });
async function image(page: Page, label: string, colour: string, name: string) {
  // The file input, not the toolbar button that opens it and shares its name.
  await page.locator('input[type="file"]').and(page.getByLabel(label, { exact: true })).evaluate(async (input, args) => {
    const canvas = new OffscreenCanvas(400, 300), context = canvas.getContext("2d")!;
    context.fillStyle = args.colour; context.fillRect(0, 0, 400, 300);
    const file = new File([await canvas.convertToBlob({ type: "image/png" })], args.name, { type: "image/png" });
    const transfer = new DataTransfer(); transfer.items.add(file);
    (input as HTMLInputElement).files = transfer.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { colour, name });
}
async function open(page: Page, backend: string) {
  await page.goto(`/?format=image/png&backend=${backend}`);
  await image(page, "Open an image", "#808080", "base.png");
  await expect(page.locator(".gi-photo-foot")).toContainText("400 × 300");
}
async function save(page: Page) {
  await page.evaluate(() => { delete window.__saved; });
  await page.getByRole("button", { name: /Save copy|Saved/ }).click();
  await page.waitForFunction(() => window.__saved);
  return page.evaluate(async () => {
    const bitmap = await createImageBitmap(await (await fetch(window.__saved!.url)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), c = canvas.getContext("2d")!;
    c.drawImage(bitmap, 0, 0); bitmap.close();
    return { pixels: [...c.getImageData(0, 0, canvas.width, canvas.height).data], recipe: (window.__saved as unknown as { recipe: import("../src/session/recipe.js").EditRecipe }).recipe };
  });
}
async function tool(page: Page, name: string) {
  const button = page.getByRole("radio", { name, exact: true });
  if (name === "Text" && !await button.isVisible()) {
    // Grouped toolbars expose Text in a flyout; its public shortcut works in either layout.
    await page.getByRole("application", { name: "Image", exact: true }).focus();
    await page.keyboard.press("t");
  } else await button.click();
}

test("real RTL glyphs, outline and shadow fit measured bounds and join across tiles at three levels", async ({ page }) => {
  await page.goto("/?layers-test");
  const result = await page.evaluate(async () => (window as unknown as { layersRasterCheck(): Promise<{ differences: number[]; alpha: number; outside: number; bounds: { width: number } }> }).layersRasterCheck());
  console.log("Text raster conformance", result);
  expect(result.bounds.width).toBeGreaterThan(1000);
  expect(result.alpha).toBeGreaterThan(1000);
  expect(result.outside).toBe(0);
  expect(result.differences).toEqual([0, 0, 0]);
});

for (const backend of ["auto", "cpu"]) {
  test(`${backend}: text is saved, remeasured on editing and undone`, async ({ page }) => {
    await open(page, backend); await tool(page, "Text");
    await page.getByRole("button", { name: "Place text", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Edit text", exact: true });
    await editor.fill("GLASS"); await editor.press("Control+Enter");
    const first = await save(page);
    expect(first.recipe.layers?.[0]?.kind).toBe("text");
    expect((first.recipe.layers![0]!.data as { content: string }).content).toBe("GLASS");
    expect(first.pixels.filter((v, i) => i % 4 !== 3 && v > 140).length).toBeGreaterThan(200);
    await page.getByRole("button", { name: "Edit text", exact: true }).click();
    await editor.fill("GLASS UX IMAGE"); await editor.press("Control+Enter");
    const second = await save(page);
    expect(second.recipe.layers![0]!.quad).not.toEqual(first.recipe.layers![0]!.quad);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await save(page)).pixels).toEqual(first.pixels);
  });
  test(`${backend}: image layers blend in the saved file, reorder by keyboard and undo`, async ({ page }) => {
    await open(page, backend); await tool(page, "Layers");
    await image(page, "Add image layer", "#ff0000", "red.png");
    const red = page.getByRole("treeitem", { name: /red.png/ }); await expect(red).toBeVisible();
    await page.getByRole("combobox", { name: "Blend mode", exact: true }).click();
    await page.getByRole("option", { name: "Multiply", exact: true }).click();
    const blended = await save(page);
    expect(blended.pixels.slice(0, 4)).toEqual([128, 0, 0, 255]);
    await image(page, "Add image layer", "#0000ff", "blue.png");
    const blue = page.getByRole("treeitem", { name: /blue.png/ }); await expect(blue).toBeVisible();
    await blue.focus(); await blue.press("Alt+ArrowDown");
    const reordered = await save(page);
    expect(reordered.recipe.layers?.map(layer => layer.name)).toEqual(["blue.png", "red.png"]);
    expect(reordered.pixels.slice(0, 4)).toEqual([0, 0, 0, 255]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await save(page)).recipe.layers?.map(layer => layer.name)).toEqual(["red.png", "blue.png"]);
  });
}

test("layers and text panels have no axe violations", async ({ page }) => {
  await open(page, "cpu");
  for (const name of ["Layers", "Text"]) {
    await tool(page, name);
    const { violations } = await new AxeBuilder({ page }).include(".gi-photo-editor").exclude(".gi-stage").analyze();
    expect(violations.map(v => ({ id: v.id, html: v.nodes[0]?.html }))).toEqual([]);
  }
});

test("duplicate, rename, visibility, paste and flatten remain undoable labelled actions", async ({ page }) => {
  await open(page, "cpu"); await tool(page, "Layers");
  await image(page, "Add image layer", "#ff0000", "red.png");
  await page.getByRole("combobox", { name: "Blend mode", exact: true }).click();
  await page.getByRole("option", { name: "Multiply", exact: true }).click();
  await image(page, "Add image layer", "rgba(0,0,255,0.5)", "blue.png");
  const blue = page.getByRole("treeitem", { name: /blue.png/ });
  await blue.focus(); await blue.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  const selected = page.locator('[role="treeitem"][aria-selected="true"]');
  await selected.focus(); await selected.press("F2");
  const rename = page.getByRole("tree").getByRole("textbox");
  await rename.fill("Copy"); await rename.press("Enter");
  await expect(page.getByRole("treeitem", { name: /Copy/ })).toBeVisible();
  await page.getByRole("switch", { name: "Visible", exact: true }).click();
  const before = await save(page);
  await page.getByRole("button", { name: "Flatten layers", exact: true }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(0);
  const flattened = await save(page);
  expect(flattened.pixels).toEqual(before.pixels);
  expect(flattened.recipe.layers).toEqual([]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await selected.focus();
  await page.getByRole("tree").evaluate(async tree => {
    const canvas = new OffscreenCanvas(30, 20); canvas.getContext("2d")!.fillRect(0, 0, 30, 20);
    const transfer = new DataTransfer(); transfer.items.add(new File([await canvas.convertToBlob()], "pasted.png", { type: "image/png" }));
    tree.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
  });
  await expect(page.getByRole("treeitem", { name: /pasted.png/ })).toBeVisible();
  const pasted = await save(page);
  expect(pasted.recipe.layers).toHaveLength(4);
});

test("drag reorder and merge down preserve the current saved appearance", async ({ page }) => {
  await open(page, "cpu"); await tool(page, "Layers");
  await image(page, "Add image layer", "#ff0000", "red.png");
  await image(page, "Add image layer", "rgba(0,0,255,0.5)", "blue.png");
  const red = page.getByRole("treeitem", { name: /red.png/ }), blue = page.getByRole("treeitem", { name: /blue.png/ });
  await expect(page.locator(".gi-layers-panel")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".fa-tree-drop-line")).toBeAttached();
  await red.scrollIntoViewIfNeeded(); await blue.scrollIntoViewIfNeeded();
  const from = (await red.boundingBox())!, to = (await blue.boundingBox())!;
  await page.mouse.move(from.x + 45, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(to.x + 45, to.y + 2, { steps: 12 });
  await expect(page.locator(".fa-tree-drop-line")).toBeVisible();
  await page.mouse.up();
  const before = await save(page);
  expect(before.recipe.layers?.map(layer => layer.name)).toEqual(["blue.png", "red.png"]);
  await red.focus(); await red.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Merge down", exact: true }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(1);
  expect((await save(page)).pixels).toEqual(before.pixels);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(2);
});

test("canvas click places RTL text with native bidi editing", async ({ page }) => {
  await open(page, "cpu"); await tool(page, "Text");
  const rtl = page.getByRole("button", { name: "Right to left", exact: true });
  if (await rtl.isVisible()) await rtl.click();
  else {
    await page.getByRole("group", { name: "Text direction", exact: true }).getByRole("button").click();
    await page.getByRole("menuitemradio", { name: "Right to left", exact: true }).click();
  }
  await page.locator(".gi-stage").click();
  const editor = page.getByRole("textbox", { name: "Edit text", exact: true });
  await expect(editor).toHaveAttribute("dir", "rtl");
  await editor.fill("مرحبا بالعالم\nשלום"); await editor.press("Control+Enter");
  const saved = await save(page);
  expect(saved.recipe.layers![0]!.data).toMatchObject({ content: "مرحبا بالعالم\nשלום", direction: "rtl" });
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await editor.fill("Discard this draft");
  await page.locator(".gi-text-edit-wrap").getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await save(page)).recipe.layers![0]!.data).toEqual(saved.recipe.layers![0]!.data);
});

for (const backend of ["webgl2", "cpu"] as const) {
  test(`${backend}: flatten bakes the full export to a clean base, byte-identically, with undo and redo`, async ({ page }) => {
    await page.goto("/?layers-test");
    const result = await page.evaluate(async backend => (window as unknown as {
      layersFlattenCheck(backend: "webgl2" | "cpu"): Promise<{
        backend: string; preview: number[]; size: { width: number; height: number }; singleBase: boolean;
        otherFormatsEqual: boolean; basePixelsEqual: boolean; clean: boolean; layerCount: number; byteEqual: boolean; undoEqual: boolean; redoEqual: boolean;
        undoRecipe: boolean; undoSource: boolean; oneStep: boolean; refusedStart: boolean; refusedCommit: boolean;
        label: string; actions: string[]; stageCalls: number; fullResolutionRead: boolean;
        subsequentSize: { width: number; height: number }; cleanAfterUndo: boolean;
      }>;
    }).layersFlattenCheck(backend), backend);
    console.log("Flatten checks", backend, result);
    expect(result.backend).toBe(backend);
    expect(Math.max(...result.preview)).toBeLessThanOrEqual(50);
    expect(result.size).toEqual({ width: 550, height: 390 });
    expect(result.subsequentSize).toEqual(result.size);
    expect(result.layerCount).toBe(0);
    expect(result.label).toBe("Flatten layers");
    for (const field of ["singleBase", "otherFormatsEqual", "basePixelsEqual", "clean", "byteEqual", "undoEqual", "redoEqual", "undoRecipe", "undoSource", "oneStep", "refusedStart", "refusedCommit", "fullResolutionRead", "cleanAfterUndo"] as const) expect(result[field], field).toBe(true);
    expect(result.actions).toContain("layers.flatten");
    expect(result.stageCalls).toBeGreaterThan(0);
  });
}
