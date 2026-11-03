import { defineFilter } from "glass-ux-image/core";
import { gaussianBlur } from "glass-ux-image/filters/gaussian-blur";

/** Exercises saved results, data textures and global frame anchoring across padded tile boundaries. */
export const contextFilter = defineFilter<{sigma:number}>({
  id:"context-proof",
  padding: (params,scale)=>gaussianBlur.padding(params,scale),
  passes(params,scale,frame) {
    return [
      {id:"context-copy",save:"original",uniforms:{},glsl:"vec4 filterPixel(ivec2 p) { return texelFetch(uSource,p,0); }",cpu:(source,target)=>target.data.set(source.data)},
      ...gaussianBlur.passes(params,scale,frame),
      {
        id:"context-combine",
        inputs:{uOriginal:"original"},
        textures:{uTable:{width:2,height:1,data:new Float32Array([.25,.25,.25,1,.75,.75,.75,1])}},
        uniforms:{uOrigin:[frame.x,frame.y],uDocument:[frame.documentWidth,frame.documentHeight]},
        glsl:`
          uniform sampler2D uOriginal;
          uniform sampler2D uTable;
          uniform vec2 uOrigin;
          uniform vec2 uDocument;
          vec4 filterPixel(ivec2 p) {
            vec4 original=texelFetch(uOriginal,p,0), blurred=texelFetch(uSource,p,0);
            float table=texelFetch(uTable,ivec2((p.x+int(uOrigin.x)) & 1,0),0).r;
            float amount=clamp((float(p.y)+uOrigin.y)/uDocument.y,0.,1.)*.25+table*.25;
            return mix(original,blurred,amount);
          }`,
        cpu(source,target,context) {
          const original=context.inputs.uOriginal!,table=context.textures.uTable!;
          for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++) {
            const amount=Math.min(1,Math.max(0,(y+frame.y)/frame.documentHeight))*.25+table.data[((x+frame.x)&1)*4]!*.25;
            const i=(y*source.width+x)*4;
            for(let c=0;c<4;c++) target.data[i+c]=original.data[i+c]!*(1-amount)+source.data[i+c]!*amount;
          }
        }
      }
    ];
  }
});
