import { ScrollArea } from 'glass-ux/scroll-area';
import { TruncatedText } from 'glass-ux/truncated-text';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionProvider, ActionContextMenu, defineActions, resolveActions, useActionRunner, useActionShortcuts, usePaletteActions, type ActionDefinition } from 'glass-ux/actions';
import { PaletteProvider, useCommandPalette } from 'glass-ux/command-palette';
import { detectPlatform, matchesShortcut } from 'glass-ux/kbd';
import { KeymapProvider, ShortcutHelpDialog, type Keymap } from 'glass-ux/keymap';
import { Menubar, useMenubarActions } from 'glass-ux/menubar';
import { PaneLayout, column, layoutOf, row, setPlacement, sized, stack, type PaneDefinition, type PaneLayoutState } from 'glass-ux/pane-layout';
import { Button } from 'glass-ux/button';
import { Accordion } from 'glass-ux/accordion';
import { StatusBar } from 'glass-ux/status-bar';
import { Surface } from 'glass-ux/surface';
import { IconSearch, IconUndo, IconRedo } from 'glass-ux/icons';
import { MessagesProvider, useMessages } from 'glass-ux/i18n';
import { useAnnounce, useFocusRegionNavigation } from 'glass-ux/hooks';
import { ImageCanvas, type ImageCanvasProps } from '../canvas/index.js';
import { ImageEditorProvider, imageEditorMessages, useImageEditor, useSessionState, type ImageTool } from '../react/index.js';
import { PhotoEditorStatus } from '../photo-editor/index.js';
import { HistogramPanel } from '../panels/histogram.js';
import { HistoryPanel } from '../panels/history.js';
import { SessionPresetsPanel, type ImagePreset } from '../panels/presets.js';
import { Filmstrip, type OpenPicture } from '../panels/filmstrip.js';
import { workspaceMessages, type WorkspaceMessages } from '../messages/workspace.js';
import type { EditorSession, EditorSessionOptions } from '../session/index.js';
import { BeforeAfter, ToolLabel, ToolRail, ToolSettings } from './parts.js';

