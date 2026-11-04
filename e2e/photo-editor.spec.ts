import AxeBuilder from "@axe-core/playwright";
import { expectTiming } from "./fixtures/speed.js";
import { expect, test, type Page } from "@playwright/test";
import { crc32, deflateSync } from "node:zlib";

declare global {
  interface Window {
    __saved?: { url: string; width: number; height: number; type: string };
    __failSave?: boolean;
  }
}

/** A real PNG file: four solid quadrants, so a pixel shows exactly where it came from. */
function quadrantPng(width = 400, height = 300) {
  const RED = [220, 30, 30], GREEN = [30, 200, 60], BLUE = [40, 60, 230], WHITE = [250, 250, 250];
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const color = y < height / 2 ? (x < width / 2 ? RED : GREEN) : x < width / 2 ? BLUE : WHITE;
      rows.set(color, start + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

async function openPicture(page: Page, query = "") {
  await page.goto(`/?kit=stage2&format=image/png${query}`);
  await page.getByLabel("Open an image").setInputFiles({ name: "quadrants.png", mimeType: "image/png", buffer: quadrantPng() });
  await expect(page.locator(".gi-photo-foot")).toContainText("400 × 300");
}

const tool = (page: Page, name: string) => page.getByRole("radio", { name }).click();
const save = async (page: Page) => {
  await page.evaluate(() => (window.__saved = undefined));
  await page.locator(".gi-photo-foot").getByRole("button", { name: /Save/ }).click();
  await page.waitForFunction(() => window.__saved);
};

/** Colours in the saved file at the given fractions of its size. */
const savedPixels = (page: Page, points: Array<[number, number]>) =>
  page.evaluate(async (at) => {
    const saved = window.__saved!;
    const bitmap = await createImageBitmap(await (await fetch(saved.url)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const pixels = at.map(([u, v]) => Array.from(context.getImageData(Math.floor(u * bitmap.width), Math.floor(v * bitmap.height), 1, 1).data.slice(0, 3)));
    return { width: bitmap.width, height: bitmap.height, pixels };
  }, points);

const close = (actual: number[], expected: number[], tolerance = 3) => actual.every((value, i) => Math.abs(value - expected[i]!) <= tolerance);
const RED = [220, 30, 30], GREEN = [30, 200, 60], BLUE = [40, 60, 230], WHITE = [250, 250, 250];

test.use({ viewport: { width: 1440, height: 900 } });

test("controls keep their styles, whatever order stylesheets load in", async ({ page }) => {
  await page.goto("/?kit=stage2");
  const padding = await page.getByRole("button", { name: "Open an image" }).evaluate((node) => parseFloat(getComputedStyle(node).paddingInlineStart));
  expect(padding).toBeGreaterThan(4);
});

for (const [name, query] of [["WebGL2", ""], ["CPU", "&backend=cpu"]] as const) {
  test.describe(name, () => {
    test("saves an unedited picture unchanged", async ({ page }) => {
      await openPicture(page, query);
      await save(page);
      const { width, height, pixels } = await savedPixels(page, [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]);
      expect([width, height]).toEqual([400, 300]);
      for (const [i, color] of [RED, GREEN, BLUE, WHITE].entries()) expect(close(pixels[i]!, color), `${pixels[i]}`).toBe(true);
    });

    test("turns the saved picture clockwise", async ({ page }) => {
      await openPicture(page, query);
      await tool(page, "Rotate");
      await page.getByRole("button", { name: "Rotate right" }).click();
      await expect(page.locator(".gi-photo-foot")).toContainText("300 × 400");
      await save(page);
      const { width, height, pixels } = await savedPixels(page, [[0.75, 0.25], [0.75, 0.75], [0.25, 0.25], [0.25, 0.75]]);
      expect([width, height]).toEqual([300, 400]);
      for (const [i, color] of [RED, GREEN, BLUE, WHITE].entries()) expect(close(pixels[i]!, color), `${pixels[i]}`).toBe(true);
    });

    test("mirrors the saved picture", async ({ page }) => {
      await openPicture(page, query);
      await tool(page, "Rotate");
      await page.getByRole("button", { name: "Flip horizontal" }).click();
      await save(page);
      const { pixels } = await savedPixels(page, [[0.25, 0.25]]);
      expect(close(pixels[0]!, GREEN), `${pixels[0]}`).toBe(true);
    });

    test("crops the saved picture to exactly the chosen pixels", async ({ page }) => {
      await openPicture(page, query);
      await tool(page, "Crop");
      await page.getByRole("textbox", { name: "Width" }).fill("120");
      await page.getByRole("textbox", { name: "Height" }).fill("100");
      await page.getByRole("textbox", { name: "Height" }).press("Tab");
      await page.getByRole("button", { name: "Apply crop" }).click();
      await expect(page.locator(".gi-photo-foot")).toContainText("120 × 100");
      await save(page);
      const { width, height, pixels } = await savedPixels(page, [[0.5, 0.5]]);
      expect([width, height]).toEqual([120, 100]);
      expect(close(pixels[0]!, RED), `${pixels[0]}`).toBe(true);
    });

    test("brightens the saved picture, and undo brings it back", async ({ page }) => {
      await openPicture(page, query);
      const slider = page.getByRole("slider", { name: "Brightness" });
      await slider.focus();
      for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");
      await save(page);
      const bright = (await savedPixels(page, [[0.25, 0.75]])).pixels[0]!;
      expect(bright[2]).toBeGreaterThan(BLUE[2]! + 5);
      const undo = page.getByRole("button", { name: "Undo" });
      for (let i = 0; i < 30; i++) await undo.click();
      await expect(undo).toBeDisabled();
      await save(page);
      expect(close((await savedPixels(page, [[0.25, 0.75]])).pixels[0]!, BLUE)).toBe(true);
    });
  });
}

test("both renderers save the same picture for a full edit", async ({ page, context }) => {
  const edit = async (target: Page, query: string) => {
    await openPicture(target, query);
    const slider = target.getByRole("slider", { name: "Contrast" });
    await slider.focus();
    for (let i = 0; i < 20; i++) await target.keyboard.press("ArrowRight");
    await target.getByRole("slider", { name: "Sharpen" }).focus();
    for (let i = 0; i < 40; i++) await target.keyboard.press("ArrowRight");
    await tool(target, "Rotate");
    await target.getByRole("button", { name: "Rotate left" }).click();
    await save(target);
    return target.evaluate(async () => {
      const bitmap = await createImageBitmap(await (await fetch(window.__saved!.url)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const c = canvas.getContext("2d")!;
      c.drawImage(bitmap, 0, 0);
      return [...c.getImageData(0, 0, bitmap.width, bitmap.height).data];
    });
  };
  const gpu = await edit(page, "");
  const cpu = await edit(await context.newPage(), "&backend=cpu");
  expect(gpu.length).toBe(cpu.length);
  let worst = 0;
  for (let i = 0; i < gpu.length; i++) worst = Math.max(worst, Math.abs(gpu[i]! - cpu[i]!));
  console.log(`Saved file difference between renderers: ${worst} of 255`);
  expect(worst).toBeLessThanOrEqual(2);
});

test("a save after the GPU is lost is not blank", async ({ page }) => {
  await openPicture(page);
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".gi-stage canvas")!;
    canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await save(page);
  const { pixels } = await savedPixels(page, [[0.25, 0.25]]);
  expect(close(pixels[0]!, RED), `${pixels[0]}`).toBe(true);
});

test("the crop can be dragged, moved by keyboard, and cancelled", async ({ page }) => {
  await openPicture(page);
  await tool(page, "Crop");
  const handle = page.locator('[data-handle="se"]');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 100, box.y - 100, { steps: 4 });
  await page.mouse.up();
  const width = await page.getByRole("textbox", { name: "Width" }).inputValue();
  expect(Number(width.replace(/\D/g, ""))).toBeLessThan(400);
  const area = page.getByRole("group", { name: "Crop area" });
  await area.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  expect(Number((await page.getByRole("textbox", { name: "Width" }).inputValue()).replace(/\D/g, ""))).toBe(Number(width.replace(/\D/g, "")) - 1);
  await page.getByRole("button", { name: "Cancel" }).first().click();
  await expect(page.locator(".gi-photo-foot")).toContainText("400 × 300");
  await expect(page.getByRole("radio", { name: "Adjust" })).toBeChecked();
});

test("keeps the crop when another tool is chosen", async ({ page }) => {
  await openPicture(page);
  await tool(page, "Crop");
  await page.getByRole("textbox", { name: "Width" }).fill("200");
  await page.getByRole("textbox", { name: "Width" }).press("Tab");
  await tool(page, "Rotate");
  await expect(page.locator(".gi-photo-foot")).toContainText("200 × 300");
});

test("shortcuts work inside the editor", async ({ page }) => {
  await openPicture(page);
  await page.getByRole("application").focus();
  await page.keyboard.press("r");
  await expect(page.getByRole("radio", { name: "Rotate" })).toBeChecked();
  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.getByRole("application").focus();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".gi-photo-foot")).toContainText("400 × 300");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".gi-photo-foot")).toContainText("300 × 400");
});

