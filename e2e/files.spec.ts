import { formatBytes } from 'glass-ux/byte-size-field';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
interface Proof {
  formats():Promise<Record<string,boolean>>;
  importFormat(type:string):Promise<{width:number;height:number;frames:number}>;
  exportFormat(type:string,alpha:boolean):Promise<{type:string;alpha:number;width:number;height:number;size:number}>;
  metadataRoundTrip(type:string,mode:'preserve'|'strip'|'strip-gps'):Promise<{exif:boolean;orientation?:number;gps:boolean}>;
  dpiRoundTrip(type:string,mode:'preserve'|'strip'):Promise<{dpi:{x:number;y:number}|null;exif:boolean}>;
  projectRoundTrip():Promise<{equal:boolean;assets:string[];layers:number}>;
  persist():Promise<number>;recover():Promise<number>;pasteDrop(kind:'paste'|'drop'):Promise<number>;
  batch():Promise<string[]>;cspProbe():Promise<boolean>;dimensionsBomb():Promise<boolean>;
  actions:string[];exported?:Blob;project?:Blob;
  session:{run(id:string,args?:unknown):unknown;state:{size:{width:number;height:number}}};
}
declare global {interface Window {filesProof:Proof}}
test.setTimeout(30_000);
test.use({viewport:{width:1600,height:1100}});
async function open(page:Page) {page.on('pageerror',error=>console.log('PAGE ERROR',error.message));await page.goto('/?files-test&backend=cpu');await expect(page.getByTestId('files-fixture')).toBeVisible();await page.waitForFunction(()=>!!window.filesProof);}
for(const type of ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])test(`imports ${type} from bytes`,async({page})=> {await open(page);const result=await page.evaluate(type=>window.filesProof.importFormat(type),type);expect(result.width).toBe(type==='image/gif'?1:16);expect(result.height).toBe(type==='image/gif'?1:12);expect(result.frames).toBe(1);});
for(const type of ['image/png','image/jpeg','image/webp','image/avif'])for(const alpha of [true,false])test(`exports ${type}, alpha ${alpha}`,async({page})=> {await open(page);expect((await page.evaluate(()=>window.filesProof.formats()))[type]).toBe(true);const result=await page.evaluate(({type,alpha})=>window.filesProof.exportFormat(type,alpha),{type,alpha});expect(result.type).toBe(type);expect([result.width,result.height]).toEqual([16,12]);expect(result.size).toBeGreaterThan(10);expect(result.alpha).toBe(alpha&&type!=='image/jpeg'?0:255);});
for(const type of ['image/jpeg','image/png','image/webp'])for(const mode of ['preserve','strip','strip-gps'] as const)test(`${type} metadata ${mode} verified from exported bytes`,async({page})=> {await open(page);const result=await page.evaluate(({type,mode})=>window.filesProof.metadataRoundTrip(type,mode),{type,mode});expect(result.exif).toBe(mode!=='strip');if(mode!=='strip')expect(result.orientation).toBe(1);});
test('layered .guxi restores the same pixels and asset ids',async({page})=> {await open(page);const result=await page.evaluate(()=>window.filesProof.projectRoundTrip());expect(result.equal).toBe(true);expect(result.layers).toBe(1);expect(result.assets).toHaveLength(1);expect(result.assets[0]).toMatch(/^[a-f0-9]{64}$/);const actions=await page.evaluate(()=>window.filesProof.actions);expect(actions).toEqual(expect.arrayContaining(['file.project.save','file.project.open']));});
test('autosave survives an actual reload and restores the committed recipe',async({page})=> {await open(page);expect(await page.evaluate(()=>window.filesProof.persist())).toBeGreaterThan(0);await page.reload();await page.waitForFunction(()=>!!window.filesProof);expect(await page.evaluate(()=>window.filesProof.recover())).toBe(23);expect(await page.evaluate(()=>window.filesProof.actions)).toContain('file.recover');});
test('paste, drop and copy use intercepted actions',async({page})=> {await open(page);expect(await page.evaluate(()=>window.filesProof.pasteDrop('paste'))).toBe(18);expect(await page.evaluate(()=>window.filesProof.pasteDrop('drop'))).toBe(19);await page.evaluate(()=>window.filesProof.session.run('file.copy'));expect(await page.evaluate(()=>window.filesProof.exported?.type)).toBe('image/png');expect(await page.evaluate(()=>window.filesProof.actions)).toEqual(expect.arrayContaining(['file.paste','file.drop','file.copy']));});
test('shared FileDrop accepts a real DOM drop and paste event',async({page})=> {
 await open(page);const fixture=page.getByTestId('files-fixture');
 await fixture.evaluate(async root=> {const canvas=new OffscreenCanvas(27,9);canvas.getContext('2d');const blob=await canvas.convertToBlob({type:'image/png'}),file=new File([blob],'drop.png',{type:'image/png'}),data=new DataTransfer();data.items.add(file);root.querySelector('.fa-file-drop')?.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));});
 await expect.poll(()=>page.evaluate(()=>window.filesProof.session.state.size?.width)).toBe(27);
 await fixture.evaluate(async root=> {const canvas=new OffscreenCanvas(29,9);canvas.getContext('2d');const blob=await canvas.convertToBlob({type:'image/png'}),data=new DataTransfer();data.items.add(new File([blob],'paste.png',{type:'image/png'}));root.firstElementChild?.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
 await expect.poll(()=>page.evaluate(()=>window.filesProof.session.state.size?.width)).toBe(29);
});
test('batch continues after an invalid source',async({page})=> {await open(page);expect(await page.evaluate(()=>window.filesProof.batch())).toEqual(['fulfilled','rejected','fulfilled']);});
test('export preview reports real bytes and standalone batch accepts files',async({page})=> {await open(page);const fixture=page.getByTestId('files-fixture');await expect(fixture.locator('.gi-files-preview img')).toBeVisible();const previewBytes=await fixture.locator('.gi-files-preview img').evaluate(async img=>(await(await fetch((img as HTMLImageElement).src)).blob()).size);await expect(fixture.locator('.gi-files-preview figcaption')).toHaveText(formatBytes(previewBytes,{locale:'en'}));await fixture.getByRole('button',{name:'Export',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.filesProof.exported?.type)).toBe('image/png');
 const buffer=await page.evaluate(async()=> {const canvas=new OffscreenCanvas(4,4);canvas.getContext('2d');return Array.from(new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer()));});
 await fixture.getByLabel('Source images').setInputFiles([{name:'a.png',mimeType:'image/png',buffer:Buffer.from(buffer)},{name:'b.png',mimeType:'image/png',buffer:Buffer.from(buffer)}]);await fixture.getByRole('button',{name:'Run batch',exact:true}).click();await expect(page.getByTestId('batch-count')).toHaveText('2');
});
test('pixel limit rejects hostile header dimensions before native decoding',async({page})=> {await open(page);expect(await page.evaluate(()=>window.filesProof.dimensionsBomb())).toBe(true);});
test('strict CSP without wasm-unsafe-eval disables AVIF through the availability path',async({page})=> {
 await page.route('**/*',async route=> {const response=await route.fetch();const headers={...response.headers()};if(route.request().resourceType()==='document')headers['content-security-policy']="default-src 'self' blob: data:; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'";await route.fulfill({response,headers});});
 await open(page);expect(await page.evaluate(()=>window.filesProof.cspProbe())).toBe(false);
 const select=page.getByTestId('files-fixture').getByRole('combobox',{name:'Format',exact:true}).first();await select.click();await expect(page.getByRole('option',{name:/AVIF/})).toHaveAttribute('aria-disabled','true');
});
test('file panels pass axe',async({page})=> {await open(page);await expect(page.getByTestId('files-fixture').locator('.gi-files-preview img')).toBeVisible();const results=await new AxeBuilder({page}).include('[data-testid="files-fixture"]').analyze();expect(results.violations).toEqual([]);});
test('a missing optional WASM asset disables AVIF without breaking native export',async({page})=> {
 await page.route('**/avif_enc-*.wasm',route=>route.abort());await open(page);
 expect(await page.evaluate(()=>window.filesProof.cspProbe())).toBe(false);
 const formats=await page.evaluate(()=>window.filesProof.formats());expect(formats['image/avif']).toBe(false);expect(formats['image/png']).toBe(true);
 expect((await page.evaluate(()=>window.filesProof.exportFormat('image/png',true))).type).toBe('image/png');
});

