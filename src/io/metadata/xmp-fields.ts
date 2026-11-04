import { ascii, bounded, ensure, FileDataError, MAX_METADATA_BYTES, utf8 } from '../formats/bytes.js';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const EXTENSION = 'http://ns.adobe.com/xmp/extension/\0';
/**
 * Whether a packet is a JPEG extended-XMP chunk. Its header holds a binary length and offset, so it is
 * recognised from its bytes, never by decoding it as text.
 */
export const isExtendedXmp = (bytes: Uint8Array) => bytes.length >= EXTENSION.length && ascii(bytes.subarray(0, EXTENSION.length)) === EXTENSION;
/** Namespaces by the prefix the panel and recipe keys use, whatever alias a file chose. */
export const XMP_NAMESPACES: Readonly<Record<string, string>> = {
  dc: 'http://purl.org/dc/elements/1.1/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  xmpRights: 'http://ns.adobe.com/xap/1.0/rights/',
  xmpMM: 'http://ns.adobe.com/xap/1.0/mm/',
  photoshop: 'http://ns.adobe.com/photoshop/1.0/',
  tiff: 'http://ns.adobe.com/tiff/1.0/',
  exif: 'http://ns.adobe.com/exif/1.0/',
  exifEX: 'http://cipa.jp/exif/1.0/',
  aux: 'http://ns.adobe.com/exif/1.0/aux/',
  Iptc4xmpCore: 'http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/',
  Iptc4xmpExt: 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/',
  crs: 'http://ns.adobe.com/camera-raw-settings/1.0/',
  lr: 'http://ns.adobe.com/lightroom/1.0/',
  xmpDM: 'http://ns.adobe.com/xmp/1.0/DynamicMedia/',
  GPano: 'http://ns.google.com/photos/1.0/panorama/',
  plus: 'http://ns.useplus.org/ldf/xmp/1.0/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
};
/** Array forms the standard schemas require, so a written value has the shape other readers expect. */
const ARRAYS: Readonly<Record<string, 'Alt' | 'Bag' | 'Seq'>> = {
  'dc:title': 'Alt', 'dc:description': 'Alt', 'dc:rights': 'Alt', 'xmpRights:UsageTerms': 'Alt',
  'dc:creator': 'Seq', 'dc:subject': 'Bag', 'photoshop:SupplementalCategories': 'Bag', 'lr:hierarchicalSubject': 'Bag',
  'Iptc4xmpCore:Scene': 'Bag', 'Iptc4xmpCore:SubjectCode': 'Bag', 'dc:contributor': 'Bag', 'dc:publisher': 'Bag',
};

/** One XMP property. Structures flatten to `parent/child` names and are read-only. */
export interface XmpProperty {
  /** `prefix:Name`, using the canonical prefix for known namespaces. */
  name: string;
  /** Namespace URI. */
  namespace: string;
  /** One value for a simple property; every item for an array; the x-default item first for language alternatives. */
  values: readonly string[];
  /** How the property is stored. */
  form: 'simple' | 'Alt' | 'Bag' | 'Seq' | 'struct';
}
interface Span { start: number; end: number }
interface Found extends XmpProperty { span: Span; /** Namespaces in scope where the property sits. */ scope: ReadonlyMap<string, string> }
interface Element { name: string; attrs: { name: string; value: string; span: Span }[]; start: number; contentStart: number; end: number; children: Element[]; text: string; ns: Map<string, string> }