test("zooms and refits", async ({ page }) => {
  await openPicture(page);
  const zoom = page.getByRole("button", { name: /Actual size/ });
  const before = await zoom.innerText();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).not.toHaveText(before);
  await page.getByRole("button", { name: "Fit to window" }).click();
  await expect(zoom).toHaveText(before);
});

test("a failed save says so, keeps the edit and can be retried", async ({ page }) => {
  await openPicture(page);
  await tool(page, "Rotate");
  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.evaluate(() => (window.__failSave = true));
  await page.getByRole("button", { name: "Save copy" }).click();
  await expect(page.locator(".gi-photo-foot")).toContainText("was not saved");
  await page.evaluate(() => (window.__failSave = false));
  await save(page);
  await expect(page.locator(".gi-photo-foot")).toContainText("300 × 400");
});

test("asks before discarding edits, and not otherwise", async ({ page }) => {
  await openPicture(page);
  await tool(page, "Rotate");
  await page.getByRole("button", { name: "Rotate right" }).click();
  const cancel = page.locator(".gi-photo-foot").getByRole("button", { name: "Cancel" });
  await cancel.click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.locator(".gi-photo-foot")).toContainText("300 × 400");
  await cancel.click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByRole("button", { name: "Edit photo" })).toBeVisible();

  await page.getByRole("button", { name: "Edit photo" }).click();
  await expect(page.locator(".gi-photo-foot")).toContainText("400 × 300");
  await cancel.click();
  await expect(page.getByRole("button", { name: "Edit photo" })).toBeVisible();
});

