import { expect, it } from 'vitest';
import { editXmp } from './xmp.js';
import { FileDataError, utf8 } from '../formats/bytes.js';
const edit=(text:string,options={stripGps:true,normaliseOrientation:true})=>new TextDecoder().decode(editXmp(utf8(text),options));
it('removes GPS attributes and nested GPS elements, retaining unrelated metadata',()=> {
  const input='<rdf:RDF xmlns:rdf="urn:rdf" xmlns:x="urn:exif"><rdf:Description x:GPSLatitude="12,34N" x:Model="Camera"><x:GPSLongitude><rdf:Seq><rdf:li>12E</rdf:li></rdf:Seq></x:GPSLongitude><x:Orientation>8</x:Orientation><x:Lens>Lens</x:Lens></rdf:Description></rdf:RDF>';
  const out=edit(input); expect(out).not.toContain('GPS'); expect(out).toContain('x:Model="Camera"'); expect(out).toContain('<x:Orientation>1</x:Orientation>'); expect(out).toContain('<x:Lens>Lens</x:Lens>');
});
it('preserves comments, packet processing instructions and unrelated CDATA',()=> { const input='<?xpacket begin=""?><rdf><!-- comment --><title><![CDATA[a>b]]></title><GPSAltitude foo="bar"/></rdf><?xpacket end="w"?>'; expect(edit(input)).toBe('<?xpacket begin=""?><rdf><!-- comment --><title><![CDATA[a>b]]></title></rdf><?xpacket end="w"?>'); });
it('handles quoted tag delimiters and namespace aliases in orientation attributes',()=>expect(edit('<r camera="a>b" e:Orientation="6" />')).toBe('<r camera="a>b" e:Orientation="1" />'));
it('rejects malformed, declared, structured orientation and extended XMP with typed errors',()=> { for(const input of ['<r>','<r></wrong>','<r a=no/>','<!DOCTYPE r><r/>','<r><Orientation><v>6</v></Orientation></r>','http://ns.adobe.com/xmp/extension/']) expect(()=>edit(input)).toThrow(FileDataError); });
