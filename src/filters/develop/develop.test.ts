import { describe, expect, it } from 'vitest';
import { createPixels, type PixelBuffer } from '../../core/pixels.js';
import type { FilterFrame } from '../../core/filter.js';
import { autoEnhance, computeHistogram, curveSpline, develop, hslToRgb, linear, NEUTRAL, perceptual, rgbToHsl, applyLevels, NEUTRAL_LEVELS, kelvinTintToGains, bakeHsl, tableSample, COLOUR_RANGES, type DevelopParams } from './index.js';
const frame: FilterFrame={x:0,y:0,width:3,height:1,documentWidth:3,documentHeight:1};
function image(colours: readonly (readonly number[])[]): PixelBuffer { return {width:colours.length,height:1,data:new Float32Array(colours.flatMap(c=>{ const a=c[3]??1; return [c[0]!*a,c[1]!*a,c[2]!*a,a]; }))}; }
function run(source: PixelBuffer, params: Partial<DevelopParams>, scale=1): PixelBuffer {
  let current=source;
  const saved: Record<string,PixelBuffer>={};
  for(const pass of develop.passes(params,scale,{...frame,width:source.width,height:source.height})) {
    const target=createPixels(source.width,source.height);
    pass.cpu(current,target,{inputs:Object.fromEntries(Object.entries(pass.inputs??{}).map(([sampler,name])=>[sampler,saved[name]!])),textures:pass.textures??{}});
    if(pass.save) saved[pass.save]=target;
    current=target;
  }
  return current;
}
const grey=(x:number)=>image([[x,x,x]]);
const rgb=(p:PixelBuffer)=>Array.from(p.data.slice(0,3));
describe('develop tone and colour',()=>{
  it('neutral yields no passes and exact identity, including HDR and transparent values',()=>{
    const p=image([[2,0.1,0.3,0.5],[0,0,0,0]]);
    expect(develop.passes(NEUTRAL,1,frame)).toEqual([]);
    expect(run(p,NEUTRAL)).toBe(p);
    expect(develop.padding(NEUTRAL,1)).toBe(0);
  });
  it('exposure doubles linear light without clipping HDR',()=>{
    const p=run(image([[0.8,0.2,0.1,0.4]]),{exposure:1});
    expect(p.data[0]).toBeCloseTo(0.64,5); expect(p.data[3]).toBeCloseTo(0.4);
  });
  for(const key of ['brightness','highlights','shadows','whites','blacks'] as const) {
    it(`${key} lifts with positive values and lowers with negative values`,()=>{
      const x=key==='whites'||key==='highlights' ? 0.75 : 0.08;
      expect(run(grey(x),{[key]:50}).data[0]).toBeGreaterThan(x);
      expect(run(grey(x),{[key]:-50}).data[0]).toBeLessThan(x);
    });
  }
  it('contrast expands around perceptual middle grey',()=>{
    expect(run(grey(0.05),{contrast:50}).data[0]).toBeLessThan(0.05);
    expect(run(grey(0.6),{contrast:50}).data[0]).toBeGreaterThan(0.6);
  });
  it('shadows/highlights respond smoothly to luminance and preferentially in their ranges',()=>{
    const d=(x:number,k:'shadows'|'highlights')=>perceptual(run(grey(x),{[k]:50}).data[0]!)-perceptual(x);
    expect(d(0.02,'shadows')).toBeGreaterThan(d(0.8,'shadows'));
    expect(d(0.8,'highlights')).toBeGreaterThan(d(0.02,'highlights'));
    expect(Math.abs(d(0.18,'shadows')-d(0.1801,'shadows'))).toBeLessThan(0.001);
  });
  it('temperature warms and tint adds magenta',()=>{
    const warm=rgb(run(grey(0.3),{temperature:50})); expect(warm[0]).toBeGreaterThan(warm[2]!);
    const tint=rgb(run(grey(0.3),{tint:50})); expect(tint[0]).toBeGreaterThan(tint[1]!);
    expect(kelvinTintToGains(6500)).toEqual([1,1,1]);
  });
  it('saturation removes colour; hue rotates red to green',()=>{
    const c=rgb(run(image([[0.6,0.2,0.1]]),{saturation:-100})); expect(c[0]).toBeCloseTo(c[1]!,5); expect(c[1]).toBeCloseTo(c[2]!,5);
    const shifted=rgb(run(image([[1,0,0]]),{hueShift:120})); expect(shifted[1]).toBeCloseTo(1); expect(shifted[0]).toBeCloseTo(0);
  });
  it('vibrance protects saturated colours and skin hues',()=>{
    const sat=(h:number,s:number,v:number)=>{
      const c=hslToRgb([h,s,0.5]).map(linear);
      const out=rgb(run(image([c]),{vibrance:v})).map(perceptual) as [number,number,number]; return rgbToHsl(out)[1];
    };
    expect(sat(0.6,0.5,100)-0.5).toBeGreaterThan(sat(0.08,0.5,100)-0.5);
    expect(sat(0.6,1,100)).toBeCloseTo(1);
  });
  for(const key of ['hue','saturation','luminance'] as const) {
    it(`HSL mixer ${key} changes its range with smooth overlap`,()=>{
      const p={...NEUTRAL.hsl,red:{...NEUTRAL.hsl.red,[key]:60}};
      const c=image([[0.6,0.15,0.15]]);
      expect(rgb(run(c,{hsl:p}))).not.toEqual(rgb(c));
    });
  }
  it('levels apply master and per-channel and curves use float tables',()=>{
    const p={...NEUTRAL.levels,red:{...NEUTRAL_LEVELS,gamma:2}};
    const c=rgb(run(grey(0.2),{levels:p})); expect(c[0]).toBeGreaterThan(c[1]!);
    expect(applyLevels(0.25,{...NEUTRAL_LEVELS,gamma:2})).toBe(0.5);
    expect(applyLevels(0.4,{...NEUTRAL_LEVELS,inputBlack:0.5,inputWhite:0.5})).toBe(0);
    const curves={...NEUTRAL.curves,rgb:[[0,0],[0.5,0.75],[1,1]] as const};
    expect(run(grey(0.2),{curves}).data[0]).toBeGreaterThan(0.2);
    expect(develop.passes({curves},1,frame)[0]!.textures!.uTone!.data).toBeInstanceOf(Float32Array);
  });
  for(const region of ['shadows','midtones','highlights'] as const) it(`colour balance ${region} shifts red`,()=>{
    const balance={...NEUTRAL.colourBalance,[region]:[50,0,0] as const};
    const c=rgb(run(grey(region==='highlights'?0.7:0.15),{colourBalance:balance})); expect(c[0]).toBeGreaterThan(c[1]!);
  });
});
describe('local controls and alpha',()=>{
  const detail=image(Array.from({length:65},(_,i)=>[i===32?0.4:0.2,i===32?0.4:0.2,i===32?0.4:0.2]));
  for(const k of ['clarity','texture'] as const) it(`${k} enhances and softens detail with saved inputs`,()=>{
    const centre=32*4;
    expect(run(detail,{[k]:80}).data[centre]).toBeGreaterThan(detail.data[centre]!);
    expect(run(detail,{[k]:-80}).data[centre]).toBeLessThan(detail.data[centre]!);
    expect(develop.passes({[k]:80},1,frame).some(p=>p.save)).toBe(true);
  });
  it('dehaze darkens haze; negative values add haze',()=>{
    expect(run(grey(0.6),{dehaze:80}).data[0]).toBeLessThan(0.6);
    expect(run(grey(0.6),{dehaze:-80}).data[0]).toBeGreaterThan(0.6);
  });
  it('scales radii and adds padding for sequential controls',()=>{
    expect(develop.padding({clarity:50},0.25)).toBe(9);
    expect(develop.padding({clarity:50,texture:50,dehaze:50},1)).toBe(36+5+72);
    const passes=develop.passes({clarity:50},0.25,frame);
    expect(passes[1]!.uniforms.uSigma).toBe(3);
  });
  it('handles zero and tiny alpha without NaNs, preserves alpha and premultiplication',()=>{
    const source=image([[0.3,0.2,0.1,0],[0.3,0.2,0.1,1e-12],[0.3,0.2,0.1,0.5]]);
    for(const params of [{exposure:2,contrast:30,saturation:40},{clarity:40,texture:-40,dehaze:40}]) {
      const out=run(source,params);
      expect(Array.from(out.data).every(Number.isFinite)).toBe(true);
      expect(Array.from(out.data.slice(0,4))).toEqual([0,0,0,0]);
      expect(out.data[7]).toBe(source.data[7]); expect(out.data[11]).toBe(0.5);
    }
    const a=run(image([[0.3,0.2,0.1,0.25]]),{brightness:30});
    const b=run(image([[0.3,0.2,0.1]]),{brightness:30});
    expect(a.data[0]!/0.25).toBeCloseTo(b.data[0]!,5);
  });
});
describe('pure maths and preview statistics',()=>{
  it('spline is monotone without overshoot on unevenly spaced points',()=>{
    const f=curveSpline([[0,0],[0.01,0.4],[0.8,0.45],[1,1]]);
    let prev=0; for(let i=0;i<=2000;i++) { const x=f(i/2000); expect(x).toBeGreaterThanOrEqual(prev-1e-10); expect(x).toBeLessThanOrEqual(1); prev=x; }
    expect(()=>curveSpline([[0,0],[0,1]])).toThrow();
  });
  it('colour conversions round-trip',()=>{
    for(const c of [[0.2,0.4,0.6],[1,0,0],[0.5,0.5,0.5]] as const) {
      hslToRgb(rgbToHsl(c)).forEach((v,i)=>expect(v).toBeCloseTo(c[i]!,6));
    }
    expect(linear(perceptual(3))).toBeCloseTo(3);
  });
  it('histogram weights alpha, ignores transparent and invalid pixels, counts clipping',()=>{
    const h=computeHistogram(image([[0,0,0],[1,1,1,0.5],[0.2,0.2,0.2,0],[NaN,0,0]]),16);
    expect(h.weight).toBe(1.5); expect(h.luminance[0]).toBe(1); expect(h.luminance[15]).toBe(0.5);
    expect(h.clippedBlack).toBe(1); expect(h.clippedWhite).toBe(0.5);
    expect(()=>computeHistogram(grey(0.2),1)).toThrow();
  });
  it('auto enhance corrects synthetic under- and over-exposure deterministically',()=>{
    const under=autoEnhance(image([[0.01,0.01,0.01],[0.03,0.03,0.03],[0.05,0.05,0.05]]));
    const over=autoEnhance(image([[0.6,0.6,0.6],[0.8,0.8,0.8],[1,1,1]]));
    expect(under.exposure).toBeGreaterThan(0); expect(over.exposure).toBeLessThan(0);
    expect(run(grey(0.03),under).data[0]).toBeGreaterThan(0.03);
    expect(run(grey(0.8),over).data[0]).toBeLessThan(0.8);
    expect(autoEnhance(grey(0.03))).toEqual(autoEnhance(grey(0.03)));
  });
  it('auto enhance remains bounded on empty, clipped, flat and nearly flat buffers',()=>{
    for(const source of [createPixels(0,0),grey(0),grey(1),grey(0.18),image([[0.2,0.2,0.2],[0.200001,0.200001,0.200001]])]) {
      const p=autoEnhance(source); expect(Object.values(p).every(Number.isFinite)).toBe(true);
      expect(Math.abs(p.exposure)).toBeLessThanOrEqual(2); expect(p.contrast).toBe(0);
    }
  });
});