test("says so when a file is not an image, and offers no save", async ({ page }) => {
  await page.goto("/?kit=stage2");
  await page.getByLabel("Open an image").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("this is not a picture") });
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  await expect(page.getByRole("button", { name: "Save copy" })).toBeDisabled();
});

test("opens a large photo without freezing the page", async ({ page }) => {
  await page.goto("/?kit=stage2");
  const worst = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(6000, 4000);
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 6000, 4000);
    gradient.addColorStop(0, "#113");
    gradient.addColorStop(1, "#fc8");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 6000, 4000);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = new DataTransfer();
    files.items.add(new File([blob], "big.png", { type: "image/png" }));
    input.files = files.files;

    const gaps: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = (now: number) => {
      gaps.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const foot = document.querySelector(".gi-photo-foot");
    const started = performance.now();
    while (!foot?.textContent?.includes("6,000 × 4,000") && performance.now() - started < 25000) await new Promise((done) => setTimeout(done, 50));
    running = false;
    return { worst: Math.max(...gaps), opened: performance.now() - started };
  });
  console.log(`6000 × 4000 PNG: opened in ${Math.round(worst.opened)} ms, longest frame ${Math.round(worst.worst)} ms`);
  expectTiming("6000 × 4000 PNG, time to open", worst.opened, 25000);
  expectTiming("6000 × 4000 PNG, longest frame", worst.worst, 400);
});

test("mirrors its chrome for right-to-left, and leaves the picture alone", async ({ page }) => {
  await openPicture(page, "&dir=rtl&lang=ar");
  const stage = await page.locator(".gi-photo-stage").boundingBox();
  const side = await page.locator(".gi-photo-side").boundingBox();
  expect(side!.x).toBeLessThan(stage!.x);
  await expect(page.locator(".gi-photo-stage")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("radio", { name: "اقتصاص" })).toBeVisible();
  await page.screenshot({ path: "test-results/photo-rtl.png" });
});

test("fits a phone, with the picture first and no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPicture(page);
  const stage = (await page.locator(".gi-photo-stage").boundingBox())!;
  const side = (await page.locator(".gi-photo-side").boundingBox())!;
  expect(side.y).toBeGreaterThan(stage.y);
  expect(stage.height).toBeGreaterThan(120);
  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(scrolls).toBe(false);
  await page.screenshot({ path: "test-results/photo-phone.png" });
});

test("a host can build its own layout from the parts, and refuse an action", async ({ page }) => {
  await page.goto("/?view=custom");
  await expect(page.getByTestId("custom-size")).toHaveText("1500 × 1000");
  const stepBack = page.getByRole("button", { name: "Step back" });
  await expect(stepBack).toBeDisabled();
  await page.getByRole("slider", { name: "Contrast" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(stepBack).toBeEnabled();
  await page.getByRole("button", { name: /Try to rotate/ }).click();
  await expect(page.getByRole("button", { name: /1 refused/ })).toBeVisible();
  await expect(page.getByTestId("custom-size")).toHaveText("1500 × 1000");
  await stepBack.click();
  await expect(stepBack).toBeDisabled();
  await expect(page.locator(".gi-stage canvas")).toHaveCount(1);
});

for (const name of ["Adjust", "Crop", "Rotate"]) {
  test(`has no accessibility violations: ${name}`, async ({ page }) => {
    await openPicture(page);
    await tool(page, name);
    const { violations } = await new AxeBuilder({ page }).include(".gi-photo-editor").exclude(".gi-stage").analyze();
    expect(violations.map(({ id, nodes }) => `${id}: ${nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  });
}
