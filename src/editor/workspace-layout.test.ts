import { describe, expect, it } from 'vitest';
import { column, layoutOf, row, sized, stack, stackOf, type PaneLayoutState, type PaneNode } from 'glass-ux/pane-layout';
import { hidePane, isPaneShown, panesIn, showPane, togglePane } from './workspace-layout.js';

/** The layout's shape without ids: stacks as their panels, splits as `row`/`column` with their sizes. */
function shape(node:PaneNode):unknown {
  return node.type==='stack'?node.panels.join('|'):{[node.orientation==='horizontal'?'row':'column']:node.children.map(shape),sizes:node.sizes};
}
const columnDefaults=layoutOf(column(row(sized(stack('left'),'15rem'),stack('stage'),sized(stack('right'),'24rem')),sized(stack('bottom'),'9rem')));
const tabDefaults=layoutOf(column(row(stack('stage'),sized(stack('right','left'),'24rem')),sized(stack('bottom'),'9rem')));

describe('workspace panes',()=>{
  it('hides a pane and puts it back where the default layout has it, at its default size',()=>{
    for(const id of ['left','right','bottom']){
      const hidden=hidePane(columnDefaults,id);
      expect(panesIn(hidden)).not.toContain(id);
      expect(isPaneShown(hidden,id)).toBe(false);
      const shown=showPane(hidden,id,columnDefaults);
      expect(shape(shown.root)).toEqual(shape(columnDefaults.root));
      expect(isPaneShown(shown,id)).toBe(true);
    }
  });
  it('restores every pane in any order after all are closed',()=>{
    let layout:PaneLayoutState=columnDefaults;
    for(const id of ['bottom','left','right'])layout=hidePane(layout,id);
    expect(panesIn(layout)).toEqual(['stage']);
    for(const id of ['right','bottom','left'])layout=showPane(layout,id,columnDefaults);
    expect(shape(layout.root)).toEqual(shape(columnDefaults.root));
  });
  it('a bottom pane spans the full width again, not only the stage',()=>{
    const layout=showPane(hidePane(columnDefaults,'bottom'),'bottom',columnDefaults);
    expect(layout.root.type==='split'&&layout.root.orientation).toBe('vertical');
    expect(shape(layout.root)).toMatchObject({sizes:[1,'9rem']});
  });
  it('a pane whose tab partner is open rejoins that stack in its default place',()=>{
    const hidden=hidePane(tabDefaults,'left');
    expect(stackOf(hidden.root,'right')!.panels).toEqual(['right']);
    const shown=showPane(hidden,'left',tabDefaults);
    expect(stackOf(shown.root,'left')!.panels).toEqual(['right','left']);
    expect(isPaneShown(shown,'left')).toBe(true);
  });
  it('treats a background tab and a collapsed stack as hidden, and shows them without moving them',()=>{
    expect(isPaneShown(tabDefaults,'right')).toBe(true);
    expect(isPaneShown(tabDefaults,'left')).toBe(false);
    const front=togglePane(tabDefaults,'left',tabDefaults);
    expect(isPaneShown(front,'left')).toBe(true);
    expect(stackOf(front.root,'left')!.panels).toEqual(['right','left']);
    const collapsed:PaneLayoutState={...columnDefaults,root:JSON.parse(JSON.stringify(columnDefaults.root).replace('"panels":["left"]','"panels":["left"],"collapsed":true'))};
    expect(isPaneShown(collapsed,'left')).toBe(false);
    expect(isPaneShown(togglePane(collapsed,'left',columnDefaults),'left')).toBe(true);
    const covered={...columnDefaults,maximised:stackOf(columnDefaults.root,'stage')!.id};
    expect(isPaneShown(covered,'left')).toBe(false);
    expect(togglePane(covered,'left',columnDefaults).maximised).toBeUndefined();
  });
  it('a host layout that moved panes keeps its arrangement; the pane goes beside the stage',()=>{
    const host=layoutOf(row(stack('stage'),column(stack('right'),stack('left'))));
    const without=hidePane(host,'left');
    const back=showPane(without,'left',columnDefaults);
    expect(shape(back.root)).toEqual({row:['left','stage','right'],sizes:['15rem',1,1]});
  });
  it('keeps placement and works when there is no stage to measure from',()=>{
    const overlay={...hidePane(columnDefaults,'left'),placement:'overlay' as const};
    expect(showPane(overlay,'left',columnDefaults).placement).toBe('overlay');
    const noStage=layoutOf(row(stack('a'),stack('b')));
    expect(panesIn(showPane(noStage,'left',columnDefaults))).toContain('left');
  });
});
