import { expect,test,type Page } from '@playwright/test';
import { generatedProfile,matrices,parametric,sampled,srgbCurve } from './fixtures/colour.js';
import type {} from '../apps/demo/src/domains/colour-proof.js';
test.setTimeout(60_000);
async function open(page:Page){await page.goto('/?files-test&backend=cpu');await page.waitForFunction(()=>!!window.colourProof&&!!window.filesProof);}
for(const fallback of [false,true])for(const [name,matrix,curve,reference,mixed] of [
  ['P3',matrices.p3,srgbCurve(),[1.22494,-.04206,-.01964],[.25288361,.04434676,.56392769]],
  ['Adobe RGB',matrices.adobe,sampled(563/256),[1.39836,0,0],[.28807968,.04782738,.55032664]],
  ['ProPhoto',matrices.prophoto,parametric(3,[1.8,1,0,1/16,1/32]),[2.03437,-.22881,-.00855],[.34558839,.03438935,.67540812]],
] as const)test(`${name} native decode → linear working pixels (${fallback?'main thread fallback':'worker'})`,async({page})=>{
  await open(page);const result=await page.evaluate(async({profile,fallback})=>{
    const {io}=window.colourProof,bytes=new Uint8ClampedArray([255,0,0,255,128,64,191,255]);
    const png=await io.encodeImage(bytes,2,1,{icc:null});const tagged=await io.writeIcc(new Uint8Array(await png.arrayBuffer()),new Uint8Array(profile));
    const source=await io.openImage(new Blob([tagged.slice()],{type:'image/png'}),fallback?{worker:()=>{throw new Error('No worker');}}:{});
    try{return {pixels:Array.from((await source.readTile({x:0,y:0,level:0})).data),conversion:source.icc?.conversion};}finally{source.dispose?.();}
  },{profile:Array.from(generatedProfile([...matrix],curve)),fallback});
  expect(result.conversion).toBe('matrix-trc');for(let c=0;c<3;c++)expect(result.pixels[c]).toBeCloseTo(reference[c]!,3);expect(result.pixels[3]).toBe(1);for(let c=0;c<3;c++)expect(result.pixels[4+c]).toBeCloseTo(mixed[c]!,3);
});
for(const type of ['image/png','image/jpeg','image/webp','image/avif'])test(`${type} default sRGB and source-profile pixel conversion`,async({page})=>{
  await open(page);const result=await page.evaluate(async({profile,type})=>{
    const {io,createEditorSession,pixelsToRgba8}=window.colourProof,icc=new Uint8Array(profile);
    const bytes=new Uint8ClampedArray(16*12*4);for(let i=0;i<bytes.length;i+=4)bytes.set([255,0,0,255],i);
    const png=await io.encodeImage(bytes,16,12,{icc:null}),input=new Blob([(await io.writeIcc(new Uint8Array(await png.arrayBuffer()),icc)).slice()],{type:'image/png'});
    const session=createEditorSession({source:input});while(session.state.status==='loading')await new Promise(r=>setTimeout(r,0));if(session.state.status!=='ready')throw session.state.error;
    try {
      const sourceBlob=await session.result().toBlob({type,quality:1,icc}),sourceBytes=new Uint8Array(await sourceBlob.arrayBuffer()),sourceProfile=type==='image/avif'?io.describeIcc(io.readAvifMetadata(sourceBytes).icc!):await io.extractIcc(sourceBytes);
      let sourcePixel:number[];if(type==='image/avif'){const bitmap=await createImageBitmap(sourceBlob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();sourcePixel=Array.from(ctx.getImageData(0,0,1,1).data);}else{const raw=new Blob([(await io.writeIcc(sourceBytes,null)).slice()],{type}),decoded=await io.openImage(raw);sourcePixel=Array.from(pixelsToRgba8(await decoded.readTile({x:0,y:0,level:0})).slice(0,4));decoded.dispose?.();}
      const normal=await session.result().toBlob({type,quality:1}),normalBytes=new Uint8Array(await normal.arrayBuffer()),normalProfile=type==='image/avif'?io.describeIcc(io.readAvifMetadata(normalBytes).icc!):await io.extractIcc(normalBytes);
      return {sourceProfile:Array.from(sourceProfile!.bytes),sourcePixel,normalProfile:normalProfile!.description};
    }finally{session.dispose();}
  },{profile:Array.from(generatedProfile()),type});
  expect(result.sourceProfile).toEqual(Array.from(generatedProfile()));expect(result.normalProfile).toBe('sRGB');
  expect(result.sourcePixel[0]).toBeGreaterThanOrEqual(254);expect(result.sourcePixel[1]).toBeLessThanOrEqual(1);expect(result.sourcePixel[2]).toBeLessThanOrEqual(1);expect(result.sourcePixel[3]).toBe(255);
});
for(const mode of ['preserve','strip','strip-gps'] as const)test(`AVIF ${mode}: EXIF, XMP, ICC and native decode`,async({page})=>{
  await open(page);const result=await page.evaluate(async mode=>{
    const {io}=window.colourProof,exif=new Uint8Array(26),v=new DataView(exif.buffer);exif.set([73,73]);v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,1,true);v.setUint16(10,274,true);v.setUint16(12,3,true);v.setUint32(14,1,true);v.setUint16(18,6,true);
    const originalMetadata={format:'jpeg' as const,packets:[{kind:'exif' as const,data:exif},{kind:'xmp' as const,data:new TextEncoder().encode('<r tiff:Orientation="6" exif:GPSLatitude="30N" dc:title="Kept"/>')}],fields:{orientation:6},presence:{exif:true,xmp:true,iptc:false}};
    const bytes=new Uint8ClampedArray(16*12*4);for(let i=0;i<bytes.length;i+=4)bytes.set([180,70,30,255],i);
    const blob=await io.encodeImage(bytes,16,12,{type:'image/avif',quality:1,metadata:mode,originalMetadata}),output=new Uint8Array(await blob.arrayBuffer()),parsed=io.readAvifMetadata(output),bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
    return {type:blob.type,presence:parsed.metadata.presence,orientation:parsed.metadata.fields.orientation,xmp:new TextDecoder().decode(parsed.metadata.packets.find(p=>p.kind==='xmp')?.data),profile:parsed.icc&&io.describeIcc(parsed.icc).description,pixel:Array.from(ctx.getImageData(0,0,1,1).data),size:[canvas.width,canvas.height]};
  },mode);
  expect(result.type).toBe('image/avif');expect(result.size).toEqual([16,12]);expect(result.profile).toBe('sRGB');expect(result.presence).toEqual({exif:mode!=='strip',xmp:mode!=='strip',iptc:false});if(mode!=='strip'){expect(result.orientation).toBe(1);expect(result.xmp).toContain('Kept');expect(result.xmp.includes('GPSLatitude')).toBe(mode==='preserve');}
  result.pixel.slice(0,3).forEach((v,i)=>expect(Math.abs(v-[180,70,30][i]!)).toBeLessThanOrEqual(2));expect(result.pixel[3]).toBe(255);
});
test('unsupported profile falls back explicitly and source export is unavailable',async({page})=>{
  await open(page);const profile=Array.from(generatedProfile(matrices.srgb,srgbCurve(),4,[['A2B0',new Uint8Array(16)]]));
  await page.evaluate(async profile=>{const {io}=window.colourProof,png=await io.encodeImage(new Uint8ClampedArray([128,64,255,255]),1,1,{icc:null}),blob=new Blob([(await io.writeIcc(new Uint8Array(await png.arrayBuffer()),new Uint8Array(profile))).slice()],{type:'image/png'});await window.filesProof.session.run('file.open',blob);},profile);
  const fixture=page.getByTestId('files-fixture');await expect(fixture.getByRole('note')).toContainText(['Unsupported ICC profile: LUT-based, non-RGB or invalid matrix/TRC. Treated as sRGB.']);await expect(fixture.getByRole('switch',{name:'Convert to source profile'})).toBeDisabled();
});
test('AVIF panel retains metadata choices without the old stripping warning',async({page})=>{
  await open(page);const fixture=page.getByTestId('files-fixture');await expect.poll(()=>page.evaluate(()=>window.filesProof.formats().then(f=>f['image/avif']))).toBe(true);
  await fixture.getByRole('combobox',{name:'Format',exact:true}).first().click();await page.getByRole('option',{name:'AVIF',exact:true}).click();await expect(fixture.getByRole('combobox',{name:'Metadata',exact:true}).first()).toBeEnabled();await expect(fixture.getByText('AVIF exports remove EXIF, XMP, IPTC and ICC profiles.')).toHaveCount(0);
});