const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  const lower = e.toLowerCase();
  if (lower === 'amp') return '&'; if (lower === 'lt') return '<'; if (lower === 'gt') return '>'; if (lower === 'quot') return '"'; if (lower === 'apos') return "'";
  const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
});
/** Escape text for XML. Control characters XML 1.0 forbids, even as references, are dropped, so other readers accept the packet. */
// eslint-disable-next-line no-control-regex
const escape = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function decode(bytes: Uint8Array): string {
  bounded(bytes, MAX_METADATA_BYTES);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (cause) { throw new FileDataError('invalid', 'Invalid XMP UTF-8', { cause }); }
}
/** A bounded element tree with source spans. No DTDs, entities beyond XML's own, or external references. */
function parse(text: string): Element {
  const root: Element = { name: '#root', attrs: [], start: 0, contentStart: 0, end: text.length, children: [], text: '', ns: new Map([['xml', 'http://www.w3.org/XML/1998/namespace']]) };
  const stack: Element[] = [root];
  let p = 0, nodes = 0;
  const namePattern = /^[A-Za-z_][\w.:-]*/;
  while (p < text.length) {
    const start = text.indexOf('<', p);
    const top = stack[stack.length - 1]!;
    if (start < 0) { top.text += text.slice(p); break; }
    top.text += text.slice(p, start);
    if (text.startsWith('<!--', start) || text.startsWith('<?', start)) {
      const suffix = text.startsWith('<!--', start) ? '-->' : '?>', end = text.indexOf(suffix, start + 2);
      ensure(end >= 0, 'Truncated XMP token'); p = end + suffix.length; continue;
    }
    if (text.startsWith('<![CDATA[', start)) {
      const end = text.indexOf(']]>', start + 9); ensure(end >= 0, 'Truncated XMP token');
      top.text += text.slice(start + 9, end).replace(/&/g, '&amp;').replace(/</g, '&lt;'); p = end + 3; continue;
    }
    ensure(!text.startsWith('<!', start), 'XMP declarations are unsupported');
    let end = start + 1, quote = '';
    for (; end < text.length; end++) { const c = text[end]!; if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break; }
    ensure(end < text.length, 'Truncated XMP tag');
    const closing = text[start + 1] === '/', nameAt = start + (closing ? 2 : 1), match = namePattern.exec(text.slice(nameAt, end));
    ensure(match, 'Invalid XMP tag');
    const name = match[0];
    if (closing) {
      const open = stack.pop(); ensure(open && open.name === name && stack.length > 0, 'Mismatched XMP tag');
      open.end = end + 1; p = end + 1; continue;
    }
    ensure(++nodes <= 100000 && stack.length < 64, 'Excessive XMP nesting');
    const selfClosing = text[end - 1] === '/', attrEnd = selfClosing ? end - 1 : end;
    const element: Element = { name, attrs: [], start, contentStart: end + 1, end: end + 1, children: [], text: '', ns: new Map(top.ns) };
    let at = nameAt + name.length;
    while (at < attrEnd) {
      const space = /^\s+/.exec(text.slice(at, attrEnd)); ensure(space, 'Invalid XMP attribute spacing');
      const spanStart = at; at += space[0].length; if (at === attrEnd) break;
      const attr = namePattern.exec(text.slice(at, attrEnd)); ensure(attr, 'Invalid XMP attribute'); at += attr[0].length;
      const equals = /^\s*=\s*(["'])/.exec(text.slice(at, attrEnd)); ensure(equals, 'Invalid XMP attribute value'); at += equals[0].length;
      const valueEnd = text.indexOf(equals[1]!, at); ensure(valueEnd >= at && valueEnd < attrEnd, 'Truncated XMP attribute');
      const value = unescape(text.slice(at, valueEnd)); at = valueEnd + 1;
      if (attr[0] === 'xmlns') element.ns.set('', value);
      else if (attr[0].startsWith('xmlns:')) element.ns.set(attr[0].slice(6), value);
      element.attrs.push({ name: attr[0], value, span: { start: spanStart, end: at } });
    }
    top.children.push(element);
    if (!selfClosing) stack.push(element);
    p = end + 1;
  }
  ensure(stack.length === 1, 'Unclosed XMP tag');
  return root;
}
const prefixOf = (name: string) => name.includes(':') ? name.slice(0, name.indexOf(':')) : '';
const localOf = (name: string) => name.slice(name.indexOf(':') + 1);
function qualified(element: Element, name: string): { namespace: string; name: string } | undefined {
  const namespace = element.ns.get(prefixOf(name));
  if (!namespace) return undefined;
  const canonical = Object.entries(XMP_NAMESPACES).find(([, uri]) => uri === namespace)?.[0] ?? prefixOf(name);
  return { namespace, name: `${canonical}:${localOf(name)}` };
}
const isRdf = (element: Element, local: string) => element.ns.get(prefixOf(element.name)) === RDF && localOf(element.name) === local;
const textOf = (element: Element): string => unescape(element.text).trim();

function descriptions(element: Element, out: Element[] = []): Element[] {
  for (const child of element.children) { if (isRdf(child, 'Description')) out.push(child); else descriptions(child, out); }
  return out;
}
function properties(text: string): { found: Found[]; root: Element } {
  const root = parse(text), found: Found[] = [];
  for (const description of descriptions(root)) {
    for (const attr of description.attrs) {
      if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:') || attr.name.startsWith('rdf:') || attr.name.startsWith('xml:')) continue;
      const q = qualified(description, attr.name); if (!q || q.namespace === RDF) continue;
      found.push({ ...q, values: [attr.value], form: 'simple', span: attr.span, scope: description.ns });
    }
    for (const child of description.children) {
      const q = qualified(child, child.name); if (!q) continue;
      found.push({ ...q, ...readValue(child, q.name), span: { start: child.start, end: child.end }, scope: description.ns });
    }
  }
  return { found, root };
}
function readValue(element: Element, name: string): Pick<XmpProperty, 'values' | 'form'> {
  const resource = element.attrs.find(a => qualified(element, a.name)?.namespace === RDF && localOf(a.name) === 'resource');
  if (resource) return { values: [resource.value], form: 'simple' };
  const array = element.children.find(c => isRdf(c, 'Alt') || isRdf(c, 'Bag') || isRdf(c, 'Seq'));
  if (array) {
    const items = array.children.filter(c => isRdf(c, 'li'));
    const form = localOf(array.name) as 'Alt' | 'Bag' | 'Seq';
    const values = items.map(item => item.children.length ? flatten(item).map(f => f.value).join(', ') : textOf(item));
    if (form === 'Alt') {
      const preferred = items.findIndex(item => item.attrs.some(a => a.name === 'xml:lang' && a.value === 'x-default'));
      if (preferred > 0) values.unshift(values.splice(preferred, 1)[0]!);
    }
    return { values, form };
  }
  const fieldAttrs = element.attrs.filter(a => !a.name.startsWith('xmlns') && !a.name.startsWith('rdf:') && !a.name.startsWith('xml:'));
  if (element.children.length || fieldAttrs.length) {
    const fields = flatten(element);
    return { values: fields.map(f => `${f.name.slice(name.length + 1)}: ${f.value}`), form: 'struct' };
  }
  return { values: [textOf(element)], form: 'simple' };
}
function flatten(element: Element, prefix = qualified(element, element.name)?.name ?? element.name): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const attr of element.attrs) {
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:') || attr.name.startsWith('rdf:') || attr.name.startsWith('xml:')) continue;
    const q = qualified(element, attr.name); if (q) out.push({ name: `${prefix}/${q.name}`, value: attr.value });
  }
  for (const child of element.children) {
    if (isRdf(child, 'Description') || isRdf(child, 'Alt') || isRdf(child, 'Bag') || isRdf(child, 'Seq') || isRdf(child, 'li')) { out.push(...flatten(child, prefix)); continue; }
    const q = qualified(child, child.name); if (!q) continue;
    if (child.children.length) out.push(...flatten(child, `${prefix}/${q.name}`));
    else out.push({ name: `${prefix}/${q.name}`, value: textOf(child) });
  }
  return out.slice(0, 256);
}

