import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { crc32, deflateSync } from "node:zlib";
declare global {
    interface Window {
        __saved?: {
            url: string;
            width: number;
            height: number;
            type: string;
        };
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
    await page.goto(`/?format=image/png${query}`);
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
const savedPixels = (page: Page, points: Array<[
    number,
    number
]>) => page.evaluate(async (at) => {
    const saved = window.__saved!;
    const bitmap = await createImageBitmap(await (await fetch(saved.url)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const pixels = at.map(([u, v]) => Array.from(context.getImageData(Math.floor(u * bitmap.width), Math.floor(v * bitmap.height), 1, 1).data.slice(0, 3)));
    return { width: bitmap.width, height: bitmap.height, pixels };
}, points);
const close = (actual: number[], expected: number[], tolerance = 3) => actual.every((value, i) => Math.abs(value - expected[i]!) <= tolerance);
const RED = [220, 30, 30], WHITE = [250, 250, 250];
test.use({ viewport: { width: 1440, height: 900 } });
for (const [backend, query] of [['WebGL2', ''], ['CPU', '&backend=cpu']] as const) {
    test(`${backend}: saved pixels after free rotation, straighten, resize and canvas expansion, then undo`, async ({ page }) => {
        await openPicture(page, query);
        await tool(page, 'Rotate');
        const angle = page.getByRole('textbox', { name: 'Angle', exact: true });
        await angle.fill('30');
        await angle.press('Tab');
        await save(page);
        let output = await savedPixels(page, [[.35, .3], [.65, .7]]);
        expect([output.width, output.height]).toEqual([496, 460]);
        expect(close(output.pixels[0]!, RED)).toBe(true);
        expect(close(output.pixels[1]!, WHITE)).toBe(true);
        await tool(page, 'Straighten');
        await angle.fill('10');
        await angle.press('Tab');
        await save(page);
        output = await savedPixels(page, [[.25, .25], [.75, .75]]);
        expect([output.width, output.height]).toEqual([329, 247]);
        expect(close(output.pixels[0]!, RED)).toBe(true);
        expect(close(output.pixels[1]!, WHITE)).toBe(true);
        await tool(page, 'Resize');
        await page.getByRole('textbox', { name: 'Width', exact: true }).fill('200');
        await page.getByRole('textbox', { name: 'Width', exact: true }).press('Tab');
        await page.getByRole('button', { name: 'Apply', exact: true }).click();
        await save(page);
        output = await savedPixels(page, [[.25, .25], [.75, .75]]);
        expect([output.width, output.height]).toEqual([200, 150]);
        expect(close(output.pixels[0]!, RED)).toBe(true);
        expect(close(output.pixels[1]!, WHITE)).toBe(true);
        await tool(page, 'Canvas size');
        // Canvas precedes output resize, so expand the underlying cropped picture and retain output dimensions.
        await page.getByRole('textbox', { name: 'Width', exact: true }).fill('600');
        await page.getByRole('textbox', { name: 'Width', exact: true }).press('Tab');
        await page.getByRole('button', { name: 'Apply', exact: true }).click();
        await save(page);
        const alpha = await page.evaluate(async () => { const b = await createImageBitmap(await (await fetch(window.__saved!.url)).blob()), c = new OffscreenCanvas(b.width, b.height), ctx = c.getContext('2d')!; ctx.drawImage(b, 0, 0); return ctx.getImageData(0, Math.floor(b.height / 2), 1, 1).data[3]; });
        expect(alpha).toBe(0);
        for (const size of ['200 × 150', '329 × 247', '496 × 460', '400 × 300']) {
            await page.getByRole('button', { name: 'Undo', exact: true }).click();
            await expect(page.locator('.gi-photo-foot')).toContainText(size);
        }
    });
    test(`${backend}: canvas shrink changes saved pixels`, async ({ page }) => { await openPicture(page, query); await tool(page, 'Canvas size'); for (const [name, value] of [['Width', '200'], ['Height', '100']]) {
        const field = page.getByRole('textbox', { name, exact: true });
        await field.fill(value!);
        await field.press('Tab');
    } await page.getByRole('button', { name: 'Apply', exact: true }).click(); await save(page); const p = await savedPixels(page, [[.1, .1], [.9, .9]]); expect([p.width, p.height]).toEqual([200, 100]); expect(close(p.pixels[0]!, RED)).toBe(true); expect(close(p.pixels[1]!, WHITE)).toBe(true); });
}
for (const name of ['Crop', 'Resize', 'Rotate', 'Flip', 'Straighten', 'Canvas size', 'Move', 'Transform'])
    test(`accessible geometry panel: ${name}`, async ({ page }) => { await openPicture(page); await tool(page, name); const { violations } = await new AxeBuilder({ page }).include('.gi-photo-editor').exclude('.gi-stage').analyze(); expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]); });
test('transform handles preview, cancel and apply by keyboard', async ({ page }) => { await openPicture(page); await tool(page, 'Transform'); const handle = page.getByRole('button', { name: 'Scale Top left', exact: true }); await handle.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled(); await handle.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled(); });

test('crop custom ratio, orientation and individual keyboard handle', async ({ page }) => {
 await openPicture(page);
 await tool(page,'Crop');
 await page.getByRole('button',{name:/Aspect ratio:/}).click();
 await page.getByRole('menuitemradio',{name:'Custom',exact:true}).click();
 await page.getByRole('textbox',{name:'Custom',exact:true}).fill('2');
 await page.getByRole('textbox',{name:'Custom',exact:true}).press('Tab');
 await expect(page.getByRole('textbox',{name:'Height',exact:true})).toHaveValue('150');
 await page.getByRole('button',{name:'Swap orientation',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Width',exact:true})).toHaveValue('150');
 const handle=page.getByRole('button',{name:'Crop area Right',exact:true});
 await handle.focus();await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('textbox',{name:'Width',exact:true})).toHaveValue('149');
});

test('straighten drawn horizon commits once and undoes',async({page})=>{
 await openPicture(page);await tool(page,'Straighten');
 const rect=(await page.locator('.gi-horizon').boundingBox())!;
 await page.mouse.move(rect.x+rect.width*.3,rect.y+rect.height*.4);await page.mouse.down();
 await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.5,{steps:6});await page.mouse.up();
 const value=Number(await page.getByRole('textbox',{name:'Angle',exact:true}).inputValue());expect(value).toBeLessThan(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('.gi-photo-foot')).toContainText('400 × 300');
 await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
});
