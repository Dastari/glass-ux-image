import { describe,expect,it } from 'vitest';
import { srgbToLinear } from '../../core/pixels.js';
import { describeIcc } from '../metadata/icc.js';
import { createColourPyramid,pixelsToProfile,profileConversion,srgbProfile } from './index.js';
import { readToneCurve } from './profile.js';
import { generatedProfile,matrices,parametric,sampled,srgbCurve } from '../../../e2e/fixtures/colour.js';
const near=(actual:number[],expected:number[],digits=4)=>actual.forEach((v,i)=>expect(v).toBeCloseTo(expected[i]!,digits));
function transform(bytes:Uint8Array){const value=profileConversion(bytes);expect(value.reason).toBeUndefined();expect(value.transform).not.toBeNull();return value.transform!;}
describe('matrix/TRC ICC reference colours',()=>{
  for(const version of [2,4]) {
    it(`converts Display P3 v${version} red without clipping`,()=>near(transform(generatedProfile(matrices.p3,srgbCurve(),version)).toLinear(1,0,0),[1.22494,-.04206,-.01964],3));
    it(`converts Adobe RGB v${version} gamma 563/256 and sampled curves`,()=>{
      const gamma=563/256,gammaCurve=new Uint8Array(14);gammaCurve.set(new TextEncoder().encode('curv'));new DataView(gammaCurve.buffer).setUint32(8,1);new DataView(gammaCurve.buffer).setUint16(12,563);
      for(const curve of [gammaCurve,sampled(gamma)])near(transform(generatedProfile(matrices.adobe,curve,version)).toLinear(.5,.25,.75),[.28561067,.04741747,.55193554],3);
    });
    it(`converts ProPhoto v${version} toe and D50 colourants`,()=>{
      const tr=transform(generatedProfile(matrices.prophoto,parametric(3,[1.8,1,0,1/16,1/32]),version));
      near(tr.toLinear(1,0,0),[2.03437,-.22881,-.00855],3);
      // Neutral values and the low linear toe must be adapted to neutral sRGB.
      near(tr.toLinear(.02,.02,.02),[.00125,.00125,.00125],5);
      near(tr.toLinear(.5,.5,.5),[.5**1.8,.5**1.8,.5**1.8],4);
    });
    it(`honours per-profile sRGB variant curves v${version}`,()=>{
      const tr=transform(generatedProfile(matrices.srgb,sampled(2.2),version));near(tr.toLinear(.5,.25,.75),[.5**2.2,.25**2.2,.75**2.2],4);
      expect(tr.toLinear(.5,.5,.5)[0]).not.toBeCloseTo(srgbToLinear(.5),3);
    });
  }
  it('generated output profile identifies and decodes sRGB',()=>{const profile=srgbProfile();expect(describeIcc(profile).description).toBe('sRGB');expect(describeIcc(profile).conversion).toBe('matrix-trc');const tr=transform(profile);near(tr.toLinear(.2,.5,.8),[.0331048,.2140411,.6038273],4);});
  for(const [kind,params,reference] of [
    [0,[2.2],(x:number)=>x**2.2],
    [1,[2,1,-.1],(x:number)=>x>=.1?(x-.1)**2:0],
    [2,[2,1,-.1,.02],(x:number)=>x>=.1?(x-.1)**2+.02:.02],
    [3,[2,1,0,.1,.1],(x:number)=>x>=.1?x*x:.1*x],
    [4,[2,1,0,.1,.1,.02,.02],(x:number)=>x>=.1?x*x+.02:.1*x+.02],
  ] as const)it(`parametric function ${kind} and its inverse`,()=>{const curve=readToneCurve(parametric(kind,[...params]));for(const x of [.001,.05,.2,.5,1]){expect(curve.decode(x)).toBeCloseTo(reference(x),4);if(x>.1)expect(curve.encode(curve.decode(x))).toBeCloseTo(x,6);}});
  it('keeps alpha premultiplied and converts before averaging float pyramid levels',()=>{
    const profile=describeIcc(generatedProfile()),bytes=new Uint8Array(258*2*4);for(let i=0;i<bytes.length;i+=4){bytes[i]=255;bytes[i+3]=128;}
    const pyramid=createColourPyramid(bytes,{width:258,height:2},profile);
    for(const level of [0,1]){const pixel=pyramid.readTile({x:0,y:0,level});near(Array.from(pixel.data.slice(0,4)),[1.22494*128/255,-.04206*128/255,-.01964*128/255,128/255],3);}
    const tile=pyramid.readTile({x:0,y:0,level:0});expect(Array.from(pixelsToProfile(tile,transform(profile.bytes)).slice(0,4))).toEqual([255,0,0,128]);
  });
  it('round trips mixed pixels through every profile',()=>{
    for(const [matrix,curve] of [[matrices.p3,srgbCurve()],[matrices.adobe,sampled(2.2)],[matrices.prophoto,parametric(3,[1.8,1,0,1/16,1/32])]] as const){const tr=transform(generatedProfile(matrix,curve));for(const rgb of [[.12,.37,.89],[0,0,0],[1,1,1],[1,0,0]])near(tr.fromLinear(...tr.toLinear(rgb[0]!,rgb[1]!,rgb[2]!) as [number,number,number]),rgb,6);}
  });
});
describe('explicit fallback for unsupported profiles',()=>{
  it('uses matrix/TRC when only optional gamut-preview tables are present',()=>expect(profileConversion(generatedProfile(matrices.srgb,srgbCurve(),4,[['pre0',new Uint8Array(16)]])).transform).not.toBeNull());
  it('refuses LUT transforms even alongside matrix tables',()=>expect(profileConversion(generatedProfile(matrices.srgb,srgbCurve(),4,[['A2B0',new Uint8Array(16)]]))).toEqual({transform:null,reason:'lut'}));
  it('refuses non-RGB, unsupported versions and singular matrices',()=>{const bytes=generatedProfile();bytes.set(new TextEncoder().encode('CMYK'),16);expect(profileConversion(bytes).reason).toBe('space');expect(profileConversion(generatedProfile(matrices.p3,srgbCurve(),5)).reason).toBe('version');expect(profileConversion(generatedProfile(Array.from({length:9},()=>0))).reason).toBe('invalid');});
  it('rejects bad curves, offsets, duplicates and all truncations safely',()=>{
    expect(()=>readToneCurve(sampled(-1))).toThrow();
    const invalid=generatedProfile();new DataView(invalid.buffer).setUint32(136,0xffffff00);expect(profileConversion(invalid).reason).toBe('invalid');
    const bytes=generatedProfile();for(let i=0;i<bytes.length;i++)expect(profileConversion(bytes.slice(0,i)).reason).toBe('invalid');
  });
  it('falls back to sRGB samples for an unsupported source',()=>{const profile=describeIcc(generatedProfile(matrices.srgb,srgbCurve(),4,[['A2B0',new Uint8Array(16)]]));expect(profile.conversion).toBe('unsupported');const pixel=createColourPyramid(new Uint8Array([128,64,255,255]),{width:1,height:1},profile).readTile({x:0,y:0,level:0});near(Array.from(pixel.data),[srgbToLinear(128/255),srgbToLinear(64/255),1,1],6);});
});
