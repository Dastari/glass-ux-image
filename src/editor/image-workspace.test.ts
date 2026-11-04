import { describe, expect, it } from 'vitest';
import { panelsOf, stackOf, type PaneNode } from 'glass-ux/pane-layout';
import { createImageWorkspace } from './image-editor.js';
import { showPane, hidePane } from './workspace-layout.js';

/** A layout's structure without node ids, which a rebuilt split is free to renumber. */
const shape=(node:PaneNode):unknown=>node.type==='stack'?[node.panels,node.active]:{[node.orientation]:node.children.map(shape),sizes:node.sizes};

/** A node with one stack's shown panel changed. */
const withActive=(node:PaneNode,stack:string,active:string):PaneNode=>node.type==='stack'?(node.id===stack?{...node,active}:node):{...node,children:node.children.map(child=>withActive(child,stack,active))};

describe('createImageWorkspace',()=>{
  it('leaves the library out when there is nothing to put in it',()=>{
    expect(panelsOf(createImageWorkspace({library:false}).layout.root)).toEqual(['stage','right','bottom']);
    expect(panelsOf(createImageWorkspace({library:false,filmstrip:false}).layout.root)).toEqual(['stage','right']);
  });
  it('puts the library in a column or a tab, and every default restores a closed pane to the same place',()=>{
    for(const library of ['column','tab'] as const){
      const {layout}=createImageWorkspace({library});
      for(const id of panelsOf(layout.root).filter(id=>id!=='stage')){
        const back=showPane(hidePane(layout,id),id,layout);
        // The pane comes back in place, and as the shown tab of its stack.
        expect(shape(back.root)).toEqual(shape(withActive(layout.root,stackOf(layout.root,id)!.id,id)));
      }
    }
    expect(stackOf(createImageWorkspace({library:'tab'}).layout.root,'left')!.panels).toEqual(['right','left']);
  });
});
