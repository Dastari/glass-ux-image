import { normaliseGeometry, type Geometry } from "../../core/geometry.js";
import { bounded, ensure, FileDataError, MAX_METADATA_BYTES, utf8 } from '../formats/bytes.js';
import { readZip, writeZip } from './zip.js';
export { readZip, writeZip, indexZip } from './zip.js';
export type { ZipEntry, ZipRange } from './zip.js';
/** Current native project manifest version. */
export const PROJECT_VERSION=1;
/** A project version cannot be read by this package. */
export class ProjectVersionError extends FileDataError {
  override name='ProjectVersionError';
  constructor(public readonly version:number) { super('unsupported',`Project version ${version} is newer than supported version ${PROJECT_VERSION}`); }
}
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key:string]:JsonValue };
/** A blob stored without compression inside the project archive. */
export interface ProjectReference {
  /** Safe archive path beneath blobs/. */
  path:string;
  /** Original host MIME type. */
  mime:string;
}
/** Recipe includes layers/strokes as plain JSON; normalisation and kind validation belong to the session. */
export interface ProjectManifest {
  /** Project schema version, currently one. Newer versions produce ProjectVersionError. */
  version:number;
  /** Plain JSON recipe, including layers and strokes. Session/tool validation follows loading. */
  recipe:JsonValue;
  /** Unmodified original source. */
  source:ProjectReference;
  /** References keyed by original session asset id. */
  assets:Record<string,ProjectReference>;
}
/** Complete project data, without opening a session or writing storage. */
export interface ImageProject {
  /** Validated project manifest. */
  manifest:ProjectManifest;
  /** All referenced blobs, keyed by archive path. */
  blobs:ReadonlyMap<string,Uint8Array>;
}
function json(value:unknown, depth=0, state={nodes:0}): asserts value is JsonValue {
  ensure(depth<=64&&++state.nodes<=100000,'Recipe is too complex');
  if(value===null||typeof value==='string'||typeof value==='boolean') return;
  if(typeof value==='number') { ensure(Number.isFinite(value)); return; }
  ensure(typeof value==='object'&&value!==null && (Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype),'Recipe must be plain JSON');
  for(const v of Object.values(value)) json(v,depth+1,state);
}
function validate(value:unknown): asserts value is ProjectManifest {
  ensure(value!==null&&typeof value==='object'); const m=value as ProjectManifest;
  ensure(Number.isInteger(m.version)&&m.version>=1); if(m.version>PROJECT_VERSION) throw new ProjectVersionError(m.version);
  json(m.recipe);
  if(m.recipe && typeof m.recipe === "object" && !Array.isArray(m.recipe) && m.recipe.geometry) {
    try { normaliseGeometry(m.recipe.geometry as Partial<Geometry>); }
    catch(cause) { throw new FileDataError("invalid", "Invalid project geometry", {cause}); }
  } ensure(m.assets&&typeof m.assets==='object'&&!Array.isArray(m.assets)&&Object.keys(m.assets).length<=4094);
  if(m.recipe&&typeof m.recipe==='object'&&!Array.isArray(m.recipe)&&Array.isArray(m.recipe.layers)) {
    for(const layer of m.recipe.layers) {
      ensure(layer&&typeof layer==='object'&&!Array.isArray(layer),'Invalid project layer');
      if(layer.asset!==undefined) ensure(typeof layer.asset==='string'&&Object.hasOwn(m.assets,layer.asset),'Missing layer asset reference');
    }
  }
  for(const ref of [m.source,...Object.values(m.assets)]) ensure(ref&&typeof ref.path==='string'&&ref.path.startsWith('blobs/')&&typeof ref.mime==='string'&&ref.mime.length<=255,'Invalid project reference');
}
/** Encode a validated project manifest and its referenced blobs as a native project archive. */
export function writeProject(project:ImageProject): Uint8Array {
  validate(project.manifest); const manifest=bounded(utf8(JSON.stringify(project.manifest)),MAX_METADATA_BYTES);
  const paths=new Set([project.manifest.source.path,...Object.values(project.manifest.assets).map(r=>r.path)]);
  ensure(project.blobs.size===paths.size,'Project contains missing or unreferenced blobs');
  return writeZip([{name:'manifest.json',bytes:manifest},...Array.from(paths).sort().map(name=> { const bytes=project.blobs.get(name); ensure(bytes,'Missing project blob'); return {name,bytes}; })]);
}
/** Read a bounded native project archive and validate its manifest and referenced blobs. */
export function readProject(bytes:Uint8Array): ImageProject {
  const entries=readZip(bytes); const manifest=entries.find(e=>e.name==='manifest.json'); ensure(manifest,'Missing project manifest'); bounded(manifest.bytes,MAX_METADATA_BYTES);
  let value:unknown; try { value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifest.bytes)); } catch(cause) { throw new FileDataError('invalid','Invalid project JSON',{cause}); }
  validate(value); const blobs=new Map(entries.filter(e=>e!==manifest).map(e=>[e.name,e.bytes])); const project={manifest:value,blobs};
  const paths=new Set([value.source.path,...Object.values(value.assets).map(r=>r.path)]); ensure(blobs.size===paths.size&&[...paths].every(p=>blobs.has(p)),'Missing or unreferenced project blobs'); return project;
}
