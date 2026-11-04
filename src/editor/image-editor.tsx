import { ScrollArea } from 'glass-ux/scroll-area';
import { TruncatedText } from 'glass-ux/truncated-text';
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionProvider, ActionContextMenu, defineActions, resolveActions, useActionRunner, usePaletteActions, type ActionDefinition } from 'glass-ux/actions';
import { PaletteProvider, useCommandPalette } from 'glass-ux/command-palette';
import { detectPlatform, matchesShortcut } from 'glass-ux/kbd';
import { KeymapProvider, ShortcutHelpDialog, type Keymap } from 'glass-ux/keymap';
import { Menubar, useMenubarActions } from 'glass-ux/menubar';
import { PaneLayout, column, layoutOf, row, setPlacement, sized, stack, type PaneDefinition, type PaneLayoutState } from 'glass-ux/pane-layout';
import { Button } from 'glass-ux/button';
import { Accordion } from 'glass-ux/accordion';
import { StatusBar } from 'glass-ux/status-bar';
import { Surface } from 'glass-ux/surface';
import { Popover } from 'glass-ux/popover';
import type { IconComponent, IconProps } from 'glass-ux/icon';
import { IconSearch, IconUndo, IconRedo, IconHistory, IconCopy, IconClipboard, IconSave, IconKeyboard, IconColumns, IconSplitHorizontal, IconFullscreen, IconFullscreenExit, IconFitWidth, IconZoom, IconZoomIn, IconZoomOut, IconLayers, IconArrowDown, IconChevronUp, IconChevronDown } from 'glass-ux/icons';
import { MessagesProvider, useMessages } from 'glass-ux/i18n';
import { useAnnounce, useElementSize, useFocusRegionNavigation } from 'glass-ux/hooks';
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
import { PHOTOSHOP_COMMAND_KEYS, keysFor, toolKeys, useEditorShortcuts, type DeclaredShortcut } from './shortcuts.js';
import { geometryMessages } from '../messages/geometry.js';
import { isPaneShown, togglePane } from './workspace-layout.js';

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
  /**
   * Where the library (presets and layers) goes: its own column at the start, or a tab beside the
   * develop pane, which leaves the picture the width of that column. `false` leaves it out, for a
   * workspace with nothing to put there. Default `column`.
   */
  library?:'column'|'tab'|false;
}
/** Below this width, in rem, the uncontrolled default puts the library in a tab so the stage stays wide. */
const LIBRARY_COLUMN_MIN=72;
/** Default layout is plain data, so hosts may modify or migrate it. */
export function createImageWorkspace({filmstrip=true,library='column'}:ImageWorkspaceOptions={}):ImageWorkspace {
  const main=library===false?row(stack('stage'),sized(stack('right'),'24rem')):library==='tab'?row(stack('stage'),sized(stack('right','left'),'24rem')):row(sized(stack('left'),'15rem'),stack('stage'),sized(stack('right'),'24rem')); // tokens:allow PaneLayout serialises host-controlled pane sizes in rem.
  return {mode:'docked',layout:layoutOf(filmstrip?column(main,sized(stack('bottom'),'9rem')):main)}; // tokens:allow PaneLayout serialises host-controlled pane sizes in rem.
}
const WorkspaceCommands=/* @__PURE__ */ createContext<(id:string)=>void>(()=>{});
const WorkspaceContext=/* @__PURE__ */ createContext<ImageEditorViewProps|null>(null);
function useWorkspace(){return useContext(WorkspaceContext)!;}
function LeftRegion(){
  const {editor,tools,presets=[],slots={},labels}=useWorkspace(),m=useMessages(workspaceMessages,{labels});
  return <div role="group" className="gi-workspace-region" data-workspace-region="" tabIndex={-1} aria-label={m.presets}><ScrollArea orientation="vertical" edges="hairline"><div className="gi-workspace-region-content">{slots.left!==undefined?slots.left:<Accordion.Root multiple defaultValue={['presets','layers']}>
    {presets.length>0&&<Accordion.Item value="presets" title={m.presets}><SessionPresetsPanel editor={editor} presets={presets}/></Accordion.Item>}
    {tools.filter(t=>t.id==='layers').map(t=><Accordion.Item key={t.id} value="layers" title={m.layers}><ToolSettings tool={t}/></Accordion.Item>)}
  </Accordion.Root>}</div></ScrollArea></div>;
}
function RightRegion(){
  const {tools,editor,slots={},labels}=useWorkspace(),state=useSessionState(editor),m=useMessages(workspaceMessages,{labels});
  const active=tools.find(t=>t.id===state.tool), names=useContext(ToolNames),run=useContext(WorkspaceCommands);
  // The histogram and the tool rail stay at the top; only the settings under them scroll.
  const histogram=slots.right!==undefined?null:slots.histogram!==undefined?slots.histogram:<HistogramPanel/>;
  const rail=slots.right!==undefined?null:slots.tools!==undefined?slots.tools:tools.length<2?null:<ToolRail tools={tools} toolLabels={names} layout="wrap" onToolSelect={id=>run(`tool.${id}`)}/>;
  return <div role="group" className="gi-workspace-region gi-workspace-right" data-workspace-region="" tabIndex={-1} aria-label={m.settings}>
    {(histogram||rail)&&<div className="gi-workspace-right-head">{histogram}{rail}</div>}
    <ScrollArea className="gi-workspace-right-scroll" orientation="vertical" edges="hairline"><div className="gi-workspace-right-content">{slots.right!==undefined?slots.right:<>
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
/** View commands belong in menus, the palette and the title bar, not in the picture's context menu. */
const VIEW_SURFACES=['menu','header','palette'] as const;
/** Glass UX's icons for the built-in commands; a tool's command takes the tool's own icon. */
const COMMAND_ICONS:Readonly<Record<string,IconComponent>>={'edit.undo':IconUndo,'edit.redo':IconRedo,'file.copy':IconCopy,'file.paste':IconClipboard,'file.save':IconSave,'workspace.compare':IconSplitHorizontal,'workspace.shortcuts':IconKeyboard,'workspace.commands':IconSearch,'workspace.history':IconHistory,'workspace.resetLayout':IconColumns,'view.fit':IconFitWidth,'view.zoomIn':IconZoomIn,'view.zoomOut':IconZoomOut,'view.actualSize':IconZoom,'layers.duplicate':IconCopy,'layers.mergeDown':IconArrowDown,'layers.mergeVisible':IconLayers,'layers.selectAbove':IconChevronUp,'layers.selectBelow':IconChevronDown};
const toolIcons=/* @__PURE__ */ new WeakMap<ImageTool,IconComponent>();
/** A tool's icon node as an action icon, so menus and the palette show the same picture as the rail. */
function toolIcon(tool:ImageTool):IconComponent|undefined {
  if(!tool.icon)return undefined;
  let icon=toolIcons.get(tool);
  if(!icon){const node=tool.icon;icon=Object.assign((props:IconProps)=>isValidElement(node)?cloneElement(node,props):node,{iconName:`image-tool-${tool.id}`});toolIcons.set(tool,icon);}
  return icon;
}
/** The workspace's panes the View menu shows and hides, by action id, with the layout's panel id. */
type PaneCommand=readonly [action:string,panel:string,label:string];
const ToolNames=/* @__PURE__ */ createContext<Readonly<Record<string,string>>>({});
/** A full workspace made from public parts; no persistence or file transport is implicit. */
export function ImageEditorView(props:ImageEditorViewProps){
  const {editor,tools,shortcuts}=props;
  // Tool keys are applied where the workspace groups them (Shift cycles a group), so they stay out of the keymap.
  const keymap=useMemo<Keymap>(()=>Object.fromEntries(Object.entries(shortcuts??{}).filter(([id])=>!id.startsWith('tool.')).map(([id,keys])=>[`imageEditor.${id}`,keys===null?[]:typeof keys==='string'?[keys]:keys])),[shortcuts]);
  useEffect(()=>{editor.registerTools(tools);},[editor,tools]);
  return <MessagesProvider messages={{"imageEditor.workspace":props.labels}}><ImageEditorProvider editor={editor}><ActionProvider><KeymapProvider keymap={keymap}><PaletteProvider><WorkspaceContext.Provider value={props}><Workspace/></WorkspaceContext.Provider></PaletteProvider></KeymapProvider></ActionProvider></ImageEditorProvider></MessagesProvider>;
}
function Workspace(){
  const props=useWorkspace(),{editor,tools,title,labels,slots={},commands=NO_COMMANDS}=props;
  const m=useMessages(workspaceMessages,{labels}),base=useMessages(imageEditorMessages),g=useMessages(geometryMessages),state=useSessionState(editor);
  const root=useRef<HTMLDivElement>(null),announce=useAnnounce(),palette=useCommandPalette();
  // With a single picture and no host content, an empty "Open pictures" pane would only take space.
  // With neither a controlled nor a default workspace, the box picks the layout (R7.2) until someone changes it.
  const filmstrip=Boolean(props.pictures?.length)||slots.bottom!==undefined;
  // History has its own popover, so the library holds presets and layers; with neither, it is left out.
  const library=slots.left!==undefined?slots.left!==null:Boolean(props.presets?.length)||tools.some(t=>t.id==='layers');
  const automatic=useRef(props.workspace===undefined&&props.defaultWorkspace===undefined);
  const [own,setOwn]=useState(()=>props.defaultWorkspace??createImageWorkspace({filmstrip,library:library?'column':false})),workspace=props.workspace??own;
  const {width:rootWidth}=useElementSize(root);
  useEffect(()=>{
    if(!automatic.current||!rootWidth)return;
    const rem=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
    const next=createImageWorkspace({filmstrip,library:!library?false:rootWidth<LIBRARY_COLUMN_MIN*rem?'tab':'column'});
    setOwn(old=>JSON.stringify(old.layout)===JSON.stringify(next.layout)?old:{...old,layout:next.layout});
  },[rootWidth,filmstrip,library]);
  /** Where Reset layout returns to, and where a closed pane comes back: the host's default, or the one for this width. */
  const defaultLayout=useCallback(()=>{
    if(props.defaultWorkspace)return props.defaultWorkspace.layout;
    const rem=parseFloat(getComputedStyle(document.documentElement).fontSize)||16,width=root.current?.offsetWidth??0;
    return createImageWorkspace({filmstrip,library:!library?false:width&&width<LIBRARY_COLUMN_MIN*rem?'tab':'column'}).layout;
  },[props.defaultWorkspace,filmstrip,library]);
  const panes=useMemo<readonly PaneCommand[]>(()=>[...(library?[['workspace.library','left',m.library] as const]:[]),['workspace.develop','right',m.develop] as const,...(filmstrip?[['workspace.filmstrip','bottom',m.filmstrip] as const]:[])],[library,filmstrip,m]);
  const [historyOpen,setHistoryOpen]=useState(false),historyButton=useRef<HTMLButtonElement>(null);
  // The History button hides in a narrow title bar; the popover then opens from the bar itself.
  const historyAnchor=useCallback(()=>{const button=historyButton.current;return button&&button.offsetParent!==null?button:root.current?.querySelector<HTMLElement>('.gi-workspace-top')??null;},[]);
  const historyReturn=useCallback(()=>{const button=historyButton.current;return button&&button.offsetParent!==null?button:root.current?.querySelector<HTMLElement>('.gi-stage')??true;},[]);
  const [help,setHelp]=useState(false),[names,setNames]=useState<Record<string,string>>({});
  const onLabel=useCallback((id:string,label:string)=>setNames(old=>old[id]===label?old:{...old,[id]:label}),[]);
  const change=useCallback((next:ImageWorkspace)=>{if(next.layout!==workspace.layout)automatic.current=false;if(props.workspace===undefined)setOwn(next);props.onWorkspaceChange?.(next);},[props.workspace,props.onWorkspaceChange,workspace.layout]);
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
    {id:'workspace.history',run:()=>setHistoryOpen(true)},
    {id:'workspace.resetLayout',run:()=>{change({...workspace,layout:defaultLayout()});automatic.current=props.workspace===undefined&&props.defaultWorkspace===undefined;}},
    ...panes.map(([id,panel])=>({id,run:()=>change({...workspace,layout:togglePane(workspace.layout,panel,defaultLayout())})})),
  ]),[editor,change,workspace,palette.open,panes,defaultLayout,props.workspace,props.defaultWorkspace]);
  const targets=useMemo(()=>[editor],[editor]);
  // Layer commands are enabled by the chosen layer; read here so the set follows it without following each drag frame.
  const selection=state.toolData['layers.selectedId'];
  const set=useMemo(()=>{
    // While typing, only keys a field cannot mean as text (a modifier chord or a function key) run commands;
    // a plain letter such as Focus's F, or \ and ?, stays a character.
    const inText=(id:string)=>{const keys=props.shortcuts?.[id]===undefined?PHOTOSHOP_COMMAND_KEYS[id]:props.shortcuts[id];const list=keys==null?[]:typeof keys==='string'?[keys]:keys;return list.length>0&&list.every(k=>/^(mod|ctrl|alt|meta)\+|^(shift\+)?f\d{1,2}$/i.test(k));};
    const command=(id:string,label:string,shortcut?:string,args?:unknown):ActionDefinition<EditorSession>=>({id,label,group:'manage',shortcut,shortcutTextEntry:inText(id)?'all':'none',shortcutScoped:true,disabledReason:()=>editor.action(id).enabled?null:m.unavailable,visible:()=>editor.action(id).available,run:()=>editor.run(id,args)});
    // Photoshop's keys (shortcuts.ts); the first of each list is the one menus show.
    const key=(id:string)=>PHOTOSHOP_COMMAND_KEYS[id]?.[0];
    const keyed=(id:string,label:string,args?:unknown)=>command(id,label,key(id),args);
    const builtin=[keyed('edit.undo',base.undo),keyed('edit.redo',base.redo),keyed('file.copy',m.copy),keyed('file.paste',m.paste),keyed('file.save',m.save),keyed('workspace.compare',m.compare),keyed('workspace.mode',workspace.mode==='docked'?m.focus:m.docked,workspace.mode==='docked'?'focus':'docked'),keyed('workspace.shortcuts',m.shortcuts),keyed('workspace.commands',m.commands),keyed('workspace.nextRegion',m.nextRegion),keyed('workspace.previousRegion',m.previousRegion),keyed('view.fit',base.fit),keyed('view.actualSize',base.actualSize),keyed('view.zoomIn',base.zoomIn),keyed('view.zoomOut',base.zoomOut),keyed('view.pan',m.pan),
      // Layer and brush commands appear when a tool registers them: Select and Layers bring the layer ones, the brushes theirs.
      keyed('layers.duplicate',g.duplicateLayer,{label:g.duplicateLayer}),keyed('layers.mergeDown',g.mergeDown,{label:g.mergeDown}),keyed('layers.mergeVisible',g.mergeVisible,{label:g.mergeVisible}),keyed('layers.selectAbove',g.selectAbove),keyed('layers.selectBelow',g.selectBelow),
      keyed('brush.smaller',g.brushSmaller),keyed('brush.larger',g.brushLarger),keyed('brush.softer',g.brushSofter),keyed('brush.harder',g.brushHarder),
      ...tools.map(t=>({id:`tool.${t.id}`,label:names[t.id]??t.label(t.messages?.defaults??base),group:'open' as const,shortcut:toolKeys(t.id,t.shortcut)[0],shortcutScoped:true,disabledReason:()=>state.status==='ready'?null:m.unavailable,run:()=>editor.run('tool.select',t.id)}))];
    const view=[command('workspace.history',m.history),...panes.map(([id,panel,label])=>command(id,isPaneShown(workspace.layout,panel)?m.hidePane(label):m.showPane(label))),command('workspace.resetLayout',m.resetLayout)].map(c=>({...c,surfaces:VIEW_SURFACES}));
    const iconFor=(id:string)=>{const tool=tools.find(t=>`tool.${t.id}`===id);return id==='workspace.mode'?(workspace.mode==='docked'?IconFullscreen:IconFullscreenExit):COMMAND_ICONS[id]??(tool?toolIcon(tool):undefined);};
    const own=[...builtin,...view].map((c:ActionDefinition<EditorSession>)=>c.icon?c:{...c,icon:iconFor(c.id)});
    const overrides=new Map(commands.map(c=>[c.id,c]));
    return defineActions<EditorSession>('imageEditor',[...own.map(c=>overrides.get(c.id)??c),...commands.filter(c=>!own.some(b=>b.id===c.id))]);
  },[editor,base,m,g,workspace.mode,workspace.layout,panes,tools,names,commands,state.status,state.canUndo,state.canRedo,state.dirty,state.save,state.tool,selection,state.recipe.layers,props.shortcuts]);
  // Keys in the help dialog's sections, in Photoshop's order of concerns.
  const shortcutGroup=useCallback((id:string)=>id.startsWith('tool.')?base.tools:id.startsWith('layers.')?m.layers:id.startsWith('brush.')?g.brushes:id.startsWith('view.')?m.view:id==='workspace.shortcuts'||id==='workspace.commands'?m.help:id.startsWith('workspace.')?m.view:id.startsWith('file.')?m.file:m.edit,[base,m,g]);
  const shortcutDefaults=useCallback((id:string,shortcut?:string)=>{
    if(id.startsWith('tool.'))return keysFor(id,shortcut?[shortcut]:[],props.shortcuts);
    const table=PHOTOSHOP_COMMAND_KEYS[id];
    return shortcut===undefined?[]:table?.[0]===shortcut?table:[shortcut];
  },[props.shortcuts]);
  // The Select tool handles these keys on the canvas itself; declared, they show in help and a keymap can rebind them.
  const declared=useMemo<readonly DeclaredShortcut[]>(()=>tools.some(t=>t.id==='select')?[
    {id:'imageEditor.layers.delete',label:g.deleteLayer,group:m.layers,keys:PHOTOSHOP_COMMAND_KEYS['layers.delete']!},
    {id:'imageEditor.layers.deselect',label:g.deselect,group:m.layers,keys:PHOTOSHOP_COMMAND_KEYS['layers.deselect']!},
    {id:'imageEditor.layers.nudge',label:g.nudge,group:m.layers,keys:['arrowleft','arrowright','arrowup','arrowdown'],rebindable:false},
  ]:[],[tools,g,m]);
  useEditorShortcuts(set,targets,{scope:root,context:'imageEditor',group:shortcutGroup,tool:state.tool,declared,defaults:shortcutDefaults});
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
  // Panes are toggles that name the pane, as an application's Window menu does; the layout is the state.
  const viewItems=[...['workspace.mode','workspace.compare'].map(menu.item),{kind:'separator' as const,id:'view.zoom'},...['view.zoomIn','view.zoomOut','view.fit','view.actualSize'].map(menu.item),{kind:'separator' as const,id:'view.panes'},
    ...panes.map(([id,panel,label])=>{const action=resolved.find(a=>a.id===id);return action?{kind:'check' as const,id,label,checked:isPaneShown(workspace.layout,panel),disabledReason:action.disabledReason,onCheckedChange:()=>run(id)}:null;}),
    menu.item('workspace.history'),{kind:'separator' as const,id:'view.layout'},menu.item('workspace.resetLayout')];
  const historyLabel=labelFor('workspace.history',m.history);
  const historyPopup=<Popover.Popup title={historyLabel} align="end" anchor={historyAnchor} finalFocus={historyReturn} className="gi-workspace-history"><ScrollArea className="gi-workspace-history-scroll" orientation="vertical" edges="hairline"><HistoryPanel editor={editor} labels={labels}/></ScrollArea></Popover.Popup>;
  return <WorkspaceCommands.Provider value={run}><ToolNames.Provider value={{...names,...Object.fromEntries(resolved.filter(action=>action.id.startsWith('tool.')).map(action=>[action.id.slice(5),action.label]))}}><div ref={root} className={['gi-image-editor',props.className].filter(Boolean).join(' ')} data-workspace={workspace.mode} aria-label={m.workspace}>
    {tools.map(t=><ToolLabel key={t.id} tool={t} onLabel={onLabel}/>)}
    <Surface as="header" material="chrome" radius="surface" className="gi-workspace-top" data-workspace-region="" tabIndex={-1}>{slots.top!==undefined?slots.top:<>
      <Menubar aria-label={m.workspace} menus={[{id:'file',label:m.file,items:['file.save','file.copy','file.paste',...tools.filter(t=>t.group==='files').map(t=>`tool.${t.id}`)].map(menu.item)},{id:'edit',label:m.edit,items:['edit.undo','edit.redo',...tools.filter(t=>t.group!=='files').map(t=>`tool.${t.id}`)].map(menu.item)},{id:'view',label:m.view,items:viewItems},...(tools.some(t=>t.id==='layers'||t.id==='select')?[{id:'layer',label:g.layer,items:['layers.duplicate','layers.mergeDown','layers.mergeVisible','layers.selectAbove','layers.selectBelow'].map(menu.item)}]:[]),{id:'help',label:m.help,items:['workspace.commands','workspace.shortcuts'].map(menu.item)}]}/>
      <TruncatedText className="gi-workspace-title">{title}</TruncatedText>
      <div className="gi-workspace-actions">
        {button('edit.undo',<IconUndo/>)}
        {button('edit.redo',<IconRedo/>)}
        {resolved.some(a=>a.id==='workspace.history')&&<Popover.Root open={historyOpen} onOpenChange={setHistoryOpen}><Popover.Trigger ref={historyButton} render={<Button size="sm" variant="ghost" icon={<IconHistory/>} aria-label={historyLabel}/>}/>{historyPopup}</Popover.Root>}
        {button('workspace.commands',<IconSearch/>)}
        {(editor.savable||tools.some(t=>t.id==='files.export'))&&<span className="gi-workspace-divider" aria-hidden="true"/>}
        {tools.find(t=>t.id==='files.export')&&button('tool.files.export')}
        {editor.savable&&button('file.save')}
      </div>
    </>}</Surface>
    {slots.top!==undefined&&<Popover.Root open={historyOpen} onOpenChange={setHistoryOpen}>{historyPopup}</Popover.Root>}
    <ActionContextMenu set={set} targets={targets} label={m.workspace}><div className="gi-workspace-body" tabIndex={-1}><PaneLayout className="gi-workspace-panes" panel={panel} layout={shownLayout} moving={moving} onLayoutChange={layout=>change({...workspace,layout})} storageKey={null} collapseBelow={props.collapseBelow??"64rem"}/></div></ActionContextMenu> {/* tokens:allow PaneLayout serialises rem breakpoints. */}
    {slots.status!==undefined?slots.status:<StatusBar aria-label={m.workspace}><StatusBar.Start><PhotoEditorStatus/></StatusBar.Start><StatusBar.End><StatusBar.Item><Button variant="ghost" size="xs" aria-label={labelFor('workspace.compare',m.compare)} aria-pressed={!!state.toolData['workspace.compare']} onClick={()=>run('workspace.compare')}>{labelFor('workspace.compare',m.compare)}</Button></StatusBar.Item><StatusBar.Item><Button variant="ghost" size="xs" aria-label={labelFor('workspace.mode',workspace.mode==='docked'?m.focus:m.docked)} onClick={()=>run('workspace.mode')}>{labelFor('workspace.mode',workspace.mode==='docked'?m.focus:m.docked)}</Button></StatusBar.Item></StatusBar.End></StatusBar>}
    <ShortcutHelpDialog title={m.shortcuts} open={help} onOpenChange={setHelp} groupOrder={[base.tools,m.edit,m.layers,g.brushes,m.view,m.file,m.help]}/>
  </div></ToolNames.Provider></WorkspaceCommands.Provider>;
}
/** Own a session for one source, or use ImageEditorView for a host-owned collection. */
export function ImageEditor({src,tools,...props}:ImageEditorProps){
  const editor=useImageEditor({...props,source:src,tools});
  return <ImageEditorView {...props} editor={editor} tools={tools}/>;
}