for(const type of ['image/jpeg','image/png'])for(const mode of ['preserve','strip'] as const)test(`resize DPI reaches ${type} (${mode})`,async({page})=> {await open(page);const result=await page.evaluate(({type,mode})=>window.filesProof.dpiRoundTrip(type,mode),{type,mode});expect(result.exif).toBe(mode==='preserve');expect(result.dpi?.x).toBeCloseTo(300,2);expect(result.dpi?.y).toBeCloseTo(300,2);});
test('AVIF selection retains metadata choices without a stripping warning',async({page})=> {await open(page);const fixture=page.getByTestId('files-fixture');const format=fixture.getByRole('combobox',{name:'Format',exact:true}).first();await expect(format).toBeEnabled();await expect.poll(()=>page.evaluate(()=>window.filesProof.formats().then(f=>f['image/avif']))).toBe(true);await format.click();await page.getByRole('option',{name:'AVIF',exact:true}).click();await expect(fixture.getByRole('combobox',{name:'Metadata',exact:true}).first()).toBeEnabled();await expect(fixture.getByText('AVIF exports remove EXIF, XMP, IPTC and ICC profiles.')).toHaveCount(0);});
test('the crop-only tool bundle contains no AVIF codec modules or WASM assets',async()=> {
 const {build}=await import('../apps/demo/node_modules/vite/dist/node/index.js');const {resolve}=await import('node:path');
 const result=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/tools/crop.tsx'),formats:['es'],fileName:'crop'},rollupOptions:{external:[/^react/,/^glass-ux\//]}}});
 const output=(Array.isArray(result)?result:[result]).flatMap(r=>'output' in r?r.output:[]);
 const chunks=output.filter(o=>o.type==='chunk');expect(chunks.length).toBeGreaterThan(0);
 const eager=new Set<string>();const visit=(name:string)=>{if(eager.has(name))return;eager.add(name);const entry=chunks.find(c=>c.fileName===name);for(const dependency of entry?.imports??[])visit(dependency);};for(const entry of chunks.filter(c=>c.isEntry))visit(entry.fileName);
 expect(chunks.filter(c=>eager.has(c.fileName)).flatMap(c=>Object.keys(c.modules)).filter(id=>id.includes('/codecs/'))).toEqual([]);
 expect(chunks.flatMap(c=>Object.keys(c.modules)).filter(id=>id.includes('/codecs/avif')||id.includes('/@jsquash/')||id.includes('/wasm-feature-detect/'))).toEqual([]);
 expect(output.filter(o=>o.type==='asset'&&o.fileName.endsWith('.wasm'))).toEqual([]);
});
