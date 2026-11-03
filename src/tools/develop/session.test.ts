import {afterEach,describe,expect,it} from 'vitest';
import {createPixels,pixelSource} from '../../core/index.js';
import {createEditorSession,type EditorSession,type EditorSessionOptions} from '../../session/index.js';
import {develop} from '../../filters/develop/index.js';
import {developActions} from './actions.js';
const sessions:EditorSession[]=[];
function make(extra:Partial<EditorSessionOptions>={}) {
  const p=createPixels(8,8);for(let i=0;i<p.data.length;i+=4)p.data.set([0.03,0.03,0.03,1],i);
  const s=createEditorSession({source:pixelSource(p),tools:[{id:'develop',filters:[develop],actions:developActions}],...extra});sessions.push(s);return s;
}
async function ready(s:EditorSession) {
  if(s.state.status==='ready')return;
  await new Promise<void>((resolve,reject)=>{const stop=s.subscribe(()=>{if(s.state.status==='ready'){stop();resolve();}else if(s.state.status==='failed'){stop();reject(s.state.error);}});});
}
afterEach(()=>{sessions.splice(0).forEach(s=>s.dispose());});
describe('develop session integration',()=>{
  it('readPreview awaits the original asynchronous tile cache at identity',async()=>{
    const p=createPixels(8,8);for(let i=0;i<p.data.length;i+=4)p.data.set([0.03,0.03,0.03,1],i);
    const s=make({source:{width:8,height:8,async readTile(){await new Promise(resolve=>setTimeout(resolve,1));return p;}}});
    await ready(s);const pixels=await s.readPreview(8);expect(pixels.data[0]).toBeCloseTo(0.03);expect(pixels.width).toBe(8);
  });

  it('auto enhance is a named action; repeat analysis uses the ungraded preview',async()=>{
    const actions:string[]=[],s=make({onAction:(action,next)=>{actions.push(action.id);return next();}});await ready(s);
    await s.run('develop.autoEnhance');
    expect((s.state.recipe.filters.develop as {exposure:number}).exposure).toBeGreaterThan(0);
    const first=s.state.recipe.filters.develop;
    await s.run('develop.autoEnhance');expect(s.state.recipe.filters.develop).toEqual(first);
    expect(actions).toContain('develop.autoEnhance');expect(actions).toContain('edit.apply');
    s.run('edit.undo');expect(s.state.recipe.filters.develop).toBeUndefined();
  });
  it('a host can veto auto analysis and its final asynchronous commit',async()=>{
    const first=make({onAction:(a,next)=>a.id==='develop.autoEnhance'?undefined:next()});await ready(first);await first.run('develop.autoEnhance');expect(first.state.dirty).toBe(false);
    const second=make({onAction:(a,next)=>a.id==='edit.apply'?undefined:next()});await ready(second);await second.run('develop.autoEnhance');expect(second.state.dirty).toBe(false);expect(second.state.draft.filters.develop).toBeUndefined();
  });
  it('host overrides win over tool actions',async()=>{
    let called=0;const s=make({actions:[{id:'develop.autoEnhance',run:()=>{called++;}}]});await ready(s);await s.run('develop.autoEnhance');expect(called).toBe(1);expect(s.state.dirty).toBe(false);
  });
  it('comparison is an action and alternate-recipe reads leave draft and history alone',async()=>{
    const actions:string[]=[],s=make({onAction:(a,next)=>{actions.push(a.id);return next();}});await ready(s);
    s.previewFilter('develop',{exposure:2});
    const draft=s.state.draft,current=s.history.current.id;
    const before=await s.readPreview(8,{recipe:s.state.recipe});const after=await s.readPreview(8);
    expect(before.data[0]).toBeCloseTo(0.03);expect(after.data[0]).toBeCloseTo(0.12);
    expect(s.state.draft).toBe(draft);expect(s.history.current.id).toBe(current);
    s.run('develop.compare');expect(actions).toContain('develop.compare');expect(s.state.toolData['develop.compare']).toBe(true);
  });
});
