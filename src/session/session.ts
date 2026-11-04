import { abortable, retryRead } from "../core/async.js";
import {
  clampCrop,
  createImageDocument,
  flipGeometry,
  geometrySize,
  geometrySource,
  canvasSource,
  rotateGeometry,
  TileCache,
  TileCacheBudget,
  turnedSize,
  type Filter,
  type Geometry,
  type ImageDocument,
  type LayerFilter,
  type Rect,
  type Size,
  type TileSource,
} from "../core/index.js";
import { encodeImage, openImage, type EncodeOptions, type ImageInput, type OpenImageOptions } from "../io/index.js";
import { composeDocument, CpuBackend, type Renderer, type RenderBackend } from "../render/index.js";

export { EMPTY_RECIPE, normaliseRecipe, recipesEqual, type EditRecipe, type NormalisedRecipe, type Stroke, type StrokePoint } from "./recipe.js";
import { EMPTY_RECIPE, normaliseRecipe, recipesEqual, type EditRecipe } from "./recipe.js";
import type { OpenedImage } from "../io/open-image.js";
import type { SourceStage } from "./source-stage.js";
import { AssetStore, imageLayerKind, geometryMapping, warpSource, rectQuad, homography, workSize, createPixels, halve, coarsestLevel, maskFillSource, maskedSource, type LayerKind, type LayerMask, type LayerSpec, type Mapping, type PixelBuffer, type Warp } from "../core/index.js";
const same = recipesEqual;

/** Options for an atomic history entry, including an optional replacement base. */
export interface CommitOptions {
  /** Host-visible history label. */
  label?: string;
  /** Decoded replacement base. Undo/redo restore it alongside the recipe. */
  source?: OpenedImage;
}

/** One layer's sources in its own pixels: staged pixels, staged mask coverage, and what is composed. */
export interface LayerParts {
  readonly spec: LayerSpec;
  /** The layer's pixels after any stages, before its mask. */
  readonly pixels: TileSource;
  /** The mask's coverage in alpha, or null for a layer without a mask. Present while disabled. */
  readonly mask: TileSource | null;
  /** What composes: pixels times an enabled mask. */
  readonly composite: TileSource;
}

/** A labelled edit in a persistent branching history. */
export interface HistoryNode { readonly id: string; readonly parent: string | null; readonly children: readonly string[]; readonly label: string; readonly recipe: EditRecipe }
export interface SessionHistory { readonly nodes: readonly HistoryNode[]; readonly current: HistoryNode }

/** The finished picture, handed to `onSave`. Nothing is rendered until the host asks. */
export interface EditResult {
  /** Size of the edited picture, in pixels. */
  width: number;
  height: number;
  /** Committed serialisable edit captured for this result. */
  recipe: EditRecipe;
  /** Render and encode this committed snapshot. Encoding starts only when called. */
  toBlob(options?: EncodeOptions & ExportOptions): Promise<Blob>;
}

export interface ExportOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** Passed to `onSave` beside the result, as in `EditableAvatar`. */
export interface SaveContext {
  signal: AbortSignal;
  /** Report upload progress from 0 to 1, or null when it cannot be known. */
  setProgress: (fraction: number | null) => void;
}

export interface ActionRequest {
  id: string;
  args?: unknown;
}

/** Add an action, or replace or hide a built-in one by using its id. */
export interface ActionOverride {
  id: string;
  run?: (session: EditorSession, args?: unknown) => unknown;
  enabled?: (session: EditorSession) => boolean;
  hidden?: boolean;
}

export interface EditorSessionOptions {
  /** A file, blob, URL or tile source. */
  source: ImageInput;
  /** An earlier edit to continue from. */
  recipe?: EditRecipe;
  /** Host-owned decoded assets, shared with project adapters. */
  assets?: AssetStore;
  /** Tools to offer. The first is selected when the picture opens. */
  tools?: readonly SessionTool[];
  /** Filters beyond those the tools bring, in the order they apply. */
  filters?: readonly (Filter<any> | Warp<any>)[];
  /** Opt-in source stages that replay before geometry and filters. */
  stages?: readonly SourceStage[];
  /** Opt-in source providers for recipe layer kinds. */
  layerKinds?: readonly LayerKind[];
  /** Host action overrides; matching ids replace or hide built-ins. */
  actions?: readonly ActionOverride[];
  /** Runs for every action. Call `next` to let it go ahead, or don't to stop it. */
  onAction?: (action: ActionRequest, next: (args?: unknown) => unknown) => unknown;
  /** Receive the lazy edited result and cancellable delivery context. No storage occurs without this callback. */
  onSave?: (result: EditResult, context: SaveContext) => unknown;
  /** Explicit export delivery. The host decides whether to download, upload or persist it. */
  onExport?: (blob: Blob, context: SaveContext) => unknown;
  /** Called when the host cancellation action runs. */
  onCancel?: () => void;
  /** Called with each committed change. */
  onChange?: (recipe: EditRecipe) => void;
  /** Reports whether committed edits differ from the last saved state. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Reports operational loading, rendering or delivery failures to the host. */
  onError?: (error: unknown) => void;
  open?: Pick<OpenImageOptions, "worker">;
}

export interface SessionState {
  status: "loading" | "ready" | "failed";
  error?: unknown;
  /** The original picture. */
  sourceSize: Size | null;
  /** The picture as edited so far. */
  size: Size | null;
  /** The committed edit. */
  recipe: EditRecipe;
  /** What is showing: the recipe plus any change still being dragged. */
  draft: EditRecipe;
  canUndo: boolean;
  canRedo: boolean;
  /** Changed since it was opened or last saved. */
  dirty: boolean;
  tool: string | null;
  /** Each tool's own settings, such as the crop's aspect ratio. */
  toolData: Readonly<Record<string, unknown>>;
  /** Canvas pixels per picture pixel, once a canvas is showing it. */
  zoom: number | null;
  /** True while the crop tool shows the whole picture. */
  cropping: boolean;
  save: "idle" | "saving" | "saved" | "failed";
  saveProgress: number | null;
  saveError?: unknown;
}

/** Zoom controls, supplied by whichever canvas is showing the session. */
export interface ViewControls {
  fit(): void;
  actualSize(): void;
  zoomIn(): void;
  zoomOut(): void;
}

/** The part of a tool the session needs. `glass-ux-image/tools/*` define whole tools. */
export interface SessionTool {
  id: string;
  /** Actions supplied by this tool. Host overrides and hidden actions retain priority. */
  actions?: readonly ActionOverride[];
  /** Filters this tool works with, in the order they apply. */
  filters?: readonly (Filter<any> | Warp<any>)[];
  stages?: readonly SourceStage[];
  layerKinds?: readonly LayerKind[];
  /** Called when the tool becomes active. */
  enter?: (session: EditorSession) => void;
  /** Called when another tool takes over, before unsaved drafts are dropped. */
  leave?: (session: EditorSession) => void;
}

interface Action {
  run: (session: EditorSession, args?: unknown) => unknown;
  enabled?: (session: EditorSession) => boolean;
}

