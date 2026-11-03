import { bounded, ensure, FileDataError, MAX_METADATA_BYTES, utf8 } from '../formats/bytes.js';
interface Replacement { start:number; end:number; value:string }
/**
 * Bounded XML token walker, without a DOM or entity expansion. Edits standard GPS properties by
 * local name (namespace aliases may vary), retaining unrelated XMP. Extended JPEG XMP needs
 * reassembly/MD5 and is explicitly rejected when editing, rather than corrupted.
 */
export function editXmp(bytes:Uint8Array,options:{stripGps?:boolean;normaliseOrientation?:boolean}):Uint8Array {
  bounded(bytes,MAX_METADATA_BYTES);
  let text:string;
  try { text=new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch(cause) { throw new FileDataError('invalid','Invalid XMP UTF-8',{cause}); }
  if(text.startsWith('http://ns.adobe.com/xmp/extension/')) throw new FileDataError('unsupported','Editing extended XMP is unsupported');
  const changes:Replacement[]=[],stack:{name:string;start:number;content:number;gps:boolean;orientation:boolean}[]=[];
  let p=0,nodes=0;
  const namePattern=/^[A-Za-z_][\w.:-]*/;
  const local=(name:string)=>name.slice(name.lastIndexOf(':')+1);
  while(p<text.length) {
    const start=text.indexOf('<',p); if(start<0) break;
    if(text.startsWith('<!--',start)||text.startsWith('<![CDATA[',start)||text.startsWith('<?',start)) {
      const prefix=text.startsWith('<!--',start)?'<!--':text.startsWith('<?',start)?'<?':'<![CDATA[';
      const suffix=prefix==='<!--'?'-->':prefix==='<?'?'?>':']]>';
      const end=text.indexOf(suffix,start+prefix.length); ensure(end>=0,'Truncated XMP token'); p=end+suffix.length; continue;
    }
    ensure(!text.startsWith('<!',start),'XMP declarations are unsupported');
    let end=start+1,quote='';
    for(;end<text.length;end++) { const c=text[end]!; if(quote) { if(c===quote) quote=''; } else if(c==='"'||c==="'") quote=c; else if(c==='>') break; }
    ensure(end<text.length,'Truncated XMP tag');
    const closing=text[start+1]==='/',nameAt=start+(closing?2:1),match=namePattern.exec(text.slice(nameAt,end)); ensure(match,'Invalid XMP tag'); const name=match[0];
    if(closing) {
      ensure(text.slice(nameAt+name.length,end).trim()===''); const open=stack.pop(); ensure(open?.name===name,'Mismatched XMP tag');
      if(open.gps) changes.push({start:open.start,end:end+1,value:''});
      else if(open.orientation) { ensure(!text.slice(open.content,start).includes('<'),'Structured XMP orientation is unsupported'); changes.push({start:open.content,end:start,value:'1'}); }
    } else {
      ensure(++nodes<=100000&&stack.length<64,'Excessive XMP nesting');
      let at=nameAt+name.length; const selfClosing=text[end-1]==='/'; const attrEnd=selfClosing?end-1:end;
      while(at<attrEnd) {
        const whitespace=/^\s+/.exec(text.slice(at,attrEnd)); ensure(whitespace,'Invalid XMP attribute spacing'); at+=whitespace[0].length; if(at===attrEnd) break;
        const attr=namePattern.exec(text.slice(at,attrEnd)); ensure(attr,'Invalid XMP attribute'); const attrStart=at; at+=attr[0].length;
        const equals=/^\s*=\s*(["'])/.exec(text.slice(at,attrEnd)); ensure(equals,'Invalid XMP attribute value'); at+=equals[0].length; const valueStart=at,valueEnd=text.indexOf(equals[1]!,at); ensure(valueEnd>=at&&valueEnd<attrEnd,'Truncated XMP attribute'); at=valueEnd+1;
        const key=local(attr[0]);
        if(options.stripGps&&/^GPS/i.test(key)) changes.push({start:attrStart,end:at,value:''});
        else if(options.normaliseOrientation&&key==='Orientation') changes.push({start:valueStart,end:valueEnd,value:'1'});
      }
      const gps=!!options.stripGps&&/^GPS/i.test(local(name)),orientation=!!options.normaliseOrientation&&local(name)==='Orientation';
      if(selfClosing) { if(gps) changes.push({start,end:end+1,value:''}); }
      else stack.push({name,start,content:end+1,gps,orientation});
    }
    p=end+1;
  }
  ensure(stack.length===0,'Unclosed XMP tag');
  // Outer removals take precedence over edits to their children/attributes.
  changes.sort((a,b)=>a.start-b.start||b.end-a.end); let cursor=0; const parts:string[]=[];
  for(const c of changes) { if(c.start<cursor) continue; parts.push(text.slice(cursor,c.start),c.value); cursor=c.end; }
  parts.push(text.slice(cursor)); return utf8(parts.join(''));
}
