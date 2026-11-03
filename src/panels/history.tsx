import { useEffect, useRef } from 'react';
import { Tree, type TreeHandle, type TreeNode } from 'glass-ux/tree';
import { IconHistory } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { workspaceMessages, type WorkspaceMessages } from '../messages/workspace.js';
import { useEditor, useImageHistory } from '../react/index.js';
import type { EditorSession, HistoryNode } from '../session/index.js';
/** Session history, including every retained branch. */
export interface HistoryPanelProps {
  /** Explicit editor, or the nearest provider. */
  editor?: EditorSession;
  /** Host wording overrides. */
  labels?: Partial<WorkspaceMessages>;
  /** Layout class. */
  className?: string;
}
/** Glass UX Tree supplies roving focus and arrow-key branch navigation; selection jumps via edit.goTo. */
export function HistoryPanel({editor, labels, className}: HistoryPanelProps) {
  const session=useEditor(editor), history=useImageHistory(session), m=useMessages(workspaceMessages,{labels});
  const tree=useRef<TreeHandle>(null);
  const nodes=new Map(history.nodes.map(n=>[n.id,n]));
  const node=(n:HistoryNode):TreeNode=>({id:n.id,label:n.label || (n.parent===null?m.original:m.step),icon:<IconHistory/>,selectable:true,children:n.children.map(id=>node(nodes.get(id)!))});
  useEffect(()=>{void tree.current?.reveal(history.current.id);},[history.current.id]);
  return <Tree ref={tree} className={className} aria-label={m.history} nodes={history.nodes.filter(n=>n.parent===null).map(node)} selectableGroups selectedId={history.current.id} defaultExpanded={history.nodes.map(n=>n.id)} onSelectedIdChange={id=>{if(id)history.goTo(id);}}/>;
}