const BUILT_IN: Record<string, Action> = {
  "layers.flatten": {run:(s,args)=>s.flatten(args as {label: string}),enabled:s=>s.state.status === "ready"},
  "file.replaceSource": {run:(s,args)=> { const {source,recipe,assets}=args as {source:ImageInput;recipe?:EditRecipe;assets?:readonly import("../core/index.js").Asset[]}; return s.openSource(source,recipe,assets); }},
  "edit.commit": {run:(s,args)=>{const {change,options}=args as {change:Partial<EditRecipe>;options:CommitOptions};s.commit(change,options);}},
  "edit.goTo": {run:(s,id)=>s.goTo(id as string)},
  "image.rotate": {run:(s,d)=>s.rotate(d as 1|-1)},
  "image.flip": {run:(s,axis)=>s.flip(axis as "x"|"y")},
  "image.geometry": {run:(s,g)=>s.commit({geometry:{...s.state.draft.geometry,...g as Partial<Geometry>}})},
  "layers.set": {run:(s,layers)=>s.commit({layers:layers as readonly LayerSpec[]})},
  "layers.add": {run:(s,layer)=>s.commit({layers:[...(s.state.draft.layers??[]),layer as LayerSpec]})},
  "layers.update": {run:(s,args)=>{const {id,patch}=args as {id:string;patch:Partial<LayerSpec>};s.commit({layers:(s.state.draft.layers??[]).map(l=>l.id===id?{...l,...patch}:l)});}},
  "layers.remove": {run:(s,id)=>s.commit({layers:(s.state.draft.layers??[]).filter(l=>l.id!==id),strokes:(s.state.draft.strokes??[]).filter(stroke=>stroke.layer!==id)})},
  "layers.mask.add": {run:(s,args)=>{const {id,fill="reveal",label}=args as {id:string;fill?:LayerMask["fill"];label?:string};const layers=s.state.recipe.layers??[];
    if(layers.some(l=>l.id===id&&!l.mask))s.commit({layers:layers.map(l=>l.id===id?{...l,mask:{fill,enabled:true}}:l)},{label});}},
  "layers.mask.enable": {run:(s,args)=>{const {id,enabled,label}=args as {id:string;enabled:boolean;label?:string};const layers=s.state.recipe.layers??[];
    if(layers.some(l=>l.id===id&&l.mask))s.commit({layers:layers.map(l=>l.id===id&&l.mask?{...l,mask:{...l.mask,enabled}}:l)},{label});}},
  "layers.mask.delete": {run:(s,args)=>{const {id,label}=args as {id:string;label?:string};const {layers=[],strokes=[]}=s.state.recipe;
    if(layers.some(l=>l.id===id&&l.mask))s.commit({layers:layers.map(l=>{if(l.id!==id)return l;const {mask:_,...rest}=l;return rest;}),strokes:strokes.filter(stroke=>!(stroke.layer===id&&stroke.mask))},{label});}},
  "layers.mask.apply": {run:(s,args)=>s.applyLayerMask((args as {id:string}).id,args as {label?:string}),enabled:s=>s.state.status==="ready"},
  "layers.reorder": {run:(s,ids)=>s.commit({layers:(ids as string[]).map(id=>s.state.draft.layers!.find(l=>l.id===id)!)})},
  "strokes.set": {run:(s,strokes)=>s.commit({strokes:strokes as EditRecipe["strokes"]})},
  "strokes.add": {run:(s,stroke)=>s.commit({strokes:[...(s.state.draft.strokes??[]),stroke as NonNullable<EditRecipe["strokes"]>[number]]})},
  "edit.undo": { run: (s) => s.undo(), enabled: (s) => s.state.canUndo },
  "edit.redo": { run: (s) => s.redo(), enabled: (s) => s.state.canRedo },
  "edit.apply": { run: (s, change) => s.commit(change as Partial<EditRecipe> | undefined) },
  "edit.reset": { run: (s) => s.reset(), enabled: (s) => !same(s.state.recipe, EMPTY_RECIPE) },
  "edit.restart": {run:(s,args)=>{const {change,options}=(args ?? {}) as {change?:Partial<EditRecipe>;options?:Omit<CommitOptions,"source">};s.restart(change,options);}},
  "image.rotateRight": { run: (s) => s.rotate(1) },
  "image.rotateLeft": { run: (s) => s.rotate(-1) },
  "image.flipHorizontal": { run: (s) => s.flip("x") },
  "image.flipVertical": { run: (s) => s.flip("y") },
  "image.crop": { run: (s, crop) => s.applyCrop(crop as Rect | null) },
  "view.fit": { run: (s) => s.view?.fit() },
  "view.actualSize": { run: (s) => s.view?.actualSize() },
  "view.zoomIn": { run: (s) => s.view?.zoomIn() },
  "view.zoomOut": { run: (s) => s.view?.zoomOut() },
  "tool.select": { run: (s, id) => s.selectTool(id as string | null) },
  "file.save": { run: (s) => s.save(), enabled: (s) => s.canSave },
  "file.cancel": { run: (s) => s.cancel() },
};

/**
 * One editing session on one picture, with no UI. `PhotoEditor` is a view of this object, and a host
 * can drive it directly. Every committed change goes through an action, so `onAction` sees them all.
 * Previews do not: a slider drag would call it once a frame.
 */
export class EditorSession {
  #options: EditorSessionOptions;
  #original?: import("../io/open-image.js").OpenedImage;
  #state: SessionState;
  #listeners = new Set<() => void>();
  #nodes: HistoryNode[] = [];
  #current = "0";
  #historySources = new Map<string, OpenedImage>();
  #recipeSources = new WeakMap<EditRecipe, OpenedImage>();
  #baseLifetime = new AbortController();
  #flattenedPixels = new WeakMap<TileSource, Awaited<ReturnType<typeof composeDocument>> & { dpi?: number; originalMetadata?: OpenedImage["metadata"] }>();
  #savedSource?: OpenedImage;
  #nextHistory = 1;
  #preferred = new Map<string, string>();
  #acting = 0;
  readonly assets: AssetStore;
  #stages: SourceStage[] = [];
  #kinds = new Map<string, LayerKind>([["image", imageLayerKind]]);
  #warps: Warp<any>[] = [];
  #tileBudget = new TileCacheBudget(256 * 1024 * 1024);
  #pipelineCache = new Set<TileCache>();
  #assetLifetime = new AbortController();
  #stageDraft?: EditRecipe;
  #staged?: TileSource;
  #shownLayers?: readonly LayerSpec[];
  #shownLayerSources: readonly TileSource[] = [];
  #layerDraft?: EditRecipe;
  #layerParts = new Map<string, LayerParts>();
  #maskBases = new Map<string, TileSource>();
  #masked = new WeakMap<TileSource, WeakMap<TileSource, TileSource>>();
  #kindSources = new WeakMap<LayerSpec, TileSource>();
  #shownSource?: TileSource;
  #saved: EditRecipe;
  #cache?: TileCache;
  #document?: ImageDocument;
  #shownGeometry?: string;
  #filters: Filter<any>[];
  #tools: SessionTool[] = [];
  #actions = new Map<string, Action>(Object.entries(BUILT_IN));
  #hidden = new Set<string>();
  #renderer?: Renderer;
  #open = new AbortController();
  #saving?: AbortController;
  /** Set by the canvas showing this session. */
  view?: ViewControls;