describe('table and tile boundaries',()=>{
  it('all eight HSL ranges affect their centre and wrap continuously around red',()=>{
    const centres=[0,30,60,120,180,240,275,315];
    COLOUR_RANGES.forEach((range,i)=>{
      const table=bakeHsl({...NEUTRAL.hsl,[range]:{hue:50,saturation:50,luminance:50}});
      expect(tableSample(table,centres[i]!/360,0)).toBeGreaterThan(0);
      for(let c=0;c<3;c++) expect(tableSample(table,0,c)).toBeCloseTo(tableSample(table,1,c),7);
      const nearLeft=tableSample(table,1-1e-5,0),nearRight=tableSample(table,1e-5,0);
      expect(Math.abs(nearLeft-nearRight)).toBeLessThan(0.0001);
    });
  });
  it('per-channel curves leave other channels alone; output levels set the range',()=>{
    for(const [j,channel] of ['red','green','blue'].entries()) {
      const out=rgb(run(grey(0.2),{curves:{...NEUTRAL.curves,[channel]:[[0,0],[0.5,0.8],[1,1]]}}));
      out.forEach((x,k)=> k===j ? expect(x).toBeGreaterThan(0.2) : expect(x).toBeCloseTo(0.2,5));
    }
    const levels={...NEUTRAL.levels,rgb:{...NEUTRAL_LEVELS,outputBlack:0.2,outputWhite:0.8}};
    expect(run(grey(0),{levels}).data[0]).toBeCloseTo(linear(0.2),5);
    expect(run(grey(1),{levels}).data[0]).toBeCloseTo(linear(0.8),5);
  });
  it('declared sequential padding reproduces the same tile interior as the full image',()=>{
    const params={clarity:40,texture:-30,dehaze:20},scale=0.25;
    const source=image(Array.from({length:140},(_,i)=>[0.1+(i%11)/30,0.2+(i%7)/40,0.3]));
    const full=run(source,params,scale),pad=develop.padding(params,scale),start=60,end=70;
    const tile={width:end-start+2*pad,height:1,data:source.data.slice((start-pad)*4,(end+pad)*4)};
    const output=run(tile,params,scale);
    for(let i=start;i<end;i++) for(let j=0;j<4;j++) expect(output.data[(i-start+pad)*4+j]).toBeCloseTo(full.data[i*4+j]!,6);
  });
});

describe('hue stability regressions',()=>{
  it('skin-protected vibrance is continuous across the red hue boundary',()=>{
    const a=rgb(run(image([[0.6,0.2,0.200001]]),{vibrance:80}));
    const b=rgb(run(image([[0.6,0.200001,0.2]]),{vibrance:80}));
    a.forEach((v,i)=>expect(Math.abs(v-b[i]!)).toBeLessThan(0.00001));
  });
  it('the HSL mixer does not give neutral grey an arbitrary hue-dependent lightness',()=>{
    const hsl={...NEUTRAL.hsl,red:{hue:50,saturation:50,luminance:50}};
    const a=rgb(run(grey(0.3),{hsl}));
    a.forEach(v=>expect(v).toBeCloseTo(0.3,6));
    const near=rgb(run(image([[0.3,0.300001,0.3]]),{hsl}));
    near.forEach((v,i)=>expect(Math.abs(v-a[i]!)).toBeLessThan(0.00001));
  });
});
