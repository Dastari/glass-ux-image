import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page} from '@playwright/test';
import {crc32,deflateSync} from 'node:zlib';

function previewPng() {
  const width=96,height=64,rows=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)rows.set(x<width/2?[80,100,120]:[160,130,90],y*(width*3+1)+1+x*3);
  const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),check=Buffer.alloc(4);length.writeUInt32BE(data.length);check.writeUInt32BE(crc32(body));return Buffer.concat([length,body,check]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header.set([8,2,0,0,0],8);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
async function open(page:Page,backend:string) {
  await page.goto(`/?format=image/png&backend=${backend}`);
  await expect(page.getByRole('slider',{name:'Exposure',exact:true})).toBeVisible({timeout:30_000});
  await page.getByLabel('Open an image').setInputFiles({name:'develop.png',mimeType:'image/png',buffer:previewPng()});
  await expect(page.locator('.gi-photo-foot')).toContainText('96 × 64',{timeout:30_000});
  await expect(page.getByRole('slider',{name:'Exposure',exact:true})).toBeVisible();
}
async function save(page:Page) {
  await page.evaluate(()=>{window.__saved=undefined;});
  await page.locator('.gi-photo-foot').getByRole('button',{name:/Save/}).click();
  await page.waitForFunction(()=>window.__saved);
  return page.evaluate(async()=>{
    const bitmap=await createImageBitmap(await(await fetch(window.__saved!.url)).blob());
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);
    const data=Array.from(ctx.getImageData(24,32,1,1).data);
    return {width:bitmap.width,height:bitmap.height,data};
  });
}
test.use({viewport:{width:1440,height:1000}});
for(const backend of ['webgl2','cpu']) test.describe(backend,()=>{
  test('exposure reaches the saved PNG, and undo restores original pixels',async({page})=>{
    await open(page,backend);
    const original=await save(page);expect(original.data).toEqual([80,100,120,255]);
    await page.getByRole('slider',{name:'Exposure',exact:true}).focus();await page.keyboard.press('ArrowRight');
    const changed=await save(page);
    expect(changed.width).toBe(96);expect(changed.height).toBe(64);
    expect(changed.data[0]).toBeGreaterThan(original.data[0]!);expect(changed.data[2]).toBeGreaterThan(original.data[2]!);
    await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).data).toEqual(original.data);
  });
  test('curve and levels points work by keyboard and survive saving',async({page})=>{
    await open(page,backend);
    const curve=page.getByRole('group',{name:'Tone curve',exact:true});
    await curve.getByRole('button',{name:'Add point',exact:true}).click();
    const output=curve.getByRole('textbox',{name:'Output',exact:true});
    await output.fill('0.7');await output.press('Tab');
    const curved=await save(page);expect(curved.data[0]).toBeGreaterThan(80);
    const levels=page.getByRole('group',{name:'Levels',exact:true});
    const gamma=levels.getByRole('textbox',{name:'Gamma',exact:true});
    await gamma.fill('1.5');await gamma.press('ArrowUp');await gamma.press('Tab');
    expect((await save(page)).data[0]).toBeGreaterThan(curved.data[0]!);
  });
  test('histogram updates during an uncommitted drag; comparison is keyboard operable',async({page})=>{
    await open(page,backend);
    const histogram=page.getByTestId('develop-histogram');
    await expect.poll(()=>histogram.getAttribute('data-weight')).not.toBe('0');
    const chart=histogram.locator('svg.fa-chart-svg').first();const before=await chart.innerHTML();
    const slider=page.getByRole('slider',{name:'Exposure',exact:true}),box=(await slider.boundingBox())!;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2,{steps:4});
    await expect.poll(()=>chart.innerHTML()).not.toBe(before);
    await page.mouse.up();
    await page.getByRole('button',{name:'Before and after',exact:true}).click();
    const divider=page.getByRole('slider',{name:'Before and after',exact:true});await divider.focus();await page.keyboard.press('ArrowRight');await expect(divider).toHaveAttribute('aria-valuenow','51');
    // The comparison composes two previews on the main thread (a known limit in PROPOSAL.md), slow on hosted runners.
    await expect(page.getByRole('img',{name:'Before',exact:true})).toHaveAttribute('src',/^data:image\/png/,{timeout:process.env.CI?60_000:15_000});
    await expect(page.getByRole('img',{name:'After',exact:true})).toHaveAttribute('src',/^data:image\/png/);
  });
  test('auto enhance commits an undoable action and all develop sections pass axe',async({page})=>{
    await open(page,backend);
    await page.getByRole('button',{name:'Auto enhance',exact:true}).click();
    await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
    await save(page);
    const result=await new AxeBuilder({page}).include('.gi-photo-editor').analyze();
    expect(result.violations).toEqual([]);
  });
});