/** Every property of an XMP packet, in document order. Extended JPEG XMP is opaque and reads as empty. */
export function readXmpProperties(bytes: Uint8Array): XmpProperty[] {
  if (isExtendedXmp(bytes)) return [];
  return properties(decode(bytes)).found.map(found => { const { span, scope, ...property } = found; void span; void scope; return property; });
}

/** Changes to an XMP packet by canonical `prefix:Name`. */
export interface XmpEdit {
  /** New values. A string writes a simple property, or a one-item array where the schema requires one. */
  set?: Readonly<Record<string, string | readonly string[]>>;
  /** Properties to remove. */
  remove?: readonly string[];
}
/** Whether a property can be written: its prefix must be a known namespace. Structures stay read-only. */
export function isWritableXmpProperty(name: string): boolean {
  return /^[A-Za-z][\w-]*:[A-Za-z_][\w.-]*$/.test(name) && prefixOf(name) in XMP_NAMESPACES;
}
const PACKET = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${RDF}"><rdf:Description rdf:about=""></rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
/** A new, empty XMP packet. */
export const emptyXmp = () => utf8(PACKET);

/**
 * One property element. Arrays use a prefix already bound to RDF where the element goes; when there is
 * none (the file binds RDF only as the default namespace, or not at all there), the element declares `rdf`
 * itself, so the output never depends on a default namespace.
 */
