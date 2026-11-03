import { parseCube } from '../../filters/effects/cube.js';
/** Parse large text tables away from pointer, animation and input work. */
self.onmessage = (event: MessageEvent<string>) => { try {
    self.postMessage({ lut: parseCube(event.data) });
}
catch {
    self.postMessage({ error: true });
} };
