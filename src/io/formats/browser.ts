import { ensure, FileDataError } from './bytes.js';
import type { NativeEncoder, SvgBoundary } from './index.js';
const elements=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath']);
const attributes=new Set(['viewBox','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','d','points','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','opacity','transform','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','id','clip-path']);
/** Browser-only adapter. Unsupported SVG constructs are rejected rather than silently trusted. */
export function browserSvgBoundary(): SvgBoundary {
  return {
    sanitise(text) {
      ensure(!/<!DOCTYPE|<!ENTITY/i.test(text) && !/<\?/.test(text.replace(/^\s*<\?xml[^?]*\?>/,'')),'SVG declarations and processing instructions are forbidden');
      const parsed=new DOMParser().parseFromString(text,'image/svg+xml');
      ensure(!parsed.querySelector('parsererror') && parsed.documentElement.localName==='svg');
      let count=0;
      for(const node of parsed.querySelectorAll('*')) {
        ensure(++count<=10000 && elements.has(node.localName) && node.namespaceURI==='http://www.w3.org/2000/svg','Unsupported SVG element');
        for(const attr of node.attributes) {
          if(attr.name==='xmlns' && attr.value==='http://www.w3.org/2000/svg') continue;
          ensure(attributes.has(attr.name) && !/[\\<>]/.test(attr.value),'Unsupported SVG attribute');
          // Only local fragment paint/clip references; no CSS escapes, external URLs or data URLs.
          ensure(!/url\s*\(/i.test(attr.value) || /^url\(#[A-Za-z_][\w.-]*\)$/.test(attr.value),'External SVG resource');
          ensure(!/(?:https?:|data:|javascript:|@import)/i.test(attr.value),'External SVG resource');
        }
      }
      return new XMLSerializer().serializeToString(parsed.documentElement);
    },
    async rasterise(svg,width,height) {
      const url=URL.createObjectURL(svg);
      try {
        const image=new Image(); image.src=url; await image.decode();
        const canvas=new OffscreenCanvas(width,height); const ctx=canvas.getContext('2d');
        if(!ctx) throw new FileDataError('unsupported','Canvas 2D is unavailable');
        ctx.drawImage(image,0,0,width,height); return await canvas.convertToBlob({type:'image/png'});
      } catch(cause) { throw new FileDataError('invalid','SVG rasterisation failed',{cause}); }
      finally { URL.revokeObjectURL(url); }
    },
  };
}
export function browserNativeEncoder(): NativeEncoder {
  const canvas=new OffscreenCanvas(1,1);canvas.getContext('2d');return {encode:type=>canvas.convertToBlob({type})};
}