test('source profile export has a keyboard path and passes through the export action',async({page})=>{
  await open(page);const profile=Array.from(generatedProfile());await page.evaluate(async profile=>{const {io}=window.colourProof,bytes=new Uint8ClampedArray(16*12*4);for(let i=0;i<bytes.length;i+=4)bytes.set([255,0,0,255],i);const png=await io.encodeImage(bytes,16,12,{icc:null});await window.filesProof.session.run('file.open',new Blob([(await io.writeIcc(new Uint8Array(await png.arrayBuffer()),new Uint8Array(profile))).slice()],{type:'image/png'}));},profile);
  const fixture=page.getByTestId('files-fixture'),toggle=fixture.getByRole('switch',{name:'Convert to source profile'});await expect(toggle).not.toBeChecked();await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toBeChecked();await fixture.getByRole('button',{name:'Export',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!window.filesProof.exported)).toBe(true);
  expect(await page.evaluate(async()=>Array.from((await window.colourProof.io.extractIcc(new Uint8Array(await window.filesProof.exported!.arrayBuffer())))!.bytes))).toEqual(profile);expect(await page.evaluate(()=>window.filesProof.actions)).toContain('file.export');
  await toggle.focus();await page.keyboard.press('Space');await expect(toggle).not.toBeChecked();await page.evaluate(()=>{window.filesProof.exported=undefined;});await fixture.getByRole('button',{name:'Export',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!window.filesProof.exported)).toBe(true);expect(await page.evaluate(async()=>(await window.colourProof.io.extractIcc(new Uint8Array(await window.filesProof.exported!.arrayBuffer())))?.description)).toBe('sRGB');
});
test('RAW import provenance plainly identifies a preview rather than demosaicing',async({page})=>{
  await open(page);await page.evaluate(async()=>{const {io}=window.colourProof;await window.filesProof.session.run('file.open',{width:1,height:1,...io.createColourPyramid(new Uint8Array([128,64,32,255]),{width:1,height:1}),importInfo:{kind:'raw-preview'}});});await expect(page.getByTestId('files-fixture').getByRole('note')).toHaveText('Embedded JPEG preview only. RAW sensor data is not demosaiced.');
});

