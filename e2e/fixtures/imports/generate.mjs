// Original geometric fixtures, generated for this repository; MIT like the source.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { writePsdUint8Array } from 'ag-psd';
const dir=new URL('./',import.meta.url);
function tiff({bits=8,compression=1,orientation=1,raw=false,multi=false,associated=false,bigEndian=false}={}) {
 const le=!bigEndian,width=3,height=2,channels=4;
 const rgba=[255,0,0,255,0,255,0,255,0,0,255,255,128,64,32,128,255,255,255,255,0,0,0,0];
 let data=new Uint8Array(width*height*channels*bits/8);const dv=new DataView(data.buffer);
 rgba.forEach((v,i)=>{if(bits===16)dv.setUint16(i*2,v*257,le);else data[i]=v;});
 if(compression===5) {const codes=[256,...data,257],packed=new Uint8Array(Math.ceil(codes.length*9/8));let bit=0;for(const code of codes)for(let n=8;n>=0;n--){packed[bit>>3]|=((code>>n)&1)<<(7-(bit&7));bit++;}data=packed;}
 if(compression===8)data=deflateSync(data);if(compression===32773)data=new Uint8Array([data.length-1,...data]);
 const tags=[[256,4,1,width],[257,4,1,height],[258,3,4,200],[259,3,1,compression],[262,3,1,2],[273,4,1,256],[274,3,1,orientation],[277,3,1,4],[278,4,1,height],[279,4,1,data.length],[284,3,1,1],[338,3,1,associated?1:2]];
 if(raw)tags.push([50706,1,4,0x040001]);
 const bytes=new Uint8Array(256+data.length+(multi?256:0)),v=new DataView(bytes.buffer);bytes.set(le?[73,73]:[77,77]);v.setUint16(2,42,le);v.setUint32(4,8,le);
 function ifd(at,next) {v.setUint16(at,tags.length,le);tags.forEach(([tag,type,count,value],i)=>{const p=at+2+i*12;v.setUint16(p,tag,le);v.setUint16(p+2,type,le);v.setUint32(p+4,count,le);if(type===3&&count===1)v.setUint16(p+8,value,le);else v.setUint32(p+8,value,le);});v.setUint32(at+2+tags.length*12,next,le);}
 ifd(8,multi?256+data.length:0);for(let i=0;i<4;i++)v.setUint16(200+i*2,bits,le);bytes.set(data,256);if(multi)ifd(256+data.length,0);return bytes;
}
for(const [name,options] of Object.entries({'rgba8.tif':{},'rgba16.tif':{bits:16},'rgba16-be.tif':{bits:16,bigEndian:true},'deflate.tif':{compression:8},'lzw.tif':{compression:5},'packbits.tif':{compression:32773},'multipage.tif':{multi:true},'oriented.tif':{orientation:6},'associated.tif':{associated:true}}))writeFileSync(new URL(name,dir),tiff(options));
const solid=(width,height,rgba)=>({width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>rgba[i%4])});
const psd=writePsdUint8Array({width:6,height:4,imageData:solid(6,4,[40,80,120,255]),children:[
 {name:'Bottom',left:0,top:0,imageData:solid(6,4,[255,0,0,255])},
 {name:'Offset',left:2,top:1,opacity:.5,blendMode:'multiply',imageData:solid(2,2,[71,191,37,13])},
 {name:'Hidden',left:-1,top:0,hidden:true,blendMode:'color dodge',imageData:solid(2,1,[0,0,255,255])}
]});writeFileSync(new URL('layers.psd',dir),psd);
