import { develop, NEUTRAL, type DevelopParams } from 'glass-ux-image/filters/develop';
import { createPixels, pixelSource } from 'glass-ux-image/core';
import { noise, SIZE, type Scene } from './conformance-source';

/** Noise plus neutral/hue ties, transparency, HDR and sharp edges for nonlinear controls. */
function fixture() {
  const p=noise(SIZE.width,SIZE.height,83,0.7);
  const special=[[0,0,0,0],[0.3,0.3,0.3,1],[0.2,0.20001,0.2,1],[1,0,0,1],[1,0.00001,0,1],[1,0,0.00001,1],[0.4,0.2,0.1,0.01],[2,0.4,0.1,0.5]];
  for(let x=0;x<SIZE.width;x++) {
    const c=special[x%special.length]!;
    for(let y=0;y<16;y++) p.data.set([c[0]!*c[3]!,c[1]!*c[3]!,c[2]!*c[3]!,c[3]!],(y*SIZE.width+x)*4);
  }
  return pixelSource(p);
}
const scene=(params:Partial<DevelopParams>):Scene=>doc=>void doc.addLayer({source:fixture(),filters:[{filter:develop,params}]});
/** Every develop control, adversarial boundaries and sequential local stages at three levels. */
export const developScenes: Record<string,Scene>={};
for(const key of ['exposure','brightness','contrast','highlights','shadows','whites','blacks','temperature','tint','saturation','vibrance','hueShift','clarity','texture','dehaze'] as const) {
  developScenes[`develop: ${key}`]=scene({[key]:key==='exposure'?2:65});
  developScenes[`develop: ${key} negative`]=scene({[key]:key==='exposure'?-2:-65});
}
for(const channel of ['rgb','red','green','blue'] as const) {
  developScenes[`develop: levels ${channel}`]=scene({levels:{...NEUTRAL.levels,[channel]:{inputBlack:0.08,gamma:0.65,inputWhite:0.92,outputBlack:0.03,outputWhite:0.97}}});
  developScenes[`develop: curves ${channel}`]=scene({curves:{...NEUTRAL.curves,[channel]:[[0,0],[0.01,0.15],[0.5,0.7],[1,1]]}});
}
for(const range of ['red','orange','yellow','green','aqua','blue','purple','magenta'] as const) {
  developScenes[`develop: HSL ${range}`]=scene({hsl:{...NEUTRAL.hsl,[range]:{hue:65,saturation:-60,luminance:25}}});
}
for(const range of ['shadows','midtones','highlights'] as const) developScenes[`develop: balance ${range}`]=scene({colourBalance:{...NEUTRAL.colourBalance,[range]:[40,-25,20]}});
developScenes['develop: combined']=scene({exposure:0.3,brightness:10,contrast:15,temperature:15,tint:-10,vibrance:25,clarity:30,texture:20,dehaze:20});
// A steep gamma at black, rather than only well-behaved midtones.
developScenes['develop: steep gamma']=scene({levels:{...NEUTRAL.levels,rgb:{...NEUTRAL.levels.rgb,gamma:3}}});
developScenes['develop: alpha extremes']=doc=>{
  const p=createPixels(SIZE.width,SIZE.height);
  for(let i=0;i<p.data.length;i+=4){const a=(i/4)%4===0?0:0.0001;p.data.set([0.4*a,0.2*a,0.1*a,a],i);}
  doc.addLayer({source:pixelSource(p),filters:[{filter:develop,params:{exposure:3,contrast:70,hueShift:-170}}]});
};
