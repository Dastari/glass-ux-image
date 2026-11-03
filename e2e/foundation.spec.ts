import { expect, test } from "@playwright/test";

test("Sections use Accordion and history/layer hooks expose the current tree",async({page})=>{
  await page.goto("/foundation.html");
  await expect(page.getByRole("button",{name:"Apply",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Apply",exact:true}).click();
  await expect(page.getByTestId("tree")).toHaveText("2:Angle:0");
  await page.getByRole("button",{name:"Crop",exact:true}).click();
  await expect(page.getByRole("button",{name:"Apply",exact:true})).toBeHidden();
  await page.evaluate(()=>window.foundation.session.goTo("0"));
  await expect(page.getByTestId("tree")).toHaveText("2::0");
});
test("reports document pointers and Space pans through a tool overlay",async({page})=>{
  await page.goto("/foundation.html");
  const canvas=page.getByRole("application").nth(1);
  await expect(canvas).toHaveAttribute("aria-busy","false");
  await canvas.focus();
  const rect=(await canvas.boundingBox())!;
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.up();
  await expect(page.getByTestId("pointer")).toHaveText("up:300.00:200.00");
  const before=await page.evaluate(()=>window.foundation.pointerSession.renderer!.view.centerX);
  await page.keyboard.down("Space");
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+80,y,{steps:5});await page.mouse.up();
  await page.keyboard.up("Space");
  await expect.poll(()=>page.evaluate(()=>window.foundation.pointerSession.renderer!.view.centerX)).toBeLessThan(before-50);
});

test("both renderers save byte-identical PNGs with free rotation, canvas, resize and a projective layer",async({page})=>{
  await page.goto("/foundation.html");
  const [gpu,cpu]=await page.evaluate(()=>window.foundation.exportBoth());
  expect(gpu!.length).toBeGreaterThan(100);
  expect(gpu).toEqual(cpu);
});
