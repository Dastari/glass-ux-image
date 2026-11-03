import { validateLut, type Lut3D } from './grading.js';
import type { Colour } from './shared.js';
/** Parse a 3D .cube table. Rejects 1D/shaper tables and unsupported directives. Samples are linear RGB. */
export function parseCube(text: string): Lut3D {
    let size: number | undefined, title: string | undefined, domainMin: Colour | undefined, domainMax: Colour | undefined;
    const values: number[] = [];
    for (const [lineNumber, raw] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
        const line = raw.replace(/#(?=(?:[^"]*"[^"]*")*[^"]*$).*$/, '').trim();
        if (!line)
            continue;
        const [key, ...parts] = line.split(/\s+/);
        const fail = () => new SyntaxError(`Invalid .cube line ${lineNumber + 1}: ${line}`);
        if (key === 'TITLE') {
            const match = /^TITLE\s+"(.*)"$/.exec(line);
            if (!match || title !== undefined)
                throw fail();
            title = match[1]!;
            continue;
        }
        if (key === 'LUT_3D_SIZE') {
            if (size !== undefined || values.length || parts.length !== 1)
                throw fail();
            size = Number(parts[0]);
            if (!Number.isInteger(size) || size < 2 || size > 64)
                throw fail();
            continue;
        }
        if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
            if (values.length || parts.length !== 3)
                throw fail();
            const v = parts.map(Number) as Colour;
            if (!v.every(Number.isFinite))
                throw fail();
            if (key === 'DOMAIN_MIN') {
                if (domainMin)
                    throw fail();
                domainMin = v;
            }
            else {
                if (domainMax)
                    throw fail();
                domainMax = v;
            }
            continue;
        }
        const samples = line.split(/\s+/).map(Number);
        if (size === undefined || samples.length !== 3 || !samples.every(Number.isFinite) || values.length >= size ** 3 * 3)
            throw fail();
        values.push(...samples);
    }
    if (size === undefined)
        throw new SyntaxError('Missing LUT_3D_SIZE');
    const lut: Lut3D = { size, values, ...(title === undefined ? {} : { title }), ...(domainMin ? { domainMin } : {}), ...(domainMax ? { domainMax } : {}) };
    validateLut(lut);
    return lut;
}