function serialise(name: string, values: readonly string[], scope: ReadonlyMap<string, string>): string {
  const prefix = prefixOf(name);
  let declare = ` xmlns:${prefix}="${XMP_NAMESPACES[prefix]}"`;
  const form = ARRAYS[name];
  if (!form) return `<${name}${declare}>${escape(values[0] ?? '')}</${name}>`;
  let rdf = [...scope.entries()].find(([p, uri]) => uri === RDF && p !== '' && p !== prefix)?.[0];
  if (!rdf) { rdf = 'rdf'; declare += ` xmlns:rdf="${RDF}"`; }
  const items = values.map((value, i) => `<${rdf}:li${form === 'Alt' && i === 0 ? ' xml:lang="x-default"' : ''}>${escape(value)}</${rdf}:li>`).join('');
  return `<${name}${declare}><${rdf}:${form}>${items}</${rdf}:${form}></${name}>`;
}
/**
 * Edit properties in place, leaving every other byte of the packet as it was. New properties go
 * into the first `rdf:Description`, each declaring its own namespace so no existing declaration moves.
 */
export function editXmpProperties(source: Uint8Array | null, edit: XmpEdit): Uint8Array {
  if (source && isExtendedXmp(source)) throw new FileDataError('unsupported', 'Editing extended XMP is unsupported');
  let text = source ? decode(source) : PACKET;
  const { found, root } = properties(text);
  if (!descriptions(root).length) { text = PACKET; return editXmpProperties(utf8(text), edit); }
  const description = descriptions(root)[0]!;
  const changes: { start: number; end: number; value: string }[] = [];
  const removeName = (name: string) => { for (const f of found.filter(f => f.name === name)) changes.push({ start: f.span.start, end: f.span.end, value: '' }); };
  for (const name of edit.remove ?? []) removeName(name);
  const inserts: string[] = [];
  for (const [name, raw] of Object.entries(edit.set ?? {})) {
    ensure(isWritableXmpProperty(name), `XMP ${name} cannot be written`);
    const values = (typeof raw === 'string' ? [raw] : [...raw]).map(v => v.trim()).filter(Boolean);
    const existing = found.find(f => f.name === name);
    removeName(name);
    if (!values.length) continue;
    const inPlace = !!existing && text[existing.span.start] === '<';
    const element = serialise(name, values, inPlace ? existing.scope : description.ns);
    // An element replaces its old element in place; a replaced attribute becomes an element inside the description.
    if (inPlace) { changes.push({ start: existing.span.start, end: existing.span.start, value: element }); }
    else inserts.push(element);
  }
  if (inserts.length) {
    const selfClosing = description.contentStart === description.end && text[description.end - 2] === '/';
    if (selfClosing) changes.push({ start: description.end - 2, end: description.end, value: `>${inserts.join('')}</${description.name}>` });
    else { const close = text.lastIndexOf('</', description.end - 1); changes.push({ start: close, end: close, value: inserts.join('') }); }
  }
  // Removals and insertions never overlap: an insertion at a removed span's start keeps its place before the removal.
  changes.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  let cursor = 0; const parts: string[] = [];
  for (const c of changes) { if (c.start < cursor) continue; parts.push(text.slice(cursor, c.start), c.value); cursor = c.end; }
  parts.push(text.slice(cursor));
  return utf8(parts.join(''));
}
