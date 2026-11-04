import { closePanel, column, openPanel, panelsOf, parsePaneLayout, row, sized, stack, stackOf, type PaneLayoutState, type PaneNode, type PaneSize, type PaneSplit, type PaneStack } from 'glass-ux/pane-layout';

/**
 * Showing and hiding the workspace's panes, as pure functions over PaneLayout's plain JSON, so the
 * View menu, a host's own menu and tests share them. A host's own layout keeps working: these only
 * read the tree and change it through PaneLayout's public operations.
 */

/** Whether a pane can be seen: in the layout, its stack's chosen tab, and not collapsed or covered. */
export function isPaneShown(layout:PaneLayoutState,id:string):boolean {
  const holder=stackOf(layout.root,id);
  return Boolean(holder&&holder.active===id&&!holder.collapsed&&(!layout.maximised||layout.maximised===holder.id));
}

/** The layout without a pane. Its neighbours take the room. */
export function hidePane(layout:PaneLayoutState,id:string):PaneLayoutState {return closePanel(layout,id);}

/** A layout put in order (empty stacks gone, ids unique, one size per child) through PaneLayout's own reader. */
const tidy=(layout:PaneLayoutState):PaneLayoutState=>parsePaneLayout(layout)??layout;

/** A node rebuilt with `change` applied to the stack whose id matches. */
function replaceStack(node:PaneNode,id:string,change:(stack:PaneStack)=>PaneNode):PaneNode {
  if(node.type==='stack')return node.id===id?change(node):node;
  const children=node.children.map(child=>replaceStack(child,id,change));
  return children.every((child,index)=>child===node.children[index])?node:{...node,children};
}

/** The layout with a pane chosen in its stack, the stack open, and no other stack maximised over it. */
export function revealPane(layout:PaneLayoutState,id:string):PaneLayoutState {
  const holder=stackOf(layout.root,id);
  if(!holder||isPaneShown(layout,id))return layout;
  const root=replaceStack(layout.root,holder.id,({collapsed:_collapsed,...open})=>({...open,active:id}));
  const {maximised,...rest}=layout;
  return tidy(maximised&&maximised!==holder.id?{...rest,root}:{...layout,root});
}

/** Every split from the root down to the node holding `id`, with the index of the child taken at each. */
function pathTo(node:PaneNode,id:string,trail:{split:PaneSplit;index:number}[]=[]):{split:PaneSplit;index:number}[]|null {
  if(node.type==='stack')return node.panels.includes(id)?trail:null;
  for(const [index,child] of node.children.entries()){const found=pathTo(child,id,[...trail,{split:node,index}]);if(found)return found;}
  return null;
}

/** A node rebuilt with `change` applied to the split whose id matches. */
function replaceSplit(node:PaneNode,id:string,change:(split:PaneSplit)=>PaneNode):PaneNode {
  if(node.type==='stack')return node;
  if(node.id===id)return change(node);
  const children=node.children.map(child=>replaceSplit(child,id,change));
  return children.every((child,index)=>child===node.children[index])?node:{...node,children};
}

/**
 * The layout with a pane shown where `defaults` puts it, measured from `anchor` (the stage).
 *
 * - A pane already in the layout is revealed: chosen in its stack, its stack opened and uncovered.
 * - A pane whose default stack still has another pane open joins that stack, as a tab.
 * - Otherwise it goes beside the anchor on the side `defaults` gives it, at its default size, in
 *   the nearest split that runs that way; with none, the layout is wrapped, so a bottom pane spans
 *   the whole width again.
 */
export function showPane(layout:PaneLayoutState,id:string,defaults:PaneLayoutState,anchor='stage'):PaneLayoutState {
  if(stackOf(layout.root,id))return revealPane(layout,id);
  const home=stackOf(defaults.root,id);
  const partner=home?.panels.find(panel=>panel!==id&&stackOf(layout.root,panel));
  if(home&&partner){
    const target=stackOf(layout.root,partner)!;
    const before=home.panels.slice(0,home.panels.indexOf(id)).filter(panel=>target.panels.includes(panel)).length;
    return openPanel(layout,id,{stack:target.id,index:before});
  }
  const ownPath=pathTo(defaults.root,id),anchorPath=pathTo(defaults.root,anchor),here=pathTo(layout.root,anchor);
  if(!ownPath||!anchorPath||!here)return openPanel(layout,id);
  // The deepest split holding both in the defaults says which way, which side and how large.
  let depth=0;
  while(depth<ownPath.length&&depth<anchorPath.length&&ownPath[depth]!.split.id===anchorPath[depth]!.split.id&&ownPath[depth]!.index===anchorPath[depth]!.index)depth++;
  const shared=ownPath[depth]??anchorPath[depth];
  if(!shared)return openPanel(layout,id);
  const {split}=shared,orientation=split.orientation,first=ownPath[depth]!.index<anchorPath[depth]!.index;
  const size:PaneSize=split.sizes[ownPath[depth]!.index]??1;
  const placed=stack(id);
  // The innermost split around the anchor running the same way takes the pane beside the anchor's branch.
  const host=[...here].reverse().find(step=>step.split.orientation===orientation);
  if(host){
    const root=replaceSplit(layout.root,host.split.id,node=>{
      const at=first?host.index:host.index+1;
      return {...node,children:[...node.children.slice(0,at),placed,...node.children.slice(at)],sizes:[...node.sizes.slice(0,at),size,...node.sizes.slice(at)]};
    });
    return tidy({...layout,root});
  }
  const wrap=orientation==='horizontal'?row:column,whole=layout.root;
  const root=wrap(...(first?[sized(placed,size),whole]:[whole,sized(placed,size)]));
  return tidy({...layout,root});
}

/** Show a hidden pane, or hide a shown one. A pane behind another tab is brought forward, as a window menu does. */
export function togglePane(layout:PaneLayoutState,id:string,defaults:PaneLayoutState,anchor='stage'):PaneLayoutState {
  return isPaneShown(layout,id)?hidePane(layout,id):showPane(layout,id,defaults,anchor);
}

/** Panels in the layout, for a host checking what its own layout holds. */
export const panesIn=(layout:PaneLayoutState):string[]=>panelsOf(layout.root);
