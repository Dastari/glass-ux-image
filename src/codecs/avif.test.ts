import { expect, it, vi } from 'vitest';
import { AvifEncoder, AvifUnavailableError } from './avif.js';
it('does not construct a worker until first use and treats load refusal as unavailable',async()=> {const make=vi.fn(()=>{throw new Error('CSP');}),codec=new AvifEncoder(make);expect(make).not.toHaveBeenCalled();expect(await codec.available()).toBe(false);expect(make).toHaveBeenCalledOnce();await expect(codec.encode(new Uint8ClampedArray(4),1,1)).rejects.toBeInstanceOf(AvifUnavailableError);codec.dispose();});
