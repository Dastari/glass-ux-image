/// <reference types="node" />
import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
it('vintage family bundles without blur, React, render, or session', async () => {
    const require = createRequire(new URL('../../../apps/demo/package.json', import.meta.url));
    const { build } = await import(require.resolve('vite')) as {
        build: (options: unknown) => Promise<{ output: Array<{ modules?: Record<string, unknown> }> } | Array<{ output: Array<{ modules?: Record<string, unknown> }> }>>;
    };
    const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./vintage.ts', import.meta.url)), formats: ['es'] } } });
    const chunks = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
    const modules = chunks.flatMap(c => Object.keys(c.modules ?? {}));
    expect(modules.some(m => m.endsWith('/effects/vintage.ts'))).toBe(true);
    expect(modules.filter(m => /gaussian|blur|react|render|session|catalogue|artistic/.test(m))).toEqual([]);
});
