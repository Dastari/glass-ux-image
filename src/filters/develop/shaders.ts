/** These transfer functions intentionally extend beyond 1, like the TypeScript helpers. */
export const colourGlsl = /* glsl */ `
float enc(float x) { return x <= 0.0031308 ? max(x,0.0)*12.92 : 1.055*pow(x,1.0/2.4)-0.055; }
float dec(float x) { return x <= 0.04045 ? max(x,0.0)/12.92 : pow((x+0.055)/1.055,2.4); }
vec3 encode(vec3 c) { return vec3(enc(c.r),enc(c.g),enc(c.b)); }
vec3 decode(vec3 c) { return vec3(dec(c.r),dec(c.g),dec(c.b)); }
float lum(vec3 c) { return dot(c,vec3(0.2126,0.7152,0.0722)); }
vec3 toHsl(vec3 c) {
 float hi=max(c.r,max(c.g,c.b)), lo=min(c.r,min(c.g,c.b)), d=hi-lo, l=(hi+lo)*0.5;
 if(d<=0.0000001) return vec3(0.0,0.0,l);
 float h=hi==c.r ? (c.g-c.b)/d : hi==c.g ? (c.b-c.r)/d+2.0 : (c.r-c.g)/d+4.0;
 return vec3(fract(h/6.0),d/max(0.0000001,1.0-abs(2.0*l-1.0)),l);
}
vec3 fromHsl(vec3 hsl) {
 vec3 k=mod(hsl.x*6.0+vec3(0.0,4.0,2.0),6.0);
 return hsl.z+hsl.y*(1.0-abs(2.0*hsl.z-1.0))*(clamp(abs(k-3.0)-1.0,0.0,1.0)-0.5);
}
vec3 lookup(sampler2D table, float x) {
 int n=textureSize(table,0).x; float at=clamp(x,0.0,1.0)*float(n-1); int i=int(floor(at));
 return mix(texelFetch(table,ivec2(i,0),0).rgb,texelFetch(table,ivec2(min(n-1,i+1),0),0).rgb,at-float(i));
}
`;
export const pointGlsl = /* glsl */ `
uniform float uExposure, uBrightness, uContrast, uHighlights, uShadows, uWhites, uBlacks;
uniform vec3 uGains, uBalanceS, uBalanceM, uBalanceH;
uniform float uSaturation, uVibrance, uHue, uUseTone, uUseHsl;
uniform sampler2D uTone, uHsl;
${colourGlsl}
vec4 filterPixel(ivec2 p) {
 vec4 src=texelFetch(uSource,p,0); if(src.a<=0.0) return vec4(0.0);
 vec3 c=encode(src.rgb/src.a*uExposure*uGains);
 float l=lum(c), sh=1.0-smoothstep(0.0,0.65,l), hi=smoothstep(0.35,1.0,l);
 float delta=uBrightness*0.25+uShadows*sh*0.25+uHighlights*hi*0.25+uWhites*smoothstep(0.65,1.0,l)*0.25+uBlacks*(1.0-smoothstep(0.0,0.35,l))*0.2;
 c=max(vec3(0.0),vec3(0.46135613)+(c-0.46135613)*uContrast+delta);
 c=max(vec3(0.0),c+uBalanceS*sh+uBalanceM*(1.0-sh)*(1.0-hi)*4.0+uBalanceH*hi);
 if(uUseTone>0.5) c=vec3(lookup(uTone,c.r).r,lookup(uTone,c.g).g,lookup(uTone,c.b).b);
 // Normalise HDR before HSL, retaining its peak on return.
 float peak=max(1.0,max(c.r,max(c.g,c.b))); vec3 hsl=toHsl(c/peak);
 float skinDistance=abs(hsl.x-0.08);
 float skin=1.0-smoothstep(0.04,0.13,min(skinDistance,1.0-skinDistance));
 float sat=max(0.0,uSaturation+uVibrance*(1.0-hsl.y)*(1.0-0.8*skin));
 hsl.y=clamp(hsl.y*sat,0.0,1.0);
 vec3 adj=uUseHsl>0.5 ? lookup(uHsl,hsl.x)*smoothstep(0.02,0.12,hsl.y) : vec3(0.0);
 hsl.x=fract(hsl.x+uHue+adj.x);
 hsl.y=clamp(hsl.y*(1.0+adj.y),0.0,1.0); hsl.z=clamp(hsl.z+adj.z,0.0,1.0);
 c=fromHsl(hsl)*peak;
 return vec4(decode(c)*src.a,src.a);
}`;
