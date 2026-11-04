import { expect, test, type Page } from "@playwright/test";
import { crc32, deflateSync } from "node:zlib";

/**
 * A smoke test every browser runs: Chromium by default, Firefox and WebKit with GI_BROWSERS. It uses whichever
 * renderer the browser offers (WebGL2 or the CPU backend), so its checks hold for both.
 */
declare global {
  interface Window { __saved?: { url: string; width: number; height: number; type: string } }
}

/** A real PNG: red above, blue below, so a turn or a crop shows in the saved file. */
function twoBandPng(width = 120, height = 80) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows.set(y < height / 2 ? [220, 30, 30] : [40, 60, 230], y * (width * 3 + 1) + 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), check = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    check.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

async function open(page: Page) {
  await page.goto("/?format=image/png");
  await page.getByLabel("Open an image").setInputFiles({ name: "bands.png", mimeType: "image/png", buffer: twoBandPng() });
  await expect(page.locator(".gi-photo-foot")).toContainText("120 × 80");
}

const save = async (page: Page) => {
  await page.evaluate(() => (window.__saved = undefined));
  await page.locator(".gi-photo-foot").getByRole("button", { name: /Save/ }).click();
  await page.waitForFunction(() => window.__saved, null, { timeout: 30_000 });
  return page.evaluate(async () => {
    const saved = window.__saved!;
    const bitmap = await createImageBitmap(await (await fetch(saved.url)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const at = (u: number, v: number) => Array.from(context.getImageData(Math.floor(u * bitmap.width), Math.floor(v * bitmap.height), 1, 1).data.slice(0, 3));
    return { width: bitmap.width, height: bitmap.height, start: at(.1, .5), end: at(.9, .5), top: at(.5, .1) };
  });
};

test.setTimeout(120_000);
test.use({ viewport: { width: 1280, height: 800 } });

test("opens, turns, undoes and saves a picture in this browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await page.getByRole("radio", { name: "Rotate" }).click();
  await page.getByRole("button", { name: "Rotate right" }).click();
  await expect(page.locator(".gi-photo-foot")).toContainText("80 × 120");
  // A quarter turn clockwise puts the red top band on the right.
  let saved = await save(page);
  expect([saved.width, saved.height]).toEqual([80, 120]);
  expect(saved.end[0]).toBeGreaterThan(180);
  expect(saved.start[2]).toBeGreaterThan(180);
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(page.locator(".gi-photo-foot")).toContainText("120 × 80");
  saved = await save(page);
  expect([saved.width, saved.height]).toEqual([120, 80]);
  expect(saved.top[0]).toBeGreaterThan(180);
  expect(errors).toEqual([]);
});

test("the workspace loads and a develop slider records one step", async ({ page }) => {
  await page.goto("/?view=workspace");
  await expect(page.locator(".gi-image-editor .gi-stage")).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __workspaceDemo?: { pictures: { editor: { state: { status: string } } }[] } }).__workspaceDemo?.pictures[0]?.editor.state.status === "ready", null, { timeout: 60_000 });
  const exposure = page.getByRole("slider", { name: "Exposure" }).first();
  await exposure.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __workspaceDemo: { pictures: { editor: { history: { nodes: unknown[] } } }[] } }).__workspaceDemo.pictures[0]!.editor.history.nodes.length)).toBe(2);
});
