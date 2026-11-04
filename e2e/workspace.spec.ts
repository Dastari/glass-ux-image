import type { OpenPicture, ImageWorkspace } from '../src/editor/index.js';
declare global {interface Window {__workspaceDemo?:{pictures:OpenPicture[];selected:string|null;workspace:ImageWorkspace|undefined}}}
import { expect,test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.setTimeout(30000);
test.use({viewport:{width:1440,height:900}});
const ready=async(page:import('@playwright/test').Page)=>{await page.goto('/?view=workspace');await expect(page.locator('.gi-image-editor .gi-stage canvas')).toHaveCount(1);await page.waitForFunction(()=>window.__workspaceDemo?.pictures[0]?.editor.state.status==='ready');};

test('workspace actions share menus, palette, overrides and scoped keys; branches and pictures retain history',async({page})=>{
  await ready(page);
  await page.locator('.gi-stage').focus();
  await page.keyboard.press('c');
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.state.tool==='crop');
  await page.evaluate(()=>{const s=window.__workspaceDemo!.pictures[0]!.editor;s.commit({geometry:{...s.state.recipe.geometry,rotation:90}},{label:'Turn'});s.undo();s.commit({geometry:{...s.state.recipe.geometry,rotation:180}},{label:'Other turn'});});
  // History opens from its title-bar button.
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByRole('treeitem',{name:'Turn',exact:true})).toBeVisible();
  await expect(page.getByRole('treeitem',{name:'Other turn',exact:true})).toBeVisible();
  await page.getByRole('treeitem',{name:'Turn',exact:true}).click();
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.history.current.label==='Turn');
  await page.keyboard.press('Escape');
  await page.locator('.gi-stage').focus();await page.keyboard.press('Control+z');
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.history.current.id==='0');
  await page.keyboard.press('Control+Shift+z');
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.history.current.label==='Turn');
  // F6 moves to the next region: to where focus last was there, or its first control (Glass UX's traversal).
  const regionOfFocus=()=>page.evaluate(()=>{const regions=[...document.querySelectorAll('[data-workspace-region]')];return regions.findIndex(r=>r.contains(document.activeElement));});
  const before=await regionOfFocus();
  await page.keyboard.press('F6');
  await expect.poll(regionOfFocus).not.toBe(before);
  expect(await regionOfFocus()).toBeGreaterThanOrEqual(0);
  await page.getByRole('button',{name:'Command palette',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('menuitem',{name:'Help',exact:true}).click();await page.getByRole('menuitem',{name:/^Keyboard shortcuts/}).click();
  await expect(page.getByRole('dialog')).toContainText('Keyboard shortcuts');await page.keyboard.press('Escape');
});

test('Focus drops blur during motion and reports serialisable layout; comparison leaves history intact',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'Focus',exact:true}).click();
  await expect(page.locator('.gi-image-editor')).toHaveAttribute('data-workspace','focus');
  await page.waitForFunction(()=>window.__workspaceDemo!.workspace?.mode==='focus');
  await expect(page.locator('.gi-workspace-right')).toBeInViewport();
  await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.renderer!.settle());
  const stage=page.locator('.gi-stage');await stage.dispatchEvent('pointerdown',{pointerId:1,clientX:500,clientY:300});
  await expect(page.locator('.gi-image-editor')).toHaveAttribute('data-pixels-moving','');
  const blur=await page.locator('.fa-pane-stack').evaluateAll(es=>es.map(e=>getComputedStyle(e).backdropFilter));expect(blur.every(b=>b==='none')).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup')));
  await expect(page.locator('.gi-image-editor')).not.toHaveAttribute('data-pixels-moving','');
  const count=await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.history.nodes.length);
  await page.locator('.fa-status-bar').getByRole('button',{name:'Before and after',exact:true}).click();
  await expect(page.locator('.gi-workspace-compare')).toBeVisible();
  expect(await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.history.nodes.length)).toBe(count);
});

test('file opening creates independent sessions; recovery survives reload; save downloads',async({page})=>{
  await ready(page);
  const png=await page.evaluate(async()=>{const c=new OffscreenCanvas(80,60);c.getContext('2d')!.fillRect(0,0,80,60);return Array.from(new Uint8Array(await(await c.convertToBlob()).arrayBuffer()));});
  await page.getByLabel('Open images').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:Buffer.from(png)},{name:'two.png',mimeType:'image/png',buffer:Buffer.from(png)}]);
  await page.waitForFunction(()=>window.__workspaceDemo?.pictures.length===3&&window.__workspaceDemo.pictures[2]!.editor.state.status==='ready');
  await page.evaluate(()=>{const s=window.__workspaceDemo!.pictures[2]!.editor;s.setGeometry({rotation:90});});
  await page.getByRole('radio',{name:'one.png',exact:true}).click();
  await page.getByRole('radio',{name:'two.png',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__workspaceDemo!.pictures[2]!.editor.history.nodes.length)).toBe(2);
  const encoded=()=>page.evaluate(async()=>Array.from(new Uint8Array(await (await window.__workspaceDemo!.pictures[2]!.editor.result().toBlob({type:'image/png'})).arrayBuffer())));
  const docked=await encoded();await page.getByRole('button',{name:'Focus',exact:true}).click();expect(await encoded()).toEqual(docked);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy',exact:true}).click();expect((await download).suggestedFilename()).toContain('two.png');
  await expect.poll(()=>page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('glass-image-demo');let count=0;for await(const _ of dir.keys())count++;return count;})).toBeGreaterThan(0);
  await page.reload();await page.getByRole('button',{name:'Recover previous session',exact:true}).click();
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures.length===2&&window.__workspaceDemo!.pictures[1]!.editor.state.size?.width===60);
});

