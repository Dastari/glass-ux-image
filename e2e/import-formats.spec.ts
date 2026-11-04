import { expect, test, type Page } from '@playwright/test';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import type { ImportProof } from './fixtures/import-proof.js';
declare global {interface Window {importProof:ImportProof}}
let output:string;
test.beforeAll(async()=> {
  output=await mkdtemp(join(tmpdir(),'gi-import-proof-'));const {build}=await import('vite');
  await build({configFile:false,worker:{format:'es'},base:'/imports-proof/',logLevel:'silent',resolve:{alias:[{find:/^glass-ux-image\/(.*)$/,replacement:resolve('src')+'/$1'}]},build:{outDir:output,emptyOutDir:true,minify:false,lib:{entry:resolve('e2e/fixtures/import-proof.ts'),formats:['es'],fileName:()=> 'proof.js'}}});
});
async function open(page:Page) {
  await page.route('**/imports-proof/**',async route=>{const name=new URL(route.request().url()).pathname.split('/imports-proof/')[1]!;await route.fulfill({body:await readFile(join(output,name)),contentType:extname(name)==='.js'?'text/javascript':'application/octet-stream'});});
  await page.goto('/');await page.addScriptTag({type:'module',url:'/imports-proof/proof.js'});await page.waitForFunction(()=>!!window.importProof);
}
async function fixture(name:string) {return Array.from(await readFile(resolve('e2e/fixtures/imports',name)));}
for(const name of ['rgba8.tif','rgba16.tif','rgba16-be.tif','deflate.tif','lzw.tif','packbits.tif','multipage.tif','oriented.tif'])test(`imports ${name} in a worker`,async({page})=> {
  await open(page);const result=await page.evaluate(async bytes=>window.importProof.tile(new Blob([new Uint8Array(bytes)])),await fixture(name));
  expect([result.width,result.height]).toEqual(name==='oriented.tif'?[2,3]:[3,2]);expect(result.info?.kind).toBe('tiff');if(name!=='oriented.tif')expect(result.pixels.slice(0,4)).toEqual([1,0,0,1]);
});
test('PSD composite, editable layers, undo and .guxi assets round trip',async({page})=> {
  await open(page);const bytes=await fixture('layers.psd');const composite=await page.evaluate(async b=>window.importProof.tile(new Blob([new Uint8Array(b)])),bytes);expect([composite.width,composite.height]).toEqual([6,4]);expect(composite.info?.kind).toBe('psd');
  const result=await page.evaluate(async b=>window.importProof.psd(new Blob([new Uint8Array(b)])),bytes);expect(result.layers.map(l=>l.name)).toEqual(['Bottom','Offset','Hidden']);expect(result.layers[1]).toMatchObject({opacity:128/255,blend:'multiply',quad:[[2,1],[4,1],[4,3],[2,3]]});expect(result.layers[2]?.visible).toBe(false);expect(result.assetIds).toHaveLength(3);expect(result.equal).toBe(true);expect(result.remaining).toBe(0);expect(result.actions).toEqual(expect.arrayContaining(['layers.update','edit.undo','file.project.save','file.project.open']));
});
for(const kind of ['cr2','nef','arw','orf','raf','dng','cr3'])test(`${kind.toUpperCase()} opens the largest embedded JPEG as an oriented preview`,async({page})=> {
 await open(page);const result=await page.evaluate(kind=>window.importProof.raw(kind),kind);expect([result.width,result.height]).toEqual([4,8]);expect(result.info?.kind).toBe('raw-preview');expect(result.orientation).toBe(6);
});
test('RAW preview reflects all eight EXIF orientations exactly once',async({page})=> {await open(page);for(let orientation=1;orientation<=8;orientation++){const result=await page.evaluate(o=>window.importProof.raw('dng',o),orientation);expect([result.width,result.height]).toEqual(orientation>=5?[4,8]:[8,4]);expect(result.orientation).toBe(orientation);const blueFirst=[2,3,7,8].includes(orientation);expect(result.pixels[blueFirst?2:0]).toBeGreaterThan(.95);expect(result.pixels[blueFirst?0:2]).toBeLessThan(.02);}});
test('HEIF has an optional host loader and a clear unsupported path',async({page})=> {await open(page);const absent=await page.evaluate(()=>window.importProof.heif(false));expect(absent.ok).toBe(false);const peer=await page.evaluate(()=>window.importProof.heif(true));expect(peer.ok).toBe(true);expect(peer.loads).toBe(1);expect(peer.result?.pixels).toEqual([1,0,0,1]);});
test('oversized TIFF and PSD reject before allocation',async({page})=> {await open(page);for(const name of ['rgba8.tif','layers.psd']){const result=await page.evaluate(async bytes=>{try {await window.importProof.tile(new Blob([new Uint8Array(bytes)]),{maxPixels:1});return false;}catch{return true;}},await fixture(name));expect(result).toBe(true);}});

test('JPEG-compressed TIFF decodes through utif2',async({page})=> {await open(page);const result=await page.evaluate(bytes=>window.importProof.jpegTiff(bytes),await fixture('rgba8.tif'));expect([result.width,result.height]).toEqual([3,2]);expect(result.pixels[0]).toBeGreaterThan(.98);expect(result.pixels[1]).toBeLessThan(.01);expect(result.pixels[3]).toBe(1);});

test('opening TIFF does not fetch the PSD, RAW or HEIF decoder chunks',async({page})=> {await open(page);const requests:string[]=[];page.on('request',r=>requests.push(r.url()));await page.evaluate(bytes=>window.importProof.tile(new Blob([new Uint8Array(bytes)])),await fixture('rgba8.tif'));expect(requests.some(url=>/\/tiff-[^/]+\.js/.test(url))).toBe(true);expect(requests.filter(url=>/\/(psd|raw|heif)-[^/]+\.js/.test(url))).toEqual([]);});