test('headless byte export converts pixels before embedding the destination profile',async({page})=>{
  await open(page);const pixels=await page.evaluate(async profile=>{const {io}=window.colourProof,blob=await io.encodeImage(new Uint8ClampedArray([128,80,40,255]),1,1,{icc:new Uint8Array(profile)}),bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(1,1),ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();return Array.from(ctx.getImageData(0,0,1,1).data);},Array.from(generatedProfile()));pixels.forEach((v,i)=>expect(Math.abs(v-[128,80,40,255][i]!)).toBeLessThanOrEqual(1));
});

for(const [name,options,resize] of [
  ['JPEG',{type:'image/jpeg',quality:1},false],
  ['alpha:false PNG',{type:'image/png',alpha:false},false],
  ['maxEdge resize',{type:'image/png',maxEdge:8},true],
  ['explicit resize',{type:'image/png',width:8,height:6},true],
] as const)test(`profile ${name}: session and headless resize/composite in linear working space`,async({page})=>{
  await open(page);
  const result=await page.evaluate(async({profile,options,resize})=>{
    const {io,createEditorSession}=window.colourProof;
    const width=16,height=12,bytes=new Uint8ClampedArray(width*height*4),icc=new Uint8Array(profile);
    for(let i=0;i<bytes.length;i+=4){const grey=resize&&(i/4%width)%2?255:0;bytes.set([grey,grey,grey,resize?255:128],i);}
    const session=createEditorSession({source:{width,height,...io.createColourPyramid(bytes,{width,height})}});
    while(session.state.status==='loading')await new Promise(r=>setTimeout(r,0));
    if(session.state.status!=='ready')throw session.state.error;
    const samples=async(blob:Blob)=>{
      const output=new Uint8Array(await blob.arrayBuffer());
      const embedded=await io.extractIcc(output);
      // Read raw destination samples, without browser ICC display conversion.
      const raw=new Blob([(await io.writeIcc(output,null)).slice()],{type:blob.type});
      const bitmap=await createImageBitmap(raw),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d')!;
      ctx.drawImage(bitmap,0,0);bitmap.close();
      return {width:canvas.width,height:canvas.height,bytes:Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data),profile:Array.from(embedded!.bytes)};
    };
    try {
      const settings={...options,icc};
      return {session:await samples(await session.result().toBlob(settings)),headless:await samples(await io.encodeImage(bytes,width,height,settings))};
    }finally{session.dispose();}
  },{profile:Array.from(generatedProfile(matrices.srgb,parametric(0,[1]))),options,resize});
  expect(result.session).toEqual(result.headless);
  expect([result.session.width,result.session.height]).toEqual(resize?[8,6]:[16,12]);
  const expected=resize?128:127;
  for(let i=0;i<result.session.bytes.length;i+=4){
    for(let c=0;c<3;c++)expect(Math.abs(result.session.bytes[i+c]!-expected)).toBeLessThanOrEqual(1);
    expect(result.session.bytes[i+3]).toBe(255);
  }
});
