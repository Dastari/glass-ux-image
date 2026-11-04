import type { OpenPicture, ImageWorkspace } from '../src/editor/index.js';
declare global {interface Window {__workspaceDemo?:{pictures:OpenPicture[];selected:string|null;workspace:ImageWorkspace|undefined}}}
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workspaceMessages } from '../src/messages/workspace.js';
import { workspaceTranslations } from '../src/i18n/domains/workspace.js';

/* Workspace chrome: the fixed histogram and rail, History out of the Library, the View menu's panes,
   menu icons, the effects gallery's end, and the transparency grid. */

test.setTimeout(90_000);
const ready=async(page:Page,query='')=>{
  await page.goto(`/?view=workspace${query}`);
  await expect(page.locator('.gi-image-editor .gi-stage canvas')).toHaveCount(1);
  await page.waitForFunction(()=>window.__workspaceDemo?.pictures[0]?.editor.state.status==='ready');
};
/** Runs a session action on the selected picture. */
const run=(page:Page,id:string,value?:unknown)=>page.evaluate(([id,value])=>{const d=window.__workspaceDemo!,s=d.pictures.find(p=>p.id===d.selected)!.editor;return s.run(id as string,value);},[id,value] as const);
const box=async(page:Page,selector:string)=>(await page.locator(selector).first().boundingBox())!;