for(const mode of ['dark','light'])for(const dir of ['ltr','rtl'])for(const width of [1440,900,390])test(`layout ${width} ${mode} ${dir}`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto(`/?view=workspace&mode=${mode}&dir=${dir}${dir==='rtl'?'&lang=ar':''}`);
  await expect(page.locator('.gi-image-editor .gi-stage canvas')).toHaveCount(1);
  await page.waitForFunction(()=>window.__workspaceDemo?.pictures[0]?.editor.state.status==='ready');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const stage=page.locator('.gi-stage');await expect(stage).toHaveAttribute('dir','ltr');const box=(await stage.boundingBox())!;expect(box.height).toBeGreaterThan(200);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.renderer!.settle());
  if(width===1440) {
    const histogram=page.locator('.gi-workspace-right-head > .gi-develop-histogram');
    await expect(histogram).toHaveAttribute('data-weight',/^[1-9]/);
    await expect.poll(()=>histogram.locator('.fa-chart-bar').evaluateAll(bars=>bars.filter(bar=>bar.getBoundingClientRect().height>0).length)).toBeGreaterThan(0);
  }
  await page.screenshot({path:`/tmp/gi-workspace-${width}-${mode}-${dir}.png`});
  await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.run('workspace.mode','focus'));
  await expect(page.locator('.gi-image-editor')).toHaveAttribute('data-workspace','focus');
  await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.renderer!.settle());
  await page.screenshot({path:`/tmp/gi-workspace-focus-${width}-${mode}-${dir}.png`});
});

test('workspace chrome has no axe violations',async({page})=>{await ready(page);const {violations}=await new AxeBuilder({page}).include('.gi-image-editor').exclude('.gi-stage').analyze();expect(violations.map(v=>`${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);});


test('host key overrides disable the old binding and change hold-to-pan without changing the recipe',async({page})=>{
  await page.goto('/?view=workspace&shortcuts-test');await page.waitForFunction(()=>window.__workspaceDemo?.pictures[0]?.editor.state.status==='ready');
  await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.setGeometry({rotation:90}));
  await page.locator('.gi-stage').focus();await page.keyboard.press('Control+z');
  expect(await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.state.recipe.geometry.rotation)).toBe(90);
  await page.keyboard.press('Alt+z');await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.state.recipe.geometry.rotation===0);
  await page.keyboard.down('p');await expect(page.locator('.gi-image-editor')).toHaveAttribute('data-pan-held','');
  await page.keyboard.up('p');await expect(page.locator('.gi-image-editor')).not.toHaveAttribute('data-pan-held','');
  await page.keyboard.down('Space');await expect(page.locator('.gi-stage')).not.toHaveAttribute('data-panning','');await page.keyboard.up('Space');
});
for(const kit of ['basic','standard','advanced'])test(`PhotoEditor accepts ${kit} kit with reachable tools`,async({page})=>{
  await page.goto(`/?view=editor&kit=${kit}`);await expect(page.locator('.gi-photo-stage canvas')).toHaveCount(1);
  await page.getByLabel('Open an image').setInputFiles('apps/demo/src/assets/sample.png');
  await expect(page.locator('.gi-photo-foot')).toContainText('1,500 × 1,000',{timeout:20_000});
  // A readiness wait, not a speed check: SwiftShader's first paint takes about 4 s at a 4x slower CPU, the same
  // before and after 0.1.0's changes, which left a hosted runner too close to the default 5 s.
  await expect.poll(async()=>(await page.locator('.gi-stage-surface canvas').screenshot()).byteLength,{timeout:20_000}).toBeGreaterThan(15000);
  const radios=page.locator('.gi-photo-side').getByRole('radiogroup',{name:'Tools',exact:true}).getByRole('radio');await expect(radios).toHaveCount(kit==='basic'?4:kit==='standard'?12:18); // advanced: Select leads it
  await radios.last().click();await expect(radios.last()).toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/gi-photo-kit-${kit}.png`});
});