  constructor(options: EditorSessionOptions) {
    this.#options = options;
    const recipe = normaliseRecipe(options.recipe);
    this.assets = options.assets ?? new AssetStore();
    this.#nodes = [{id:"0",parent:null,children:[],label:"",recipe}];
    this.#stages = [...(options.stages ?? [])];
    for(const kind of options.layerKinds ?? []) this.#kinds.set(kind.kind,kind);
    this.#saved = recipe;
    this.#filters = [];
    for(const filter of options.filters ?? []) this.#registerFilter(filter);
    this.#state = { status: "loading", sourceSize: null, size: null, recipe, draft: recipe, canUndo: false, canRedo: false, dirty: false, tool: null, toolData: {}, zoom: null, cropping: false, save: "idle", saveProgress: null };
    for (const { id, run, enabled, hidden } of options.actions ?? []) {
      if (hidden) this.#hidden.add(id);
      if (run) this.#actions.set(id, { run, ...(enabled ? { enabled } : {}) });
    }
    this.registerTools(options.tools ?? []);
    void this.#load(options.source,options.recipe?.layers===undefined);
  }

  get state() {
    return this.#state;
  }

  /** The document as shown now, once the picture has loaded. */
  get document() {
    return this.#document;
  }

  get canSave() {
    return Boolean(this.#options.onSave) && this.#state.status === "ready" && this.#state.save !== "saving";
  }

  /** Whether the host handles saving at all, even if a save is running now. */
  get savable() {
    return Boolean(this.#options.onSave);
  }

  /** Whether the host handles cancelling. */
  get closable() {
    return Boolean(this.#options.onCancel);
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };

  getState = () => this.#state;

  /** Run an action by id, through `onAction`. Does nothing if it is missing or disabled. */
  run(id: string, args?: unknown): unknown {
    const action = this.#actions.get(id);
    if (!action || this.#hidden.has(id) || (action.enabled && !action.enabled(this))) return undefined;
    const go = (nextArgs: unknown = args) => { this.#acting++; try { return action.run(this, nextArgs); } finally { this.#acting--; } };
    return this.#options.onAction ? this.#options.onAction({ id, args }, go) : go();
  }

  /** Public rendering parts for an independent batch session; no persistence or transport. */
  get renderingParts() { return {filters:[...this.#filters,...this.#warps],stages:[...this.#stages],layerKinds:[...this.#kinds.values()],assets:this.assets}; }
  /** Original source bytes and import information, retained without persistence. */
  get original() { return this.#original; }
  /** Whether the host supplied an explicit export destination. */
  get exportable() { return Boolean(this.#options.onExport); }
  /** Deliver encoded bytes only to the host callback; no library transport or download. */
  async deliverExport(blob: Blob, context: SaveContext) { await this.#options.onExport?.(blob, context); }
  /** Add opt-in domain actions without replacing existing host overrides. Returns a cleanup. */
  registerActions(actions: readonly ActionOverride[]) {
    const added: string[]=[];
    for(const action of actions) if(action.run && !this.#actions.has(action.id)) {
      this.#actions.set(action.id,{run:action.run,enabled:action.enabled}); added.push(action.id);
    }
    if(added.length)this.#set({});
    return ()=> { for(const id of added)this.#actions.delete(id); };
  }
  /** Replace the document through a domain action. Asset ids are restored by the caller. */
  async openSource(source: ImageInput, recipe: EditRecipe = EMPTY_RECIPE, assets?: readonly import("../core/index.js").Asset[]):Promise<void> {
    this.signal.throwIfAborted();
    const next=normaliseRecipe(recipe);
    if(!this.#acting) { await this.run("file.replaceSource",{source,recipe,assets}); return; }
    if(assets) {for(const asset of this.assets.entries)this.assets.delete(asset.id);for(const asset of assets)this.assets.set(asset);}
    this.cancelSave();
    this.#open.abort(); this.#open=new AbortController();
    this.#document?.dispose(); this.#cache?.dispose();
    for(const cache of this.#pipelineCache.values())cache.dispose(); this.#pipelineCache.clear();
    this.#document=undefined; this.#cache=undefined; this.#original=undefined;
    for(const stage of this.#stages)stage.release?.(this);
    this.#shownGeometry=undefined;this.#shownLayers=undefined;this.#shownSource=undefined;this.#stageDraft=undefined; this.#layerDraft=undefined; this.#layerParts.clear(); this.#maskBases.clear(); this.#kindSources=new WeakMap(); this.#shownLayerSources=[];this.#staged=undefined;
    this.#nodes=[{id:"0",parent:null,children:[],label:"",recipe:next}];
    this.#historySources.clear(); this.#recipeSources=new WeakMap(); this.#flattenedPixels=new WeakMap(); this.#savedSource=undefined;
    this.#current="0";this.#nextHistory=1;this.#preferred.clear();this.#saved=next;
    this.#set({status:"loading",recipe:next,draft:next,sourceSize:null,size:null,canUndo:false,canRedo:false,dirty:false,save:"idle",saveProgress:null,saveError:undefined});
    await this.#load(source,recipe===EMPTY_RECIPE||recipe.layers===undefined);
    if(this.#state.status==="failed")throw this.#state.error;
  }

  /** Aborted when the session is disposed; use for session-owned asynchronous work. */
  get signal(): AbortSignal { return this.#assetLifetime.signal; }

  /** Decode an asset owned by this session. Retained for history until session disposal. */
  async decodeImage(input: ImageInput): Promise<OpenedImage> {
    return openImage(input, {...this.#options.open, signal: this.#assetLifetime.signal});
  }

  /** Whether an action exists, and can run now. */
  action(id: string) {
    const action = this.#actions.get(id);
    const available = Boolean(action) && !this.#hidden.has(id);
    return { available, enabled: available && (!action!.enabled || action!.enabled(this)) };
  }

  /** Offer more tools, bringing their filters with them. */
  registerTools(tools: readonly SessionTool[]) {
    let added = false;
    for (const tool of tools) {
      if (this.#tools.some(({ id }) => id === tool.id)) continue;
      this.#tools.push(tool);
      for (const action of tool.actions ?? []) {
        if (action.run && !this.#actions.has(action.id)) this.#actions.set(action.id, {run:action.run, enabled:action.enabled});
      }
      for (const filter of tool.filters ?? []) { this.#registerFilter(filter); added = true; }
      for (const stage of tool.stages ?? []) if(!this.#stages.some(s=>s.id===stage.id)) { this.#stages.push(stage); added=true; }
      for (const kind of tool.layerKinds ?? []) { this.#kinds.set(kind.kind,kind); added=true; }
    }
    if (added) { this.#stageDraft=undefined; this.#layerDraft=undefined; this.#sync(); }
  }

  /** The tool to return to when one finishes. */
  get defaultTool() {
    return this.#tools[0]?.id ?? null;
  }

  /** Show a change without recording it, as a slider drags. `commit` records it. */
  preview(change: Partial<EditRecipe>) {
    const draft=normaliseRecipe({ ...this.#state.draft, ...change });
    if(this.#original)geometrySize(this.#original,draft.geometry);
    this.#set({ draft });
    this.#sync();
  }

  /** Record the draft, or a final change to it, as one undo step. */
  commit(change: Partial<EditRecipe> = {}, options: CommitOptions = {}) {
    if(!this.#acting) return void this.run("edit.commit", {change, options});
    const next = normaliseRecipe({ ...this.#state.draft, ...change });
    if (options.source ?? this.#original) geometrySize((options.source ?? this.#original)!,next.geometry);
    if (same(next, this.#state.recipe) && (!options.source || options.source === this.#original)) {
      this.#set({ draft: this.#state.recipe });
      this.#sync();
      return;
    }
    const id=String(this.#nextHistory++), parent=this.#current;
    this.#nodes=this.#nodes.map(node=>node.id===parent ? {...node,children:[...node.children,id]} : node);
    this.#nodes.push({id,parent,children:[],label:options.label ?? "",recipe:next});
    this.#historySources.set(id, options.source ?? this.#original!);
    this.#recipeSources.set(next, options.source ?? this.#original!);
    this.#preferred.set(parent,id);
    this.#current=id;
    this.#apply(next);
    this.#options.onChange?.(next);
  }

  /** Drop any change still in draft. */
  revert() {
    this.#set({ draft: this.#state.recipe });
    this.#sync();
  }

  /** Set one filter's parameters as a draft. */
  previewFilter(id: string, params: unknown) {
    this.preview({ filters: { ...this.#state.draft.filters, [id]: params } });
  }

  /** The complete tree, including branches retained after editing from an earlier step. */
  get history(): SessionHistory { return {nodes:this.#nodes,current:this.#nodes.find(n=>n.id===this.#current)!}; }
  /** Navigate to any history node through edit.goTo. */
  goTo(id: string) {
    if(!this.#acting) return void this.run("edit.goTo",id);
    const node=this.#nodes.find(n=>n.id===id);
    if(!node||id===this.#current)return;
    this.#current=id;
    this.#apply(node.recipe);
    this.#options.onChange?.(node.recipe);
  }
  undo() {
    if(!this.#acting) return void this.run("edit.undo");
    const node=this.history.current;
    if(node.parent) { this.#preferred.set(node.parent,node.id); this.goTo(node.parent); }
  }
  redo() {
    if(!this.#acting) return void this.run("edit.redo");
    const node=this.history.current, id=this.#preferred.get(node.id) ?? node.children.at(-1);
    if(id) this.goTo(id);
  }

  /**
   * Start again from the picture as it was opened: every history step is dropped, and `change`,
   * applied over the opened recipe, becomes the first step. Undo returns to the original. Presets
   * use this, so choosing one never stacks on earlier edits.
   */
  restart(change: Partial<EditRecipe> = {}, options: Omit<CommitOptions, "source"> = {}) {
    if(!this.#acting) return void this.run("edit.restart", {change, options});
    const root=this.#nodes.find(node=>node.parent===null)!, source=this.#historySources.get(root.id);
    const next=normaliseRecipe({ ...root.recipe, ...change });
    if (source) geometrySize(source, next.geometry);
    for (const id of this.#historySources.keys()) if (id !== root.id) this.#historySources.delete(id);
    this.#preferred.clear();
    this.#current=root.id;
    if (same(next, root.recipe)) {
      this.#nodes=[{ ...root, children: [] }];
    } else {
      const id=String(this.#nextHistory++);
      this.#nodes=[{ ...root, children: [id] }, { id, parent: root.id, children: [], label: options.label ?? "", recipe: next }];
      if (source) { this.#historySources.set(id, source); this.#recipeSources.set(next, source); }
      this.#preferred.set(root.id, id);
      this.#current=id;
    }
    const shown=this.#nodes.find(node=>node.id===this.#current)!.recipe;
    this.#apply(shown);
    this.#options.onChange?.(shown);
  }

  reset() {
    if(!this.#acting) return void this.run("edit.reset");
    this.commit(EMPTY_RECIPE);
  }

  rotate(direction: 1 | -1) {
    if(!this.#acting) return void this.run("image.rotate", direction);
    const { sourceSize, recipe } = this.#state;
    if (sourceSize) this.commit({ geometry: rotateGeometry(recipe.geometry, sourceSize, direction) });
  }

  flip(axis: "x" | "y") {
    if(!this.#acting) return void this.run("image.flip", axis);
    const { sourceSize, recipe } = this.#state;
    if (sourceSize) this.commit({ geometry: flipGeometry(recipe.geometry, sourceSize, axis) });
  }

  /** Set geometry, retaining fields the tool does not own. */
  setGeometry(change: Partial<Geometry>) { this.run("image.geometry",change); }
  /** Replace the plain-data layer list. */
  setLayers(layers: readonly LayerSpec[]) { this.run("layers.set",layers); }
  /** Replace source-coordinate strokes; the registered stages reconcile their work. */
  setStrokes(strokes: NonNullable<EditRecipe["strokes"]>) { this.run("strokes.set",strokes); }
  /**
   * Preview source-coordinate strokes without notifying React subscribers each frame.
   * Stages emit dirty rectangles directly; the draft remains accurate for cancellation and export.
   * A stage replacing its source still triggers the ordinary document synchronisation path.
   */
  previewStrokes(strokes: NonNullable<EditRecipe["strokes"]>) {
    this.#state = { ...this.#state, draft: { ...this.#state.draft, strokes } };
    const draft = this.#state.draft;
    if (this.#sourceFor(draft) !== this.#shownSource || !this.#sameLayerSources(draft)) this.#sync();
  }
  /** Output document coordinates to decoded source coordinates. Null denotes a non-invertible mapping. */
  toSource(x: number,y: number) { return this.#state.sourceSize ? this.#mapping(this.#state.draft,this.#state.draft.geometry).toSource(x,y) : null; }
  /** Decoded source coordinates to output document coordinates. */
  fromSource(x: number,y: number) { return this.#state.sourceSize ? this.#mapping(this.#state.draft,this.#state.draft.geometry).fromSource(x,y) : null; }
  /**
   * One layer's sources in its own pixels: for thumbnails, baking or a host's own processing. With no
   * recipe they are the live sources being shown, so treat their tiles as borrowed; with a recipe they
   * are an independent branch. Null when the layer is not in the recipe.
   */
  layerSources(id: string, options: { /** Read this recipe instead of the live draft. */ recipe?: EditRecipe } = {}): LayerParts | null {
    if(this.#state.status!=="ready") return null;
    const recipe=options.recipe ?? this.#state.draft, spec=recipe.layers?.find(layer=>layer.id===id);
    if(!spec) return null;
    return options.recipe ? this.#partsFor(spec,recipe,true) : this.#layersFor(recipe).find(parts=>parts.spec.id===id) ?? null;
  }
  /** Output document coordinates to a layer's own pixels, as layer strokes store them. Null when unmapped. */
  toLayer(id: string, x: number, y: number): readonly [number, number] | null {
    const parts=this.layerSources(id); if(!parts) return null;
    const work=this.#mapping(this.#state.draft,this.#state.draft.geometry).toWork(x,y);
    return work && homography(parts.spec.quad,rectQuad(parts.pixels))(...work);
  }
  /** A layer's own pixels to output document coordinates. */
  fromLayer(id: string, x: number, y: number): readonly [number, number] | null {
    const parts=this.layerSources(id); if(!parts) return null;
    const work=homography(rectQuad(parts.pixels),parts.spec.quad)(x,y);
    return work && this.#mapping(this.#state.draft,this.#state.draft.geometry).fromWork(...work);
  }
  /**
   * Bake a layer's mask into its pixels: the layer becomes a plain image layer with no mask, and its
   * pixel and mask strokes are dropped because they are in the new pixels. One labelled undo step.
   */
  async applyLayerMask(id: string, options: { label?: string } = {}): Promise<void> {
    if (!this.#acting) { await this.run("layers.mask.apply", { id, ...options }); return; }
    const recipe=this.#state.recipe, spec=recipe.layers?.find(layer=>layer.id===id), signal=this.#open.signal;
    if(!spec?.mask) return;
    const { composite }=this.#partsFor(spec,recipe,true);
    const document=createImageDocument(composite), backend=new CpuBackend();
    try {
      document.addLayer({source:composite});
      const image=await composeDocument(backend,document,{signal});
      const blob=await encodeImage(image.bytes,image.width,image.height,{type:"image/png"});
      signal.throwIfAborted();
      const decoded=await openImage(blob,{...this.#options.open,signal}), asset=await this.assets.add(blob,decoded);
      signal.throwIfAborted();
      if(this.#state.recipe!==recipe) throw new Error("Layers changed while applying the mask");
      const { mask: _mask, data: _data, ...rest }=spec;
      const layers=(recipe.layers ?? []).map(layer=>layer.id===id ? {...rest,kind:"image",asset} : layer);
      // Re-enter the action boundary after the asynchronous bake, as flatten does.
      this.run("edit.commit",{change:{layers,strokes:(recipe.strokes ?? []).filter(stroke=>stroke.layer!==id)},options:{label:options.label}});
    } finally { document.dispose(); backend.dispose(); }
  }
  /** A small linear-premultiplied composite, yielding between tiles. */
  async readPreview(maxEdge: number, options: { /** Render this recipe without changing the live draft. */ recipe?: EditRecipe; signal?: AbortSignal } = {}): Promise<PixelBuffer> {
    if(!this.#document) throw new Error("The picture has not loaded");
    if(!(Number.isFinite(maxEdge)&&maxEdge>=1)) throw new RangeError("maxEdge must be positive");
    const recipe=options.recipe ?? this.#state.draft;
    const signal=AbortSignal.any([this.#open.signal,this.#baseLifetime.signal,...(options.signal ? [options.signal] : [])]);
    signal.throwIfAborted();
    const document=this.#documentFor(recipe,recipe.geometry,undefined,true), backend=new CpuBackend();
    try {
    const level=Math.min(coarsestLevel(document),Math.max(0,Math.ceil(Math.log2(Math.max(document.width,document.height)/maxEdge))));
    let pixels=await this.#previewPixels(backend,document,level,signal);
    while(Math.max(pixels.width,pixels.height)>maxEdge){signal.throwIfAborted();pixels=halve(pixels);await new Promise<void>(resolve=>setTimeout(resolve));}
    return pixels;
    } finally { document.dispose(); backend.dispose(); }
  }

  /** The turned picture's size, which a crop is measured against. */
  get cropBounds(): Size | null {
    const { sourceSize, recipe } = this.#state;
    return sourceSize && turnedSize(sourceSize, recipe.geometry.rotation);
  }

  /** Show the whole picture for cropping, or go back. */
  setCropping(cropping: boolean) {
    this.#set({ cropping });
    this.#sync();
  }

  /** Record a crop. Null removes it. */
  applyCrop(crop: Rect | null) {
    if(!this.#acting) return void this.run("image.crop", crop);
    const bounds = this.cropBounds;
    if (!bounds) return;
    this.commit({ geometry: { ...this.#state.recipe.geometry, crop: crop && clampCrop(crop, bounds) } });
  }

  selectTool(tool: string | null) {
    if (tool === this.#state.tool) return;
    this.#tools.find(({ id }) => id === this.#state.tool)?.leave?.(this);
    this.revert();
    this.#set({ tool });
    this.#tools.find(({ id }) => id === tool)?.enter?.(this);
  }

  setToolData(id: string, value: unknown) {
    this.#set({ toolData: { ...this.#state.toolData, [id]: value } });
  }

  /** Reported by the canvas as it zooms. */
  setZoom(zoom: number) {
    if (zoom !== this.#state.zoom) this.#set({ zoom });
  }

  get renderer() {
    return this.#renderer;
  }

  /** The canvas registers its renderer here, so geometry changes reach it. */
  attach(renderer: Renderer | undefined) {
    this.#renderer = renderer;
    if (renderer && this.#document) renderer.setDocument(this.#document);
  }

  /** Bake the committed visible picture at full export resolution into one replacement base.
   * Geometry, crop, resize, filters, strokes and layers are baked; the resulting recipe is empty.
   * Source checkpoints make this one labelled, intercepted and undoable history entry.
   */
  async flatten(options: { label: string }): Promise<void> {
    if (!this.#acting) { await this.run("layers.flatten", options); return; }
    const recipe = this.#state.recipe, source = this.#original, signal = this.#open.signal;
    const image = await this.#composeRecipe(recipe, { signal });
    const blob = await encodeImage(image.bytes, image.width, image.height, { type: "image/png", dpi: image.dpi, originalMetadata: image.originalMetadata });
    signal.throwIfAborted();
    const decoded = await openImage(blob, { ...this.#options.open, signal });
    if (this.#state.recipe !== recipe || this.#original !== source) throw new Error("Picture changed during flatten");
    this.#flattenedPixels.set(decoded, image);
    // Re-enter the action boundary after the asynchronous render, before changing any state.
    this.run("edit.commit", { change: EMPTY_RECIPE, options: { label: options.label, source: decoded } });
  }

  /** The picture as committed, ready to encode. */
  result(): EditResult {
    const { recipe, sourceSize } = this.#state;
    const size = geometrySize(sourceSize!, recipe.geometry);
    return { ...size, recipe, toBlob: (options) => this.#render(recipe, options) };
  }

  async save() {
    const { onSave } = this.#options;
    if (!onSave || !this.canSave) return;
    const controller = new AbortController();
    this.#saving = controller;
    this.#set({ save: "saving", saveProgress: 0, saveError: undefined });
    try {
      const result = this.result(), source = this.#original;
      await onSave(result, { signal: controller.signal, setProgress: (saveProgress) => {if(this.#saving === controller && !controller.signal.aborted)this.#set({ saveProgress });} });
      if(controller.signal.aborted || this.#saving !== controller) {
        if(this.#saving === controller)this.#set({save:"idle",saveProgress:null});
        return;
      }
      this.#saved = result.recipe;
      this.#savedSource = source;
      this.#updateDirty();
      this.#set({ save: this.#state.dirty ? "idle" : "saved", saveProgress: null });
    } catch (error) {
      if(this.#saving !== controller)return;
      if (controller.signal.aborted) this.#set({ save: "idle", saveProgress: null });
      else {
        this.#set({ save: "failed", saveProgress: null, saveError: error });
        this.#options.onError?.(error);
      }
    } finally {
      if(this.#saving === controller)this.#saving = undefined;
    }
  }

  /** Stop a save in progress. The host's `onSave` sees it through `signal`. */
  cancelSave() {
    this.#saving?.abort();
  }

  cancel() {
    this.cancelSave();
    this.#options.onCancel?.();
  }

  dispose() {
    this.#assetLifetime.abort();
    if(!this.#options.assets)for(const asset of this.assets.entries)this.assets.delete(asset.id);
    this.#baseLifetime.abort();
    this.#open.abort();
    this.cancelSave();
    this.#listeners.clear();
    this.#historySources.clear(); this.#recipeSources=new WeakMap(); this.#flattenedPixels=new WeakMap();
    this.#document?.dispose();
    this.#cache?.dispose();
    for(const cache of this.#pipelineCache.values()) cache.dispose();
    this.#pipelineCache.clear();
    for(const stage of this.#stages)stage.release?.(this);
    this.#document=undefined; this.#cache=undefined; this.#staged=undefined; this.#stageDraft=undefined; this.#layerDraft=undefined; this.#layerParts.clear(); this.#maskBases.clear(); this.#shownLayerSources=[];
    this.#original=undefined; this.#savedSource=undefined; this.#shownSource=undefined; this.#shownLayers=undefined;
  }

  async #load(input: ImageInput,importLayers=true) {
    const opening=this.#open;
    try {
      const opened = await openImage(input, { signal: opening.signal, ...this.#options.open });
      if(opening.signal.aborted)return;
      // Import is part of opening the source, under the same intercepted action. A restored
      // project supplies its own recipe/assets, including an intentionally empty layer list.
      if(importLayers&&opened.importedLayers?.length) {
        const layers=await Promise.all(opened.importedLayers.map(async layer=>({...layer.spec,asset:await this.assets.add(layer.blob,layer.source)})));
        if(opening.signal.aborted)return;
        const recipe=normaliseRecipe({...this.#state.recipe,layers});
        this.#nodes[0]={...this.#nodes[0]!,recipe};this.#saved=recipe;
        this.#set({recipe,draft:recipe});
      }
      const source=opened.layerBase?{...opened,...opened.layerBase}:opened;
      this.#original=source;
      this.#historySources.set("0", source); this.#recipeSources.set(this.#state.recipe, source); this.#savedSource=source;
      this.#cache = new TileCache(source, this.#tileBudget);
      this.#set({ status: "ready", sourceSize: { width: source.width, height: source.height } });
      this.#sync();
      if (this.defaultTool) this.selectTool(this.defaultTool);
    } catch (error) {
      if (opening.signal.aborted) return;
      this.#set({ status: "failed", error });
      this.#options.onError?.(error);
    }
  }

  #apply(recipe: EditRecipe) {
    const source = this.#historySources.get(this.#current);
    if (source && source !== this.#original) {
      this.#baseLifetime.abort(); this.#baseLifetime=new AbortController();
      this.#document?.dispose(); this.#document=undefined; this.#cache?.dispose();
      for (const cache of this.#pipelineCache.values()) cache.dispose();
      this.#pipelineCache.clear();
      this.#original=source; this.#cache=new TileCache(source, this.#tileBudget);
      this.#shownGeometry=undefined; this.#shownLayers=undefined; this.#shownSource=undefined;
      this.#stageDraft=undefined; this.#layerDraft=undefined; this.#layerParts.clear(); this.#shownLayerSources=[]; this.#staged=undefined;
    }
    // A new edit makes "Saved" untrue, and a past failure no longer applies.
    this.#set({ recipe, draft: recipe, sourceSize: this.#original ? { width: this.#original.width, height: this.#original.height } : null, canUndo: this.history.current.parent !== null, canRedo: this.history.current.children.length > 0, ...(this.#state.save === "saving" ? {} : { save: "idle" as const, saveError: undefined }) });
    this.#updateDirty();
    this.#sync();
  }

  #updateDirty() {
    const dirty = !same(this.#state.recipe, this.#saved) || this.#original !== this.#savedSource;
    if (dirty === this.#state.dirty) return;
    this.#set({ dirty });
    this.#options.onDirtyChange?.(dirty);
  }

  #set(patch: Partial<SessionState>) {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }

  #layerFilters(recipe: EditRecipe): LayerFilter[] {
    return this.#filters.filter(({ id }) => recipe.filters[id] !== undefined).map((filter) => ({ filter, params: recipe.filters[filter.id] }));
  }

  #registerFilter(filter: Filter<any> | Warp<any>) {
    if("map" in filter) { if(!this.#warps.some(f=>f.id===filter.id))this.#warps.push(filter); }
    else if(!this.#filters.some(f=>f.id===filter.id))this.#filters.push(filter);
  }
  #cacheFor(source: TileSource, caches: Map<TileSource, TileCache>) {
    let cache=caches.get(source);
    if(!cache) { cache=new TileCache(source, this.#tileBudget); caches.set(source,cache); this.#pipelineCache.add(cache); }
    return cache;
  }
  #releaseCaches(caches: Map<TileSource, TileCache>) {
    for(const cache of caches.values()) {cache.dispose();this.#pipelineCache.delete(cache);}
    caches.clear();
  }
  #baseFor(recipe: EditRecipe) { return this.#recipeSources.get(recipe) ?? this.#original!; }
  #mapping(recipe: EditRecipe, geometry: Geometry) {
    const source=this.#baseFor(recipe), basic=geometryMapping(source,geometry);
    const work=workSize(source,geometry);
    const warps=this.#warps.filter(w=>recipe.filters[w.id]!==undefined);
    if(!warps.length)return basic;
    const intoWork=geometryMapping(source,{...geometry,crop:null,canvas:null,resize:null});
    const map:Mapping=(x,y)=>{
      let p=basic.toWork(x,y);
      for(let i=warps.length-1;i>=0&&p;i--) { const w=warps[i]!;p=w.map(...p,recipe.filters[w.id],work); }
      return p;
    };
    const toSource:Mapping=(x,y)=>{const p=map(x,y);return p&&intoWork.toSource(...p);};
    // Invert the displacement numerically; Phase 1 warps need only supply their inverse map.
    const fromSource:Mapping=(x,y)=>{
      const initial=basic.fromSource(x,y);if(!initial)return null;
      let [ox,oy]=initial;
      for(let i=0;i<20;i++) {
        const p=toSource(ox,oy),px=toSource(ox+.01,oy),py=toSource(ox,oy+.01);
        if(!p||!px||!py)return null;
        const ex=p[0]-x,ey=p[1]-y;if(Math.hypot(ex,ey)<1e-5)return [ox,oy];
        const a=(px[0]-p[0])/.01,b=(py[0]-p[0])/.01,c=(px[1]-p[1])/.01,d=(py[1]-p[1])/.01,det=a*d-b*c;
        if(Math.abs(det)<1e-12)return null;
        ox-=(d*ex-b*ey)/det;oy-=(-c*ex+a*ey)/det;
      }
      return [ox,oy];
    };
    return {...basic,toSource,fromSource};
  }
  #sourceFor(recipe: EditRecipe, isolated=false): TileSource {
    if(!isolated && this.#staged && this.#stageDraft===recipe)return this.#staged;
    let source=this.#baseFor(recipe);
    for(const stage of this.#stages) source=stage.apply(source,recipe,this,{isolated});
    if(!isolated) {this.#stageDraft=recipe;this.#staged=source;}
    return source;
  }
  /** A layer's staged pixels, its staged mask and their product, in the layer's own pixels. */
  #partsFor(spec: LayerSpec, recipe: EditRecipe, isolated: boolean): LayerParts {
    const kind=this.#kinds.get(spec.kind);
    if(!kind) throw new Error(`Unregistered layer kind: ${spec.kind}`);
    // A spec is plain immutable data, so its kind's source is looked up once per spec object.
    let pixels=this.#kindSources.get(spec);
    if(!pixels) { pixels=kind.source(spec,{assets:this.assets}); this.#kindSources.set(spec,pixels); }
    for(const stage of this.#stages) if(stage.applyLayer) pixels=stage.applyLayer(pixels,spec,recipe,this,{isolated});
    if(!spec.mask) return {spec,pixels,mask:null,composite:pixels};
    // One fill source per layer, fill and size, so stages can key their stores on it.
    const key=`${spec.id}|${spec.mask.fill}|${pixels.width}x${pixels.height}`;
    let mask=this.#maskBases.get(key);
    if(!mask) { mask=maskFillSource(pixels,spec.mask.fill); this.#maskBases.set(key,mask); }
    for(const stage of this.#stages) if(stage.applyLayer) mask=stage.applyLayer(mask,spec,recipe,this,{isolated,mask:true});
    if(!spec.mask.enabled) return {spec,pixels,mask,composite:pixels};
    if(isolated) return {spec,pixels,mask,composite:maskedSource(pixels,mask)};
    let byMask=this.#masked.get(pixels);
    if(!byMask) { byMask=new WeakMap(); this.#masked.set(pixels,byMask); }
    let composite=byMask.get(mask);
    if(!composite) { composite=maskedSource(pixels,mask); byMask.set(mask,composite); }
    return {spec,pixels,mask,composite};
  }
  /** Layer parts for the live draft are kept, so stroke-only changes keep source identities. */
  #layersFor(recipe: EditRecipe, isolated=false): LayerParts[] {
    if(isolated) return (recipe.layers ?? []).map(spec=>this.#partsFor(spec,recipe,true));
    if(this.#layerDraft!==recipe) {
      this.#layerDraft=recipe;
      this.#layerParts=new Map((recipe.layers ?? []).map(spec=>[spec.id,this.#partsFor(spec,recipe,false)]));
    }
    return [...this.#layerParts.values()];
  }
  #sameLayerSources(recipe: EditRecipe) {
    const layers=this.#layersFor(recipe);
    return layers.length===this.#shownLayerSources.length && layers.every((parts,i)=>parts.composite===this.#shownLayerSources[i]);
  }
  /** A document for a recipe, sharing decoded and stage tiles. */
  #documentFor(recipe: EditRecipe, geometry: Geometry, staged: TileSource | undefined=undefined, isolated=false, layers=this.#layersFor(recipe,isolated)) {
    staged ??= this.#sourceFor(recipe,isolated);
    const caches=new Map<TileSource, TileCache>();
    const cacheFor=(source:TileSource)=>this.#cacheFor(source,caches);
    const mapping=this.#mapping(recipe,geometry), size=geometrySize(staged,geometry);
    const activeWarp=this.#warps.some(w=>recipe.filters[w.id]!==undefined);
    const source=activeWarp ? canvasSource(warpSource(cacheFor(staged),mapping.toSource,size),geometry,workSize(staged,geometry)) : geometrySource(cacheFor(staged),geometry);
    const document=createImageDocument(source);
    const dispose=document.dispose;
    document.dispose=()=>{dispose();this.#releaseCaches(caches);};
    try {
    document.addLayer({id:"image",name:"Image",source,filters:this.#layerFilters(recipe)});
    for(const {spec,composite:pixels} of layers) {
      const project=homography(spec.quad,rectQuad(pixels));
      const positioned=warpSource(cacheFor(pixels),(x,y)=>{
        const p=mapping.toWork(x,y);return p&&project(...p);
      },size);
      document.addLayer({...spec,source:positioned,filters:this.#layerFilters({...recipe,filters:spec.filters ?? {}})});
    }
    return document;
    } catch(error) {document.dispose();throw error;}
  }
  /** Bring the shown document in line with the draft, retaining sources for filter-only changes. */
  #sync() {
    if(!this.#cache)return;
    const {draft,cropping}=this.#state;
    const geometry=cropping ? {...draft.geometry,crop:null} : draft.geometry;
    const staged=this.#sourceFor(draft), layers=this.#layersFor(draft);
    const key=JSON.stringify([geometry,this.#warps.map(w=>draft.filters[w.id])]);
    if(key===this.#shownGeometry && this.#shownLayers===draft.layers && this.#shownSource===staged && this.#sameLayerSources(draft)) {
      const filters=this.#layerFilters(draft), previous=this.#document!.layers[0]!.filters;
      if(!recipesEqual(filters,previous)) this.#document!.updateLayer("image",{filters});
    } else {
      this.#shownGeometry=key;this.#shownLayers=draft.layers;this.#shownSource=staged;this.#shownLayerSources=layers.map(parts=>parts.composite);
      this.#document?.dispose();
      this.#document=this.#documentFor(draft,geometry,staged,false,layers);
      this.#renderer?.setDocument(this.#document);
    }
    this.#set({size:geometrySize(this.#cache.source,draft.geometry)});
  }
  async #previewPixels(backend: RenderBackend, document: ImageDocument, level: number, signal:AbortSignal): Promise<PixelBuffer> {
    // Preserve linear pixels, avoiding a display encode/decode round trip.
    const { composeTile }=await import("../render/compose.js");
    const { levelSize, tileRect, TILE_GUTTER }=await import("../core/index.js");
    const size=levelSize(document,level),out=createPixels(size.width,size.height);
    const caches=new Map<TileSource,TileCache>();
    try {
    for(let y=0;y<size.height;y+=256) for(let x=0;x<size.width;x+=256) {
      signal.throwIfAborted();
      const tile={level,x:x/256,y:y/256};
      let surface=composeTile(backend,document,tile,s=>this.#cacheFor(s,caches));
      for(let attempt=0;!surface;attempt++) { await retryRead(attempt,signal);await abortable(Promise.all([...caches.values()].map(c=>c.idle(signal))),signal);signal.throwIfAborted();surface=composeTile(backend,document,tile,s=>this.#cacheFor(s,caches)); }
      const pixels=backend.read(surface),rect=tileRect(document,tile);backend.release(surface);
      for(let row=0;row<rect.height;row++) {
        const start=((row+TILE_GUTTER)*pixels.width+TILE_GUTTER)*4;
        out.data.set(pixels.data.subarray(start,start+rect.width*4),((rect.y+row)*size.width+rect.x)*4);
      }
      await new Promise<void>(resolve=>setTimeout(resolve));
    }
    return out;
    } finally {this.#releaseCaches(caches);}
  }

  /** Full-resolution composition shared by export and flatten; never reads viewport pixels. */
  #composeRecipe(recipe: EditRecipe, options?: ExportOptions): Promise<Awaited<ReturnType<typeof composeDocument>> & { dpi?: number; originalMetadata?: OpenedImage['metadata'] }>;
  #composeRecipe(recipe: EditRecipe, options: ExportOptions, working: true): Promise<{ pixels: PixelBuffer; width: number; height: number; dpi?: number; originalMetadata?: OpenedImage['metadata'] }>;
  async #composeRecipe(recipe: EditRecipe, { signal, onProgress }: ExportOptions = {}, working = false): Promise<{ width: number; height: number; dpi?: number; originalMetadata?: OpenedImage['metadata'] } & ({ bytes: Uint8ClampedArray } | { pixels: PixelBuffer })> {
    if (this.#state.status !== "ready") throw new Error("The picture has not loaded");
    const sourceSignal = this.#open.signal;
    const lifetime = AbortSignal.any([sourceSignal, this.#baseLifetime.signal, ...(signal ? [signal] : [])]);
    lifetime.throwIfAborted();
    const source = this.#baseFor(recipe);
    const canonical = this.#flattenedPixels.get(source);
    if (canonical && same(recipe, EMPTY_RECIPE) && !working) { onProgress?.(1); return canonical; }
    const originalMetadata = source.metadata;
    const document = this.#documentFor(recipe, recipe.geometry, undefined, true);
    const compose = async (backend: RenderBackend) => {
      if (!working) return composeDocument(backend, document, { signal: lifetime, ...(onProgress ? { onProgress } : {}) });
      // Profile output needs the composed floats until resizing and alpha removal finish.
      // Use the same tile jobs as ordinary export, including the backend's worker path.
      const { prepareTile, composePrepared } = await import('../render/compose.js');
      const { TILE_SIZE, TILE_GUTTER, tileRect, validateImageSize } = await import('../core/index.js');
      validateImageSize(document);
      const pixels = createPixels(document.width, document.height);
      const caches = new Map<TileSource, TileCache>();
      const columns = Math.ceil(document.width / TILE_SIZE), rows = Math.ceil(document.height / TILE_SIZE);
      let sliceStart = performance.now();
      try {
        for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
          lifetime.throwIfAborted();
          const tile = { level: 0, x, y };
          let job = prepareTile(document, tile, source => this.#cacheFor(source, caches));
          for (let attempt = 0; !job; attempt++) {
            await retryRead(attempt, lifetime);
            await abortable(Promise.all([...caches.values()].map(cache => cache.idle(lifetime))), lifetime);
            lifetime.throwIfAborted();
            job = prepareTile(document, tile, source => this.#cacheFor(source, caches));
          }
          const surface = backend.compose ? await backend.compose(job, lifetime) : composePrepared(backend, job);
          let read: PixelBuffer;
          try { lifetime.throwIfAborted(); read = backend.read(surface); }
          finally { backend.release(surface); }
          const inner = tileRect(document, tile);
          for (let row = 0; row < inner.height; row++) {
            const from = ((row + TILE_GUTTER) * read.width + TILE_GUTTER) * 4;
            pixels.data.set(read.data.subarray(from, from + inner.width * 4), ((inner.y + row) * pixels.width + inner.x) * 4);
          }
          onProgress?.((y * columns + x + 1) / (rows * columns));
          if (performance.now() - sliceStart >= 12) { await new Promise<void>(resolve => setTimeout(resolve)); sliceStart = performance.now(); }
        }
        return { width: pixels.width, height: pixels.height, pixels };
      } finally { this.#releaseCaches(caches); }
    };
    const backend = this.#renderer?.backend;
    let fallback: CpuBackend | undefined;
    try {
      let image = backend && !backend.lost ? await compose(backend) : undefined;
      // A lost GPU reads back blank pixels, which must never reach an export or flattened base.
      if (!image || backend?.lost) { fallback = new CpuBackend(); image = await compose(fallback); }
      return { ...image, dpi: recipe.geometry.resize?.dpi, originalMetadata };
    } catch (error) { lifetime.throwIfAborted(); throw error; }
    finally { document.dispose(); fallback?.dispose(); }
  }

  async #render(recipe: EditRecipe, { signal, onProgress, ...encode }: EncodeOptions & ExportOptions = {}) {
    const sourceSignal = this.#open.signal;
    const lifetime = AbortSignal.any([sourceSignal, this.#baseLifetime.signal, ...(signal ? [signal] : [])]);
    if(encode.icc) {
      const {encodeWorkingImage}=await import('../io/encode.js');
      const image=await this.#composeRecipe(recipe,{signal:lifetime,onProgress},true);
      lifetime.throwIfAborted();
      const blob=await encodeWorkingImage(image.pixels,{dpi:image.dpi,originalMetadata:image.originalMetadata,...encode});
      lifetime.throwIfAborted();
      return blob;
    }
    const image = await this.#composeRecipe(recipe, { signal: lifetime, onProgress });
    lifetime.throwIfAborted();
    // Preserve the canonical export bytes for a clean flattened base, avoiding another decode /
    // half-float quantisation cycle. Every format still uses its ordinary encoder and options.
    const blob = await encodeImage(image.bytes, image.width, image.height, { dpi: image.dpi, originalMetadata: image.originalMetadata, ...encode });
    lifetime.throwIfAborted();
    return blob;
  }
}

/** Start loading a source into a headless session. Subscribe for ready or failed state, and dispose when the host closes it. */
export const createEditorSession = (options: EditorSessionOptions) => new EditorSession(options);
