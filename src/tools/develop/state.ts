import {useEditor,useSessionState} from '../../react/index.js';
import type {EditorSession} from '../../session/index.js';
import {NEUTRAL,type DevelopParams} from '../../filters/develop/params.js';
/** Current plain develop parameters and action-aware draft operations. */
export function useDevelop(editor?:EditorSession) {
  const session=useEditor(editor),state=useSessionState(session);
  const value={...NEUTRAL,...state.draft.filters.develop as Partial<DevelopParams>|undefined};
  return {session,value,preview:(patch:Partial<DevelopParams>)=>session.previewFilter('develop',{...value,...patch}),commit:()=>session.run('edit.apply')};
}
/** Optional session binding shared by the independently importable develop panels. */
export interface DevelopPanelProps {
  /** Explicit session; otherwise uses the nearest ImageEditorProvider. */
  editor?:EditorSession;
}