/** Serialisable view preferences. Recipes and saved pictures contain none of this data. */
export interface ImageWorkspace {
  /** Docked by default; Focus floats the side panes over a full-width stage, through PaneLayout's overlay placement. */
  mode:'docked'|'focus';
  /** Glass UX's serialisable split/stack layout. */
  layout:PaneLayoutState;
}
/** Every workspace region may be replaced by public parts or host content. */
export interface ImageEditorSlots {
  /** Menus and title row. */
  top?:ReactNode;
  /** Start column: presets, history and layer tools. */
  left?:ReactNode;
  /** End column: histogram, tool rail and settings. */
  right?:ReactNode;
  /** Entire canvas region. */
  stage?:ReactNode;
  /** Overlay inside the canvas, after the active tool. */
  overlay?:ReactNode;
  /** Contextual settings above the develop sections. */
  settings?:ReactNode;
  /** Histogram at the top of the end column. */
  histogram?:ReactNode;
  /** Tool-group strip. */
  tools?:ReactNode;
  /** Bottom filmstrip. */
  bottom?:ReactNode;
  /** Status bar. */
  status?:ReactNode;
}
/** Host-controlled full workspace over an existing session. */
export interface ImageEditorViewProps {
  /** Host owns this session and its lifetime. */
  editor:EditorSession;
  /** Only these tools, sections and layer panels appear. */
  tools:readonly ImageTool[];
  /** Current picture name. */
  title?:ReactNode;
  /** Localised words. */
  labels?:Partial<WorkspaceMessages>;
  /** Controlled workspace; nothing is persisted internally. */
  workspace?:ImageWorkspace;
  /** Uncontrolled initial workspace. */
  defaultWorkspace?:ImageWorkspace;
  /** Completed layout and mode changes; the host may store this value. */
  onWorkspaceChange?:(workspace:ImageWorkspace)=>void;
  /** Key overrides by action id (for example edit.undo or tool.crop); [] disables a binding. */
  shortcuts?:Readonly<Record<string,string|readonly string[]|null>>;
  /** Host-supplied command definitions; matching ids replace built-ins. */
  commands?:readonly ActionDefinition<EditorSession>[];
  /** Host-managed open sessions. */
  pictures?:readonly OpenPicture[];
  /** Current filmstrip picture. */
  selectedPictureId?:string|null;
  /** Reports a filmstrip choice. Host switches editor without disposing other sessions. */
  onSelectedPictureIdChange?:(id:string,picture:OpenPicture)=>void;
  /** Optional host presets. Rendering parts must belong to the supplied tools. */
  presets?:readonly ImagePreset[];
  /** Replacement regions. null intentionally empties a region. */
  slots?:ImageEditorSlots;
  /** Width below which panes use the shared sheet-and-strip layout. Defaults to 64rem. */
  collapseBelow?:`${number}rem`;
  /** Force a renderer; auto chooses the available backend. */
  backend?:ImageCanvasProps['backend'];
  /** Accessible picture name. */
  canvasLabel?:string;
  /** Extra layout class. */
  className?:string;
}
/** Ready-made workspace; callbacks and action overrides follow the public session contract. */
export interface ImageEditorProps extends Omit<EditorSessionOptions,'source'|'tools'>, Omit<ImageEditorViewProps,'editor'> {
  /** Picture URL, blob or tile source. A new source starts a new session. */
  src:EditorSessionOptions['source'];
}
/** Options for {@link createImageWorkspace}. */
export interface ImageWorkspaceOptions {
  /** Include the filmstrip pane. Leave it out when there is one picture and nothing else to show there. Default true. */
  filmstrip?:boolean;
}
/** Default layout is plain data, so hosts may modify or migrate it. */
export function createImageWorkspace({filmstrip=true}:ImageWorkspaceOptions={}):ImageWorkspace {
  const main=row(sized(stack('left'),'15rem'),stack('stage'),sized(stack('right'),'24rem')); // tokens:allow PaneLayout serialises host-controlled pane sizes in rem.
  return {mode:'docked',layout:layoutOf(filmstrip?column(main,sized(stack('bottom'),'9rem')):main)}; // tokens:allow PaneLayout serialises host-controlled pane sizes in rem.
}
const WorkspaceCommands=/* @__PURE__ */ createContext<(id:string)=>void>(()=>{});
const WorkspaceContext=/* @__PURE__ */ createContext<ImageEditorViewProps|null>(null);
function useWorkspace(){return useContext(WorkspaceContext)!;}
function LeftRegion(){
  const {editor,tools,presets=[],slots={},labels}=useWorkspace(),m=useMessages(workspaceMessages,{labels});
  return <div role="group" className="gi-workspace-region" data-workspace-region="" tabIndex={-1} aria-label={m.presets}><ScrollArea orientation="vertical" edges="hairline"><div className="gi-workspace-region-content">{slots.left!==undefined?slots.left:<Accordion.Root multiple defaultValue={['presets','history','layers']}>
    {presets.length>0&&<Accordion.Item value="presets" title={m.presets}><SessionPresetsPanel editor={editor} presets={presets}/></Accordion.Item>}
    <Accordion.Item value="history" title={m.history}><HistoryPanel editor={editor}/></Accordion.Item>
    {tools.filter(t=>t.id==='layers').map(t=><Accordion.Item key={t.id} value="layers" title={m.layers}><ToolSettings tool={t}/></Accordion.Item>)}
  </Accordion.Root>}</div></ScrollArea></div>;
}
function RightRegion(){
  const {tools,editor,slots={},labels}=useWorkspace(),state=useSessionState(editor),m=useMessages(workspaceMessages,{labels});
  const active=tools.find(t=>t.id===state.tool), names=useContext(ToolNames),run=useContext(WorkspaceCommands);
  return <div role="group" className="gi-workspace-region gi-workspace-right" data-workspace-region="" tabIndex={-1} aria-label={m.settings}><ScrollArea orientation="vertical" edges="hairline"><div className="gi-workspace-right-content">{slots.right!==undefined?slots.right:<>
    {slots.histogram!==undefined?slots.histogram:<HistogramPanel/>}
    {slots.tools!==undefined?slots.tools:tools.length<2?null:<ToolRail tools={tools} toolLabels={names} onToolSelect={id=>run(`tool.${id}`)}/>}
    {state.status==='ready'&&<>
      {slots.settings!==undefined?slots.settings:active&&active.group!=='develop'&&active.group!=='effects'&&active.id!=='layers'?<section className="gi-workspace-tool" aria-label={names[active.id]??active.id}><h2 className="gi-workspace-tool-title">{names[active.id]??active.id}</h2><ToolSettings tool={active}/></section>:null}
      {tools.filter(t=>t.group==='develop'||t.group==='effects').map(t=><ToolSettings key={t.id} tool={t}/>)}
    </>}
  </>}</div></ScrollArea></div>;
}
function StageRegion(){
  const {editor,tools,slots={},backend,canvasLabel}=useWorkspace(),state=useSessionState(editor),active=tools.find(t=>t.id===state.tool);
  return <div className="gi-workspace-stage" data-workspace-region="" tabIndex={-1}>{slots.stage!==undefined?slots.stage:<ImageCanvas backend={backend} aria-label={canvasLabel}>{active?.Overlay&&<active.Overlay/>}{state.toolData['workspace.compare']?<BeforeAfter/>:null}{slots.overlay}</ImageCanvas>}</div>;
}
function BottomRegion(){
  const {pictures=[],selectedPictureId,onSelectedPictureIdChange,slots={},labels}=useWorkspace(),m=useMessages(workspaceMessages,{labels});
  return <div role="group" className="gi-workspace-bottom" data-workspace-region="" aria-label={m.filmstrip} tabIndex={-1}>{slots.bottom!==undefined?slots.bottom:<Filmstrip pictures={pictures} selectedId={selectedPictureId} onSelectedIdChange={onSelectedPictureIdChange}/>}</div>;
}
const NO_COMMANDS:readonly ActionDefinition<EditorSession>[]=[];
const ToolNames=/* @__PURE__ */ createContext<Readonly<Record<string,string>>>({});
/** A full workspace made from public parts; no persistence or file transport is implicit. */
export function ImageEditorView(props:ImageEditorViewProps){
  const {editor,tools,shortcuts}=props;
  const keymap=useMemo<Keymap>(()=>Object.fromEntries(Object.entries(shortcuts??{}).map(([id,keys])=>[`imageEditor.${id}`,keys===null?[]:typeof keys==='string'?[keys]:keys])),[shortcuts]);
  useEffect(()=>{editor.registerTools(tools);},[editor,tools]);
  return <MessagesProvider messages={{"imageEditor.workspace":props.labels}}><ImageEditorProvider editor={editor}><ActionProvider><KeymapProvider keymap={keymap}><PaletteProvider><WorkspaceContext.Provider value={props}><Workspace/></WorkspaceContext.Provider></PaletteProvider></KeymapProvider></ActionProvider></ImageEditorProvider></MessagesProvider>;
}
function Workspace(){
  const props=useWorkspace(),{editor,tools,title,labels,slots={},commands=NO_COMMANDS}=props;
  const m=useMessages(workspaceMessages,{labels}),base=useMessages(imageEditorMessages),state=useSessionState(editor);
  const root=useRef<HTMLDivElement>(null),announce=useAnnounce(),palette=useCommandPalette();
  // With a single picture and no host content, an empty "Open pictures" pane would only take space.
  const [own,setOwn]=useState(()=>props.defaultWorkspace??createImageWorkspace({filmstrip:Boolean(props.pictures?.length)||slots.bottom!==undefined})),workspace=props.workspace??own;
  const [help,setHelp]=useState(false),[names,setNames]=useState<Record<string,string>>({});
  const onLabel=useCallback((id:string,label:string)=>setNames(old=>old[id]===label?old:{...old,[id]:label}),[]);
  const change=useCallback((next:ImageWorkspace)=>{if(props.workspace===undefined)setOwn(next);props.onWorkspaceChange?.(next);},[props.workspace,props.onWorkspaceChange]);
  // Glass UX's traversal, without its own key binding: F6 stays an action the host can veto or rebind.
  const regions=useRef<ReturnType<typeof useFocusRegionNavigation>>(null!);
  regions.current=useFocusRegionNavigation({scope:root,selector:'[data-workspace-region]'});
  useEffect(()=>editor.registerActions([
    {id:'view.pan',run:()=>{if(root.current)root.current.dataset.panHeld='';}},
    {id:'workspace.mode',run:(_s,value)=>change({...workspace,mode:value as ImageWorkspace['mode']})},
    {id:'workspace.compare',run:s=>s.setToolData('workspace.compare',!s.state.toolData['workspace.compare'])},
    {id:'workspace.shortcuts',run:()=>setHelp(true)},
    {id:'workspace.commands',run:()=>palette.open()},
    {id:'workspace.nextRegion',run:()=>regions.current.next()}, {id:'workspace.previousRegion',run:()=>regions.current.previous()},
  ]),[editor,change,workspace,palette.open]);
  const targets=useMemo(()=>[editor],[editor]);
  const set=useMemo(()=>{
    const command=(id:string,label:string,shortcut?:string,args?:unknown):ActionDefinition<EditorSession>=>({id,label,group:'manage',shortcut,shortcutTextEntry:id.startsWith('workspace.')||id==='file.save'?'all':'none',shortcutScoped:true,disabledReason:()=>editor.action(id).enabled?null:m.unavailable,visible:()=>editor.action(id).available,run:()=>editor.run(id,args)});
    const builtin=[command('edit.undo',base.undo,'mod+z'),command('edit.redo',base.redo,'mod+shift+z'),command('file.copy',m.copy,'mod+c'),command('file.paste',m.paste,'mod+v'),command('file.save',m.save,'mod+s'),command('workspace.compare',m.compare,'\\'),command('workspace.mode',workspace.mode==='docked'?m.focus:m.docked,undefined,workspace.mode==='docked'?'focus':'docked'),command('workspace.shortcuts',m.shortcuts,'shift+/'),command('workspace.commands',m.commands,'mod+k'),command('workspace.nextRegion',m.nextRegion,'f6'),command('workspace.previousRegion',m.previousRegion,'shift+f6'),command('view.fit',base.fit,'0'),command('view.pan',m.pan,'space'),...tools.map(t=>({id:`tool.${t.id}`,label:names[t.id]??t.label(t.messages?.defaults??base),group:'open' as const,shortcut:({move:'v',crop:'c',transform:'t','retouch.brush':'b','retouch.heal':'h'} as Record<string,string>)[t.id]??(t.id==='text'?'shift+t':t.shortcut),shortcutScoped:true,disabledReason:()=>state.status==='ready'?null:m.unavailable,run:()=>editor.run('tool.select',t.id)}))];
    const overrides=new Map(commands.map(c=>[c.id,c]));
    return defineActions<EditorSession>('imageEditor',[...builtin.map(c=>overrides.get(c.id)??c),...commands.filter(c=>!builtin.some(b=>b.id===c.id))]);
  },[editor,base,m,workspace.mode,tools,names,commands,state.status,state.canUndo,state.canRedo,state.dirty,state.save]);
  useActionShortcuts(set,targets,m.workspace,{scope:root,context:'imageEditor'});
  usePaletteActions(set,targets,typeof title==='string'?title:m.workspace);
  const menu=useMenubarActions(set,targets),runner=useActionRunner();
  const resolved=resolveActions(set,targets,'header').flatMap(group=>group.actions);
  const labelFor=(id:string,fallback:string)=>resolved.find(action=>action.id===id)?.label??fallback;
  const run=(id:string)=>{const action=resolved.find(a=>a.id===id);if(action&&!action.disabledReason)runner.start(action,targets,'header');};
  const button=(id:string,icon?:ReactNode)=>{const action=resolved.find(a=>a.id===id);return action?<Button key={id} size="sm" variant={id==='file.save'?'primary':icon?'ghost':'secondary'} icon={icon} aria-label={action.label} disabledReason={action.disabledReason??undefined} onClick={()=>run(id)}>{icon?null:action.label}</Button>:null;};
  // The mode is the source of truth for placement, so a host's saved layout from either mode shows correctly.
  const shownLayout=useMemo(()=>setPlacement(workspace.layout,workspace.mode==='focus'?'overlay':'docked'),[workspace.layout,workspace.mode]);
  const panel=useCallback((id:string):PaneDefinition|null=>({
    left:{title:m.library,component:LeftRegion,minSize:'12rem' as const},stage:{title:typeof title==='string'?title:m.workspace,component:StageRegion,primary:true,movable:false,closable:false,minSize:'12rem' as const,whenHidden:'run' as const},right:{title:m.develop,component:RightRegion,minSize:'16rem' as const},bottom:{title:m.filmstrip,component:BottomRegion,minSize:'4rem' as const}, // tokens:allow PaneLayout serialises host-controlled pane sizes in rem.
  }[id]??null),[m,title]);
  const previous=useRef(state.tool);
  useEffect(()=>{if(previous.current!==state.tool&&state.tool){announce(base.toolSelected(names[state.tool]??state.tool));previous.current=state.tool;}},[state.tool,names,announce,base]);
  // Motion state writes an attribute, and tells PaneLayout once at a gesture's start and end, never per pointer
  // frame; floating panes then drop their blur. A quiet period also covers wheel zoom.
  const [moving,setMoving]=useState(false);
  useEffect(()=>{
    const element=root.current!;let timer:ReturnType<typeof setTimeout>|undefined;
    const stop=()=>{if(element.hasAttribute('data-pixels-moving')){delete element.dataset.pixelsMoving;setMoving(false);}};
    const start=()=>{clearTimeout(timer);if(!element.hasAttribute('data-pixels-moving')){element.dataset.pixelsMoving='';setMoving(true);}};
    const wheel=()=>{start();timer=setTimeout(stop,160);};
    const end=()=>{clearTimeout(timer);stop();};
    const keydown=(event:KeyboardEvent)=>{
      if(!(event.target as Element).closest('.gi-stage')||(event.target as Element).closest('input,textarea,select,[contenteditable=true]'))return;
      // Hold gestures have a release phase that command keymaps deliberately do not own.
      // The shared matcher handles the host's binding; the public canvas overlay marker frees the pointer to pan.
      const override=props.shortcuts?.['view.pan'];
      const bindings=override===undefined?['space']:override===null?[]:typeof override==='string'?[override]:override;
      const held=bindings.some(binding=>matchesShortcut(event,binding,detectPlatform()));
      if(event.code==='Space'&&override!==undefined&&!held){event.preventDefault();event.stopPropagation();return;}
      if(held){element.dataset.panHeld='';wheel();}
      else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(event.key))wheel();
    };
    const release=()=>{delete element.dataset.panHeld;end();};
    element.addEventListener('keydown',keydown,true);element.addEventListener('pointerdown',start,true);element.addEventListener('wheel',wheel,{passive:true});window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('keyup',release);window.addEventListener('blur',release);
    return ()=>{release();element.removeEventListener('keydown',keydown,true);element.removeEventListener('pointerdown',start,true);element.removeEventListener('wheel',wheel);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('keyup',release);window.removeEventListener('blur',release);};
  },[props.shortcuts]);
  return <WorkspaceCommands.Provider value={run}><ToolNames.Provider value={{...names,...Object.fromEntries(resolved.filter(action=>action.id.startsWith('tool.')).map(action=>[action.id.slice(5),action.label]))}}><div ref={root} className={['gi-image-editor',props.className].filter(Boolean).join(' ')} data-workspace={workspace.mode} aria-label={m.workspace}>
    {tools.map(t=><ToolLabel key={t.id} tool={t} onLabel={onLabel}/>)}
    <Surface as="header" material="chrome" radius="surface" className="gi-workspace-top" data-workspace-region="" tabIndex={-1}>{slots.top!==undefined?slots.top:<>
      <Menubar aria-label={m.workspace} menus={[{id:'file',label:m.file,items:['file.save','file.copy','file.paste',...tools.filter(t=>t.group==='files').map(t=>`tool.${t.id}`)].map(menu.item)},{id:'edit',label:m.edit,items:['edit.undo','edit.redo',...tools.filter(t=>t.group!=='files').map(t=>`tool.${t.id}`)].map(menu.item)},{id:'view',label:m.view,items:['workspace.mode','workspace.compare','view.fit'].map(menu.item)},{id:'help',label:m.help,items:['workspace.commands','workspace.shortcuts'].map(menu.item)}]}/>
      <TruncatedText className="gi-workspace-title">{title}</TruncatedText>
      <div className="gi-workspace-actions">
        {button('edit.undo',<IconUndo/>)}
        {button('edit.redo',<IconRedo/>)}
        {button('workspace.commands',<IconSearch/>)}
        {(editor.savable||tools.some(t=>t.id==='files.export'))&&<span className="gi-workspace-divider" aria-hidden="true"/>}
        {tools.find(t=>t.id==='files.export')&&button('tool.files.export')}
        {editor.savable&&button('file.save')}
      </div>
    </>}</Surface>
    <ActionContextMenu set={set} targets={targets} label={m.workspace}><div className="gi-workspace-body" tabIndex={-1}><PaneLayout className="gi-workspace-panes" panel={panel} layout={shownLayout} moving={moving} onLayoutChange={layout=>change({...workspace,layout})} storageKey={null} collapseBelow={props.collapseBelow??"64rem"}/></div></ActionContextMenu> {/* tokens:allow PaneLayout serialises rem breakpoints. */}
    {slots.status!==undefined?slots.status:<StatusBar aria-label={m.workspace}><StatusBar.Start><PhotoEditorStatus/></StatusBar.Start><StatusBar.End><StatusBar.Item><Button variant="ghost" size="xs" aria-label={labelFor('workspace.compare',m.compare)} aria-pressed={!!state.toolData['workspace.compare']} onClick={()=>run('workspace.compare')}>{labelFor('workspace.compare',m.compare)}</Button></StatusBar.Item><StatusBar.Item><Button variant="ghost" size="xs" aria-label={labelFor('workspace.mode',workspace.mode==='docked'?m.focus:m.docked)} onClick={()=>run('workspace.mode')}>{labelFor('workspace.mode',workspace.mode==='docked'?m.focus:m.docked)}</Button></StatusBar.Item></StatusBar.End></StatusBar>}
    <ShortcutHelpDialog title={m.shortcuts} open={help} onOpenChange={setHelp}/>
  </div></ToolNames.Provider></WorkspaceCommands.Provider>;
}
/** Own a session for one source, or use ImageEditorView for a host-owned collection. */
export function ImageEditor({src,tools,...props}:ImageEditorProps){
  const editor=useImageEditor({...props,source:src,tools});
  return <ImageEditorView {...props} editor={editor} tools={tools}/>;
}
