import type {ActionOverride} from '../../session/index.js';
import {autoEnhance} from '../../filters/develop/statistics.js';
/** Auto enhance is intercepted before analysis; its final commit is intercepted again after await. */
export const developActions: readonly ActionOverride[]=[{
  id:'develop.compare',
  run:session=>session.setToolData('develop.compare',!session.state.toolData['develop.compare']),
},{
  id:'develop.autoEnhance',enabled:s=>s.state.status==='ready',
  async run(session) {
    const draft=session.state.draft;
    const {develop:_develop,...filters}=draft.filters;
    const params=autoEnhance(await session.readPreview(192,{recipe:{...draft,filters}}));
    // Ignore a stale analysis rather than overwrite a newer edit or an undo.
    if(session.state.draft!==draft)return;
    const current=draft.filters.develop as Record<string,unknown>|undefined;
    session.run('edit.apply',{filters:{...draft.filters,develop:{...current,...params}}});
  },
}];
