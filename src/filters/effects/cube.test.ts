import { expect, it } from 'vitest';
import { parseCube } from './cube.js';
import { generateLut, lookupLut, validateLut } from './grading.js';
const identity = generateLut(2, c => c);
const samples = Array.from({ length: 8 }, (_, i) => identity.values.slice(i * 3, i * 3 + 3).join(' ')).join('\n');
it('reads comments, title, BOM, CRLF, domains and red-fastest order', () => {
    const lut = parseCube(`\uFEFF# comment\nTITLE "A # title" # trailing\nLUT_3D_SIZE 2\nDOMAIN_MIN -1 -1 -1\nDOMAIN_MAX 1 1 1\n${samples}\n`.replaceAll('\n', '\r\n'));
    expect(lut.title).toBe('A # title');
    expect(lut.values).toEqual(identity.values);
    expect(lookupLut(lut, [0, 0, 0])).toEqual([.5, .5, .5]);
});
it.each(['', 'LUT_1D_SIZE 2', 'LUT_3D_SIZE 1', 'LUT_3D_SIZE 65', 'LUT_3D_SIZE 2\nNaN 0 0', 'LUT_3D_SIZE 2\n0 0', 'LUT_3D_SIZE 2\n0 0 0', `LUT_3D_SIZE 2\n${samples}\n1 1 1`, `LUT_3D_SIZE 2\nLUT_3D_SIZE 2\n${samples}`, `LUT_3D_SIZE 2\nDOMAIN_MIN 1 0 0\n${samples}`, `LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MIN 0 0 0\n${samples}`, `LUT_3D_SIZE 2\n${samples}\nDOMAIN_MAX 2 2 2`])('rejects malformed or unsupported .cube data: %s', text => { expect(() => parseCube(text)).toThrow(); });
it('rejects invalid LUT domains and non-finite data', () => { expect(() => validateLut({ ...identity, values: [NaN] })).toThrow(); expect(() => validateLut({ ...identity, domainMax: [0, 1, 1] })).toThrow(); expect(() => generateLut(2, () => [NaN, 0, 0])).toThrow(); });
