import { build } from '../apps/demo/node_modules/vite/dist/node/index.js';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
// Production JavaScript, including React and Glass UX. Eager code is what an entry loads before anything runs:
// its entry chunk and every chunk reached by static imports. Lazy code is everything loaded on demand: dynamic
// imports such as optional decoders, and emitted workers. Each has its own budget. CSS, fonts and opt-in WASM
// are separate assets. Limits are gzip bytes.
import { budgets, lazyBudgets } from './size-budgets.mjs';
const entries={basic:'src/kits/basic.ts',standard:'src/kits/standard.ts',advanced:'src/kits/advanced.ts',photo:'src/photo-editor/index.ts',workspace:'src/editor/index.ts',full:'virtual:gi-full-suite'};
for(const [name,entry] of Object.entries(entries)){
 const modules=new Set();
 const result=await build({configFile:false,worker:{format:'es'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'error',build:{write:false,minify:true,target:'es2022',rollupOptions:{input:entry.startsWith('virtual:')?entry:resolve(entry),preserveEntrySignatures:'strict',output:{format:'es'}}},plugins:[{name:'budget-graph',resolveId(id){if(id==='virtual:gi-full-suite')return id;},load(id){if(id==='virtual:gi-full-suite')return `export * from '${resolve('src/editor/index.ts')}'; export {standard} from '${resolve('src/kits/standard.ts')}'; export {advanced} from '${resolve('src/kits/advanced.ts')}';`;},generateBundle(_options,bundle){for(const item of Object.values(bundle))if(item.type==='chunk')for(const id of Object.keys(item.modules))modules.add(id);}}]});
 const outputs=Array.isArray(result)?result:[result];let bytes=0,lazy=0;
 for(const out of outputs){
   const chunks=out.output.filter(item=>item.type==='chunk'),byName=new Map(chunks.map(chunk=>[chunk.fileName,chunk])),eager=new Set();
   const visit=file=>{if(eager.has(file))return;eager.add(file);for(const next of byName.get(file)?.imports??[])visit(next);};
   for(const chunk of chunks)if(chunk.isEntry)visit(chunk.fileName);
   for(const item of out.output){
     const size=item.type==='chunk'?gzipSync(item.code).byteLength:item.fileName.endsWith('.js')?gzipSync(item.source).byteLength:0;
     if(item.type==='chunk'&&eager.has(item.fileName))bytes+=size;else lazy+=size;
   }
 }
 console.log(`${name}: ${bytes} eager / ${budgets[name]} budget, ${lazy} lazy / ${lazyBudgets[name]} budget (gzip bytes, ${modules.size} modules)`);
 if(bytes>budgets[name])throw new Error(`${name} eager code exceeds its budget`);
 if(lazy>lazyBudgets[name])throw new Error(`${name} lazy code exceeds its budget`);
 if(name==='basic'){
   const forbidden=[...modules].filter(id=>/\/src\/(retouch|layers-text)\/|\/src\/tools\/(retouch|layers|text|effects)(\/|\.)|\/src\/(filters\/effects|filters\/develop|controls\/curves)(\/|\.)/.test(id));
   if(forbidden.length)throw new Error(`basic imports advanced modules:\n${forbidden.join('\n')}`);
   console.log('basic exclusions: no retouch, layers, text, curves, full develop or effects modules');
 }
}
// Templates and the demo can only import public entries.
const pkg=JSON.parse(await readFile('package.json','utf8'));if(!pkg.exports['./kits/*'])throw new Error('Missing kit exports');