test('every copyable template is reachable, renders and exposes its complete source',async({page})=>{
  await page.goto('/?view=templates');
  for(const name of ['Single adjustment','Avatar cropper','Product photo','Social post','Annotator','Develop view','Full suite']){
    await page.getByRole('combobox',{name:'Templates',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();
    await expect(page.locator('.template-live')).not.toBeEmpty();
    await expect(page.locator('.fa-ai-code')).toContainText('export function');
    if(name!=='Single adjustment')await expect(page.locator('.template-live .gi-stage canvas')).toHaveCount(1);
  }
});

test('Rotate has its own rail button; the dial, angle finder and Reset each make one undo step',async({page})=>{
  await ready(page);
  const editor=()=>page.evaluate(()=>{const e=window.__workspaceDemo!.pictures[0]!.editor;return {angle:e.state.recipe.geometry.angle??0,labels:e.history.nodes.map(n=>n.label)};});
  const rail=page.locator('.gi-tool-rail');
  await expect(rail.getByRole('button',{name:'Reset',exact:true})).toBeVisible();
  await rail.getByRole('radio',{name:'Rotate',exact:true}).click();
  await expect(rail.getByRole('button',{name:'Reset',exact:true})).toBeDisabled();
  // Drag the knob six degrees clockwise around the ring.
  const ring=(await page.locator('.gi-rotate-ring').boundingBox())!,c=[ring.x+ring.width/2,ring.y+ring.height/2],r=ring.width/2;
  await page.mouse.move(c[0]!+r,c[1]!);await page.mouse.down();
  for(let a=1;a<=6;a++){const t=a*Math.PI/180;await page.mouse.move(c[0]!+Math.cos(t)*r,c[1]!+Math.sin(t)*r);}
  await page.mouse.up();
  await expect.poll(async()=>(await editor()).angle).toBeCloseTo(6,0);
  expect((await editor()).labels).toEqual(['','Rotate']);
  // A line drawn along an edge reads its lean; Level to line turns the picture until it is level.
  await page.mouse.move(c[0]!-200,c[1]!+120);await page.mouse.down();await page.mouse.move(c[0]!+200,c[1]!+100,{steps:6});await page.mouse.up();
  await expect(page.locator('.gi-rotate-reading output')).toHaveText(/-2\.9°/);
  await page.locator('.gi-panel').getByRole('button',{name:'Level to line',exact:true}).click();
  await expect.poll(async()=>(await editor()).angle).toBeCloseTo(8.86,1);
  await expect(page.locator('.gi-rotate-reading output')).toHaveText('0.0°');
  // The dial is a keyboard slider too: quick presses are one step.
  await page.getByRole('slider',{name:'Rotation dial',exact:true}).focus();
  await page.keyboard.press('Shift+ArrowLeft');await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async()=>(await editor()).labels.length,{timeout:3000}).toBe(4);
  await rail.getByRole('button',{name:'Reset',exact:true}).click();
  await expect.poll(async()=>(await editor()).angle).toBe(0);
  expect((await editor()).labels).toEqual(['','Rotate','Level to line','Rotate','Reset Rotate']);
  const {violations}=await new AxeBuilder({page}).include('.gi-workspace-right').analyze();
  expect(violations.map(v=>`${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test('a preset starts again from the original, so earlier steps leave the history',async({page})=>{
  await ready(page);
  await page.evaluate(()=>{const s=window.__workspaceDemo!.pictures[0]!.editor;s.commit({geometry:{...s.state.recipe.geometry,angle:12}},{label:'Turn'});});
  await page.getByRole('treeitem',{name:'Warm film',exact:true}).click();
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.history.nodes.map(n=>n.label).join('|')==='|Warm film');
  expect(await page.evaluate(()=>window.__workspaceDemo!.pictures[0]!.editor.state.recipe.geometry.angle)).toBe(0);
  await page.getByRole('treeitem',{name:'Silver screen',exact:true}).click();
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.history.nodes.map(n=>n.label).join('|')==='|Silver screen');
  await page.getByRole('button',{name:'Undo',exact:true}).first().click();
  await page.waitForFunction(()=>window.__workspaceDemo!.pictures[0]!.editor.history.current.id==='0');
});

test('the filmstrip pane fits a picture without scrolling',async({page})=>{
  await ready(page);
  const pane=page.locator('.gi-workspace-bottom');
  const [region,tile]=await Promise.all([pane.boundingBox(),pane.locator('.gi-filmstrip-picture').first().boundingBox()]);
  expect(tile!.y).toBeGreaterThanOrEqual(region!.y+4);
  expect(tile!.y+tile!.height).toBeLessThanOrEqual(region!.y+region!.height-4);
  expect(await pane.evaluate(e=>[e,...e.querySelectorAll('*')].some(n=>n.scrollHeight>n.clientHeight+1&&/auto|scroll/.test(getComputedStyle(n).overflowY)))).toBe(false);
});