test.describe('end column',()=>{
  for(const [width,height] of [[1440,900],[1100,760]] as const){
    test(`the histogram and tool rail stay put while the settings scroll at ${width}`,async({page})=>{
      await page.setViewportSize({width,height});
      await ready(page);
      // At 1100 the library shares the stack; Develop is the chosen tab.
      const head=page.locator('.gi-workspace-right-head');
      await expect(head.locator('.gi-develop-histogram')).toBeVisible();
      await expect(head.locator('.gi-tool-rail')).toBeVisible();
      const viewport=page.locator('.gi-workspace-right-scroll > .fa-scroll-viewport');
      expect(await viewport.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
      const before=await box(page,'.gi-workspace-right-head .gi-tool-rail');
      await viewport.hover();await page.mouse.wheel(0,600);
      await expect.poll(()=>viewport.evaluate(e=>e.scrollTop)).toBeGreaterThan(100);
      const after=await box(page,'.gi-workspace-right-head .gi-tool-rail');
      expect(after.y).toBe(before.y);
      await expect(head.locator('.gi-develop-histogram')).toBeInViewport({ratio:1});
      // The settings scroll under the head, never over it.
      expect((await box(page,'.gi-workspace-right-scroll')).y).toBeGreaterThanOrEqual(after.y+after.height);
      // The rail still chooses tools while the settings are scrolled.
      await page.locator('.gi-workspace-right-head').getByRole('radio',{name:'Effects'}).or(page.locator('.gi-workspace-right-head').getByRole('button',{name:'Effects'})).first().click();
      await page.waitForFunction(()=>{const d=window.__workspaceDemo!,s=d.pictures.find(p=>p.id===d.selected)!.editor;return s.state.tool==='effects';});
    });
  }
  test('the sheet layout keeps the histogram and rail above the scrolling settings',async({page})=>{
    await page.setViewportSize({width:900,height:800});
    await ready(page);
    await page.getByRole('tab',{name:'Develop'}).or(page.getByRole('button',{name:'Develop',exact:true})).first().click();
    const head=page.locator('.gi-workspace-right-head'),viewport=page.locator('.gi-workspace-right-scroll > .fa-scroll-viewport');
    await expect(head.locator('.gi-tool-rail')).toBeVisible();
    // The sheet slides up as it opens; measure once it has come to rest.
    let last=-1;
    await expect.poll(async()=>{const y=(await box(page,'.gi-workspace-right-head')).y,still=y===last;last=y;return still;},{intervals:[150]}).toBe(true);
    const before=await box(page,'.gi-workspace-right-head');
    await viewport.evaluate(e=>{e.scrollTop=300;});
    await expect.poll(()=>viewport.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
    expect((await box(page,'.gi-workspace-right-head')).y).toBe(before.y);
    await expect(head.locator('.gi-tool-rail')).toBeInViewport({ratio:1});
  });
});

test.describe('history',()=>{
  test.use({viewport:{width:1440,height:900}});
  test('lives behind a title-bar button and View > History, not in the Library',async({page})=>{
    await ready(page);
    await expect(page.locator('.gi-workspace-region').getByRole('tree',{name:'History'})).toHaveCount(0);
    await page.evaluate(()=>{const d=window.__workspaceDemo!,s=d.pictures.find(p=>p.id===d.selected)!.editor;s.commit({geometry:{...s.state.recipe.geometry,rotation:90}},{label:'Turn'});s.undo();s.commit({geometry:{...s.state.recipe.geometry,rotation:180}},{label:'Other turn'});});
    const button=page.locator('.gi-workspace-actions').getByRole('button',{name:'History',exact:true});
    await expect(button).toHaveAttribute('aria-expanded','false');
    await button.click();
    const popup=page.locator('.gi-workspace-history');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('tree',{name:'History'})).toBeVisible();
    // Every branch is kept.
    await expect(popup.getByRole('treeitem',{name:'Turn',exact:true})).toBeVisible();
    await expect(popup.getByRole('treeitem',{name:'Other turn',exact:true})).toHaveAttribute('aria-selected','true');
    const axe=await new AxeBuilder({page}).include('.gi-workspace-history').analyze();
    expect(axe.violations.map(v=>v.id)).toEqual([]);
    await popup.getByRole('treeitem',{name:'Turn',exact:true}).click();
    await page.waitForFunction(()=>{const d=window.__workspaceDemo!,s=d.pictures.find(p=>p.id===d.selected)!.editor;return s.history.current.label==='Turn';});
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(button).toBeFocused();
    // The same popover from the View menu, and the arrow keys walk the tree.
    await page.getByRole('menuitem',{name:'View',exact:true}).click();
    await page.getByRole('menuitem',{name:'History',exact:true}).click();
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('treeitem',{name:'Turn',exact:true})).toHaveAttribute('aria-selected','true');
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
  });
  test('opens from the title bar when the bar is too narrow for its button',async({page})=>{
    await page.setViewportSize({width:420,height:860});
    await ready(page);
    await expect(page.locator('.gi-workspace-actions').getByRole('button',{name:'History',exact:true})).toBeHidden();
    await page.getByRole('menuitem',{name:'Menu'}).or(page.getByRole('button',{name:'Menu'})).first().click();
    await page.getByRole('menuitem',{name:'View',exact:true}).click();
    await page.getByRole('menuitem',{name:'History',exact:true}).click();
    const popup=page.locator('.gi-workspace-history');
    await expect(popup).toBeInViewport({ratio:1});
    const bar=await box(page,'.gi-workspace-top');
    expect((await popup.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y+bar.height-1);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
  });
});

test.describe('View menu',()=>{
  test.use({viewport:{width:1440,height:900}});
  const layout=(page:Page)=>page.evaluate(()=>JSON.stringify(window.__workspaceDemo!.workspace?.layout??null));
  // A right-to-left demo page is in Arabic, so the names come from the pack the page uses.
  let words:typeof workspaceMessages.defaults=workspaceMessages.defaults;
  const toggle=async(page:Page,name:string,checked:boolean)=>{
    await page.getByRole('menuitem',{name:words.view,exact:true}).click();
    const row=page.getByRole('menuitemcheckbox',{name,exact:true});
    await expect(row).toHaveAttribute('aria-checked',String(!checked));
    await row.click();
    await expect(row).toHaveAttribute('aria-checked',String(checked));
    await page.keyboard.press('Escape');
  };
  for(const dir of ['ltr','rtl'] as const)test(`shows and hides each pane and resets the layout (${dir})`,async({page})=>{
    words=dir==='rtl'?{...workspaceMessages.defaults,...workspaceTranslations.ar}:workspaceMessages.defaults;
    await ready(page,dir==='rtl'?'&dir=rtl':'');
    const library=page.locator('.gi-workspace-region:not(.gi-workspace-right)').first(),develop=page.locator('.gi-workspace-right'),pictures=page.locator('.gi-workspace-bottom'),stage=page.locator('.gi-workspace-stage');
    const start=async()=>({library:(await library.boundingBox())!,develop:(await develop.boundingBox())!,pictures:(await pictures.boundingBox())!,stage:(await stage.boundingBox())!});
    const original=await start();
    for(const [name,region] of [[words.library,library],[words.develop,develop],[words.filmstrip,pictures]] as const){
      await toggle(page,name,false);
      await expect(region).toHaveCount(0);
      await toggle(page,name,true);
      await expect(region).toBeVisible();
    }
    // Each pane came back where it was, at its size.
    const back=await start();
    for(const key of ['library','develop','pictures','stage'] as const){
      expect(Math.abs(back[key].x-original[key].x),key).toBeLessThanOrEqual(2);
      expect(Math.abs(back[key].width-original[key].width),key).toBeLessThanOrEqual(2);
      expect(Math.abs(back[key].height-original[key].height),key).toBeLessThanOrEqual(2);
    }
    // The library sits at the start of the reading direction, the filmstrip spans the whole width.
    if(dir==='ltr')expect(back.library.x).toBeLessThan(back.stage.x);else expect(back.library.x).toBeGreaterThan(back.stage.x);
    expect(back.pictures.width).toBeGreaterThan(back.library.width+back.stage.width);
    const restored=await layout(page);
    // Hide two, then Reset layout puts the default back.
    await toggle(page,words.library,false);await toggle(page,words.filmstrip,false);
    await page.getByRole('menuitem',{name:words.view,exact:true}).click();
    await page.getByRole('menuitem',{name:words.resetLayout,exact:true}).click();
    await expect(library).toBeVisible();await expect(pictures).toBeVisible();
    expect(await layout(page)).toBe(restored);
    // The palette offers the same commands, named for what they do.
    await page.getByRole('button',{name:words.commands,exact:true}).click();
    await page.keyboard.type(words.hidePane(words.library));
    await expect(page.getByRole('option',{name:new RegExp(words.hidePane(words.library))})).toBeVisible();
    await page.keyboard.press('Escape');
  });
  test('a pane behind another tab is brought forward, and the host layout is reported',async({page})=>{
    await page.setViewportSize({width:1100,height:760});
    await ready(page);
    await page.getByRole('menuitem',{name:'View',exact:true}).click();
    const row=page.getByRole('menuitemcheckbox',{name:'Library',exact:true});
    await expect(row).toHaveAttribute('aria-checked','false');
    await row.click();
    await expect(row).toHaveAttribute('aria-checked','true');
    await expect(page.getByRole('menuitemcheckbox',{name:'Develop',exact:true})).toHaveAttribute('aria-checked','false');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tab',{name:'Library'})).toHaveAttribute('aria-selected','true');
    await page.waitForFunction(()=>JSON.stringify(window.__workspaceDemo!.workspace?.layout).includes('"active":"left"'));
  });
});

test('every menu row carries its icon, and a tool row shows the same icon as the rail',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await ready(page);
  await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
  const expectMenuIcons=async(name:string,minimum=1)=>{
    const popup=page.getByRole('menu',{name,exact:true});
    await expect(popup).toBeVisible();
    // Menu content arrives after opening, and the previous popup can remain during
    // its exit. Wait for the named menu and inspect its rows in one DOM read.
    await expect(async()=>{
      const icons=await popup.getByRole('menuitem').evaluateAll(items=>items.map(item=>({label:item.textContent,hasIcon:!!item.querySelector('svg')})));
      expect(icons.length,name).toBeGreaterThanOrEqual(minimum);
      for(const icon of icons)expect(icon.hasIcon,`${name}: ${icon.label}`).toBe(true);
    }).toPass({timeout:5000});
  };
  await expectMenuIcons('Edit',11);
  const shape=async(locator:import('@playwright/test').Locator)=>locator.locator('svg').first().evaluate(svg=>[...svg.querySelectorAll('path,rect,circle,line,polyline')].map(e=>e.outerHTML.replace(/ class="[^"]*"/g,'')).join(''));
  const crop=await shape(page.getByRole('menuitem',{name:/^Crop/}));
  await page.keyboard.press('Escape');
  expect(crop).not.toBe('');
  expect(await shape(page.locator('.gi-workspace-right-head .gi-tool-rail').getByRole('radio',{name:'Crop'}).or(page.locator('.gi-workspace-right-head .gi-tool-rail').getByRole('button',{name:/^Crop/})).first())).toBe(crop);
  for(const menu of ['File','View','Help']){
    await page.getByRole('menuitem',{name:menu,exact:true}).click();
    await expectMenuIcons(menu);
    await page.keyboard.press('Escape');
  }
});

test('an effects gallery ends at its last row of thumbnails',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await ready(page);
  await run(page,'tool.select','effects');
  const right=page.locator('.gi-workspace-right');
  for(const name of ['Artistic','Blur','Looks and presets']){
    const trigger=right.getByRole('button',{name,exact:true});
    await trigger.click();
    const item=right.locator('.fa-accordion-item',{has:page.getByRole('button',{name,exact:true})});
    const gallery=item.locator('.gi-filter-gallery');
    await expect(gallery).toBeVisible();
    const measure=await gallery.evaluate(g=>{
      const cards=[...g.querySelectorAll('.gi-filter-choice')].map(c=>c.getBoundingClientRect().bottom);
      const wrapper=g.parentElement!.getBoundingClientRect().bottom;
      return {last:Math.max(...cards),wrapper};
    });
    // Only the focus ring's reach remains below the last row; nothing is held for a hidden notice.
    expect(measure.wrapper-measure.last,name).toBeLessThanOrEqual(8);
    await expect(item.locator('.gi-filter-gallery-status')).toHaveAttribute('role','status');
    await trigger.click();
  }
});

/** Opens a picture whose left half is fully transparent and right half opaque green. */
async function openTransparent(page:Page){
  const bytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;
    const g=canvas.getContext('2d')!;g.fillStyle='rgb(40,160,90)';g.fillRect(300,0,300,400);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.locator('.workspace-host-bar input[type=file]').setInputFiles({name:'transparent.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures.length===2&&window.__workspaceDemo!.pictures[1]!.editor.state.status==='ready'&&window.__workspaceDemo!.selected===window.__workspaceDemo!.pictures[1]!.id);
}
const STAGE=38,LIGHT=204,MID=158;
/** Reads the stage's pixels: where the picture is, and what lies under its corner, inside and outside it. */
async function readStage(page:Page){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForTimeout(400);
  const stage=(await page.locator('.gi-stage').boundingBox())!,clear=(await page.locator('.gi-stage-clear').boundingBox())!;
  const png=(await page.locator('.gi-stage').screenshot()).toString('base64');
  // Floating panes in Focus cover the stage's edges; the picture fits the clear area, so only that is read.
  const area={x:Math.round(clear.x-stage.x)+12,y:Math.round(clear.y-stage.y)+12,width:Math.round(clear.width)-24,height:Math.round(clear.height)-24};
  return page.evaluate(async({png,area,STAGE})=>{
    const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const g=canvas.getContext('2d')!;g.drawImage(image,0,0);
    const {data}=g.getImageData(0,0,canvas.width,canvas.height);
    const at=(x:number,y:number)=>{const i=(y*canvas.width+x)*4;return [data[i]!,data[i+1]!,data[i+2]!];};
    const isStage=(p:number[])=>p.every(v=>Math.abs(v-STAGE)<=3);
    let left=Infinity,top=Infinity,right=-1,bottom=-1;
    for(let y=area.y;y<area.y+area.height;y++)for(let x=area.x;x<area.x+area.width;x++)if(!isStage(at(x,y))){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const inset=2;
    return {
      bounds:{left,top,right,bottom},
      corner:at(left+inset,top+inset),
      across:at(left+8+inset,top+inset),
      down:at(left+inset,top+8+inset),
      diagonal:at(left+8+inset,top+8+inset),
      outside:[at(left-4,top+10),at(right+4,bottom-10),at(left+10,top-4),at(right-10,bottom+4)].filter(p=>p[0]!==undefined),
      greenRight:at(right-inset-2,Math.round((top+bottom)/2)),
    };
  },{png,area,STAGE});
}
const near=(p:number[],v:number)=>p.every(c=>Math.abs(c-v)<=4);
function expectAligned(read:Awaited<ReturnType<typeof readStage>>,label:string){
  expect(read.bounds.right,label).toBeGreaterThan(read.bounds.left);
  // Squares count from the picture's own corner: light, then grey across and down, light on the diagonal.
  expect(near(read.corner,LIGHT),`${label} corner ${read.corner}`).toBe(true);
  expect(near(read.across,MID),`${label} across ${read.across}`).toBe(true);
  expect(near(read.down,MID),`${label} down ${read.down}`).toBe(true);
  expect(near(read.diagonal,LIGHT),`${label} diagonal ${read.diagonal}`).toBe(true);
  // The stage outside the picture stays solid.
  for(const p of read.outside)expect(near(p,STAGE),`${label} outside ${p}`).toBe(true);
}

test('transparent pixels show a grid under the picture only, aligned at every zoom, pan, turn and in Focus',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await ready(page);
  await openTransparent(page);
  const fitted=await readStage(page);
  expectAligned(fitted,'fit');
  expect(near(fitted.greenRight,0)).toBe(false);
  // Zoomed out, then panned by an odd amount: the squares move with the picture.
  await page.evaluate(()=>{const d=window.__workspaceDemo!,s=d.pictures.find(p=>p.id===d.selected)!.editor;s.view!.zoomOut();});
  const zoomed=await readStage(page);
  expectAligned(zoomed,'zoom');
  const stage=(await page.locator('.gi-stage').boundingBox())!;
  await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);
  await page.mouse.down();await page.mouse.move(stage.x+stage.width/2+37,stage.y+stage.height/2+23,{steps:4});await page.mouse.up();
  const panned=await readStage(page);
  expect(panned.bounds.left).not.toBe(zoomed.bounds.left);
  expectAligned(panned,'pan');
  // A turn opens transparent corners inside the new bounds; they show the grid too.
  await page.evaluate(()=>{const d=window.__workspaceDemo!,s=d.pictures.find(p=>p.id===d.selected)!.editor;s.commit({geometry:{...s.state.recipe.geometry,angle:20}},{label:'Turn'});s.view?.fit();});
  const turned=await readStage(page);
  expectAligned(turned,'turn');
  // Focus floats the panes over a full-width stage; the grid follows the picture there.
  await page.getByRole('button',{name:'Focus',exact:true}).click();
  await expect(page.locator('.gi-image-editor')).toHaveAttribute('data-workspace','focus');
  expectAligned(await readStage(page),'focus');
});

test('the CPU renderer draws the same grid',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await ready(page,'&backend=cpu');
  await openTransparent(page);
  expectAligned(await readStage(page),'cpu');
});

test('typing a plain letter in a field stays a character; it does not run a workspace command',async({page})=>{
  await ready(page);
  await page.evaluate(()=>{const input=document.createElement('input');input.id='typing-probe';input.setAttribute('aria-label','Probe');document.querySelector('.gi-workspace-right-content')!.prepend(input);});
  const mode=()=>page.locator('.gi-image-editor').getAttribute('data-workspace');
  const before=await mode();
  await page.locator('#typing-probe').click();
  await page.keyboard.type('fff\\');
  await expect(page.locator('#typing-probe')).toHaveValue('fff\\');
  expect(await mode()).toBe(before);
  // Outside a field the same key still switches the layout.
  await page.locator('.gi-stage').focus();await page.keyboard.press('f');
  await expect.poll(mode).not.toBe(before);
});
