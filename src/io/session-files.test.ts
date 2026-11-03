import { expect, it } from 'vitest';
import { createEditorSession } from '../session/index.js';
import { solidSource } from '../core/index.js';
import { attachSessionFiles } from './session-files.js';
it('file actions are opt-in and a host veto prevents opening/export/persistence',async()=> {
 const actions:string[]=[];const session=createEditorSession({source:solidSource({width:2,height:2},[0,0,0,1]),onAction:request=>{actions.push(request.id);},onExport:()=>{throw new Error('must not deliver');}});
 expect(session.action('file.open').available).toBe(false);const dispose=attachSessionFiles(session,{onProjectSave:()=>{throw new Error('must not persist');}});
 await session.run('file.open',new Blob(['bad']));await session.run('file.project.save');await session.run('file.export');
 expect(actions).toEqual(['file.open','file.project.save','file.export']);expect(session.state.sourceSize).toEqual({width:2,height:2});dispose();session.dispose();
});
it('host action overrides take precedence over adapter defaults',()=> {let called=false;const session=createEditorSession({source:solidSource({width:1,height:1},[0,0,0,1]),actions:[{id:'file.copy',run:()=>{called=true;}}]});const dispose=attachSessionFiles(session);session.run('file.copy');expect(called).toBe(true);dispose();expect(session.action('file.copy').available).toBe(true);session.dispose();});

it('settles an in-flight compressed preview when opening another source disposes its cache',async()=> {
 let release!:(pixels:import('../core/index.js').PixelBuffer)=>void;
 let started!:()=>void;const reading=new Promise<void>(resolve=>{started=resolve;});
 const source={width:2,height:2,readTile:()=>{started();return new Promise<import('../core/index.js').PixelBuffer>(resolve=>{release=resolve;});}};
 const session=createEditorSession({source});const remove=attachSessionFiles(session);
 await new Promise<void>(resolve=>{if(session.state.status==='ready')resolve();else{const stop=session.subscribe(()=>{if(session.state.status==='ready'){stop();resolve();}});}});
 const preview=session.result().toBlob({type:'image/png'});
 const rejected=expect(preview).rejects.toMatchObject({name:'AbortError'});
 await reading;
 const opening=session.run('file.open',solidSource({width:3,height:3},[0,0,0,1]));
 release({width:2,height:2,data:new Float32Array(16)});
 await Promise.all([opening,rejected]);expect(session.state.sourceSize).toEqual({width:3,height:3});
 remove();session.dispose();
});
